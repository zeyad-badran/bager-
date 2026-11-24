/**
 * Tests for the harness state behind the test page, with the fake provider (nothing is sent anywhere).
 *
 * Module:   spikes/web-push (THROWAWAY)
 * Serves:   FR-12, AT-07 · spike scope items 2–4
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FakePushProvider } from "./fake-provider";
import { Harness, MAX_SUBSCRIPTIONS } from "./harness";
import { fakeClock, SECOND } from "./test-support";

const input = { endpoint: "https://fcm.googleapis.com/fcm/send/phone-1", keys: { p256dh: "p", auth: "a" } };
const send = { kind: "plain", delaySeconds: 0, failFirst: 0, duplicate: false } as const;

function setup() {
  const clock = fakeClock();
  const provider = new FakePushProvider();
  const harness = new Harness(provider, clock.now);
  const subscribed = harness.subscribe(input);
  assert.ok("id" in subscribed);
  return { clock, provider, harness, id: subscribed.id };
}

describe("FR-12 harness", () => {
  it("the same browser subscribing again keeps its id (page reopened)", () => {
    const { harness, id } = setup();
    assert.deepEqual(harness.subscribe(input), { id, endpointKind: "Google FCM (Chrome, Edge on Android, Samsung)" });
  });

  it("'send twice' enqueues the same idempotency key twice and one push goes out", async () => {
    const { harness, provider, id } = setup();
    const result = harness.send({ ...send, subscriptionId: id, duplicate: true });
    assert.ok("eventId" in result && result.duplicateIgnored);
    await harness.worker.tick();
    await harness.worker.tick();
    assert.equal(provider.calls.length, 1);
  });

  it("a delayed send waits, then records time from due to service-worker receipt", async () => {
    const { harness, provider, clock, id } = setup();
    const result = harness.send({ ...send, subscriptionId: id, delaySeconds: 15 });
    assert.ok("eventId" in result);
    await harness.worker.tick();
    assert.equal(provider.calls.length, 0);
    clock.advance(15 * SECOND);
    await harness.worker.tick();
    clock.advance(1_200);
    harness.markReceived(result.eventId);
    harness.markClicked(result.eventId);
    const event = harness.status(id)?.events[0];
    assert.equal(event?.arrivalMs, 1_200);
    assert.ok(event?.clickedAt);
  });

  it("AT-07 forced failures: retries are visible in the status, then sent", async () => {
    const { harness, clock, id } = setup();
    harness.send({ ...send, subscriptionId: id, failFirst: 2 });
    for (let i = 0; i < 30; i += 1) {
      await harness.worker.tick();
      clock.advance(10 * SECOND);
    }
    const event = harness.status(id)?.events[0];
    assert.equal(event?.status, "sent");
    assert.deepEqual(event?.history.map((h) => h.outcome), ["retry", "retry", "accepted"]);
  });

  it("410 from the push service disables the phone's subscription and shows a dead letter", async () => {
    const { harness, provider, id } = setup();
    provider.script(id, [410]);
    harness.send({ ...send, subscriptionId: id });
    await harness.worker.tick();
    const status = harness.status(id);
    assert.ok(status?.subscription.disabledAt);
    assert.equal(status?.deadLetters.length, 1);
    assert.notDeepEqual(harness.subscribe(input), { id }, "a re-subscribe after 410 gets a fresh subscription");
  });

  it("refuses unknown subscriptions and caps how many can be added", () => {
    const { harness } = setup();
    assert.ok("error" in harness.send({ ...send, subscriptionId: "nope" }));
    for (let i = 1; i < MAX_SUBSCRIPTIONS; i += 1) harness.subscribe({ ...input, endpoint: `${input.endpoint}-${i}` });
    assert.ok("error" in harness.subscribe({ ...input, endpoint: `${input.endpoint}-overflow` }));
  });
});
