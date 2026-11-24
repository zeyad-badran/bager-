/**
 * Tests for the forced-failure wrapper the harness uses to show retries on a real phone.
 *
 * Module:   spikes/web-push (THROWAWAY)
 * Serves:   AT-07 (push provider unavailable: the job retries and the notification still arrives)
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FakePushProvider } from "./fake-provider";
import { ForcedFailureProvider } from "./forced-failures";
import { drain, makeWorld, syntheticSubscription } from "./test-support";
import { OutboxWorker } from "./outbox";

const message = { eventId: "e1", payload: "{}", topic: "t", tag: "k", ttlSeconds: 60, urgency: "high" as const };

describe("AT-07 forced failures", () => {
  it("answers 503 for the first N attempts of that event only, then passes through", async () => {
    const inner = new FakePushProvider();
    const provider = new ForcedFailureProvider(inner);
    provider.failNext("e1", 2);
    const sub = { ...syntheticSubscription("s"), disabledAt: null, disabledReason: null };
    const statuses = [];
    for (let i = 0; i < 3; i += 1) {
      const result = await provider.send(sub, message);
      statuses.push(result.kind === "response" ? result.statusCode : result.kind);
    }
    assert.deepEqual(statuses, [503, 503, 201]);
    assert.equal(inner.calls.length, 1, "the forced failures never reach the real provider");
    const other = await provider.send(sub, { ...message, eventId: "e2" });
    assert.equal(other.kind === "response" && other.statusCode, 201);
  });

  it("with the outbox worker: two forced failures, then the event is sent", async () => {
    const world = makeWorld();
    const provider = new ForcedFailureProvider(world.provider);
    const { event } = world.store.enqueue({ idempotencyKey: "k", subscriptionId: "sub-1", payload: "{}" });
    provider.failNext(event.id, 2);
    world.worker = new OutboxWorker({
      store: world.store,
      provider,
      now: world.clock.now,
      random: () => 0.5,
      policy: { baseDelayMs: 1_000, maxDelayMs: 30_000, maxAttempts: 5 },
      leaseMs: 10_000,
    });
    await drain(world);
    assert.equal(event.status, "sent");
    assert.deepEqual(event.history.map((a) => a.detail), ["HTTP 503", "HTTP 503", "HTTP 201"]);
  });
});
