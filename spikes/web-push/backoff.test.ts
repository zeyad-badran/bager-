/**
 * Tests for retry backoff with jitter and for classifying push-provider responses.
 *
 * Module:   spikes/web-push (THROWAWAY)
 * Serves:   FR-12, AT-07 · blueprint §7.4 (bounded exponential backoff with jitter; permanent vs
 *           retryable errors) · ADR-0004 PoC
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { backoffDelayMs } from "./backoff";
import { classifyResult, parseRetryAfter } from "./classify";
import { TEST_POLICY } from "./test-support";

describe("AT-07 backoff with jitter", () => {
  it("grows exponentially: the ceiling doubles per attempt (1 s, 2 s, 4 s, 8 s)", () => {
    const top = () => 0.999_999;
    const delays = [1, 2, 3, 4].map((attempt) => backoffDelayMs(attempt, TEST_POLICY, top));
    assert.deepEqual(delays.map((d) => Math.round(d / 1000)), [1, 2, 4, 8]);
  });

  it("is bounded by maxDelayMs however many attempts were made", () => {
    for (const attempt of [6, 10, 50, 1000]) {
      assert.ok(backoffDelayMs(attempt, TEST_POLICY, () => 0.999_999) <= TEST_POLICY.maxDelayMs);
    }
  });

  it("jitter: the delay lies between half and all of the ceiling, chosen by the random source", () => {
    // attempt 3: ceiling 4 s → delay in [2 s, 4 s)
    assert.equal(backoffDelayMs(3, TEST_POLICY, () => 0), 2_000);
    assert.equal(backoffDelayMs(3, TEST_POLICY, () => 0.5), 3_000);
    assert.ok(backoffDelayMs(3, TEST_POLICY, () => 0.999_999) < 4_000);
  });

  it("never retries instantly, so a failing provider is not hammered", () => {
    assert.ok(backoffDelayMs(1, TEST_POLICY, () => 0) >= TEST_POLICY.baseDelayMs / 2);
  });

  it("spreads many failing events apart (no thundering herd)", () => {
    const delays = new Set(Array.from({ length: 50 }, () => backoffDelayMs(4, TEST_POLICY, Math.random)));
    assert.ok(delays.size > 40, `only ${delays.size} distinct delays of 50`);
  });
});

describe("AT-07 classify provider results", () => {
  const response = (statusCode: number, retryAfterMs?: number) =>
    classifyResult({ kind: "response", statusCode, ...(retryAfterMs === undefined ? {} : { retryAfterMs }) });

  it("2xx means the push service accepted the message (NOT delivered, NOT seen)", () => {
    assert.equal(response(201).kind, "accepted");
    assert.equal(response(200).kind, "accepted");
  });

  it("404 and 410 mean the subscription is gone and must be disabled", () => {
    assert.equal(response(404).kind, "subscription-gone");
    assert.equal(response(410).kind, "subscription-gone");
  });

  it("429 and 5xx are retryable; 429 keeps the provider's Retry-After", () => {
    assert.deepEqual(response(429, 60_000), { kind: "retry", retryAfterMs: 60_000 });
    for (const status of [500, 502, 503, 504]) assert.equal(response(status).kind, "retry");
  });

  it("a network error or timeout is retryable (the message may or may not have been accepted)", () => {
    assert.equal(classifyResult({ kind: "network-error", message: "ECONNRESET" }).kind, "retry");
  });

  it("other 4xx (bad VAPID key, payload too large) are permanent: dead-letter, keep the subscription", () => {
    for (const status of [400, 401, 403, 413]) assert.equal(response(status).kind, "permanent");
  });
});

describe("AT-07 Retry-After header", () => {
  const now = Date.UTC(2026, 10, 25, 12, 0, 0);

  it("reads delay-seconds and HTTP dates; ignores missing or unreadable values", () => {
    assert.equal(parseRetryAfter("120", now), 120_000);
    assert.equal(parseRetryAfter(new Date(now + 30_000).toUTCString(), now), 30_000);
    assert.equal(parseRetryAfter(new Date(now - 30_000).toUTCString(), now), 0);
    assert.equal(parseRetryAfter(undefined, now), undefined);
    assert.equal(parseRetryAfter("soon", now), undefined);
  });
});
