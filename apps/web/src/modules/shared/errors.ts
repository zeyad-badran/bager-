/**
 * Domain errors with stable, machine-readable codes.
 *
 * Module:   shared
 * Serves:   blueprint §14.1 (validate all inputs), docs/code-style.md §4
 * Protects: callers branch on `code`, never on message text, so wording can change
 *           (or be translated) without breaking behaviour.
 */

/**
 * Stable error codes. Add new codes here; never rename an existing one,
 * because logs, tests and clients may depend on it.
 */
export const DOMAIN_ERROR_CODES = [
  "INVALID_INPUT",
  "NOT_ALLOWED",
  "NOT_FOUND",
  // The record changed since the caller read it (optimistic concurrency, AT-09): refresh and retry.
  "CONFLICT",
  // The requested status change is not in the lifecycle table (blueprint §5.1, FR-10).
  "INVALID_TRANSITION",
] as const;

export type DomainErrorCode = (typeof DOMAIN_ERROR_CODES)[number];

/**
 * An expected, business-level failure (bad input, missing permission, ...).
 * Unexpected failures (bugs, outages) are NOT domain errors and should surface as-is.
 */
export class DomainError extends Error {
  readonly code: DomainErrorCode;

  constructor(code: DomainErrorCode, message: string) {
    super(message);
    this.name = "DomainError";
    this.code = code;
  }
}
