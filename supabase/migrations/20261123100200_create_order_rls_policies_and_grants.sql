-- =============================================================================
-- Purpose:      Define who can read `orders` (and that nobody can read or write
--               `outbox_events` through the API). Explicit grants + RLS policy.
-- Serves:       FR-10, AT-02, AT-11, AT-06 · blueprint §8.3, §11.2, §14.1
-- Depends on:   20261123100000 (orders), 20261123100100 (outbox_events),
--               20261120100300 (private.can_access_branch)
-- Not included: writes. Clients never insert, update or delete orders directly: they call
--               create_manual_order() and transition_order() (20261123100300), which
--               check the role and the version. Customer access is ADR-0006 (Open).
-- Rollback:     forward-only; undo by writing a new migration.
-- =============================================================================

-- Start from "no access" (Supabase grants new tables to the API roles by default).
revoke all on table public.orders        from anon, authenticated;
revoke all on table public.outbox_events from anon, authenticated;

-- ---------------------------------------------------------------------------
-- orders
--   read:  every staff role in the order's branch, including the auditor (read-only
--          role, blueprint §11.2): restaurant-wide staff see all branches, branch-scoped
--          staff see their own branch.
--   write: none. SECURITY: with no INSERT/UPDATE/DELETE privilege, a client cannot set
--          `status` or `version` directly, so the state machine and the version check in
--          transition_order() cannot be bypassed (CLAUDE.md, blueprint §5.1).
-- ---------------------------------------------------------------------------
grant select on public.orders to authenticated;

create policy orders_member_select on public.orders
  for select to authenticated
  using ( private.can_access_branch(restaurant_id, branch_id) );

-- ---------------------------------------------------------------------------
-- outbox_events
--   No grant and no policy for anon or authenticated. Only privileged server code
--   (the future worker, ADR-0004) and the SECURITY DEFINER functions touch it.
-- ---------------------------------------------------------------------------
