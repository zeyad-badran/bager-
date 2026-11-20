-- =============================================================================
-- Purpose:      Create the `private` schema (internal helper functions) and the
--               `staff_role` enum, plus the shared `updated_at` trigger function.
-- Serves:       FR-03 (staff identity and roles) · blueprint §8.2, §11.2, §14.1
-- Depends on:   nothing
-- Not included: any table (tables arrive in the next migrations).
-- Rollback:     forward-only; undo by writing a new migration.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Schema `private`
-- Holds helper functions used by RLS policies and triggers. It must NOT be
-- listed in the API's exposed schemas (supabase/config.toml -> [api] schemas),
-- so none of these functions can be called from the browser.
-- ---------------------------------------------------------------------------
create schema if not exists private;

comment on schema private is
  'Internal helpers for RLS policies and triggers. Never expose through the API.';

-- Nobody gets access by default; later migrations grant USAGE/EXECUTE to
-- `authenticated` only for the helpers that RLS policies must evaluate.
revoke all on schema private from public;

-- ---------------------------------------------------------------------------
-- Enum `staff_role`
-- The five roles proposed in blueprint §11.2. The role matrix is still a
-- PROPOSAL (blueprint §3.3), so which role may do what is decided in the RLS
-- policy migration, not here. Adding a value later is a new migration.
-- ---------------------------------------------------------------------------
create type public.staff_role as enum (
  'owner',    -- all restaurant settings, branches, staff, integrations, subscription
  'manager',  -- branch operations, queue configuration, cancellations/overrides
  'cashier',  -- view branch queue, create manual orders, mark READY/COLLECTED
  'kitchen',  -- view queue, move NEW -> PREPARING, mark READY
  'auditor'   -- read-only access to history and reports
);

comment on type public.staff_role is
  'Staff roles (blueprint §11.2). Proposal; permissions live in RLS policies.';

-- ---------------------------------------------------------------------------
-- Trigger function: keep `updated_at` honest.
-- Used by every table that has an `updated_at` column.
-- ---------------------------------------------------------------------------
create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function private.set_updated_at() is
  'BEFORE UPDATE trigger: stamps updated_at with the transaction time (UTC-safe timestamptz).';
