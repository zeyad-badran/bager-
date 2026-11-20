-- =============================================================================
-- FR-02: branch management and branch-scoped access.
-- Serves:  FR-02, FR-03 · blueprint §2.2, §11.2
-- Setup:   supabase/seed.sql. Alpha has branches Downtown (01) and Airport (02).
--          alpha_cashier (03) and alpha_kitchen (04) are scoped to Downtown only.
-- =============================================================================
begin;

-- ---- A cashier scoped to Downtown sees and changes only Downtown ---------------
select tests.login_as('00000000-0000-4000-8000-000000000003');  -- alpha_cashier (Downtown)

select tests.assert_equals('FR-02 branch-scoped cashier sees exactly one branch',
  tests.count_rows($$ select 1 from public.branches $$)::text, '1');
select tests.assert_equals('FR-02 ...and it is Downtown',
  tests.count_rows($$ select 1 from public.branches where id = '20000000-0000-4000-8000-000000000001' $$)::text, '1');
select tests.assert_equals('FR-02 cashier cannot see Alpha Airport (same restaurant, other branch)',
  tests.count_rows($$ select 1 from public.branches where id = '20000000-0000-4000-8000-000000000002' $$)::text, '0');
select tests.assert_equals('FR-02 cashier sees only Downtown''s settings',
  tests.count_rows($$ select 1 from public.branch_settings $$)::text, '1');
select tests.assert_equals('FR-02 cashier cannot rename their own branch',
  tests.rows_affected($$ update public.branches set name = 'Renamed' where id = '20000000-0000-4000-8000-000000000001' $$)::text, '0');
select tests.assert_raises('FR-02 cashier cannot create a branch',
  $$ insert into public.branches (restaurant_id, name) values ('10000000-0000-4000-8000-000000000001', 'New') $$, '42501');
select tests.assert_equals('FR-02 cashier sees only their own membership row',
  tests.count_rows($$ select 1 from public.memberships $$)::text, '1');
select tests.assert_equals('FR-02 cashier cannot read the audit history',
  tests.count_rows($$ select 1 from public.audit_logs $$)::text, '0');

select tests.login_as('00000000-0000-4000-8000-000000000004');  -- alpha_kitchen (Downtown)
select tests.assert_equals('FR-02 branch-scoped kitchen user sees exactly one branch',
  tests.count_rows($$ select 1 from public.branches $$)::text, '1');

-- ---- A restaurant-wide manager sees all branches and can run them -------------
select tests.login_as('00000000-0000-4000-8000-000000000002');  -- alpha_manager

select tests.assert_equals('FR-02 restaurant-wide manager sees both branches',
  tests.count_rows($$ select 1 from public.branches $$)::text, '2');

do $$
declare
  v_branch_id uuid;
begin
  insert into public.branches (restaurant_id, name, display_name, time_zone, locale)
  values ('10000000-0000-4000-8000-000000000001', 'Alpha Mall', 'Alpha at the Mall', 'Asia/Amman', 'ar')
  returning id into v_branch_id;
  perform tests.assert_equals('FR-02 manager can create a branch', (v_branch_id is not null)::text, 'true');

  perform tests.assert_equals('FR-02 new branch automatically gets its settings row',
    tests.count_rows(format('select 1 from public.branch_settings where branch_id = %L', v_branch_id))::text, '1');
end;
$$;

select tests.assert_equals('FR-02 manager can rename a branch',
  tests.rows_affected($$ update public.branches set name = 'Alpha Downtown (renamed)' where id = '20000000-0000-4000-8000-000000000001' $$)::text, '1');
select tests.assert_equals('FR-02 manager can change operating settings',
  tests.rows_affected($$ update public.branch_settings set operating_settings = '{"note":"test"}' where branch_id = '20000000-0000-4000-8000-000000000001' $$)::text, '1');
select tests.assert_equals('FR-02 manager cannot delete a branch (owner only)',
  tests.rows_affected($$ delete from public.branches where id = '20000000-0000-4000-8000-000000000002' $$)::text, '0');

-- Input validation: unknown time zone and malformed locale are rejected.
select tests.assert_raises('FR-02 unknown time zone is rejected',
  $$ insert into public.branches (restaurant_id, name, time_zone) values ('10000000-0000-4000-8000-000000000001', 'Bad TZ', 'Mars/Olympus') $$, '22023');
select tests.assert_raises('FR-02 malformed locale is rejected',
  $$ insert into public.branches (restaurant_id, name, locale) values ('10000000-0000-4000-8000-000000000001', 'Bad Locale', 'english') $$, '23514');
select tests.assert_raises('FR-02 blank branch name is rejected',
  $$ insert into public.branches (restaurant_id, name) values ('10000000-0000-4000-8000-000000000001', '   ') $$, '23514');

-- ---- Owner may delete a branch -------------------------------------------------
select tests.login_as('00000000-0000-4000-8000-000000000001');  -- alpha_owner
select tests.assert_equals('FR-02 owner can delete a branch',
  tests.rows_affected($$ delete from public.branches where id = '20000000-0000-4000-8000-000000000002' $$)::text, '1');

-- ---- A manager scoped to ONE branch manages only that branch -------------------
-- (set up as the database owner: the seed has no branch-scoped manager)
select tests.logout();
insert into public.branches (id, restaurant_id, name)
values ('20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', 'Alpha Harbour');
insert into public.memberships (restaurant_id, branch_id, user_id, role)
values ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000003',
        '00000000-0000-4000-8000-000000000099', 'manager');

select tests.login_as('00000000-0000-4000-8000-000000000099');  -- "stranger", now Harbour manager
select tests.assert_equals('FR-02 branch-scoped manager sees only their branch',
  tests.count_rows($$ select 1 from public.branches $$)::text, '1');
select tests.assert_equals('FR-02 branch-scoped manager can edit their branch',
  tests.rows_affected($$ update public.branches set name = 'Alpha Harbour 2' where id = '20000000-0000-4000-8000-000000000003' $$)::text, '1');
select tests.assert_equals('FR-02 branch-scoped manager cannot edit a sibling branch',
  tests.rows_affected($$ update public.branches set name = 'Nope' where id = '20000000-0000-4000-8000-000000000001' $$)::text, '0');
select tests.assert_raises('FR-02 branch-scoped manager cannot create new branches (restaurant-wide only)',
  $$ insert into public.branches (restaurant_id, name) values ('10000000-0000-4000-8000-000000000001', 'Nope') $$, '42501');

select tests.logout();
rollback;
