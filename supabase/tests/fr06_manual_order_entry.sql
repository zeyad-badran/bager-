-- =============================================================================
-- FR-06: staff create manual orders through create_manual_order(); nobody else can,
-- and nobody can insert into orders directly.
-- Serves:  FR-06 (manual order entry), FR-03 (roles), AT-11 (other tenants), FR-14 (audit)
-- Setup:   supabase/seed.sql (users, branches; Alpha Downtown = branch 01, Airport = 02)
-- Method:  act as real users via tests.login_as(); everything is rolled back at the end.
-- =============================================================================
begin;

-- ---- Every staff role may create an order in a branch it can work in ----------
select tests.login_as('00000000-0000-4000-8000-000000000003');  -- alpha_cashier (Downtown only)
select (public.create_manual_order('20000000-0000-4000-8000-000000000001', '101')).id as cashier_order \gset

select tests.assert_equals('FR-06 cashier creates a manual order in their own branch',
  tests.count_rows(format($q$ select 1 from public.orders where id = %L $q$, :'cashier_order'))::text, '1');
select tests.assert_equals('FR-06 a new manual order starts as new, version 1, source manual',
  (select status::text || '/' || version || '/' || source::text from public.orders where id = :'cashier_order'),
  'new/1/manual');
select tests.assert_equals('FR-06 the ticket number is stored trimmed (display value, not a key)',
  (select (public.create_manual_order('20000000-0000-4000-8000-000000000001', '  102  ')).ticket_number),
  '102');

select tests.login_as('00000000-0000-4000-8000-000000000004');  -- alpha_kitchen (Downtown only)
select tests.assert_equals('FR-06 kitchen may create a manual order',
  ((public.create_manual_order('20000000-0000-4000-8000-000000000001', '103')).status)::text, 'new');

select tests.login_as('00000000-0000-4000-8000-000000000002');  -- alpha_manager (restaurant-wide)
select tests.assert_equals('FR-06 a restaurant-wide manager may create orders in any of its branches',
  ((public.create_manual_order('20000000-0000-4000-8000-000000000002', '104')).status)::text, 'new');

select tests.login_as('00000000-0000-4000-8000-000000000001');  -- alpha_owner
select tests.assert_equals('FR-06 the owner may create a manual order',
  ((public.create_manual_order('20000000-0000-4000-8000-000000000001', '105')).status)::text, 'new');

-- ---- Who may not -------------------------------------------------------------
select tests.login_as('00000000-0000-4000-8000-000000000003');  -- alpha_cashier (Downtown only)
select tests.assert_raises('FR-06 branch-scoped cashier cannot create an order in another branch (Airport)',
  $$ select public.create_manual_order('20000000-0000-4000-8000-000000000002', '201') $$, '42501');

select tests.login_as('00000000-0000-4000-8000-000000000005');  -- alpha_auditor
select tests.assert_raises('FR-06 auditor is read-only and cannot create an order',
  $$ select public.create_manual_order('20000000-0000-4000-8000-000000000001', '202') $$, '42501');

select tests.login_as('00000000-0000-4000-8000-000000000099');  -- stranger
select tests.assert_raises('FR-06 a user with no membership cannot create an order',
  $$ select public.create_manual_order('20000000-0000-4000-8000-000000000001', '203') $$, '42501');

select tests.login_as('00000000-0000-4000-8000-000000000011');  -- beta_owner
select tests.assert_raises('AT-11 Beta''s owner cannot create an order in an Alpha branch',
  $$ select public.create_manual_order('20000000-0000-4000-8000-000000000001', '204') $$, '42501');
select tests.assert_raises('FR-06 an unknown branch id is refused like a forbidden one (no existence leak)',
  $$ select public.create_manual_order('20000000-0000-4000-8000-0000000000ff', '205') $$, '42501');

select tests.login_as_anon();
select tests.assert_raises('FR-06 anonymous visitors cannot call create_manual_order',
  $$ select public.create_manual_order('20000000-0000-4000-8000-000000000001', '206') $$, '42501');

-- ---- Input checks ------------------------------------------------------------
select tests.login_as('00000000-0000-4000-8000-000000000003');  -- alpha_cashier
select tests.assert_raises('FR-06 a blank ticket number is rejected',
  $$ select public.create_manual_order('20000000-0000-4000-8000-000000000001', '   ') $$, '23514');
select tests.assert_raises('FR-06 a ticket number longer than 20 characters is rejected',
  $$ select public.create_manual_order('20000000-0000-4000-8000-000000000001', repeat('9', 21)) $$, '23514');
select tests.assert_raises('FR-06 a missing branch id is rejected as invalid input',
  $$ select public.create_manual_order(null, '207') $$, '22023');

-- ---- No back door: clients never write orders directly -----------------------
select tests.assert_raises('FR-06 a signed-in client cannot insert into orders directly',
  $$ insert into public.orders (restaurant_id, branch_id, ticket_number)
     values ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '208') $$, '42501');

-- ---- Audited (FR-14) -----------------------------------------------------------
select tests.logout();
select tests.assert_equals('FR-14 creating a manual order writes an INSERT audit row with the actor',
  (select actor_user_id::text from public.audit_logs
    where entity_table = 'orders' and entity_id = :'cashier_order' and action = 'INSERT'),
  '00000000-0000-4000-8000-000000000003');

rollback;
