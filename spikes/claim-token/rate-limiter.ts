/**
 * In-memory sliding-window rate limiter with an injectable clock.
 *
 * Module:   spikes/claim-token (THROWAWAY, never imported by product code)
 * Serves:   AT-03 · spec item 5 · blueprint §9.2 ("rate-limit order lookup and claim attempts by
 *           IP/device/session/branch")
 * Note:     in-memory and single-process on purpose (spike). A deployment with several server
 *           instances needs a shared store; that choice belongs to ADR-0003/0004, not here.
 */

/** Milliseconds since the epoch. Injected so tests control time exactly. */
export type Clock = () => number;

export interface LimitRule {
  /** Which request attribute this rule is keyed by, for example "ip", "device", "branch". */
  readonly name: string;
  readonly limit: number;
  readonly windowMs: number;
}

/**
 * Sliding-window log: remembers the time of each ALLOWED attempt per key and allows a new one
 * while fewer than `limit` fall inside the last `windowMs`. Blocked attempts are not recorded,
 * so a shared IP is not locked out forever by one noisy client (trade-off noted in the report).
 */
export class SlidingWindowLimiter {
  private readonly attempts = new Map<string, number[]>();

  constructor(
    private readonly rule: { readonly limit: number; readonly windowMs: number },
    private readonly clock: Clock,
  ) {}

  /** Would an attempt for `key` be allowed right now? Does not record anything. */
  canAttempt(key: string): boolean {
    return this.recent(key).length < this.rule.limit;
  }

  /** Record an attempt for `key` (call only after canAttempt said yes). */
  record(key: string): void {
    const recent = this.recent(key);
    recent.push(this.clock());
    this.attempts.set(key, recent);
  }

  /** Check and record in one step. */
  attempt(key: string): boolean {
    if (!this.canAttempt(key)) return false;
    this.record(key);
    return true;
  }

  private recent(key: string): number[] {
    const cutoff = this.clock() - this.rule.windowMs;
    // An attempt made exactly windowMs ago has left the window.
    const recent = (this.attempts.get(key) ?? []).filter((at) => at > cutoff);
    this.attempts.set(key, recent);
    return recent;
  }
}

/**
 * Several limiters at once (one per rule). An attempt passes only if EVERY rule allows it, and
 * is then counted against every rule. A blocked attempt is counted against none, so one
 * exhausted key (an attacker's IP) cannot use up a shared key (the branch) for everyone else.
 */
export class MultiKeyLimiter {
  private readonly limiters: ReadonlyArray<{ name: string; limiter: SlidingWindowLimiter }>;

  constructor(rules: readonly LimitRule[], clock: Clock) {
    this.limiters = rules.map((rule) => ({ name: rule.name, limiter: new SlidingWindowLimiter(rule, clock) }));
  }

  /** `keys` maps a rule name to this request's value for it; rules without a value are skipped. */
  attempt(keys: Readonly<Record<string, string>>): boolean {
    const applicable = this.limiters.filter(({ name }) => keys[name] !== undefined);
    if (!applicable.every(({ name, limiter }) => limiter.canAttempt(`${name}:${keys[name]}`))) return false;
    for (const { name, limiter } of applicable) limiter.record(`${name}:${keys[name]}`);
    return true;
  }
}
