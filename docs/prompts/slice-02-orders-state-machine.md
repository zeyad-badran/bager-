# Slice 02 — Orders, status state machine and outbox write

Status: ready (after PR #1 and PR #2 are merged to `main`)
Covers: FR-06, FR-10 (backend only), AT-01 (creation half), AT-02 (same ticket number half), AT-05, AT-06 (as encoded below), AT-09; FR-14 for orders
Phase: 3 — Architecture and backend foundation (the first business slice, after the tenant exit gate)

## Goal
Orders exist as tenant-scoped rows. Status changes go through one server-side domain service backed by
one database function that, in a single transaction, checks the transition and the version, updates the
order, writes an audit row and writes one outbox event for READY. No UI, no worker, no push, no POS.

## Read first
`CLAUDE.md` (domain invariants), `docs/code-style.md`, blueprint §5.1, §5.2, §7.4, §11, §15 (AT-01, 02, 05, 06, 09),
ADR-0004 (Open: **do not build a worker**), slice 01 migrations and `supabase/tests/support/10_helpers.sql`.

## Scope
1. **Migrations** (new files after `20261120100600`, one purpose each, RLS enabled in the same file, verify script each):
   - `orders`: UUID pk; `restaurant_id`, `branch_id` (composite FK as in slice 01); `ticket_number text` (display
     only, **not unique**); `source` (`manual` for now; `provider` text nullable) and `external_id text` nullable with
     a **unique (branch_id, provider, external_id)** where both are not null; `status` enum
     `new, preparing, ready, collected, cancelled`; `version integer not null default 1`; `created_at`, `updated_at`,
     `ready_at`, `closed_at` (UTC).
   - `outbox_events`: UUID pk; tenant columns; `event_type` (`order.ready` only); `order_id`; `payload jsonb` (ids only,
     no customer data); `status` (`pending` default); `available_at`; `attempts`; unique `(order_id, event_type)` so READY
     can enqueue **at most once per order** (AT-05, "do not resend READY").
   - `public.create_manual_order(p_branch_id, p_ticket_number)` and
     `public.transition_order(p_order_id, p_expected_version, p_to_status)`: SECURITY DEFINER, `search_path = ''`,
     check `auth.uid()` and role via the slice-01 helpers, lock the row (`for update`), validate against the allowed-transition
     table in blueprint §5.1, bump `version`, write the audit row, and for `ready` insert the outbox event, all in one transaction.
     Wrong `p_expected_version` → a distinct error code (conflict); illegal transition → another; no permission → another.
   - Audit trigger attached to `orders` (reuse `private.audit_row_change`). No policy lets a client `update` `status` or
     `version` directly: clients call the function only.
2. **Permissions (encode the minimum, list the gap):** owner, manager, cashier and kitchen may do
   `new→preparing`, `preparing→ready`, `ready→collected`; owner, manager, cashier may cancel; auditor reads only.
   Branch-scoped staff act on their own branch only. Blueprint §11.2 is still a proposal: report every assumption.
3. **TypeScript** in `apps/web/src/modules/orders` (public `index.ts`):
   - `transitions.ts`: the pure allowed-transition table and `canTransition(from, to)`, mirroring the SQL.
   - `order-service.ts`: thin service calling the function through an injected repository interface; maps the three error
     codes to `DomainError` codes (add `CONFLICT` and `INVALID_TRANSITION` to `shared`).
   - No Next.js route handlers in this slice.
4. **Seed**: extend `supabase/seed.sql` with synthetic orders (including the **same ticket number in two restaurants** and a
   reused ticket number in one branch after the earlier order is `collected`).
5. `docs/traceability.md` rows; `CLAUDE.md` unchanged unless commands change.

## Out of scope
Outbox worker, push, dispatch, notification tables, customer claim/session tables (ADR-0006 is Open), POS adapters and
ingest endpoints (AT-01 ingest half), UI, realtime, billing, hosted Supabase.

## Acceptance
Tests first, as SQL tests in `supabase/tests/` named with requirement IDs, plus `node:test` unit tests for `transitions.ts`:
- AT-02: same ticket number in restaurant A and B coexist; each tenant sees only its own; reuse in one branch after
  `collected` works and creates a separate order.
- AT-05: kitchen marks READY → exactly one `order.ready` outbox row; repeating the call (same or stale version) does not
  create a second one.
- AT-06: cashier READY allowed and audited; a role without permission is rejected and writes nothing.
- AT-09: two sessions race on the same order/version (use two connections); exactly one succeeds, the other gets the
  conflict error and sees the latest state.
- Illegal transitions (`collected→ready`, `new→ready`, `cancelled→*`) fail; terminal states stay terminal.
- A tenant-B user cannot read or transition a tenant-A order, by UUID guessing or direct function call (AT-11 extension).
- A direct `update orders set status = ...` by an authenticated client fails.
- `pnpm check` and `pnpm test:db` pass; verify scripts return all `t`.

## Stop and ask if
- Any change to existing migrations seems necessary (it never is: write a new one).
- The role matrix above conflicts with blueprint §11.2 or the owner's wishes.
- You are tempted to add a queue/worker/push table beyond `outbox_events`.
- AT-09 cannot be tested reliably with the available tooling.
