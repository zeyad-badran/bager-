-- =============================================================================
-- FR-14 (orders): every status change leaves exactly ONE audit row that answers
-- "who moved it, from which status, to which status, version before and after".
-- Rejected transitions write nothing. Audit rows of the tenancy tables keep their
-- exact previous shape.
-- Serves:  FR-14 (audit history), FR-10 · slice 02b
-- Setup:   supabase/seed.sql order 01 (Alpha Downtown, ticket 42, new v1)
-- =============================================================================
begin;

-- ---- One transition, one audit row with the four details -------------------------
select tests.login_as('00000000-0000-4000-8000-000000000004');  -- alpha_kitchen (Downtown)
select tests.assert_equals('FR-14 kitchen moves order 01 new -> preparing',
  (select status::text from public.transition_order('30000000-0000-4000-8000-000000000001', 1, 'preparing')), 'preparing');

select tests.logout();
select tests.assert_equals('FR-14 the transition wrote exactly one UPDATE audit row',
  tests.count_rows($$ select 1 from public.audit_logs where entity_table = 'orders' and action = 'UPDATE'
                      and entity_id = '30000000-0000-4000-8000-000000000001' $$)::text, '1');
select tests.assert_equals('FR-14 the audit row records who, from, to, version before and after',
  (select right(actor_user_id::text, 2) || ' ' || (details ->> 'from_status') || '->' || (details ->> 'to_status')
          || ' v' || (details ->> 'version_from') || '->' || (details ->> 'version_to')
     from public.audit_logs where entity_table = 'orders' and action = 'UPDATE'
      and entity_id = '30000000-0000-4000-8000-000000000001'),
  '04 new->preparing v1->2');
select tests.assert_equals('FR-14 the versions are stored as numbers, not text',
  (select jsonb_typeof(details -> 'version_from') || '/' || jsonb_typeof(details -> 'version_to')
     from public.audit_logs where entity_table = 'orders' and action = 'UPDATE'
      and entity_id = '30000000-0000-4000-8000-000000000001'),
  'number/number');
select tests.assert_equals('FR-14 what was recorded before is still there (changed column names)',
  (select (details -> 'changed_columns')::text from public.audit_logs
    where entity_table = 'orders' and action = 'UPDATE' and entity_id = '30000000-0000-4000-8000-000000000001'),
  '["status", "version"]');

-- ---- Rejected transitions write nothing --------------------------------------------
select tests.login_as('00000000-0000-4000-8000-000000000004');
select tests.assert_raises('FR-14 a stale-version transition is refused',
  $$ select public.transition_order('30000000-0000-4000-8000-000000000001', 1, 'ready') $$, 'PT409');
select tests.assert_raises('FR-14 an illegal transition is refused',
  $$ select public.transition_order('30000000-0000-4000-8000-000000000001', 2, 'collected') $$, 'PT422');
select tests.assert_raises('FR-14 a no-op transition (preparing -> preparing) is refused',
  $$ select public.transition_order('30000000-0000-4000-8000-000000000001', 2, 'preparing') $$, 'PT422');
select tests.logout();
select tests.assert_equals('FR-14 the refused attempts added no audit row',
  tests.count_rows($$ select 1 from public.audit_logs where entity_table = 'orders' and action = 'UPDATE'
                      and entity_id = '30000000-0000-4000-8000-000000000001' $$)::text, '1');

-- ---- "Who marked this READY, and when?" from audit_logs alone ----------------------
select tests.login_as('00000000-0000-4000-8000-000000000003');  -- alpha_cashier
select tests.assert_equals('FR-14 cashier marks order 01 READY',
  (select status::text from public.transition_order('30000000-0000-4000-8000-000000000001', 2, 'ready')), 'ready');
select tests.logout();
select tests.assert_equals('FR-14 the READY audit row names the cashier, preparing -> ready, v2 -> 3, with a time',
  (select right(actor_user_id::text, 2) || ' ' || (details ->> 'from_status') || '->' || (details ->> 'to_status')
          || ' v' || (details ->> 'version_from') || '->' || (details ->> 'version_to')
          || ' ' || (occurred_at is not null)
     from public.audit_logs
    where entity_table = 'orders' and action = 'UPDATE' and details ->> 'to_status' = 'ready'
      and entity_id = '30000000-0000-4000-8000-000000000001'),
  '03 preparing->ready v2->3 true');
select tests.assert_equals('FR-14 two transitions, two audit rows (never duplicated)',
  tests.count_rows($$ select 1 from public.audit_logs where entity_table = 'orders' and action = 'UPDATE'
                      and entity_id = '30000000-0000-4000-8000-000000000001' $$)::text, '2');

-- ---- Creating an order: audit row shape unchanged ---------------------------------
select tests.login_as('00000000-0000-4000-8000-000000000003');
select (public.create_manual_order('20000000-0000-4000-8000-000000000001', '801')).id as new_order \gset
select tests.logout();
select tests.assert_equals('FR-14 an order INSERT audit row still has empty details',
  (select details::text from public.audit_logs
    where entity_table = 'orders' and action = 'INSERT' and entity_id = :'new_order'),
  '{}');

-- ---- Tenancy tables: exactly the previous shape --------------------------------------
select tests.login_as('00000000-0000-4000-8000-000000000001');  -- alpha_owner
update public.branches set name = 'Alpha Downtown Renamed' where id = '20000000-0000-4000-8000-000000000001';
update public.restaurants set name = 'Alpha Burgers Renamed' where id = '10000000-0000-4000-8000-000000000001';
select tests.logout();
select tests.assert_equals('FR-14 a branch update audit row is unchanged (changed column names only)',
  (select details::text from public.audit_logs
    where entity_table = 'branches' and action = 'UPDATE' and entity_id = '20000000-0000-4000-8000-000000000001'
    order by occurred_at desc limit 1),
  '{"changed_columns": ["name"]}');
select tests.assert_equals('FR-14 a restaurant update audit row is unchanged (changed column names only)',
  (select details::text from public.audit_logs
    where entity_table = 'restaurants' and action = 'UPDATE' and entity_id = '10000000-0000-4000-8000-000000000001'
    order by occurred_at desc limit 1),
  '{"changed_columns": ["name"]}');
select tests.assert_equals('FR-14 no tenancy audit row carries order status details',
  tests.count_rows($$ select 1 from public.audit_logs
                      where entity_table <> 'orders' and details ? 'from_status' $$)::text, '0');

rollback;
