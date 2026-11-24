/**
 * Retry delay for failed push attempts: bounded exponential backoff with jitter.
 *
 * Module:   spikes/web-push (THROWAWAY, never imported by product code)
 * Serves:   FR-12, AT-07 · blueprint §7.4 ("bounded exponential backoff with jitter for transient errors")
 * Protects: a push service that is down is not hammered, and many failing events do not all retry at the
 *           same instant when it comes back.
 */

/** How retries are spaced and when they stop. All values are parameters; nothing here is a product decision. */
export interface RetryPolicy {
  /** Ceiling of the first retry delay; each further attempt doubles the ceiling. */
  baseDelayMs: number;
  /** No delay is ever longer than this. */
  maxDelayMs: number;
  /** Send attempts (not retries) before an event is dead-lettered. */
  maxAttempts: number;
}

/**
 * Delay before the next attempt, after `attempt` attempts have failed (1 = the first attempt failed).
 *
 * "Equal jitter": the ceiling is `min(max, base · 2^(attempt-1))` and the delay is picked uniformly from
 * [ceiling/2, ceiling). Half is fixed so a retry never fires instantly; half is random to spread the herd.
 *
 * @param random returns a number in [0, 1); injected so tests are deterministic.
 */
export function backoffDelayMs(attempt: number, policy: RetryPolicy, random: () => number): number {
  const exponent = Math.max(0, attempt - 1);
  const ceiling = Math.min(policy.maxDelayMs, policy.baseDelayMs * 2 ** exponent);
  return ceiling / 2 + random() * (ceiling / 2);
}
