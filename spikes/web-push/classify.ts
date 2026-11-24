/**
 * What a push provider's answer means for the outbox: done, retry, disable the subscription, or give up.
 *
 * Module:   spikes/web-push (THROWAWAY, never imported by product code)
 * Serves:   FR-12, AT-07 · blueprint §7.4 ("classify permanent errors separately from retryable errors"),
 *           §10.3 ("permission revoked: endpoint invalidation, cleanup, no endless retry loop")
 * Protects: a dead endpoint (404/410) is never retried; a provider outage (429/5xx) never drops the event.
 */

/** What the provider (or the network) returned for one send attempt. */
export type ProviderResult =
  | { kind: "response"; statusCode: number; retryAfterMs?: number }
  | { kind: "network-error"; message: string };

/**
 * - `accepted`: the push service took the message. This is NOT "delivered" and NOT "seen" (CLAUDE.md).
 * - `retry`: transient; try again later. `retryAfterMs` is the provider's own hint, if it sent one.
 * - `subscription-gone`: the endpoint no longer exists (unsubscribed, permission revoked, expired).
 * - `permanent`: our request is wrong (bad VAPID key, payload too large); retrying will not help.
 */
export type Classified =
  | { kind: "accepted" }
  | { kind: "retry"; retryAfterMs?: number }
  | { kind: "subscription-gone" }
  | { kind: "permanent" };

const HTTP_NOT_FOUND = 404;
const HTTP_GONE = 410;
const HTTP_TOO_MANY_REQUESTS = 429;

/** Maps one provider result to what the outbox must do next (RFC 8030 §8 and push-service docs). */
export function classifyResult(result: ProviderResult): Classified {
  // A timeout or reset: the message may or may not have been accepted. Retrying is safe because the
  // Topic header and notification tag collapse a duplicate (see outbox.ts).
  if (result.kind === "network-error") return { kind: "retry" };

  const status = result.statusCode;
  if (status >= 200 && status < 300) return { kind: "accepted" };
  if (status === HTTP_NOT_FOUND || status === HTTP_GONE) return { kind: "subscription-gone" };
  if (status === HTTP_TOO_MANY_REQUESTS || status >= 500) {
    return result.retryAfterMs === undefined ? { kind: "retry" } : { kind: "retry", retryAfterMs: result.retryAfterMs };
  }
  return { kind: "permanent" };
}
