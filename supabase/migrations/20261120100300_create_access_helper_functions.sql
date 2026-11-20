-- =============================================================================
-- Purpose:      Create the helper functions that RLS policies call to answer
--               "is the current user a member / does their role allow this?".
-- Serves:       FR-03, AT-02, AT-11 · blueprint §8.3, §14.1
-- Depends on:   20261120100200 (memberships)
-- Not included: the policies that use these functions (next-but-two migration).
-- Rollback:     forward-only; undo by writing a new migration.
-- =============================================================================

-- WHY these functions are SECURITY DEFINER:
--   The `memberships` table itself is protected by RLS. A policy on another
--   table that queried `memberships` as the calling user would be filtered by
--   memberships' own policies (and could recurse). Running the lookup as the
--   function owner avoids that, while `auth.uid()` still identifies the caller.
--
-- SECURITY: every function pins `search_path = ''` and uses fully qualified
--   names, so a malicious schema or temp object can never hijack a lookup.
--   Each function only ever answers about the CURRENT user (auth.uid()); none
--   accepts a user id, so none can be used to probe someone else's memberships.

-- ---------------------------------------------------------------------------
-- Is the current user a member of this restaurant, in any scope?
-- ---------------------------------------------------------------------------
create function private.is_restaurant_member(p_restaurant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships m
    where m.restaurant_id = p_restaurant_id
      and m.user_id = (select auth.uid())
  );
$$;

-- ---------------------------------------------------------------------------
-- Does the current user hold one of these roles across the WHOLE restaurant?
-- (restaurant-wide membership: branch_id is null)
-- ---------------------------------------------------------------------------
create function private.has_restaurant_role(p_restaurant_id uuid, p_roles public.staff_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships m
    where m.restaurant_id = p_restaurant_id
      and m.user_id = (select auth.uid())
      and m.branch_id is null
      and m.role = any (p_roles)
  );
$$;

-- ---------------------------------------------------------------------------
-- May the current user see this branch at all?
-- Yes if they are restaurant-wide staff, or scoped to exactly this branch.
-- ---------------------------------------------------------------------------
create function private.can_access_branch(p_restaurant_id uuid, p_branch_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships m
    where m.restaurant_id = p_restaurant_id
      and m.user_id = (select auth.uid())
      and (m.branch_id is null or m.branch_id = p_branch_id)
  );
$$;

-- ---------------------------------------------------------------------------
-- Does the current user hold one of these roles for this branch?
-- Restaurant-wide role OR a role scoped to exactly this branch.
-- ---------------------------------------------------------------------------
create function private.has_branch_role(
  p_restaurant_id uuid,
  p_branch_id uuid,
  p_roles public.staff_role[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships m
    where m.restaurant_id = p_restaurant_id
      and m.user_id = (select auth.uid())
      and (m.branch_id is null or m.branch_id = p_branch_id)
      and m.role = any (p_roles)
  );
$$;

comment on function private.is_restaurant_member(uuid) is
  'RLS helper: current user has any membership in the restaurant.';
comment on function private.has_restaurant_role(uuid, public.staff_role[]) is
  'RLS helper: current user holds one of the roles restaurant-wide (branch_id is null).';
comment on function private.can_access_branch(uuid, uuid) is
  'RLS helper: current user is restaurant-wide staff or scoped to this branch.';
comment on function private.has_branch_role(uuid, uuid, public.staff_role[]) is
  'RLS helper: current user holds one of the roles restaurant-wide or on this branch.';

-- ---------------------------------------------------------------------------
-- Privileges: only signed-in users may evaluate the helpers (policies run as
-- the calling role). Anonymous visitors get nothing.
-- ---------------------------------------------------------------------------
revoke all on function private.is_restaurant_member(uuid)                            from public;
revoke all on function private.has_restaurant_role(uuid, public.staff_role[])        from public;
revoke all on function private.can_access_branch(uuid, uuid)                         from public;
revoke all on function private.has_branch_role(uuid, uuid, public.staff_role[])      from public;

grant usage on schema private to authenticated;
grant execute on function private.is_restaurant_member(uuid)                         to authenticated;
grant execute on function private.has_restaurant_role(uuid, public.staff_role[])     to authenticated;
grant execute on function private.can_access_branch(uuid, uuid)                      to authenticated;
grant execute on function private.has_branch_role(uuid, uuid, public.staff_role[])   to authenticated;
