-- =============================================================================
-- FR-14: every change to tenant data leaves an audit row, and history cannot
-- be rewritten.
-- Serves:  FR-14 · blueprint §5 (FR-14), §14.1
-- Setup:   supabase/seed.sql
-- =============================================================================
begin;

-- ---- Changes made by a manager are recorded with who/what/where ----------------
select tests.login_as('00000000-0000-4000-8000-000000000002');  -- alpha_manager

do $$
declare
  v_branch_id uuid;
begin
  insert into public.branches (restaurant_id, name)
  values ('10000000-0000-4000-8000-000000000001', 'Audit Test Branch')
  returning id into v_branch_id;

  perform tests.assert_equals('FR-14 creating a branch is audited with the actor',
    tests.count_rows(format($q$
      select 1 from public.audit_logs
       where entity_table = 'branches' and action = 'INSERT' and entity_id = %L
         and restaurant_id = '10000000-0000-4000-8000-000000000001'
         and branch_id = %L
         and actor_user_id = '00000000-0000-4000-8000-000000000002'
    $q$, v_branch_id, v_branch_id))::text, '1');

  update public.branches set name = 'Audit Test Branch 2', locale = 'ar' where id = v_branch_id;

  perform tests.assert_equals('FR-14 an update records WHICH columns changed, not their values',
    tests.count_rows(format($q$
      select 1 from public.audit_logs
       where entity_table = 'branches' and action = 'UPDATE' and entity_id = %L
         and details = '{"changed_columns": ["locale", "name"]}'::jsonb
    $q$, v_branch_id))::text, '1');

  perform tests.assert_equals('FR-14 audit details never contain the new name',
    tests.count_rows(format($q$
      select 1 from public.audit_logs
       where entity_id = %L and details::text like '%%Audit Test Branch 2%%'
    $q$, v_branch_id))::text, '0');

  update public.branch_settings set operating_settings = '{"k":1}' where branch_id = v_branch_id;
  perform tests.assert_equals('FR-14 changing branch settings is audited',
    tests.count_rows(format($q$
      select 1 from public.audit_logs
       where entity_table = 'branch_settings' and action = 'UPDATE' and entity_id = %L
    $q$, v_branch_id))::text, '1');
end;
$$;

-- ---- Owner deletes are recorded too -------------------------------------------------
select tests.login_as('00000000-0000-4000-8000-000000000001');  -- alpha_owner
do $$
declare
  v_branch_id uuid;
begin
  insert into public.branches (restaurant_id, name)
  values ('10000000-0000-4000-8000-000000000001', 'Delete Me')
  returning id into v_branch_id;
  delete from public.branches where id = v_branch_id;

  perform tests.assert_equals('FR-14 deleting a branch is audited',
    tests.count_rows(format($q$
      select 1 from public.audit_logs
       where entity_table = 'branches' and action = 'DELETE' and entity_id = %L
         and actor_user_id = '00000000-0000-4000-8000-000000000001'
    $q$, v_branch_id))::text, '1');
end;
$$;

select tests.assert_equals('FR-14 staff changes are audited (add a member)',
  tests.rows_affected($$ insert into public.memberships (restaurant_id, user_id, role)
     values ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000099', 'auditor') $$)::text, '1');
select tests.assert_equals('FR-14 ...and the membership insert shows in the history',
  (tests.count_rows($$ select 1 from public.audit_logs
     where entity_table = 'memberships' and action = 'INSERT'
       and actor_user_id = '00000000-0000-4000-8000-000000000001' $$) >= 1)::text, 'true');

-- ---- Nobody can write or rewrite history through the API -----------------------------
select tests.assert_raises('FR-14 owner cannot insert audit rows by hand',
  $$ insert into public.audit_logs (restaurant_id, action, entity_table)
     values ('10000000-0000-4000-8000-000000000001', 'INSERT', 'branches') $$, '42501');
select tests.assert_raises('FR-14 owner cannot edit audit rows',
  $$ update public.audit_logs set action = 'DELETE' $$, '42501');
select tests.assert_raises('FR-14 owner cannot delete audit rows',
  $$ delete from public.audit_logs $$, '42501');

-- ---- ...and not even the database owner / service code ---------------------------------
select tests.logout();
select tests.assert_raises('FR-14 audit rows cannot be updated even by the database owner',
  $$ update public.audit_logs set action = 'DELETE' $$, '42501');
select tests.assert_raises('FR-14 audit rows cannot be deleted even by the database owner',
  $$ delete from public.audit_logs $$, '42501');

rollback;
