/**
 * Validates what the harness page posts to the local sender, and converts it to internal types.
 *
 * Module:   spikes/web-push (THROWAWAY, never imported by product code)
 * Serves:   FR-12 · code-style §4 (validate all external input at the boundary). Hand-written instead of zod
 *           because the spike may add only `web-push`.
 * Protects: the sender only accepts an https push endpoint and bounded test parameters, even though the
 *           tunnel makes it reachable from the internet.
 */

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

export interface SubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export const NOTIFICATION_KINDS = ["plain", "vibrate", "require-interaction"] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export interface SendRequest {
  subscriptionId: string;
  kind: NotificationKind;
  /** Gives the tester time to lock the phone or close the tab. */
  delaySeconds: number;
  /** The provider answers 503 this many times first (AT-07 on a real device). */
  failFirst: number;
  /** Enqueue the same idempotency key twice (should still show one notification). */
  duplicate: boolean;
}

/** Long enough to lock a phone and put it in a pocket. */
export const MAX_DELAY_SECONDS = 120;
/** Below the retry policy's attempt limit, so a forced failure still ends in delivery. */
export const MAX_FORCED_FAILURES = 3;
const MAX_ENDPOINT_LENGTH = 2048;
const MAX_KEY_LENGTH = 512;
const MAX_ID_LENGTH = 64;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isBoundedString(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max;
}

function isIntegerIn(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}

/** Accepts the JSON of `PushSubscription.toJSON()`; push endpoints are always https. */
export function parseSubscription(body: unknown): Parsed<SubscriptionInput> {
  if (!isRecord(body) || !isRecord(body.keys)) return { ok: false, error: "subscription must be an object with keys" };
  const { endpoint } = body;
  const { p256dh, auth } = body.keys;
  if (!isBoundedString(endpoint, MAX_ENDPOINT_LENGTH) || !endpoint.startsWith("https://")) {
    return { ok: false, error: "endpoint must be an https URL" };
  }
  if (!isBoundedString(p256dh, MAX_KEY_LENGTH) || !isBoundedString(auth, MAX_KEY_LENGTH)) {
    return { ok: false, error: "keys.p256dh and keys.auth are required" };
  }
  return { ok: true, value: { endpoint, keys: { p256dh, auth } } };
}

/** Accepts one harness "send" button press. */
export function parseSendRequest(body: unknown): Parsed<SendRequest> {
  if (!isRecord(body)) return { ok: false, error: "body must be an object" };
  const { subscriptionId, kind } = body;
  const delaySeconds = body.delaySeconds ?? 0;
  const failFirst = body.failFirst ?? 0;
  const duplicate = body.duplicate ?? false;
  if (!isBoundedString(subscriptionId, MAX_ID_LENGTH)) return { ok: false, error: "subscriptionId is required" };
  if (!NOTIFICATION_KINDS.some((k) => k === kind)) return { ok: false, error: "unknown kind" };
  if (!isIntegerIn(delaySeconds, 0, MAX_DELAY_SECONDS)) return { ok: false, error: "delaySeconds out of range" };
  if (!isIntegerIn(failFirst, 0, MAX_FORCED_FAILURES)) return { ok: false, error: "failFirst out of range" };
  if (typeof duplicate !== "boolean") return { ok: false, error: "duplicate must be a boolean" };
  return { ok: true, value: { subscriptionId, kind: kind as NotificationKind, delaySeconds, failFirst, duplicate } };
}
