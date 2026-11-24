/**
 * Claim service: binds a per-order secret to an order INSTANCE, claims with
 * (branch, ticket number, secret) without enumeration, and offers a staff-assisted fallback.
 *
 * Module:   spikes/claim-token (THROWAWAY, never imported by product code)
 * Serves:   FR-08 (secure order claim), FR-09, AT-03, AT-04 · spec items 2, 3, 5, 6
 *           · blueprint §9, risks "Order-number-only claiming", "Ticket number reuse"
 * Protects: a ticket number alone never grants access; every failure returns the same answer
 *           with the same amount of work; old secrets and sessions never reach a reused number.
 */
import { randomUUID } from "node:crypto";
import { DeviceRegistry, type DeviceEvent } from "./devices";
import { MultiKeyLimiter, type Clock, type LimitRule } from "./rate-limiter";
import { generateNumericCode, generateToken, hashSecret, secretsMatch } from "./secrets";

export interface ClaimConfig {
  /** HMAC key from the host's secret store. A parameter: never a file, never a constant. */
  readonly serverKey: Uint8Array;
  /** "token": >= 128-bit QR/link secret. "code": short digits a customer can type (needs the limiter). */
  readonly secretKind: "token" | "code";
  readonly codeDigits: number;
  /** How long a receipt secret can be used after the order is created. */
  readonly claimSecretTtlMs: number;
  readonly sessionTtlMs: number;
  readonly inviteTtlMs: number;
  readonly inviteMaxUses: number;
  readonly deviceCap: number;
  readonly staffCodeTtlMs: number;
  readonly staffCodeDigits: number;
  /** Rate limits for claim and staff-code attempts; rule names "ip", "device", "branch". */
  readonly limits: readonly LimitRule[];
}

/** Who is asking. In a real route these come from the request, never from the body. */
export interface RequestContext {
  readonly ip: string;
  readonly deviceId: string;
}

export type ClaimResult =
  | { ok: true; sessionToken: string; sessionId: string }
  | { ok: false; error: "CLAIM_FAILED" | "RATE_LIMITED" | "DEVICE_CAP_REACHED" };

/** Audit events: identifiers only, never secrets, codes or customer data (blueprint §14.2). */
export type ClaimEvent =
  | DeviceEvent
  | { type: "claim.succeeded"; orderId: string; sessionId: string; at: number }
  | { type: "claim.staff_code_issued"; orderId: string; staffUserId: string; at: number }
  | { type: "claim.staff_code_redeemed"; orderId: string; staffUserId: string; sessionId: string; at: number };

interface OrderClaim {
  readonly orderId: string;
  readonly branchId: string;
  readonly secretHash: Buffer;
  readonly expiresAt: number;
  consumedAt: number | null;
  closedAt: number | null;
}

interface StaffCode {
  readonly orderId: string;
  readonly staffUserId: string;
  readonly expiresAt: number;
  usedAt: number | null;
}

/** The one failure answer for every claim problem: no hint which part was wrong (AT-03). */
const CLAIM_FAILED = { ok: false, error: "CLAIM_FAILED" } as const;
const RATE_LIMITED = { ok: false, error: "RATE_LIMITED" } as const;

export class ClaimService {
  private readonly orders = new Map<string, OrderClaim>();
  /** (branch, ticket number) -> order instances that ever used that number there. */
  private readonly byTicket = new Map<string, OrderClaim[]>();
  private readonly staffCodes = new Map<string, StaffCode>();
  private readonly limiter: MultiKeyLimiter;
  private readonly devices: DeviceRegistry;
  /** Compared against when no order matches, so "unknown ticket" costs the same work (timing). */
  private readonly dummy: OrderClaim;

  constructor(
    private readonly config: ClaimConfig,
    private readonly clock: Clock,
    private readonly emit: (event: ClaimEvent) => void,
  ) {
    this.limiter = new MultiKeyLimiter(config.limits, clock);
    this.devices = new DeviceRegistry(config, clock, (orderId) => this.isOpen(orderId), emit);
    this.dummy = {
      orderId: "", branchId: "", secretHash: hashSecret(generateToken(), config.serverKey),
      expiresAt: 0, consumedAt: 0, closedAt: 0,
    };
  }

  /**
   * A new order instance and its receipt secret. The raw secret is returned ONCE (to print);
   * only its hash is kept. A reused ticket number gets a new instance and a new secret.
   */
  registerOrder(branchId: string, ticketNumber: string): { orderId: string; claimSecret: string } {
    const claimSecret = this.config.secretKind === "token" ? generateToken() : generateNumericCode(this.config.codeDigits);
    const order: OrderClaim = {
      orderId: randomUUID(),
      branchId,
      secretHash: hashSecret(claimSecret, this.config.serverKey),
      expiresAt: this.clock() + this.config.claimSecretTtlMs,
      consumedAt: null,
      closedAt: null,
    };
    this.orders.set(order.orderId, order);
    const key = ticketKey(branchId, ticketNumber);
    this.byTicket.set(key, [...(this.byTicket.get(key) ?? []), order]);
    return { orderId: order.orderId, claimSecret };
  }

  /** The order reached collected/cancelled: no more claims, invites or staff codes. */
  closeOrder(orderId: string): void {
    const order = this.orders.get(orderId);
    if (order && order.closedAt === null) order.closedAt = this.clock();
  }

  /**
   * First-device claim. Same answer and same work for unknown ticket, wrong secret, expired,
   * already used or closed: one HMAC, then one constant-time comparison per candidate (or one
   * against a dummy), with no early exit.
   */
  claim(context: RequestContext, branchId: string, ticketNumber: string, secret: string): ClaimResult {
    if (!this.limiter.attempt({ ip: context.ip, device: context.deviceId, branch: branchId })) return RATE_LIMITED;

    const presented = hashSecret(secret, this.config.serverKey);
    const candidates = this.byTicket.get(ticketKey(branchId, ticketNumber)) ?? [this.dummy];
    let match: OrderClaim | undefined;
    for (const candidate of candidates) {
      const isEqual = secretsMatch(candidate.secretHash, presented);
      const isUsable = this.isClaimable(candidate);
      if (isEqual && isUsable && match === undefined) match = candidate;
    }
    if (!match) return CLAIM_FAILED;

    const opened = this.devices.openSession(match.orderId, true);
    if (!opened.ok) return CLAIM_FAILED;
    match.consumedAt = this.clock(); // single-use: a photo of the receipt is useless afterwards
    this.emit({ type: "claim.succeeded", orderId: match.orderId, sessionId: opened.sessionId, at: this.clock() });
    return opened;
  }

  /**
   * Staff at the counter issue a one-time code for an open order (after checking the customer
   * in person). Unique among the branch's live codes.
   * @throws Error if the order is unknown or closed
   */
  issueStaffCode(staffUserId: string, orderId: string): { code: string } {
    const order = this.orders.get(orderId);
    if (!order || !this.isOpen(orderId)) throw new Error("order is not open");
    let code: string;
    do {
      code = generateNumericCode(this.config.staffCodeDigits);
    } while (this.isLiveStaffCode(this.staffKey(order.branchId, code)));
    this.staffCodes.set(this.staffKey(order.branchId, code), {
      orderId, staffUserId, expiresAt: this.clock() + this.config.staffCodeTtlMs, usedAt: null,
    });
    this.emit({ type: "claim.staff_code_issued", orderId, staffUserId, at: this.clock() });
    return { code };
  }

  /** Customer types the staff code. Rate limited like claim; once only; short TTL. */
  redeemStaffCode(context: RequestContext, branchId: string, code: string): ClaimResult {
    if (!this.limiter.attempt({ ip: context.ip, device: context.deviceId, branch: branchId })) return RATE_LIMITED;
    const key = this.staffKey(branchId, code);
    const staffCode = this.staffCodes.get(key);
    if (!staffCode || !this.isLiveStaffCode(key) || !this.isOpen(staffCode.orderId)) return CLAIM_FAILED;

    const opened = this.devices.openSession(staffCode.orderId, !this.devices.hasActivePrimary(staffCode.orderId));
    if (!opened.ok) return opened;
    staffCode.usedAt = this.clock();
    this.emit({
      type: "claim.staff_code_redeemed", orderId: staffCode.orderId, staffUserId: staffCode.staffUserId,
      sessionId: opened.sessionId, at: this.clock(),
    });
    return opened;
  }

  verifySession(sessionToken: string) {
    return this.devices.verify(sessionToken);
  }

  createInvite(sessionToken: string) {
    return this.devices.createInvite(sessionToken);
  }

  joinWithInvite(context: RequestContext, inviteToken: string) {
    if (!this.limiter.attempt({ ip: context.ip, device: context.deviceId })) return RATE_LIMITED;
    return this.devices.join(inviteToken);
  }

  revokeDevice(primarySessionToken: string, targetSessionId: string): boolean {
    return this.devices.revoke(primarySessionToken, targetSessionId);
  }

  activeDeviceCount(orderId: string): number {
    return this.devices.activeCount(orderId);
  }

  private isOpen(orderId: string): boolean {
    return this.orders.get(orderId)?.closedAt === null;
  }

  private isClaimable(order: OrderClaim): boolean {
    return order.consumedAt === null && order.closedAt === null && this.clock() < order.expiresAt;
  }

  private isLiveStaffCode(key: string): boolean {
    const staffCode = this.staffCodes.get(key);
    return staffCode !== undefined && staffCode.usedAt === null && this.clock() < staffCode.expiresAt;
  }

  /** Staff codes are stored under the HMAC of branch + code, never the code itself. */
  private staffKey(branchId: string, code: string): string {
    return hashSecret(`${branchId}\u0000${code}`, this.config.serverKey).toString("hex");
  }
}

function ticketKey(branchId: string, ticketNumber: string): string {
  return `${branchId}\u0000${ticketNumber}`;
}
