/**
 * Tests for the in-memory sliding-window rate limiter, including the brute-force scenario.
 *
 * Module:   spikes/claim-token (THROWAWAY)
 * Serves:   AT-03 (spec item 5: limiter keyed by IP/device/branch, injectable clock; guessing
 *           10,000 six-digit codes is stopped long before it succeeds)
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MultiKeyLimiter, SlidingWindowLimiter } from "./rate-limiter";
import { BRANCH, MINUTE, fakeClock, makeService } from "./test-support";

describe("AT-03 sliding-window limiter", () => {
  it("allows `limit` attempts per window, then blocks", () => {
    const clock = fakeClock();
    const limiter = new SlidingWindowLimiter({ limit: 3, windowMs: MINUTE }, clock.now);
    assert.deepEqual([1, 2, 3, 4].map(() => limiter.attempt("k")), [true, true, true, false]);
  });

  it("the window slides: an attempt frees up exactly windowMs after it was made", () => {
    const clock = fakeClock();
    const limiter = new SlidingWindowLimiter({ limit: 2, windowMs: MINUTE }, clock.now);
    limiter.attempt("k");
    clock.advance(30_000);
    limiter.attempt("k");
    assert.equal(limiter.attempt("k"), false);
    clock.advance(29_999);
    assert.equal(limiter.attempt("k"), false, "first attempt is still inside the window");
    clock.advance(1);
    assert.equal(limiter.attempt("k"), true, "first attempt has left the window");
  });

  it("keys are independent", () => {
    const clock = fakeClock();
    const limiter = new SlidingWindowLimiter({ limit: 1, windowMs: MINUTE }, clock.now);
    assert.equal(limiter.attempt("a"), true);
    assert.equal(limiter.attempt("b"), true);
    assert.equal(limiter.attempt("a"), false);
  });
});

describe("AT-03 multi-key limiter (IP, device, branch)", () => {
  const rules = [
    { name: "ip", limit: 2, windowMs: MINUTE },
    { name: "device", limit: 5, windowMs: MINUTE },
    { name: "branch", limit: 4, windowMs: MINUTE },
  ];

  it("blocks when ANY key is over its limit, and a blocked attempt does not use up the others", () => {
    const clock = fakeClock();
    const limiter = new MultiKeyLimiter(rules, clock.now);
    const keys = { ip: "1.1.1.1", device: "d1", branch: "b1" };
    assert.equal(limiter.attempt(keys), true);
    assert.equal(limiter.attempt(keys), true);
    assert.equal(limiter.attempt(keys), false, "IP limit reached");
    // Same branch, new IP and device: the branch still has 2 of 4 left, because the blocked
    // attempt above was not counted against it.
    assert.equal(limiter.attempt({ ip: "2.2.2.2", device: "d2", branch: "b1" }), true);
    assert.equal(limiter.attempt({ ip: "3.3.3.3", device: "d3", branch: "b1" }), true);
    assert.equal(limiter.attempt({ ip: "4.4.4.4", device: "d4", branch: "b1" }), false, "branch limit reached");
  });
});

describe("AT-03 brute force: guessing 10,000 six-digit codes", () => {
  const LIMITS = [
    { name: "ip", limit: 10, windowMs: 15 * MINUTE },
    { name: "device", limit: 10, windowMs: 15 * MINUTE },
    { name: "branch", limit: 300, windowMs: 15 * MINUTE },
  ];
  const GUESSES = 10_000;
  const GUESS_INTERVAL_MS = 100; // 10 guesses per second, the whole run lasts under 17 minutes

  /** Try every code from 000000 upwards; the real code is guess number 10,000 (worst case for us). */
  function bruteForce(rotateIdentity: boolean) {
    const { service, clock } = makeService({ secretKind: "code", codeDigits: 6, limits: LIMITS });
    const { claimSecret } = service.registerOrder(BRANCH, "42");
    const guesses = Array.from({ length: GUESSES - 1 }, (_, i) => String(i).padStart(6, "0"))
      .filter((code) => code !== claimSecret);
    guesses.push(claimSecret);

    let allowed = 0;
    let succeeded = false;
    guesses.forEach((code, i) => {
      const who = rotateIdentity ? { ip: `ip-${i}`, deviceId: `dev-${i}` } : { ip: "203.0.113.5", deviceId: "attacker" };
      const result = service.claim(who, BRANCH, "42", code);
      if (!(result.ok === false && result.error === "RATE_LIMITED")) allowed += 1;
      if (result.ok) succeeded = true;
      clock.advance(GUESS_INTERVAL_MS);
    });
    return { allowed, succeeded };
  }

  it("one IP/device gets 10 of 10,000 guesses checked in ~17 minutes, and never the right one", (t) => {
    const { allowed, succeeded } = bruteForce(false);
    t.diagnostic(`single identity: ${allowed} of ${GUESSES} guesses reached the secret check`);
    assert.equal(succeeded, false);
    assert.ok(allowed <= 20, `allowed ${allowed}`);
  });

  it("rotating IP and device on every guess is still capped by the branch key (300 per 15 min)", (t) => {
    const { allowed, succeeded } = bruteForce(true);
    t.diagnostic(`rotating identities: ${allowed} of ${GUESSES} guesses reached the secret check`);
    assert.equal(succeeded, false);
    assert.ok(allowed <= 600, `allowed ${allowed}`);
  });
});
