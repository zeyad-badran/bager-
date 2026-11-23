-- =============================================================================
-- AT-11 (orders extension): a user of tenant B can neither read nor transition a
-- tenant-A order, by guessing its UUID or by calling the functions directly.
-- Serves:  AT-11, AT-02, CLAUDE.md "a user from tenant A must never read or write tenant B"
-- Setup:   supabase/seed.sql: Alpha orders 01-06, Beta orders 11-12
-- =============================================================================
begin;

-- ---- Beta looking at Alpha -------------------------------------------------------
select tests.login_as('00000000-0000-4000-8000-000000000011');  -- beta_owner
select tests.assert_equals('AT-11 Beta''s owner sees only Beta''s 2 orders',
  tests.count_rows($$ select 1 from public.orders $$)::text, '2');
select tests.assert_equals('AT-11 guessing an Alpha order UUID returns nothing',
  tests.count_rows($$ select 1 from public.orders where id = '30000000-0000-4000-8000-000000000001' $$)::text, '0');
select tests.assert_raises('AT-11 transitioning a guessed Alpha order is refused like a missing one',
  $$ select public.transition_order('30000000-0000-4000-8000-000000000001', 1, 'preparing') $$, '42501');
select tests.assert_raises('AT-11 ...even with a wrong version (no conflict code that would leak existence)',
  $$ select public.transition_order('30000000-0000-4000-8000-000000000001', 99, 'preparing') $$, '42501');
select tests.assert_raises('AT-11 ...and even for an illegal move (no transition code that would leak state)',
  $$ select public.transition_order('30000000-0000-4000-8000-000000000002', 4, 'ready') $$, '42501');
select tests.assert_raises('AT-11 a completely unknown order id gets the same answer',
  $$ select public.transition_order('30000000-0000-4000-8000-0000000000ff', 1, 'preparing') $$, '42501');

-- ---- Alpha looking at Beta (every Alpha role) ----------------------------------------
select tests.login_as('00000000-0000-4000-8000-000000000001');  -- alpha_owner
select tests.assert_equals('AT-11 Alpha''s owner sees none of Beta''s orders',
  tests.count_rows($$ select 1 from public.orders where restaurant_id = '10000000-0000-4000-8000-000000000002' $$)::text, '0');
select tests.assert_raises('AT-11 Alpha''s owner cannot move a Beta order to READY',
  $$ select public.transition_order('30000000-0000-4000-8000-000000000012', 2, 'ready') $$, '42501');

select tests.login_as('00000000-0000-4000-8000-000000000004');  -- alpha_kitchen
select tests.assert_raises('AT-11 Alpha''s kitchen cannot cancel a Beta order',
  $$ select public.transition_order('30000000-0000-4000-8000-000000000011', 1, 'cancelled') $$, '42501');

select tests.login_as('00000000-0000-4000-8000-000000000005');  -- alpha_auditor
select tests.assert_equals('AT-11 Alpha''s auditor sees none of Beta''s orders',
  tests.count_rows($$ select 1 from public.orders where restaurant_id = '10000000-0000-4000-8000-000000000002' $$)::text, '0');

select tests.login_as('00000000-0000-4000-8000-000000000099');  -- stranger
select tests.assert_equals('AT-11 a user with no membership sees no orders at all',
  tests.count_rows($$ select 1 from public.orders $$)::text, '0');

select tests.login_as_anon();
select tests.assert_raises('AT-11 anonymous visitors cannot read orders',
  $$ select 1 from public.orders $$, '42501');

select tests.logout();
select tests.assert_equals('AT-11 Beta''s orders are unchanged after all of Alpha''s attempts',
  (select string_agg(status::text || '/' || version, ',' order by id) from public.orders
    where restaurant_id = '10000000-0000-4000-8000-000000000002'),
  'new/1,preparing/2');

rollback;
