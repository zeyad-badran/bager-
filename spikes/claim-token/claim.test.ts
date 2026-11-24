/**
 * Tests for claiming an order with (branch, ticket number, secret).
 *
 * Module:   spikes/claim-token (THROWAWAY)
 * Serves:   FR-08 (secure order claim), AT-03 (unauthorized user guesses ticket number)
 *           · spec items 2 (no enumeration) and 3 (ticket-number reuse), blueprint §9, §5.2
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BRANCH, CUSTOMER, MINUTE, makeService } from "./test-support";

const CLAIM_FAILED = { ok: false, error: "CLAIM_FAILED" } as const;

describe("AT-03 claim with the receipt secret", () => {
  it("the right secret claims the order and opens a session bound to that order", () => {
    const { service } = makeService();
    const { orderId, claimSecret } = service.registerOrder(BRANCH, "42");
    const result = service.claim(CUSTOMER, BRANCH, "42", claimSecret);
    assert.equal(result.ok, true);
    assert.ok(result.ok);
    assert.equal(service.verifySession(result.sessionToken)?.orderId, orderId);
  });

  it("the ticket number alone, or with a wrong secret, claims nothing", () => {
    const { service } = makeService();
    service.registerOrder(BRANCH, "42");
    assert.deepEqual(service.claim(CUSTOMER, BRANCH, "42", ""), CLAIM_FAILED);
    assert.deepEqual(service.claim(CUSTOMER, BRANCH, "42", "not-the-secret"), CLAIM_FAILED);
  });

  it("a short numeric code works the same way when the POS can only print digits", () => {
    const { service } = makeService({ secretKind: "code", codeDigits: 6 });
    const { claimSecret } = service.registerOrder(BRANCH, "42");
    assert.match(claimSecret, /^\d{6}$/);
    assert.equal(service.claim(CUSTOMER, BRANCH, "42", claimSecret).ok, true);
  });
});

describe("AT-03 no enumeration: every failure looks the same", () => {
  it("unknown ticket, wrong secret, expired, already used, closed order and other branch give one identical answer", () => {
    const { service, clock } = makeService({ claimSecretTtlMs: 30 * MINUTE });
    const wrong = service.registerOrder(BRANCH, "10");
    const expired = service.registerOrder(BRANCH, "11");
    const used = service.registerOrder(BRANCH, "12");
    const closed = service.registerOrder(BRANCH, "13");
    service.claim(CUSTOMER, BRANCH, "12", used.claimSecret);
    service.closeOrder(closed.orderId);
    clock.advance(20 * MINUTE);
    const fresh = service.registerOrder(BRANCH, "14");
    clock.advance(10 * MINUTE); // order 11 is now exactly at its expiry, 14 is not

    const answers = [
      service.claim(CUSTOMER, BRANCH, "999", wrong.claimSecret), //  unknown ticket
      service.claim(CUSTOMER, BRANCH, "10", "guess"), //               wrong secret
      service.claim(CUSTOMER, BRANCH, "11", expired.claimSecret), //   expired secret
      service.claim(CUSTOMER, BRANCH, "12", used.claimSecret), //      already used (replay)
      service.claim(CUSTOMER, BRANCH, "13", closed.claimSecret), //    order closed
      service.claim(CUSTOMER, "another-branch", "14", fresh.claimSecret), // right secret, wrong branch
    ];
    for (const answer of answers) assert.deepEqual(answer, CLAIM_FAILED);
    assert.equal(service.claim(CUSTOMER, BRANCH, "14", fresh.claimSecret).ok, true, "control: a valid claim still works");
  });
});

describe("AT-03 expiry boundaries", () => {
  it("works 1 ms before expiry and fails exactly at expiry", () => {
    const ttl = 30 * MINUTE;
    const early = makeService({ claimSecretTtlMs: ttl });
    const a = early.service.registerOrder(BRANCH, "1");
    early.clock.advance(ttl - 1);
    assert.equal(early.service.claim(CUSTOMER, BRANCH, "1", a.claimSecret).ok, true);

    const late = makeService({ claimSecretTtlMs: ttl });
    const b = late.service.registerOrder(BRANCH, "1");
    late.clock.advance(ttl);
    assert.deepEqual(late.service.claim(CUSTOMER, BRANCH, "1", b.claimSecret), CLAIM_FAILED);
  });
});

describe("AT-03 replay", () => {
  it("the receipt secret is single-use: a photo of the receipt is useless once the order was claimed", () => {
    const { service } = makeService();
    const { claimSecret } = service.registerOrder(BRANCH, "42");
    assert.equal(service.claim(CUSTOMER, BRANCH, "42", claimSecret).ok, true);
    assert.deepEqual(service.claim({ ip: "203.0.113.9", deviceId: "thief" }, BRANCH, "42", claimSecret), CLAIM_FAILED);
  });
});

describe("AT-03 tampered token", () => {
  it("changing one character of the secret makes it fail", () => {
    const { service } = makeService();
    const { claimSecret } = service.registerOrder(BRANCH, "42");
    const tampered = claimSecret.slice(0, -1) + (claimSecret.endsWith("A") ? "B" : "A");
    assert.deepEqual(service.claim(CUSTOMER, BRANCH, "42", tampered), CLAIM_FAILED);
  });

  it("a forged session token resolves to nothing", () => {
    const { service } = makeService();
    const { claimSecret } = service.registerOrder(BRANCH, "42");
    const result = service.claim(CUSTOMER, BRANCH, "42", claimSecret);
    assert.ok(result.ok);
    const forged = result.sessionToken.slice(0, -1) + (result.sessionToken.endsWith("A") ? "B" : "A");
    assert.equal(service.verifySession(forged), null);
  });
});

describe("AT-03 ticket-number reuse (risk 'Ticket number reuse')", () => {
  it("a reused number never resolves to the old order, and an old token never unlocks the new order", () => {
    const { service } = makeService();
    const first = service.registerOrder(BRANCH, "7");
    const firstClaim = service.claim(CUSTOMER, BRANCH, "7", first.claimSecret);
    assert.ok(firstClaim.ok);
    service.closeOrder(first.orderId);

    const second = service.registerOrder(BRANCH, "7"); // the POS hands out 7 again
    assert.notEqual(second.orderId, first.orderId);

    assert.deepEqual(service.claim(CUSTOMER, BRANCH, "7", first.claimSecret), CLAIM_FAILED, "old secret, new order");
    assert.equal(service.verifySession(firstClaim.sessionToken)?.orderId, first.orderId, "old session stays on the OLD order");

    const secondClaim = service.claim(CUSTOMER, BRANCH, "7", second.claimSecret);
    assert.ok(secondClaim.ok);
    assert.equal(service.verifySession(secondClaim.sessionToken)?.orderId, second.orderId);
  });

  it("two open orders with the same number in one branch are told apart by their own secrets", () => {
    const { service } = makeService();
    const a = service.registerOrder(BRANCH, "5");
    const b = service.registerOrder(BRANCH, "5");
    const claimB = service.claim(CUSTOMER, BRANCH, "5", b.claimSecret);
    assert.ok(claimB.ok);
    assert.equal(service.verifySession(claimB.sessionToken)?.orderId, b.orderId);
    assert.notEqual(service.verifySession(claimB.sessionToken)?.orderId, a.orderId);
  });
});
