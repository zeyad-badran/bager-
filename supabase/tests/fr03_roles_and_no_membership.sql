-- =============================================================================
-- FR-03: roles are enforced by the database, not by the client.
-- Serves:  FR-03, FR-14 · blueprint §11.2 (role matrix is a PROPOSAL, §3.3)
-- Setup:   supabase/seed.sql (Alpha users 01-05; stranger 99 has no membership)
-- =============================================================================
begin;

-- ---- No membership = no access --------------------------------------------------
select tests.login_as('00000000-0000-4000-8000-000000000099');  -- stranger
select tests.assert_equals('FR-03 a user with no membership sees no restaurants',
  tests.count_rows($$ select 1 from public.restaurants $$)::text, '0');
select tests.assert_equals('FR-03 ...no branches',
  tests.count_rows($$ select 1 from public.branches $$)::text, '0');
select tests.assert_equals('FR-03 ...no memberships',
  tests.count_rows($$ select 1 from public.memberships $$)::text, '0');
select tests.assert_equals('FR-03 ...no audit history',
  tests.count_rows($$ select 1 from public.audit_logs $$)::text, '0');
select tests.assert_equals('FR-03 ...but can read their own profile',
  tests.count_rows($$ select 1 from public.profiles $$)::text, '1');
select tests.assert_raises('FR-03 a user cannot create their own profile row (sign-up trigger only)',
  $$ insert into public.profiles (id) values ('00000000-0000-4000-8000-000000000099') $$, '42501');

-- ---- Not signed in ----------------------------------------------------------------
select tests.login_as_anon();
select tests.assert_raises('FR-03 anonymous visitors cannot read restaurants',
  $$ select 1 from public.restaurants $$, '42501');
select tests.assert_raises('FR-03 anonymous visitors cannot read memberships',
  $$ select 1 from public.memberships $$, '42501');
select tests.assert_raises('FR-03 anonymous visitors cannot call create_restaurant',
  $$ select public.create_restaurant('Nope') $$, '42501');

-- ---- Auditor: read-only ---------------------------------------------------------
select tests.login_as('00000000-0000-4000-8000-000000000005');  -- alpha_auditor
select tests.assert_equals('FR-03 auditor can read all branches',
  tests.count_rows($$ select 1 from public.branches $$)::text, '2');
select tests.assert_equals('FR-03 auditor can read the audit history',
  (tests.count_rows($$ select 1 from public.audit_logs $$) > 0)::text, 'true');
select tests.assert_equals('FR-03 auditor cannot rename the restaurant',
  tests.rows_affected($$ update public.restaurants set name = 'Nope' where id = '10000000-0000-4000-8000-000000000001' $$)::text, '0');
select tests.assert_equals('FR-03 auditor cannot edit a branch',
  tests.rows_affected($$ update public.branches set name = 'Nope' where id = '20000000-0000-4000-8000-000000000001' $$)::text, '0');
select tests.assert_raises('FR-03 auditor cannot create a branch',
  $$ insert into public.branches (restaurant_id, name) values ('10000000-0000-4000-8000-000000000001', 'Nope') $$, '42501');
select tests.assert_raises('FR-03 auditor cannot add staff',
  $$ insert into public.memberships (restaurant_id, user_id, role)
     values ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000099', 'cashier') $$, '42501');

-- ---- Kitchen and cashier: operational roles cannot administer ------------------
select tests.login_as('00000000-0000-4000-8000-000000000004');  -- alpha_kitchen
select tests.assert_equals('FR-03 kitchen cannot rename the restaurant',
  tests.rows_affected($$ update public.restaurants set name = 'Nope' where id = '10000000-0000-4000-8000-000000000001' $$)::text, '0');
select tests.assert_raises('FR-03 kitchen cannot add staff',
  $$ insert into public.memberships (restaurant_id, user_id, role)
     values ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000099', 'cashier') $$, '42501');
select tests.login_as('00000000-0000-4000-8000-000000000003');  -- alpha_cashier
select tests.assert_raises('FR-03 cashier cannot add staff',
  $$ insert into public.memberships (restaurant_id, user_id, role)
     values ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000099', 'cashier') $$, '42501');

-- ---- Manager: sees the team, cannot change it (conservative until role matrix decided) ----
select tests.login_as('00000000-0000-4000-8000-000000000002');  -- alpha_manager
select tests.assert_equals('FR-03 manager can see the whole team (5 Alpha memberships)',
  tests.count_rows($$ select 1 from public.memberships $$)::text, '5');
select tests.assert_raises('FR-03 manager cannot add staff (owner only for now)',
  $$ insert into public.memberships (restaurant_id, user_id, role)
     values ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000099', 'cashier') $$, '42501');
select tests.assert_equals('FR-03 manager cannot rename the restaurant (owner only)',
  tests.rows_affected($$ update public.restaurants set name = 'Nope' where id = '10000000-0000-4000-8000-000000000001' $$)::text, '0');
select tests.assert_equals('FR-03 manager cannot promote themselves',
  tests.rows_affected($$ update public.memberships set role = 'owner' where user_id = '00000000-0000-4000-8000-000000000002' $$)::text, '0');

-- ---- Owner: full control of their restaurant's staff ----------------------------
select tests.login_as('00000000-0000-4000-8000-000000000001');  -- alpha_owner
select tests.assert_equals('FR-03 owner can rename the restaurant',
  tests.rows_affected($$ update public.restaurants set name = 'Alpha Burgers Ltd' where id = '10000000-0000-4000-8000-000000000001' $$)::text, '1');
select tests.assert_equals('FR-03 owner can add staff (cashier at Downtown)',
  tests.rows_affected($$ insert into public.memberships (restaurant_id, branch_id, user_id, role)
     values ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
             '00000000-0000-4000-8000-000000000099', 'cashier') $$)::text, '1');
select tests.assert_equals('FR-03 owner can change a staff role',
  tests.rows_affected($$ update public.memberships set role = 'kitchen'
     where user_id = '00000000-0000-4000-8000-000000000099' $$)::text, '1');
select tests.assert_raises('FR-03 membership user and restaurant cannot be rewritten',
  $$ update public.memberships set user_id = '00000000-0000-4000-8000-000000000001'
     where user_id = '00000000-0000-4000-8000-000000000099' $$, '42501');
select tests.assert_equals('FR-03 owner can remove staff',
  tests.rows_affected($$ delete from public.memberships where user_id = '00000000-0000-4000-8000-000000000099' $$)::text, '1');

-- Database rules that hold even for the owner.
select tests.assert_raises('FR-03 an owner membership must be restaurant-wide (not tied to one branch)',
  $$ insert into public.memberships (restaurant_id, branch_id, user_id, role)
     values ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
             '00000000-0000-4000-8000-000000000099', 'owner') $$, '23514');
select tests.assert_raises('FR-03 a user cannot hold two restaurant-wide roles in one restaurant',
  $$ insert into public.memberships (restaurant_id, user_id, role)
     values ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', 'cashier') $$, '23505');

-- ---- Profiles: your own only ---------------------------------------------------------
select tests.assert_equals('FR-03 owner can edit their own display name',
  tests.rows_affected($$ update public.profiles set display_name = 'Alpha Owner Renamed' where id = '00000000-0000-4000-8000-000000000001' $$)::text, '1');
select tests.assert_equals('FR-03 owner cannot edit a colleague''s profile',
  tests.rows_affected($$ update public.profiles set display_name = 'Nope' where id = '00000000-0000-4000-8000-000000000002' $$)::text, '0');
select tests.assert_raises('FR-03 a profile id can never be changed',
  $$ update public.profiles set id = '00000000-0000-4000-8000-000000000098' where id = '00000000-0000-4000-8000-000000000001' $$, '42501');

select tests.logout();
rollback;
