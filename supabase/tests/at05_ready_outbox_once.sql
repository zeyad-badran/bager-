-- =============================================================================
-- AT-05: a kitchen employee marks READY. The transition commits once and enqueues
-- exactly one `order.ready` outbox event in the same transaction. Repeating the call
-- (same version or a stale one, or a fresh version) never enqueues a second event.
-- Serves:  AT-05, FR-12 (READY notification is enqueued, not sent: no worker yet, ADR-0004),
--          blueprint §5.1 ("do not resend READY"), §7.4 (transactional outbox)
-- Setup:   supabase/seed.sql order 03 (Alpha Downtown, ticket 7, preparing v2)
-- =============================================================================
begin;

select tests.login_as('00000000-0000-4000-8000-000000000004');  -- alpha_kitchen (Downtown)
select tests.assert_equals('AT-05 kitchen marks the order READY',
  (select status::text || '/' || version from public.transition_order('30000000-0000-4000-8000-000000000003', 2, 'ready')),
  'ready/3');

select tests.logout();
select tests.assert_equals('AT-05 exactly one order.ready outbox event exists for the order',
  tests.count_rows($$ select 1 from public.outbox_events
                      where order_id = '30000000-0000-4000-8000-000000000003' $$)::text, '1');
select tests.assert_equals('AT-05 the event is pending, attempt 0, for the right tenant and branch',
  (select event_type || '/' || status || '/' || attempts || '/' || restaurant_id || '/' || branch_id
     from public.outbox_events where order_id = '30000000-0000-4000-8000-000000000003'),
  'order.ready/pending/0/10000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000001');
select tests.assert_equals('AT-05 the payload carries ids only (no customer data)',
  (select string_agg(key, ',' order by key) from public.outbox_events, jsonb_object_keys(payload) as key
    where order_id = '30000000-0000-4000-8000-000000000003'),
  'branch_id,order_id,restaurant_id');

-- ---- Repeated clicks and duplicate requests --------------------------------------
select tests.login_as('00000000-0000-4000-8000-000000000004');  -- alpha_kitchen
select tests.assert_raises('AT-05 repeating the call with the SAME (now stale) version is a conflict',
  $$ select public.transition_order('30000000-0000-4000-8000-000000000003', 2, 'ready') $$, 'PT409');
select tests.assert_raises('AT-05 repeating READY with the CURRENT version is an illegal ready -> ready',
  $$ select public.transition_order('30000000-0000-4000-8000-000000000003', 3, 'ready') $$, 'PT422');
select tests.login_as('00000000-0000-4000-8000-000000000003');  -- alpha_cashier, a second person
select tests.assert_raises('AT-05 a second staff member pressing READY again is also refused',
  $$ select public.transition_order('30000000-0000-4000-8000-000000000003', 3, 'ready') $$, 'PT422');

select tests.logout();
select tests.assert_equals('AT-05 still exactly one outbox event after the repeats',
  tests.count_rows($$ select 1 from public.outbox_events
                      where order_id = '30000000-0000-4000-8000-000000000003' $$)::text, '1');

-- ---- Only READY enqueues --------------------------------------------------------
select tests.login_as('00000000-0000-4000-8000-000000000004');
select tests.assert_equals('AT-05 collecting the order succeeds',
  (select status::text from public.transition_order('30000000-0000-4000-8000-000000000003', 3, 'collected')), 'collected');
select tests.assert_equals('AT-05 new -> preparing on another order succeeds',
  (select status::text from public.transition_order('30000000-0000-4000-8000-000000000001', 1, 'preparing')), 'preparing');
select tests.logout();
select tests.assert_equals('AT-05 collected and preparing transitions enqueue nothing',
  tests.count_rows($$ select 1 from public.outbox_events
                      where order_id in ('30000000-0000-4000-8000-000000000003',
                                         '30000000-0000-4000-8000-000000000001') $$)::text, '1');

-- ---- The database refuses a second READY event even from privileged code ---------
select tests.assert_raises('AT-05 the unique (order_id, event_type) key blocks a second order.ready row',
  $$ insert into public.outbox_events (restaurant_id, branch_id, order_id, event_type, payload)
     values ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
             '30000000-0000-4000-8000-000000000003', 'order.ready', '{}') $$, '23505');

rollback;
