/**
 * Entropy and guess-resistance arithmetic for the report (computed, not estimated).
 *
 * Module:   spikes/claim-token (THROWAWAY, never imported by product code)
 * Serves:   AT-03 · spec item 8
 */

/** Bits of entropy in a token made of `bytes` uniformly random bytes. */
export function tokenEntropyBits(bytes: number): number {
  return bytes * 8;
}

/** Bits of entropy in a uniformly random code of `digits` decimal digits. */
export function codeEntropyBits(digits: number): number {
  return digits * Math.log2(10);
}

/**
 * Chance that `attempts` distinct guesses hit the one valid secret among `space` possibilities
 * (guessing without repeats, the attacker's best case).
 */
export function successProbability(attempts: number, space: number): number {
  return Math.min(1, attempts / space);
}

/**
 * Upper bound on attempts a sliding-window limit lets through in `durationMs`: the first window
 * plus one more `limit` for every full window that passes.
 */
export function attemptsAllowed(limit: number, windowMs: number, durationMs: number): number {
  return limit * (Math.floor(durationMs / windowMs) + 1);
}

/** Windows needed before `attempts` guesses have been allowed at `limit` per window. */
export function windowsToReach(attempts: number, limit: number): number {
  return Math.ceil(attempts / limit);
}
