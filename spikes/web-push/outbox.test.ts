/**
 * Tests for the minimal outbox loop against a fake push provider.
 *
 * Module:   spikes/web-push (THROWAWAY)
 * Serves:   FR-12, AT-07 · blueprint §7.4 · ADR-0004 PoC: at-least-once delivery, idempotency key so READY
 *           is sent once, retry with backoff and jitter, 410/404 disables the subscription, 429/5xx retries,
 *           visible dead-letter list, handlers safe to run twice.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FakeDevice } from "./fake-provider";
import { topicFor } from "./outbox";
import { SECOND, TEST_LEASE_MS, TEST_POLICY, drain, makeWorld, syntheticSubscription } from "./test-support";

const READY = { idempotencyKey: "order.ready:order-1:sub-1", subscriptionId: "sub-1", payload: '{"title":"Ready"}' };

describe("FR-12 outbox: idempotency (READY is sent once)", () => {
  it("enqueuing the same idempotency key twice keeps one event", () => {
    const { store } = makeWorld();
    const first = store.enqueue(READY);
    const second = store.enqueue(READY);
    assert.equal(first.isNew, true);
    assert.equal(second.isNew, false);
    assert.equal(second.event.id, first.event.id);
    assert.equal(store.events().length, 1);
  });

  it("a delivered event is not sent again by later ticks", async () => {
    const world = makeWorld();
    world.store.enqueue(READY);
    await world.worker.tick();
    await world.worker.tick();
    world.clock.advance(TEST_LEASE_MS * 10);
    await world.worker.tick();
    assert.equal(world.provider.calls.length, 1);
    assert.equal(world.store.events()[0]?.status, "sent");
  });

  it("re-enqueueing after it was sent does not send again", async () => {
    const world = makeWorld();
    world.store.enqueue(READY);
    await world.worker.tick();
    world.store.enqueue(READY);
    await world.worker.tick();
    assert.equal(world.provider.calls.length, 1);
  });

  it("two workers ticking at the same moment send it once (the lease is taken before sending)", async () => {
    const world = makeWorld();
    world.store.enqueue(READY);
    const other = world.makeWorker();
    await Promise.all([world.worker.tick(), other.tick(), world.worker.tick()]);
    assert.equal(world.provider.calls.length, 1);
  });

  it("different subscriptions of the same order each get their own event", async () => {
    const world = makeWorld();
    world.store.addSubscription(syntheticSubscription("sub-2"));
    world.store.enqueue(READY);
    world.store.enqueue({ ...READY, idempotencyKey: "order.ready:order-1:sub-2", subscriptionId: "sub-2" });
    await world.worker.tick();
    assert.deepEqual(world.provider.calls.map((c) => c.subscriptionId).sort(), ["sub-1", "sub-2"]);
  });

  it("an event waits until its availableAt time (used by the harness's delayed send)", async () => {
    const world = makeWorld();
    world.store.enqueue({ ...READY, availableAt: world.clock.now() + 15 * SECOND });
    await world.worker.tick();
    assert.equal(world.provider.calls.length, 0);
    world.clock.advance(15 * SECOND);
    await world.worker.tick();
    assert.equal(world.provider.calls.length, 1);
  });
});

describe("AT-07 outbox: at-least-once and retries", () => {
  it("provider unavailable (503 x3) then back: the event is retried and sent, never dropped", async () => {
    const world = makeWorld({ "sub-1": [503, 503, 503, 201] });
    world.store.enqueue(READY);
    await drain(world);
    const [event] = world.store.events();
    assert.equal(event?.status, "sent");
    assert.equal(world.provider.calls.length, 4);
    assert.deepEqual(event?.history.map((a) => a.outcome), ["retry", "retry", "retry", "accepted"]);
  });

  it("waits the backoff delay between attempts and does not retry early", async () => {
    const world = makeWorld({ "sub-1": [500, 201] });
    world.store.enqueue(READY);
    await world.worker.tick();
    // attempt 1 with random 0.5 → 0.75 s delay; ceiling 1 s
    const event = world.store.events()[0];
    assert.equal(event?.nextAttemptAt, world.clock.now() + 750);
    world.clock.advance(749);
    await world.worker.tick();
    assert.equal(world.provider.calls.length, 1, "not before the delay");
    world.clock.advance(1);
    await world.worker.tick();
    assert.equal(world.provider.calls.length, 2);
  });

  it("429 honours the provider's Retry-After when it is longer than the backoff", async () => {
    const world = makeWorld({ "sub-1": [{ statusCode: 429, retryAfterMs: 20 * SECOND }, 201] });
    world.store.enqueue(READY);
    await world.worker.tick();
    assert.equal(world.store.events()[0]?.nextAttemptAt, world.clock.now() + 20 * SECOND);
  });

  it("retries exhausted: the event goes to the dead-letter list with its reason and attempts", async () => {
    const world = makeWorld({ "sub-1": Array.from({ length: TEST_POLICY.maxAttempts + 2 }, () => 503) });
    world.store.enqueue(READY);
    await drain(world, 60 * SECOND);
    const dead = world.store.deadLetters();
    assert.equal(dead.length, 1);
    assert.equal(dead[0]?.attempts, TEST_POLICY.maxAttempts);
    assert.match(dead[0]?.lastError ?? "", /retries exhausted/);
    assert.equal(world.provider.calls.length, TEST_POLICY.maxAttempts);
  });

  it("a worker that crashes mid-send loses its lease; another worker delivers after the lease runs out", async () => {
    const world = makeWorld();
    world.store.enqueue(READY);
    world.store.claimDue(TEST_LEASE_MS, 10); // simulate a worker that claimed and then died
    await world.worker.tick();
    assert.equal(world.provider.calls.length, 0, "lease still held");
    world.clock.advance(TEST_LEASE_MS);
    await world.worker.tick();
    assert.equal(world.provider.calls.length, 1);
    assert.equal(world.store.events()[0]?.status, "sent");
  });

  it("lost response (accepted but we saw a timeout): sent twice with the same topic, the device shows it once", async () => {
    const world = makeWorld({ "sub-1": ["accepted-but-response-lost", 201] });
    world.store.enqueue(READY);
    await drain(world);
    assert.equal(world.provider.calls.length, 2, "at-least-once: a duplicate reaches the push service");
    const topics = new Set(world.provider.calls.map((c) => c.topic));
    assert.equal(topics.size, 1, "same Topic header, so an undelivered copy is replaced by the push service");
    const device = new FakeDevice();
    for (const call of world.provider.calls) device.receive(call.tag);
    assert.equal(device.visibleNotifications(), 1, "same notification tag, so the second replaces the first");
  });
});

describe("AT-07 outbox: permanent errors", () => {
  for (const status of [404, 410]) {
    it(`${status} disables the subscription, dead-letters the event and stops sending to it`, async () => {
      const world = makeWorld({ "sub-1": [status, 201] });
      world.store.enqueue(READY);
      await world.worker.tick();
      assert.ok(world.store.getSubscription("sub-1")?.disabledAt, "subscription disabled");
      assert.equal(world.store.deadLetters().length, 1);

      world.store.enqueue({ ...READY, idempotencyKey: "order.ready:order-2:sub-1" });
      await drain(world);
      assert.equal(world.provider.calls.length, 1, "no endless retry loop on a dead endpoint");
      assert.equal(world.store.deadLetters().length, 2);
      assert.match(world.store.deadLetters()[1]?.lastError ?? "", /subscription disabled/);
    });
  }

  it("401/403 (VAPID problem) dead-letters without retry and keeps the subscription", async () => {
    const world = makeWorld({ "sub-1": [403] });
    world.store.enqueue(READY);
    await drain(world);
    assert.equal(world.provider.calls.length, 1);
    assert.equal(world.store.getSubscription("sub-1")?.disabledAt, null);
    assert.match(world.store.deadLetters()[0]?.lastError ?? "", /403/);
  });

  it("an unknown subscription id is dead-lettered, not retried forever", async () => {
    const world = makeWorld();
    world.store.enqueue({ ...READY, subscriptionId: "missing" });
    await drain(world);
    assert.equal(world.provider.calls.length, 0);
    assert.match(world.store.deadLetters()[0]?.lastError ?? "", /unknown subscription/);
  });
});

describe("FR-12 topic header", () => {
  it("is stable per idempotency key, at most 32 URL-safe characters (RFC 8030 §5.4)", () => {
    const topic = topicFor(READY.idempotencyKey);
    assert.equal(topic, topicFor(READY.idempotencyKey));
    assert.ok(topic.length <= 32);
    assert.match(topic, /^[A-Za-z0-9_-]+$/);
    assert.notEqual(topic, topicFor("order.ready:order-2:sub-1"));
  });
});
