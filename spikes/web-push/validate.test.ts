/**
 * Tests for validating what the harness page posts to the local sender.
 *
 * Module:   spikes/web-push (THROWAWAY)
 * Serves:   FR-12 · code-style §4 (validate all external input at the boundary)
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MAX_DELAY_SECONDS, MAX_FORCED_FAILURES, parseSendRequest, parseSubscription } from "./validate";

const subscription = {
  endpoint: "https://fcm.googleapis.com/fcm/send/abc",
  expirationTime: null,
  keys: { p256dh: "BNcR...", auth: "tBHI..." },
};

describe("FR-12 subscription from the browser", () => {
  it("accepts the shape PushSubscription.toJSON() produces", () => {
    assert.deepEqual(parseSubscription(subscription), {
      ok: true,
      value: { endpoint: subscription.endpoint, keys: subscription.keys },
    });
  });

  it("rejects non-https endpoints, missing keys and non-objects", () => {
    assert.equal(parseSubscription({ ...subscription, endpoint: "http://fcm.googleapis.com/x" }).ok, false);
    assert.equal(parseSubscription({ ...subscription, keys: { p256dh: "x" } }).ok, false);
    assert.equal(parseSubscription("nope").ok, false);
    assert.equal(parseSubscription(null).ok, false);
  });

  it("rejects absurdly long values", () => {
    assert.equal(parseSubscription({ ...subscription, endpoint: `https://x.test/${"a".repeat(5000)}` }).ok, false);
  });
});

describe("FR-12 send request from the harness buttons", () => {
  it("accepts the three notification kinds with a delay and forced failures", () => {
    const parsed = parseSendRequest({ subscriptionId: "s1", kind: "vibrate", delaySeconds: 15, failFirst: 2, duplicate: true });
    assert.deepEqual(parsed, {
      ok: true,
      value: { subscriptionId: "s1", kind: "vibrate", delaySeconds: 15, failFirst: 2, duplicate: true },
    });
  });

  it("defaults: no delay, no forced failures, no duplicate", () => {
    const parsed = parseSendRequest({ subscriptionId: "s1", kind: "plain" });
    assert.deepEqual(parsed, {
      ok: true,
      value: { subscriptionId: "s1", kind: "plain", delaySeconds: 0, failFirst: 0, duplicate: false },
    });
  });

  it("rejects unknown kinds and out-of-range numbers", () => {
    assert.equal(parseSendRequest({ subscriptionId: "s1", kind: "sms" }).ok, false);
    assert.equal(parseSendRequest({ subscriptionId: "s1", kind: "plain", delaySeconds: MAX_DELAY_SECONDS + 1 }).ok, false);
    assert.equal(parseSendRequest({ subscriptionId: "s1", kind: "plain", delaySeconds: -1 }).ok, false);
    assert.equal(parseSendRequest({ subscriptionId: "s1", kind: "plain", failFirst: MAX_FORCED_FAILURES + 1 }).ok, false);
    assert.equal(parseSendRequest({ kind: "plain" }).ok, false);
  });
});
