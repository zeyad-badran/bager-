/**
 * Branch time zone validation.
 *
 * Module:   tenancy
 * Serves:   FR-02 (branch settings) · CLAUDE.md "timestamps in UTC; render in branch time zone"
 * Mirrors:  trigger `private.assert_valid_time_zone` (rejects names Postgres does not know).
 *
 * The database is the authority. This check exists to give a friendly error BEFORE a write,
 * and it is deliberately a little stricter than the JS engine: IANA names are capitalised
 * (`Asia/Amman`), and Postgres compares them case-sensitively, whereas `Intl` would also
 * accept `asia/amman`.
 */
import { DomainError } from "../shared";

/** Each `/`-separated segment starts with a capital letter, e.g. `UTC`, `Etc/GMT+1`, `Asia/Amman`. */
const IANA_SHAPE = /^[A-Z][A-Za-z0-9_+-]*(\/[A-Z][A-Za-z0-9_+-]*)*$/;

export function isValidTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || !IANA_SHAPE.test(value)) return false;
  try {
    // Throws RangeError for a name the runtime does not know.
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** Throw a `DomainError("INVALID_INPUT")` unless `value` is a usable IANA time zone name. */
export function assertValidTimeZone(value: unknown): asserts value is string {
  if (!isValidTimeZone(value)) {
    throw new DomainError("INVALID_INPUT", "time_zone must be a valid IANA time zone name");
  }
}
