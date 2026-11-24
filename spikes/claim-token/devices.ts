/**
 * Device sessions and invitations for one order: each device has its own revocable session;
 * the first device invites more with a short-lived, bounded-use invitation; a device cap applies.
 *
 * Module:   spikes/claim-token (THROWAWAY, never imported by product code)
 * Serves:   FR-09 (multiple customer devices), AT-04 · spec item 4 · blueprint §9.2, §5.2
 *           ("a customer session is not the order itself")
 * Protects: session and invite tokens are stored only as HMAC hashes; every session is bound to
 *           ONE order instance (orderId), never to a ticket number, so ticket reuse cannot move it.
 */
import { randomUUID } from "node:crypto";
import type { Clock } from "./rate-limiter";
import { generateToken, hashSecret } from "./secrets";

export interface DeviceSettings {
  readonly serverKey: Uint8Array;
  readonly sessionTtlMs: number;
  readonly inviteTtlMs: number;
  readonly inviteMaxUses: number;
  /** Maximum active devices per order. A parameter, never a constant (ADR-0006). */
  readonly deviceCap: number;
}

interface Session {
  readonly sessionId: string;
  readonly orderId: string;
  readonly isPrimary: boolean;
  readonly expiresAt: number;
  revokedAt: number | null;
}

interface Invite {
  readonly orderId: string;
  readonly expiresAt: number;
  readonly maxUses: number;
  uses: number;
}

export type DeviceEvent =
  | { type: "invite.created"; orderId: string; sessionId: string; at: number }
  | { type: "device.joined"; orderId: string; sessionId: string; at: number }
  | { type: "device.revoked"; orderId: string; sessionId: string; at: number };

export type OpenSessionResult =
  | { ok: true; sessionToken: string; sessionId: string }
  | { ok: false; error: "DEVICE_CAP_REACHED" };

export class DeviceRegistry {
  /** Keyed by the HMAC of the session token (hex). The raw token is never stored. */
  private readonly sessionsByHash = new Map<string, Session>();
  private readonly sessionsById = new Map<string, Session>();
  private readonly invitesByHash = new Map<string, Invite>();

  constructor(
    private readonly settings: DeviceSettings,
    private readonly clock: Clock,
    private readonly isOrderOpen: (orderId: string) => boolean,
    private readonly emit: (event: DeviceEvent) => void,
  ) {}

  /** Open a session for a device on `orderId`, if the order is under its device cap. */
  openSession(orderId: string, isPrimary: boolean): OpenSessionResult {
    if (this.activeCount(orderId) >= this.settings.deviceCap) return { ok: false, error: "DEVICE_CAP_REACHED" };
    const sessionToken = generateToken();
    const session: Session = {
      sessionId: randomUUID(),
      orderId,
      isPrimary,
      expiresAt: this.clock() + this.settings.sessionTtlMs,
      revokedAt: null,
    };
    this.sessionsByHash.set(this.key(sessionToken), session);
    this.sessionsById.set(session.sessionId, session);
    return { ok: true, sessionToken, sessionId: session.sessionId };
  }

  /** The order and session a token belongs to, or null if unknown, expired or revoked. */
  verify(sessionToken: string): { orderId: string; sessionId: string; isPrimary: boolean } | null {
    const session = this.sessionsByHash.get(this.key(sessionToken));
    if (!session || !this.isActive(session)) return null;
    return { orderId: session.orderId, sessionId: session.sessionId, isPrimary: session.isPrimary };
  }

  /** Active (not revoked, not expired) devices on an order. */
  activeCount(orderId: string): number {
    let count = 0;
    for (const session of this.sessionsById.values()) {
      if (session.orderId === orderId && this.isActive(session)) count += 1;
    }
    return count;
  }

  hasActivePrimary(orderId: string): boolean {
    for (const session of this.sessionsById.values()) {
      if (session.orderId === orderId && session.isPrimary && this.isActive(session)) return true;
    }
    return false;
  }

  /** Only the first (primary) device of an open order may invite. */
  createInvite(sessionToken: string): { ok: true; inviteToken: string } | { ok: false; error: "NOT_ALLOWED" } {
    const caller = this.verify(sessionToken);
    if (!caller || !caller.isPrimary || !this.isOrderOpen(caller.orderId)) return { ok: false, error: "NOT_ALLOWED" };
    const inviteToken = generateToken();
    this.invitesByHash.set(this.key(inviteToken), {
      orderId: caller.orderId,
      expiresAt: this.clock() + this.settings.inviteTtlMs,
      maxUses: this.settings.inviteMaxUses,
      uses: 0,
    });
    this.emit({ type: "invite.created", orderId: caller.orderId, sessionId: caller.sessionId, at: this.clock() });
    return { ok: true, inviteToken };
  }

  /** A new device joins with an invitation and gets its own session. */
  join(inviteToken: string): OpenSessionResult | { ok: false; error: "INVITE_INVALID" } {
    const invite = this.invitesByHash.get(this.key(inviteToken));
    if (!invite || this.clock() >= invite.expiresAt || invite.uses >= invite.maxUses || !this.isOrderOpen(invite.orderId)) {
      return { ok: false, error: "INVITE_INVALID" };
    }
    const opened = this.openSession(invite.orderId, false);
    if (!opened.ok) return opened; // cap reached: the invite use is NOT consumed
    invite.uses += 1;
    this.emit({ type: "device.joined", orderId: invite.orderId, sessionId: opened.sessionId, at: this.clock() });
    return opened;
  }

  /**
   * The primary device revokes another device of the SAME order. It cannot revoke itself, so
   * one device always stays in control. Returns false for anything else (no detail on purpose).
   */
  revoke(primaryToken: string, targetSessionId: string): boolean {
    const caller = this.verify(primaryToken);
    const target = this.sessionsById.get(targetSessionId);
    if (!caller || !caller.isPrimary || !target || target.orderId !== caller.orderId) return false;
    if (target.sessionId === caller.sessionId || !this.isActive(target)) return false;
    target.revokedAt = this.clock();
    this.emit({ type: "device.revoked", orderId: target.orderId, sessionId: target.sessionId, at: this.clock() });
    return true;
  }

  private isActive(session: Session): boolean {
    return session.revokedAt === null && this.clock() < session.expiresAt;
  }

  private key(token: string): string {
    return hashSecret(token, this.settings.serverKey).toString("hex");
  }
}
