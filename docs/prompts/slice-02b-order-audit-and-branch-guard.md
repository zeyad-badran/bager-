# Slice 02b: order audit detail and inactive-branch guard
Covers: FR-14 (orders), FR-06, FR-10. Branch: feat/slice-02b-audit-and-branch-guard. One small PR.

## Goal
1. FR-14: every order status change records WHO moved it, FROM which status, TO which status, and the version before and after, so "who marked this READY and when" is answerable from audit_logs alone.
2. FR-06: create_manual_order() must refuse to create an order in a branch where is_active = false, as the column comment already promises.

## Rules
- NEW migration files only, timestamps after 20261123100300. Never edit an existing migration (CLAUDE.md rule 3). Each migration commented, with a matching supabase/verify/<same name>.sql.
- Audit: keep exactly ONE audit row per transition (no duplicate rows). Details must contain from_status, to_status, version_from, version_to in addition to what is recorded today. Choose the least invasive design (for example a transaction-local setting that transition_order sets and the audit trigger merges into details, or a trigger change limited to orders) and explain the choice in the delivery record. Existing audit behaviour for other tables must not change.
- Inactive branch: create_manual_order() raises a clear error with SQLSTATE PT422 and message 'branch is inactive'. Existing orders in a branch that later becomes inactive can still be transitioned, so nothing gets stuck. The service maps this to a new domain error BRANCH_INACTIVE in shared. Keep 42501 behaviour unchanged (not a member or not found stays identical).
- Do not touch POS ingest, outbox, worker, UI, route handlers.

## Tests first (name with requirement IDs)
- FR-14: after a transition, the single audit row has the four new details; a no-op or rejected transition (stale version, illegal) writes nothing.
- FR-14: audit rows for tenancy tables are unchanged.
- FR-06: creating an order in an inactive branch fails with PT422 and writes nothing (no order, no audit row); same call succeeds after reactivating the branch; an existing order in a branch deactivated afterwards can still move forward.
- Re-run every existing test: all must still pass (199 assertions, 72 unit tests as of slice 02).
- Update unit tests for the new domain error.

## Done means
pnpm check, pnpm build, DB_MODE=plain and DB_MODE=supabase test:db all pass; update docs/traceability.md; add a delivery record to the spec file; push the branch and open a PR to main. Do not apply anything to hosted Supabase.
Reply with the hand-off block from docs/workflow.md.

## Delivery record (2026-11-24)

Built on branch `feat/slice-02b-audit-and-branch-guard` from `main` (slice 02 merged as PR #7).
Tests written first; the new SQL and unit tests failed before the migrations and service change existed.

| Item | State |
|---|---|
| FR-14 audit detail | `20261124100000_add_order_status_audit_detail.sql` + verify script |
| FR-06 inactive-branch guard | `20261124100100_guard_manual_order_inactive_branch.sql` + verify script |
| Service | `BRANCH_INACTIVE` added to `shared`; PT422 from `create_manual_order` maps to it, PT422 from `transition_order` still maps to `INVALID_TRANSITION` |
| Existing migrations | untouched |

**Audit design chosen: an orders-only trigger function** (`private.audit_order_change()`), swapped in for
`orders_audit` (same trigger name and events). It writes the same row the generic function wrote and, when
the status changed, adds `from_status`, `to_status`, `version_from`, `version_to` read from OLD/NEW. Why:
- The generic `private.audit_row_change()` is not modified, so the tenancy tables cannot change (checked by test
  and verify script).
- No coupling to `transition_order()`: a transaction-local setting would only describe changes made through that
  function, and the trigger would have to trust a value set elsewhere. OLD/NEW is always the truth.
- Still exactly one audit row per transition: the trigger is replaced, not added.
- Statuses and version numbers are not personal data, so recording their values fits blueprint §14.2.

**Inactive-branch guard:** membership is checked first, activity second, so a non-member, other tenant or auditor
still gets `42501` and learns nothing about whether the branch is active. `transition_order()` is unchanged, so
existing orders in a branch that becomes inactive can still move forward or be cancelled.

Deviation: the existing assertion in `supabase/tests/at06_ready_roles_audited.sql` compared the whole audit
`details` text. It now compares only `details -> 'changed_columns'`, the part it is about, because the four new
keys are added to the same row by design.
