/**
 * Tests for the staff-assisted fallback: a one-time code staff give a customer at the counter.
 *
 * Module:   spikes/claim-token (THROWAWAY)
 * Serves:   FR-08, AT-03 · spec item 6 (staff-issued one-time code, short TTL, usable once,
 *           audited event emitted), blueprint §9.2 ("staff can assist ... without granting broad access")
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ClaimEvent } from "./claim-service";
import { BRANCH, CUSTOMER, MINUTE, OTHER_DEVICE, makeService } from "./test-support";

const STAFF = "00000000-0000-4000-8000-000000000003";

describe("AT-03 staff-assisted fallback", () => {
  it("a staff code opens a session on that order and both steps are audited", () => {
    const { service, events } = makeService();
    const { orderId } = service.registerOrder(BRANCH, "42");
    const { code } = service.issueStaffCode(STAFF, orderId);
    assert.match(code, /^\d{6}$/);

    const result = service.redeemStaffCode(CUSTOMER, BRANCH, code);
    assert.ok(result.ok);
    assert.equal(service.verifySession(result.sessionToken)?.orderId, orderId);

    const types = events.map((event) => event.type);
    assert.ok(types.includes("claim.staff_code_issued"));
    assert.ok(types.includes("claim.staff_code_redeemed"));
    const issued = events.find(
      (event): event is Extract<ClaimEvent, { type: "claim.staff_code_issued" }> => event.type === "claim.staff_code_issued",
    );
    assert.equal(issued?.staffUserId, STAFF);
    assert.equal(issued?.orderId, orderId);
  });

  it("audit events carry ids only: never the code itself", () => {
    const { service, events } = makeService();
    const { orderId } = service.registerOrder(BRANCH, "42");
    const { code } = service.issueStaffCode(STAFF, orderId);
    service.redeemStaffCode(CUSTOMER, BRANCH, code);
    assert.ok(!JSON.stringify(events).includes(code));
  });

  it("is usable once", () => {
    const { service } = makeService();
    const { orderId } = service.registerOrder(BRANCH, "42");
    const { code } = service.issueStaffCode(STAFF, orderId);
    assert.equal(service.redeemStaffCode(CUSTOMER, BRANCH, code).ok, true);
    assert.deepEqual(service.redeemStaffCode(OTHER_DEVICE, BRANCH, code), { ok: false, error: "CLAIM_FAILED" });
  });

  it("works 1 ms before its short TTL and fails exactly at it", () => {
    const early = makeService({ staffCodeTtlMs: 5 * MINUTE });
    const a = early.service.registerOrder(BRANCH, "42");
    const codeA = early.service.issueStaffCode(STAFF, a.orderId).code;
    early.clock.advance(5 * MINUTE - 1);
    assert.equal(early.service.redeemStaffCode(CUSTOMER, BRANCH, codeA).ok, true);

    const late = makeService({ staffCodeTtlMs: 5 * MINUTE });
    const b = late.service.registerOrder(BRANCH, "42");
    const codeB = late.service.issueStaffCode(STAFF, b.orderId).code;
    late.clock.advance(5 * MINUTE);
    assert.deepEqual(late.service.redeemStaffCode(CUSTOMER, BRANCH, codeB), { ok: false, error: "CLAIM_FAILED" });
  });

  it("a code is only valid in its own branch", () => {
    const { service } = makeService();
    const { orderId } = service.registerOrder(BRANCH, "42");
    const { code } = service.issueStaffCode(STAFF, orderId);
    assert.deepEqual(service.redeemStaffCode(CUSTOMER, "another-branch", code), { ok: false, error: "CLAIM_FAILED" });
  });

  it("cannot be issued for a closed order", () => {
    const { service } = makeService();
    const { orderId } = service.registerOrder(BRANCH, "42");
    service.closeOrder(orderId);
    assert.throws(() => service.issueStaffCode(STAFF, orderId), /order is not open/);
  });

  it("redeeming is rate limited like claiming", () => {
    const { service } = makeService({
      limits: [{ name: "ip", limit: 2, windowMs: 15 * MINUTE }],
    });
    service.registerOrder(BRANCH, "42");
    service.redeemStaffCode(CUSTOMER, BRANCH, "000000");
    service.redeemStaffCode(CUSTOMER, BRANCH, "000001");
    assert.deepEqual(service.redeemStaffCode(CUSTOMER, BRANCH, "000002"), { ok: false, error: "RATE_LIMITED" });
  });
});
