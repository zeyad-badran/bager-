/**
 * Public API of the `audit` module: audit-trail types and helpers (FR-14).
 *
 * Module:   audit
 * Serves:   FR-14 (audit history)
 * Rule:     other modules import from here (`../audit`), never from files inside it.
 */
export {
  AUDIT_ACTIONS,
  describeAuditEntry,
  type AuditAction,
  type AuditDescription,
  type AuditEntry,
} from "./audit-entry";
