-- =============================================================================
-- AT-02: two restaurants use the same ticket number; each sees only its own order.
-- A ticket number is reused in one branch after the earlier order was collected,
-- and the reuse is a separate order.
-- Serves:  AT-02 (same ticket number half), FR-06, blueprint §5.2 ("a ticket number is a
--          display/reference value, not an internal database key")
-- Setup:   supabase/seed.sql: ticket 42 = orders 01 (Alpha Downtown), 06 (Alpha Airport),
--          11 (Beta Mall); ticket 7 = orders 02 (collected) and 03 (preparing), Alpha Downtown
-- =============================================================================
begin;

-- ---- Same ticket number in two restaurants ------------------------------------
select tests.login_as('00000000-0000-4000-8000-000000000001');  -- alpha_owner
select tests.assert_equals('AT-02 Alpha sees its own two orders with ticket 42 (Downtown and Airport)',
  tests.count_rows($$ select 1 from public.orders where ticket_number = '42' $$)::text, '2');
select tests.assert_equals('AT-02 none of the ticket-42 orders Alpha sees belong to Beta',
  tests.count_rows($$ select 1 from public.orders where ticket_number = '42'
                      and restaurant_id <> '10000000-0000-4000-8000-000000000001' $$)::text, '0');

select tests.login_as('00000000-0000-4000-8000-000000000011');  -- beta_owner
select tests.assert_equals('AT-02 Beta sees exactly its own ticket-42 order',
  tests.count_rows($$ select 1 from public.orders where ticket_number = '42' $$)::text, '1');
select tests.assert_equals('AT-02 Beta''s ticket-42 order is the Beta one',
  (select id::text from public.orders where ticket_number = '42'),
  '30000000-0000-4000-8000-000000000011');

select tests.login_as('00000000-0000-4000-8000-000000000003');  -- alpha_cashier (Downtown only)
select tests.assert_equals('AT-02 branch-scoped cashier sees only the Downtown ticket-42 order',
  tests.count_rows($$ select 1 from public.orders where ticket_number = '42' $$)::text, '1');

-- ---- Ticket number reuse inside one branch ---------------------------------------
select tests.assert_equals('AT-02 the seeded reuse exists: ticket 7 once collected, once preparing, same branch',
  (select string_agg(status::text, ',' order by created_at) from public.orders where ticket_number = '7'),
  'collected,preparing');

-- Finish the current ticket-7 order, then hand out ticket 7 a third time.
select tests.assert_equals('AT-02 the current ticket-7 order can be readied',
  (select status::text from public.transition_order('30000000-0000-4000-8000-000000000003', 2, 'ready')), 'ready');
select tests.assert_equals('AT-02 ...and collected',
  (select status::text from public.transition_order('30000000-0000-4000-8000-000000000003', 3, 'collected')), 'collected');
select (public.create_manual_order('20000000-0000-4000-8000-000000000001', '7')).id as reused_order \gset

select tests.assert_equals('AT-02 reusing ticket 7 after collection creates a separate new order',
  (select status::text || '/' || version from public.orders where id = :'reused_order'), 'new/1');
select tests.assert_equals('AT-02 the branch now holds three distinct ticket-7 orders',
  tests.count_rows($$ select distinct id from public.orders where ticket_number = '7' $$)::text, '3');
select tests.assert_equals('AT-02 the earlier ticket-7 orders are untouched by the reuse',
  (select string_agg(status::text || '/' || version, ',' order by created_at)
     from public.orders where ticket_number = '7' and id <> :'reused_order'),
  'collected/4,collected/4');

select tests.logout();
rollback;
