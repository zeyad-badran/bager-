/**
 * Audit entry types and a UI-neutral description of an entry.
 *
 * Module:   audit
 * Serves:   FR-14 (audit history) · blueprint §14.1
 * Mirrors:  table `public.audit_logs` (migration 20261120100400).
 *
 * Why `describeAuditEntry` returns data and not a sentence: user-facing text must go through
 * i18n (FR-18), and the screen decides how to word it. Here we only extract the facts.
 */

export const AUDIT_ACTIONS = ["INSERT", "UPDATE", "DELETE"] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

/** One row of `audit_logs`, with camelCase names and the timestamp kept as an ISO-8601 UTC string. */
export interface AuditEntry {
  readonly id: string;
  readonly restaurantId: string;
  readonly branchId: string | null;
  /** `null` = a system or service-role change, not a signed-in person. */
  readonly actorUserId: string | null;
  readonly action: AuditAction;
  readonly entityTable: string;
  readonly entityId: string | null;
  /** For UPDATE: `{ changed_columns: string[] }`. Never contains row values (privacy, §14.2). */
  readonly details: Readonly<Record<string, unknown>>;
  readonly occurredAt: string;
}

export interface AuditDescription {
  readonly action: AuditAction;
  readonly entityTable: string;
  readonly actor: "user" | "system";
  /** Names of the columns an UPDATE touched; empty for INSERT/DELETE or unreadable details. */
  readonly changedColumns: readonly string[];
}

/** Pull the changed column names out of `details`, ignoring anything that is not a string list. */
function readChangedColumns(details: AuditEntry["details"]): string[] {
  const raw = details["changed_columns"];
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is string => typeof item === "string");
}

export function describeAuditEntry(entry: AuditEntry): AuditDescription {
  return {
    action: entry.action,
    entityTable: entry.entityTable,
    actor: entry.actorUserId === null ? "system" : "user",
    changedColumns: entry.action === "UPDATE" ? readChangedColumns(entry.details) : [],
  };
}
