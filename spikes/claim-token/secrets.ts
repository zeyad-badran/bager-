/**
 * Claim secrets: generation, hashing with a server key, constant-time comparison.
 *
 * Module:   spikes/claim-token (THROWAWAY, never imported by product code)
 * Serves:   FR-08, AT-03 · spec item 1 · blueprint §9.2 ("store only a hash of high-entropy tokens")
 * Protects: raw secrets exist only in memory on their way to the customer; storage holds an
 *           HMAC-SHA256 under a server key, so a leaked table cannot be replayed, and short codes
 *           cannot be brute-forced offline without the key.
 */
import { createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

/** 128 bits: the floor set by the spec and ADR-0006 ("high-entropy"). */
export const MIN_TOKEN_BYTES = 16;
/** 256 bits by default: costs nothing extra and leaves a wide margin. */
export const DEFAULT_TOKEN_BYTES = 32;

/**
 * A random, URL-safe token (base64url, no padding), suitable for a QR code or a link.
 * @throws RangeError below 128 bits
 */
export function generateToken(bytes: number = DEFAULT_TOKEN_BYTES): string {
  if (bytes < MIN_TOKEN_BYTES) throw new RangeError(`tokens need at least ${MIN_TOKEN_BYTES} bytes`);
  return randomBytes(bytes).toString("base64url");
}

/** A uniformly random numeric code with exactly `digits` digits (leading zeros kept). */
export function generateNumericCode(digits: number): string {
  return String(randomInt(0, 10 ** digits)).padStart(digits, "0");
}

/**
 * HMAC-SHA256 of a secret under the server key. The key is a parameter: it comes from the
 * host's secret store in a real deployment and never lives in a file (CLAUDE.md rule 2).
 */
export function hashSecret(secret: string, serverKey: Uint8Array): Buffer {
  return createHmac("sha256", serverKey).update(secret, "utf8").digest();
}

/**
 * Constant-time equality of two hashes. Unequal lengths return false instead of throwing
 * (hash lengths are public, so checking them first leaks nothing).
 */
export function secretsMatch(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && timingSafeEqual(a, b);
}
