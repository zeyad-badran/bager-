-- =============================================================================
-- AT-02 / AT-11: one restaurant must never read or change another's data.
-- Serves:  FR-01, AT-02 (two restaurants), AT-11 (cross-tenant request, guessed ids)
-- Setup:   supabase/seed.sql (Alpha = restaurant 01, Beta = restaurant 02)
-- Method:  act as real users via tests.login_as(); RLS applies as in production.
--          Everything runs in one transaction that is rolled back at the end.
-- =============================================================================
begin;

-- ---- Alpha's owner trying to reach Beta ------------------------------------
select tests.login_as('00000000-0000-4000-8000-000000000001');  -- alpha_owner

select tests.assert_equals('AT-11 alpha owner sees only their own restaurant',
  tests.count_rows($$ select 1 from public.restaurants $$)::text, '1');
select tests.assert_equals('AT-11 guessing Beta''s restaurant id returns nothing',
  tests.count_rows($$ select 1 from public.restaurants where id = '10000000-0000-4000-8000-000000000002' $$)::text, '0');
select tests.assert_equals('AT-11 guessing a Beta branch id returns nothing',
  tests.count_rows($$ select 1 from public.branches where id = '20000000-0000-4000-8000-000000000011' $$)::text, '0');
select tests.assert_equals('AT-11 alpha owner sees only Alpha''s 2 branches',
  tests.count_rows($$ select 1 from public.branches $$)::text, '2');
select tests.assert_equals('AT-11 alpha owner sees no Beta branch settings',
  tests.count_rows($$ select 1 from public.branch_settings where restaurant_id = '10000000-0000-4000-8000-000000000002' $$)::text, '0');
select tests.assert_equals('AT-11 alpha owner sees no Beta memberships',
  tests.count_rows($$ select 1 from public.memberships where restaurant_id = '10000000-0000-4000-8000-000000000002' $$)::text, '0');
select tests.assert_equals('AT-11 alpha owner sees no Beta audit history',
  tests.count_rows($$ select 1 from public.audit_logs where restaurant_id = '10000000-0000-4000-8000-000000000002' $$)::text, '0');

-- Writes against Beta: inserts are refused, updates/deletes touch zero rows.
select tests.assert_raises('AT-11 cannot create a branch inside Beta',
  $$ insert into public.branches (restaurant_id, name) values ('10000000-0000-4000-8000-000000000002', 'Sneaky Branch') $$, '42501');
select tests.assert_raises('AT-11 cannot make yourself owner of Beta',
  $$ insert into public.memberships (restaurant_id, user_id, role)
     values ('10000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', 'owner') $$, '42501');
select tests.assert_equals('AT-11 cannot rename Beta',
  tests.rows_affected($$ update public.restaurants set name = 'Hijacked' where id = '10000000-0000-4000-8000-000000000002' $$)::text, '0');
select tests.assert_equals('AT-11 cannot edit a Beta branch',
  tests.rows_affected($$ update public.branches set name = 'Hijacked' where id = '20000000-0000-4000-8000-000000000011' $$)::text, '0');
select tests.assert_equals('AT-11 cannot delete a Beta branch',
  tests.rows_affected($$ delete from public.branches where id = '20000000-0000-4000-8000-000000000011' $$)::text, '0');
select tests.assert_equals('AT-11 cannot edit Beta branch settings',
  tests.rows_affected($$ update public.branch_settings set operating_settings = '{"x":1}' where branch_id = '20000000-0000-4000-8000-000000000011' $$)::text, '0');
select tests.assert_equals('AT-11 cannot remove a Beta staff member',
  tests.rows_affected($$ delete from public.memberships where restaurant_id = '10000000-0000-4000-8000-000000000002' $$)::text, '0');

-- A branch cannot be moved across tenants, and a membership cannot link tenants.
select tests.assert_raises('AT-11 cannot move an Alpha branch into Beta (column not writable)',
  $$ update public.branches set restaurant_id = '10000000-0000-4000-8000-000000000002' where id = '20000000-0000-4000-8000-000000000001' $$, '42501');
select tests.assert_raises('AT-11 cannot attach an Alpha member to a Beta branch (composite foreign key)',
  $$ insert into public.memberships (restaurant_id, branch_id, user_id, role)
     values ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000011',
             '00000000-0000-4000-8000-000000000099', 'cashier') $$, '23503');

-- ---- The same in the other direction: Beta's owner and Alpha -------------------
select tests.login_as('00000000-0000-4000-8000-000000000011');  -- beta_owner
select tests.assert_equals('AT-02 beta owner sees only their own restaurant',
  tests.count_rows($$ select 1 from public.restaurants $$)::text, '1');
select tests.assert_equals('AT-02 beta owner cannot see any Alpha branch',
  tests.count_rows($$ select 1 from public.branches where restaurant_id = '10000000-0000-4000-8000-000000000001' $$)::text, '0');
select tests.assert_equals('AT-02 beta owner cannot edit an Alpha branch',
  tests.rows_affected($$ update public.branches set name = 'Hijacked' where restaurant_id = '10000000-0000-4000-8000-000000000001' $$)::text, '0');

-- ---- Every role in Beta is equally walled off from Alpha ------------------------
select tests.login_as('00000000-0000-4000-8000-000000000012');  -- beta_manager
select tests.assert_equals('AT-02 beta manager sees nothing of Alpha',
  tests.count_rows($$ select 1 from public.branches where restaurant_id = '10000000-0000-4000-8000-000000000001' $$)::text, '0');
select tests.login_as('00000000-0000-4000-8000-000000000015');  -- beta_auditor
select tests.assert_equals('AT-02 beta auditor sees no Alpha audit history',
  tests.count_rows($$ select 1 from public.audit_logs where restaurant_id = '10000000-0000-4000-8000-000000000001' $$)::text, '0');

select tests.logout();
rollback;
