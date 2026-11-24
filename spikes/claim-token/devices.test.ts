/**
 * Tests for additional devices: invitation, own session per device, revocation, device cap.
 *
 * Module:   spikes/claim-token (THROWAWAY)
 * Serves:   FR-09 (multiple customer devices), AT-04 (one order followed on several devices;
 *           one device can be revoked without corrupting others) · spec item 4
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BRANCH, CUSTOMER, MINUTE, OTHER_DEVICE, THIRD_DEVICE, makeService } from "./test-support";

/** An order claimed by the first device. */
function claimed(overrides = {}) {
  const ctx = makeService(overrides);
  const { orderId, claimSecret } = ctx.service.registerOrder(BRANCH, "42");
  const first = ctx.service.claim(CUSTOMER, BRANCH, "42", claimSecret);
  assert.ok(first.ok);
  return { ...ctx, orderId, first };
}

function invite(service: ReturnType<typeof makeService>["service"], sessionToken: string): string {
  const result = service.createInvite(sessionToken);
  assert.ok(result.ok);
  return result.inviteToken;
}

describe("AT-04 a second device joins with an invitation", () => {
  it("the joined device gets its OWN session on the same order", () => {
    const { service, orderId, first } = claimed();
    const joined = service.joinWithInvite(OTHER_DEVICE, invite(service, first.sessionToken));
    assert.ok(joined.ok);
    assert.notEqual(joined.sessionToken, first.sessionToken);
    assert.notEqual(joined.sessionId, first.sessionId);
    assert.equal(service.verifySession(joined.sessionToken)?.orderId, orderId);
    assert.equal(service.activeDeviceCount(orderId), 2);
  });

  it("only the first device may invite; a joined device cannot", () => {
    const { service, first } = claimed();
    const joined = service.joinWithInvite(OTHER_DEVICE, invite(service, first.sessionToken));
    assert.ok(joined.ok);
    assert.deepEqual(service.createInvite(joined.sessionToken), { ok: false, error: "NOT_ALLOWED" });
    assert.deepEqual(service.createInvite("forged-session"), { ok: false, error: "NOT_ALLOWED" });
  });
});

describe("AT-04 invitations are short-lived and bounded-use", () => {
  it("works 1 ms before its TTL and fails exactly at it (TTL is a parameter)", () => {
    const early = claimed({ inviteTtlMs: 5 * MINUTE });
    const tokenA = invite(early.service, early.first.sessionToken);
    early.clock.advance(5 * MINUTE - 1);
    assert.equal(early.service.joinWithInvite(OTHER_DEVICE, tokenA).ok, true);

    const late = claimed({ inviteTtlMs: 5 * MINUTE });
    const tokenB = invite(late.service, late.first.sessionToken);
    late.clock.advance(5 * MINUTE);
    assert.deepEqual(late.service.joinWithInvite(OTHER_DEVICE, tokenB), { ok: false, error: "INVITE_INVALID" });
  });

  it("stops after inviteMaxUses joins (replay of the invite link)", () => {
    const { service, first } = claimed({ inviteMaxUses: 1, deviceCap: 5 });
    const token = invite(service, first.sessionToken);
    assert.equal(service.joinWithInvite(OTHER_DEVICE, token).ok, true);
    assert.deepEqual(service.joinWithInvite(THIRD_DEVICE, token), { ok: false, error: "INVITE_INVALID" });
  });

  it("a tampered or unknown invitation is refused", () => {
    const { service, first } = claimed();
    const token = invite(service, first.sessionToken);
    const tampered = token.slice(0, -1) + (token.endsWith("A") ? "B" : "A");
    assert.deepEqual(service.joinWithInvite(OTHER_DEVICE, tampered), { ok: false, error: "INVITE_INVALID" });
  });

  it("an invitation for a closed order is refused", () => {
    const { service, orderId, first } = claimed();
    const token = invite(service, first.sessionToken);
    service.closeOrder(orderId);
    assert.deepEqual(service.joinWithInvite(OTHER_DEVICE, token), { ok: false, error: "INVITE_INVALID" });
  });
});

describe("AT-04 device cap is a parameter", () => {
  it("with deviceCap = 2 the third device is refused", () => {
    const { service, first } = claimed({ deviceCap: 2, inviteMaxUses: 5 });
    const token = invite(service, first.sessionToken);
    assert.equal(service.joinWithInvite(OTHER_DEVICE, token).ok, true);
    assert.deepEqual(service.joinWithInvite(THIRD_DEVICE, token), { ok: false, error: "DEVICE_CAP_REACHED" });
  });

  it("with deviceCap = 4 the same third device is accepted", () => {
    const { service, first } = claimed({ deviceCap: 4, inviteMaxUses: 5 });
    const token = invite(service, first.sessionToken);
    assert.equal(service.joinWithInvite(OTHER_DEVICE, token).ok, true);
    assert.equal(service.joinWithInvite(THIRD_DEVICE, token).ok, true);
  });

  it("revoking a device frees its place under the cap", () => {
    const { service, first } = claimed({ deviceCap: 2, inviteMaxUses: 5 });
    const token = invite(service, first.sessionToken);
    const second = service.joinWithInvite(OTHER_DEVICE, token);
    assert.ok(second.ok);
    assert.equal(service.revokeDevice(first.sessionToken, second.sessionId), true);
    assert.equal(service.joinWithInvite(THIRD_DEVICE, token).ok, true);
  });
});

describe("AT-04 revocation", () => {
  it("the first device revokes one device; that device loses access, the others keep it", () => {
    const { service, orderId, first } = claimed({ deviceCap: 5, inviteMaxUses: 5 });
    const token = invite(service, first.sessionToken);
    const second = service.joinWithInvite(OTHER_DEVICE, token);
    const third = service.joinWithInvite(THIRD_DEVICE, token);
    assert.ok(second.ok && third.ok);

    assert.equal(service.revokeDevice(first.sessionToken, second.sessionId), true);
    assert.equal(service.verifySession(second.sessionToken), null, "revoked device");
    assert.equal(service.verifySession(third.sessionToken)?.orderId, orderId, "other device untouched");
    assert.equal(service.verifySession(first.sessionToken)?.orderId, orderId, "first device untouched");
  });

  it("a joined device cannot revoke anyone, and nobody can revoke a device of another order", () => {
    const { service, first } = claimed({ deviceCap: 5, inviteMaxUses: 5 });
    const token = invite(service, first.sessionToken);
    const second = service.joinWithInvite(OTHER_DEVICE, token);
    const third = service.joinWithInvite(THIRD_DEVICE, token);
    assert.ok(second.ok && third.ok);
    assert.equal(service.revokeDevice(second.sessionToken, third.sessionId), false);

    const other = service.registerOrder(BRANCH, "43");
    const otherClaim = service.claim({ ip: "192.0.2.1", deviceId: "x" }, BRANCH, "43", other.claimSecret);
    assert.ok(otherClaim.ok);
    assert.equal(service.revokeDevice(otherClaim.sessionToken, second.sessionId), false);
    assert.notEqual(service.verifySession(second.sessionToken), null);
  });

  it("the first device cannot revoke itself (keeps one device in control)", () => {
    const { service, first } = claimed();
    assert.equal(service.revokeDevice(first.sessionToken, first.sessionId), false);
  });
});

describe("AT-04 sessions expire", () => {
  it("a session works 1 ms before sessionTtlMs and is gone at it", () => {
    const { service, clock, first } = claimed({ sessionTtlMs: 60 * MINUTE });
    clock.advance(60 * MINUTE - 1);
    assert.notEqual(service.verifySession(first.sessionToken), null);
    clock.advance(1);
    assert.equal(service.verifySession(first.sessionToken), null);
  });
});
