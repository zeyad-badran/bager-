-- =============================================================================
-- FR-06: no new orders in an inactive branch. create_manual_order() refuses with
-- PT422 'branch is inactive' and writes nothing; reactivating the branch lifts the
-- block; orders that already existed keep moving, so nothing gets stuck.
-- Non-members still get 42501, exactly as before (no hint whether a branch is active).
-- Serves:  FR-06 (manual order entry), FR-10, FR-02 (branches.is_active) · slice 02b
-- Setup:   supabase/seed.sql Alpha Downtown (branch 01) with order 03 (ticket 7, preparing v2)
-- =============================================================================
begin;

-- Test-only helper (session temp schema, gone after the run): the error text of a statement.
create function pg_temp.error_message(p_sql text) returns text language plpgsql as $f$
begin
  execute p_sql;
  return null;
exception when others then
  return sqlerrm;
end;
$f$;
grant execute on function pg_temp.error_message(text) to authenticated;

-- The restaurant-wide manager closes Alpha Downtown (normal branch update, allowed by RLS).
select tests.login_as('00000000-0000-4000-8000-000000000002');  -- alpha_manager
select tests.assert_equals('FR-06 the manager deactivates Alpha Downtown',
  tests.rows_affected($$ update public.branches set is_active = false
                         where id = '20000000-0000-4000-8000-000000000001' $$)::text, '1');

select tests.logout();
select count(*) as orders_before from public.orders where branch_id = '20000000-0000-4000-8000-000000000001' \gset
select count(*) as order_audit_before from public.audit_logs where entity_table = 'orders' \gset

-- ---- Staff of the branch are refused with the inactive-branch code -----------------
select tests.login_as('00000000-0000-4000-8000-000000000003');  -- alpha_cashier (Downtown)
select tests.assert_raises('FR-06 cashier cannot create an order in an inactive branch (PT422)',
  $$ select public.create_manual_order('20000000-0000-4000-8000-000000000001', '901') $$, 'PT422');
select tests.login_as('00000000-0000-4000-8000-000000000001');  -- alpha_owner
select tests.assert_raises('FR-06 not even the owner can create an order in an inactive branch',
  $$ select public.create_manual_order('20000000-0000-4000-8000-000000000001', '902') $$, 'PT422');

-- The message is the documented one, so the cause is clear in logs.
select tests.assert_equals('FR-06 the error message is ''branch is inactive''',
  pg_temp.error_message($$ select public.create_manual_order('20000000-0000-4000-8000-000000000001', '903') $$),
  'branch is inactive');

-- ---- 42501 behaviour unchanged for outsiders ----------------------------------------
select tests.login_as('00000000-0000-4000-8000-000000000099');  -- stranger
select tests.assert_raises('FR-06 a non-member still gets 42501 for an inactive branch (no state leak)',
  $$ select public.create_manual_order('20000000-0000-4000-8000-000000000001', '904') $$, '42501');
select tests.login_as('00000000-0000-4000-8000-000000000011');  -- beta_owner
select tests.assert_raises('FR-06 another tenant still gets 42501 for an inactive branch',
  $$ select public.create_manual_order('20000000-0000-4000-8000-000000000001', '905') $$, '42501');
select tests.login_as('00000000-0000-4000-8000-000000000005');  -- alpha_auditor
select tests.assert_raises('FR-06 the auditor still gets 42501 (read-only beats inactive)',
  $$ select public.create_manual_order('20000000-0000-4000-8000-000000000001', '906') $$, '42501');

-- ---- The refusals wrote nothing --------------------------------------------------------
select tests.logout();
select tests.assert_equals('FR-06 no order was created in the inactive branch',
  (select count(*) from public.orders where branch_id = '20000000-0000-4000-8000-000000000001')::text,
  :'orders_before');
select tests.assert_equals('FR-06 no order audit row was written by the refusals',
  (select count(*) from public.audit_logs where entity_table = 'orders')::text,
  :'order_audit_before');

-- ---- Existing orders keep moving in the inactive branch -----------------------------
select tests.login_as('00000000-0000-4000-8000-000000000004');  -- alpha_kitchen (Downtown)
select tests.assert_equals('FR-10 an existing order in a deactivated branch can still be marked READY',
  (select status::text from public.transition_order('30000000-0000-4000-8000-000000000003', 2, 'ready')), 'ready');
select tests.assert_equals('FR-10 ...and collected, so nothing gets stuck',
  (select status::text from public.transition_order('30000000-0000-4000-8000-000000000003', 3, 'collected')), 'collected');
select tests.assert_equals('FR-10 an existing new order can still be cancelled',
  (select status::text from public.transition_order('30000000-0000-4000-8000-000000000001', 1, 'cancelled')), 'cancelled');

-- ---- Reactivating lifts the block ------------------------------------------------------
select tests.login_as('00000000-0000-4000-8000-000000000002');  -- alpha_manager
update public.branches set is_active = true where id = '20000000-0000-4000-8000-000000000001';
select tests.login_as('00000000-0000-4000-8000-000000000003');  -- alpha_cashier
select tests.assert_equals('FR-06 the same call succeeds after the branch is reactivated',
  ((public.create_manual_order('20000000-0000-4000-8000-000000000001', '901')).status)::text, 'new');

-- ---- Other branches were never affected ---------------------------------------------------
select tests.login_as('00000000-0000-4000-8000-000000000002');  -- alpha_manager
update public.branches set is_active = false where id = '20000000-0000-4000-8000-000000000001';
select tests.assert_equals('FR-06 an active sibling branch (Airport) still accepts orders',
  ((public.create_manual_order('20000000-0000-4000-8000-000000000002', '907')).status)::text, 'new');

select tests.logout();
rollback;
