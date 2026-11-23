-- =============================================================================
-- FR-10: the order lifecycle (blueprint §5.1) is enforced by transition_order().
-- Valid moves succeed and bump the version; illegal moves fail with PT422; terminal
-- states stay terminal; a stale version fails with PT409; clients cannot write
-- status or version directly.
-- Serves:  FR-10 (queue status lifecycle), AT-09 (version check, single session),
--          blueprint §5.1, CLAUDE.md "status transitions are enforced server-side"
-- Setup:   supabase/seed.sql orders 01 (new v1), 02 (collected v4), 03 (preparing v2),
--          04 (ready v3), 05 (cancelled v2); all in Alpha Downtown
-- Error codes: PT422 illegal transition · PT409 version conflict · 22023 bad input
-- =============================================================================
begin;

select tests.login_as('00000000-0000-4000-8000-000000000003');  -- alpha_cashier (Downtown)

-- ---- The happy path: new -> preparing -> ready -> collected --------------------
select tests.assert_equals('FR-10 new -> preparing succeeds and bumps the version to 2',
  (select status::text || '/' || version from public.transition_order('30000000-0000-4000-8000-000000000001', 1, 'preparing')),
  'preparing/2');
select tests.assert_equals('FR-10 preparing -> ready succeeds, version 3, ready_at is set',
  (select status::text || '/' || version || '/' || (ready_at is not null)
     from public.transition_order('30000000-0000-4000-8000-000000000001', 2, 'ready')),
  'ready/3/true');
select tests.assert_equals('FR-10 ready -> collected succeeds, version 4, closed_at is set',
  (select status::text || '/' || version || '/' || (closed_at is not null)
     from public.transition_order('30000000-0000-4000-8000-000000000001', 3, 'collected')),
  'collected/4/true');

-- ---- Cancel is allowed from new and preparing only ---------------------------
select tests.assert_equals('FR-10 preparing -> cancelled succeeds and sets closed_at',
  (select status::text || '/' || (closed_at is not null)
     from public.transition_order('30000000-0000-4000-8000-000000000003', 2, 'cancelled')),
  'cancelled/true');
select tests.assert_raises('FR-10 ready -> cancelled is illegal (READY only moves to collected)',
  $$ select public.transition_order('30000000-0000-4000-8000-000000000004', 3, 'cancelled') $$, 'PT422');

-- ---- Illegal moves fail and change nothing -------------------------------------
select tests.login_as('00000000-0000-4000-8000-000000000001');  -- alpha_owner (role does not unlock illegal moves)
select tests.assert_raises('FR-10 collected -> ready is illegal (terminal state)',
  $$ select public.transition_order('30000000-0000-4000-8000-000000000002', 4, 'ready') $$, 'PT422');
select tests.assert_raises('FR-10 collected -> preparing is illegal (no silent reopen)',
  $$ select public.transition_order('30000000-0000-4000-8000-000000000002', 4, 'preparing') $$, 'PT422');
select tests.assert_raises('FR-10 cancelled -> new is illegal (terminal state)',
  $$ select public.transition_order('30000000-0000-4000-8000-000000000005', 2, 'new') $$, 'PT422');
select tests.assert_raises('FR-10 cancelled -> preparing is illegal (terminal state)',
  $$ select public.transition_order('30000000-0000-4000-8000-000000000005', 2, 'preparing') $$, 'PT422');
select tests.assert_raises('FR-10 cancelled -> ready is illegal (terminal state)',
  $$ select public.transition_order('30000000-0000-4000-8000-000000000005', 2, 'ready') $$, 'PT422');
select tests.assert_raises('FR-10 cancelled -> collected is illegal (terminal state)',
  $$ select public.transition_order('30000000-0000-4000-8000-000000000005', 2, 'collected') $$, 'PT422');
select tests.assert_raises('FR-10 ready -> ready is illegal (READY is never set twice)',
  $$ select public.transition_order('30000000-0000-4000-8000-000000000004', 3, 'ready') $$, 'PT422');
select tests.assert_raises('FR-10 ready -> new is illegal (no going back)',
  $$ select public.transition_order('30000000-0000-4000-8000-000000000004', 3, 'new') $$, 'PT422');

select tests.login_as('00000000-0000-4000-8000-000000000004');  -- alpha_kitchen
select (public.create_manual_order('20000000-0000-4000-8000-000000000001', '301')).id as fresh_order \gset
select tests.assert_raises('FR-10 new -> ready is illegal (must pass through preparing)',
  format($q$ select public.transition_order(%L, 1, 'ready') $q$, :'fresh_order'), 'PT422');
select tests.assert_raises('FR-10 new -> collected is illegal',
  format($q$ select public.transition_order(%L, 1, 'collected') $q$, :'fresh_order'), 'PT422');
select tests.assert_raises('FR-10 new -> new is illegal (no-op transitions are refused)',
  format($q$ select public.transition_order(%L, 1, 'new') $q$, :'fresh_order'), 'PT422');
select tests.assert_equals('FR-10 a refused transition leaves status and version untouched',
  (select status::text || '/' || version from public.orders where id = :'fresh_order'), 'new/1');

-- ---- Version check (optimistic concurrency, single session) ---------------------
select tests.assert_raises('AT-09 a stale expected version fails with the conflict code',
  format($q$ select public.transition_order(%L, 7, 'preparing') $q$, :'fresh_order'), 'PT409');
select tests.assert_equals('AT-09 after a conflict the latest state is still readable',
  (select status::text || '/' || version from public.orders where id = :'fresh_order'), 'new/1');
select tests.assert_raises('FR-10 a missing expected version is invalid input',
  format($q$ select public.transition_order(%L, null, 'preparing') $q$, :'fresh_order'), '22023');
select tests.assert_raises('FR-10 a missing target status is invalid input',
  format($q$ select public.transition_order(%L, 1, null) $q$, :'fresh_order'), '22023');

-- ---- No back door: status and version can only change through the function ------
select tests.assert_raises('FR-10 a direct update of status by a signed-in client fails',
  format($q$ update public.orders set status = 'ready' where id = %L $q$, :'fresh_order'), '42501');
select tests.assert_raises('FR-10 a direct update of version by a signed-in client fails',
  format($q$ update public.orders set version = 99 where id = %L $q$, :'fresh_order'), '42501');
select tests.assert_raises('FR-10 a signed-in client cannot delete an order',
  format($q$ delete from public.orders where id = %L $q$, :'fresh_order'), '42501');
select tests.assert_raises('FR-10 a signed-in client cannot write outbox events directly',
  $$ insert into public.outbox_events (restaurant_id, branch_id, order_id, event_type, payload)
     values ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
             '30000000-0000-4000-8000-000000000001', 'order.ready', '{}') $$, '42501');
select tests.assert_raises('FR-10 a signed-in client cannot read the outbox (worker-only, ADR-0004)',
  $$ select 1 from public.outbox_events $$, '42501');

select tests.logout();
rollback;
