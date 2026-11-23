-- =============================================================================
-- AT-06: a cashier marking READY is allowed and audited; so are kitchen, manager and
-- owner. An auditor, a user with no membership, a staff member scoped to another
-- branch and a user of another tenant are rejected and write nothing.
-- Serves:  AT-06, FR-03 (role rule decided by the product owner 2026-11-21: any staff
--          role may perform every valid transition; auditor is read-only), FR-14 (audit)
-- Setup:   supabase/seed.sql users; each allowed role gets its own fresh preparing order.
-- =============================================================================
begin;

-- Fixtures: four preparing orders in Alpha Downtown, created as the database owner.
insert into public.orders (id, restaurant_id, branch_id, ticket_number, status, version) values
  ('30000000-0000-4000-8000-0000000000a1', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '601', 'preparing', 2),
  ('30000000-0000-4000-8000-0000000000a2', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '602', 'preparing', 2),
  ('30000000-0000-4000-8000-0000000000a3', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '603', 'preparing', 2),
  ('30000000-0000-4000-8000-0000000000a4', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '604', 'preparing', 2);

-- ---- Allowed: cashier, kitchen, manager, owner ---------------------------------------
select tests.login_as('00000000-0000-4000-8000-000000000003');  -- alpha_cashier (Downtown)
select tests.assert_equals('AT-06 cashier marks READY',
  (select status::text from public.transition_order('30000000-0000-4000-8000-0000000000a1', 2, 'ready')), 'ready');
select tests.login_as('00000000-0000-4000-8000-000000000004');  -- alpha_kitchen (Downtown)
select tests.assert_equals('AT-06 kitchen marks READY',
  (select status::text from public.transition_order('30000000-0000-4000-8000-0000000000a2', 2, 'ready')), 'ready');
select tests.login_as('00000000-0000-4000-8000-000000000002');  -- alpha_manager
select tests.assert_equals('AT-06 manager marks READY',
  (select status::text from public.transition_order('30000000-0000-4000-8000-0000000000a3', 2, 'ready')), 'ready');
select tests.login_as('00000000-0000-4000-8000-000000000001');  -- alpha_owner
select tests.assert_equals('AT-06 owner marks READY',
  (select status::text from public.transition_order('30000000-0000-4000-8000-0000000000a4', 2, 'ready')), 'ready');

select tests.logout();
select tests.assert_equals('AT-06 each READY wrote one UPDATE audit row naming the person who did it',
  (select string_agg(right(entity_id::text, 2) || '=' || right(actor_user_id::text, 2), ',' order by entity_id)
     from public.audit_logs
    where entity_table = 'orders' and action = 'UPDATE'
      and entity_id in ('30000000-0000-4000-8000-0000000000a1', '30000000-0000-4000-8000-0000000000a2',
                        '30000000-0000-4000-8000-0000000000a3', '30000000-0000-4000-8000-0000000000a4')),
  'a1=03,a2=04,a3=02,a4=01');
select tests.assert_equals('AT-06 the audit row records which columns changed (status, version, ready_at)',
  -- Only the changed-column list: slice 02b adds from/to status and versions to the same row
  -- (checked in fr14_order_audit_detail.sql).
  (select (details -> 'changed_columns')::text from public.audit_logs
    where entity_table = 'orders' and action = 'UPDATE' and entity_id = '30000000-0000-4000-8000-0000000000a1'),
  '["ready_at", "status", "version"]');

-- ---- Rejected: auditor, stranger, other branch, other tenant, anonymous -----------------
-- Order 03 (Alpha Downtown, preparing v2) is the target for every rejected attempt.
select tests.login_as('00000000-0000-4000-8000-000000000005');  -- alpha_auditor
select tests.assert_raises('AT-06 auditor cannot mark READY (read-only)',
  $$ select public.transition_order('30000000-0000-4000-8000-000000000003', 2, 'ready') $$, '42501');
select tests.assert_raises('AT-06 auditor cannot cancel either',
  $$ select public.transition_order('30000000-0000-4000-8000-000000000003', 2, 'cancelled') $$, '42501');
select tests.assert_equals('AT-06 ...but the auditor can still read the order',
  tests.count_rows($$ select 1 from public.orders where id = '30000000-0000-4000-8000-000000000003' $$)::text, '1');

select tests.login_as('00000000-0000-4000-8000-000000000099');  -- stranger
select tests.assert_raises('AT-06 a user with no membership cannot mark READY',
  $$ select public.transition_order('30000000-0000-4000-8000-000000000003', 2, 'ready') $$, '42501');

select tests.login_as('00000000-0000-4000-8000-000000000013');  -- beta_cashier
select tests.assert_raises('AT-06 a cashier of another tenant cannot mark READY',
  $$ select public.transition_order('30000000-0000-4000-8000-000000000003', 2, 'ready') $$, '42501');

select tests.login_as_anon();
select tests.assert_raises('AT-06 an anonymous visitor cannot call transition_order',
  $$ select public.transition_order('30000000-0000-4000-8000-000000000003', 2, 'ready') $$, '42501');

-- Branch scope: Alpha's Downtown cashier vs an order at Alpha Airport (order 06, new v1).
select tests.login_as('00000000-0000-4000-8000-000000000003');  -- alpha_cashier (Downtown only)
select tests.assert_raises('AT-06 a branch-scoped cashier cannot act on another branch''s order',
  $$ select public.transition_order('30000000-0000-4000-8000-000000000006', 1, 'preparing') $$, '42501');

select tests.logout();
select tests.assert_equals('AT-06 the rejected attempts changed nothing (orders 03 and 06 untouched)',
  (select string_agg(status::text || '/' || version, ',' order by id) from public.orders
    where id in ('30000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000006')),
  'preparing/2,new/1');
select tests.assert_equals('AT-06 the rejected attempts wrote no audit row',
  tests.count_rows($$ select 1 from public.audit_logs where entity_table = 'orders' and action = 'UPDATE'
                      and entity_id in ('30000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000006') $$)::text, '0');
select tests.assert_equals('AT-06 the rejected attempts enqueued no outbox event',
  tests.count_rows($$ select 1 from public.outbox_events
                      where order_id in ('30000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000006') $$)::text, '0');

rollback;
