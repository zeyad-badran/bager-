-- =============================================================================
-- Purpose:      Define who can read and write each tenant table: explicit
--               table/column privileges plus Row Level Security policies.
-- Serves:       FR-01, FR-02, FR-03, FR-14, AT-02, AT-11 · blueprint §8.3, §11.2, §14.1
-- Depends on:   20261120100300 (helper functions), 20261120100400 (audit_logs)
-- Not included: customer-facing access (customers never read these tables
--               directly, ADR-0006) and the create-restaurant function (next migration).
-- Rollback:     forward-only; undo by writing a new migration.
-- =============================================================================

-- HOW ACCESS IS DECIDED (two independent layers, both must allow):
--   1. GRANT: which columns/operations a database role may attempt at all.
--   2. RLS policy: which ROWS that role may touch.
-- Starting point is "no access": we revoke everything from the API roles, then
-- grant back only what is needed. `anon` (not signed in) gets nothing.
--
-- ROLE MATRIX: this is the PROPOSAL from blueprint §11.2. The final matrix is an
-- open decision (blueprint §3.3), so a change is a new migration, and the
-- policy names below say who they are for.

revoke all on table public.restaurants     from anon, authenticated;
revoke all on table public.branches        from anon, authenticated;
revoke all on table public.branch_settings from anon, authenticated;
revoke all on table public.profiles        from anon, authenticated;
revoke all on table public.memberships     from anon, authenticated;
revoke all on table public.audit_logs      from anon, authenticated;

-- ---------------------------------------------------------------------------
-- restaurants
--   read:   any member of the restaurant
--   update: owner only, and only the name (id/timestamps are not writable)
--   insert/delete: not allowed here (creation goes through create_restaurant();
--                  deletion/export is FR-19, a later slice)
-- ---------------------------------------------------------------------------
grant select on public.restaurants to authenticated;
grant update (name) on public.restaurants to authenticated;

create policy restaurants_member_select on public.restaurants
  for select to authenticated
  using ( private.is_restaurant_member(id) );

create policy restaurants_owner_update on public.restaurants
  for update to authenticated
  using      ( private.has_restaurant_role(id, array['owner']::public.staff_role[]) )
  with check ( private.has_restaurant_role(id, array['owner']::public.staff_role[]) );

-- ---------------------------------------------------------------------------
-- branches
--   read:   restaurant-wide staff see all branches; branch-scoped staff see theirs
--   insert: restaurant-wide owner or manager
--   update: owner/manager of the restaurant, or manager scoped to that branch;
--           only descriptive columns (restaurant_id can never be changed, so a
--           branch cannot be moved to another tenant)
--   delete: restaurant-wide owner only
-- ---------------------------------------------------------------------------
grant select on public.branches to authenticated;
grant insert (restaurant_id, name, display_name, time_zone, locale, is_active)
  on public.branches to authenticated;
grant update (name, display_name, time_zone, locale, is_active)
  on public.branches to authenticated;
grant delete on public.branches to authenticated;

create policy branches_member_select on public.branches
  for select to authenticated
  using ( private.can_access_branch(restaurant_id, id) );

create policy branches_manager_insert on public.branches
  for insert to authenticated
  with check ( private.has_restaurant_role(restaurant_id, array['owner','manager']::public.staff_role[]) );

create policy branches_manager_update on public.branches
  for update to authenticated
  using      ( private.has_branch_role(restaurant_id, id, array['owner','manager']::public.staff_role[]) )
  with check ( private.has_branch_role(restaurant_id, id, array['owner','manager']::public.staff_role[]) );

create policy branches_owner_delete on public.branches
  for delete to authenticated
  using ( private.has_restaurant_role(restaurant_id, array['owner']::public.staff_role[]) );

-- ---------------------------------------------------------------------------
-- branch_settings
--   read:   same visibility as the branch
--   update: same people who may update the branch; only operating_settings
--   insert/delete: never directly (row follows the branch)
-- ---------------------------------------------------------------------------
grant select on public.branch_settings to authenticated;
grant update (operating_settings) on public.branch_settings to authenticated;

create policy branch_settings_member_select on public.branch_settings
  for select to authenticated
  using ( private.can_access_branch(restaurant_id, branch_id) );

create policy branch_settings_manager_update on public.branch_settings
  for update to authenticated
  using      ( private.has_branch_role(restaurant_id, branch_id, array['owner','manager']::public.staff_role[]) )
  with check ( private.has_branch_role(restaurant_id, branch_id, array['owner','manager']::public.staff_role[]) );

-- ---------------------------------------------------------------------------
-- profiles
--   read/update: your own row only (least privilege; a staff directory for
--   colleagues is a later, deliberate addition)
--   insert: only by the sign-up trigger (next migration)
-- ---------------------------------------------------------------------------
grant select on public.profiles to authenticated;
grant update (display_name, preferred_locale) on public.profiles to authenticated;

create policy profiles_self_select on public.profiles
  for select to authenticated
  using ( id = (select auth.uid()) );

create policy profiles_self_update on public.profiles
  for update to authenticated
  using      ( id = (select auth.uid()) )
  with check ( id = (select auth.uid()) );

-- ---------------------------------------------------------------------------
-- memberships
--   read:   your own memberships; restaurant-wide owner/manager see the staff list
--   write:  restaurant-wide owner only (conservative: delegating staff management
--           to managers needs the role matrix decision, blueprint §3.3)
--           restaurant_id and user_id are fixed once created
-- TODO(FR-03): protect against removing or demoting the last owner of a restaurant.
-- ---------------------------------------------------------------------------
grant select on public.memberships to authenticated;
grant insert (restaurant_id, branch_id, user_id, role) on public.memberships to authenticated;
grant update (role, branch_id) on public.memberships to authenticated;
grant delete on public.memberships to authenticated;

create policy memberships_self_or_manager_select on public.memberships
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or private.has_restaurant_role(restaurant_id, array['owner','manager']::public.staff_role[])
  );

create policy memberships_owner_insert on public.memberships
  for insert to authenticated
  with check ( private.has_restaurant_role(restaurant_id, array['owner']::public.staff_role[]) );

create policy memberships_owner_update on public.memberships
  for update to authenticated
  using      ( private.has_restaurant_role(restaurant_id, array['owner']::public.staff_role[]) )
  with check ( private.has_restaurant_role(restaurant_id, array['owner']::public.staff_role[]) );

create policy memberships_owner_delete on public.memberships
  for delete to authenticated
  using ( private.has_restaurant_role(restaurant_id, array['owner']::public.staff_role[]) );

-- ---------------------------------------------------------------------------
-- audit_logs
--   read:   restaurant-wide owner, manager and auditor
--   write:  nobody through the API; rows are written only by the audit trigger
-- ---------------------------------------------------------------------------
grant select on public.audit_logs to authenticated;

create policy audit_logs_reader_select on public.audit_logs
  for select to authenticated
  using ( private.has_restaurant_role(restaurant_id, array['owner','manager','auditor']::public.staff_role[]) );
