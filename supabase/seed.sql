-- =============================================================================
-- SYNTHETIC seed data for LOCAL development and tests. Never for staging or
-- production, and contains no real people or credentials.
--
-- Two unrelated restaurants, two branches each, one user per role, plus a
-- user with no membership. Fixed ids make test failures easy to read: the last
-- digits identify the thing.
--
--   users        00000000-0000-4000-8000-0000000000NN
--                01 alpha_owner      02 alpha_manager   03 alpha_cashier (Downtown only)
--                04 alpha_kitchen (Downtown only)        05 alpha_auditor
--                11 beta_owner       12 beta_manager     13 beta_cashier  (Mall only)
--                14 beta_kitchen (Mall only)             15 beta_auditor
--                99 stranger (no membership anywhere)
--   restaurants  10000000-0000-4000-8000-00000000000N    01 Alpha Burgers   02 Beta Cafe
--   branches     20000000-0000-4000-8000-0000000000NN    01 Alpha Downtown  02 Alpha Airport
--                                                        11 Beta Mall       12 Beta Old Town
--
-- Serves: FR-01, FR-02, FR-03, AT-02, AT-11 (test fixtures)
-- Inserts run as the database owner, so RLS does not apply to the seed itself.
-- =============================================================================

-- Users. The sign-up trigger creates each profile automatically.
insert into auth.users (id, email, aud, role, raw_user_meta_data) values
  ('00000000-0000-4000-8000-000000000001', 'alpha.owner@example.test',    'authenticated', 'authenticated', '{"display_name":"Alpha Owner"}'),
  ('00000000-0000-4000-8000-000000000002', 'alpha.manager@example.test',  'authenticated', 'authenticated', '{"display_name":"Alpha Manager"}'),
  ('00000000-0000-4000-8000-000000000003', 'alpha.cashier@example.test',  'authenticated', 'authenticated', '{"display_name":"Alpha Cashier"}'),
  ('00000000-0000-4000-8000-000000000004', 'alpha.kitchen@example.test',  'authenticated', 'authenticated', '{"display_name":"Alpha Kitchen"}'),
  ('00000000-0000-4000-8000-000000000005', 'alpha.auditor@example.test',  'authenticated', 'authenticated', '{"display_name":"Alpha Auditor"}'),
  ('00000000-0000-4000-8000-000000000011', 'beta.owner@example.test',     'authenticated', 'authenticated', '{"display_name":"Beta Owner"}'),
  ('00000000-0000-4000-8000-000000000012', 'beta.manager@example.test',   'authenticated', 'authenticated', '{"display_name":"Beta Manager"}'),
  ('00000000-0000-4000-8000-000000000013', 'beta.cashier@example.test',   'authenticated', 'authenticated', '{"display_name":"Beta Cashier"}'),
  ('00000000-0000-4000-8000-000000000014', 'beta.kitchen@example.test',   'authenticated', 'authenticated', '{"display_name":"Beta Kitchen"}'),
  ('00000000-0000-4000-8000-000000000015', 'beta.auditor@example.test',   'authenticated', 'authenticated', '{"display_name":"Beta Auditor"}'),
  ('00000000-0000-4000-8000-000000000099', 'stranger@example.test',       'authenticated', 'authenticated', '{"display_name":"Stranger"}')
on conflict (id) do nothing;

-- Restaurants.
insert into public.restaurants (id, name) values
  ('10000000-0000-4000-8000-000000000001', 'Alpha Burgers'),
  ('10000000-0000-4000-8000-000000000002', 'Beta Cafe')
on conflict (id) do nothing;

-- Branches (branch_settings rows are created automatically by a trigger).
insert into public.branches (id, restaurant_id, name, time_zone, locale) values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Alpha Downtown', 'Asia/Amman',    'ar'),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'Alpha Airport',  'Asia/Amman',    'en'),
  ('20000000-0000-4000-8000-000000000011', '10000000-0000-4000-8000-000000000002', 'Beta Mall',      'Europe/London', 'en'),
  ('20000000-0000-4000-8000-000000000012', '10000000-0000-4000-8000-000000000002', 'Beta Old Town',  'Europe/London', 'en')
on conflict (id) do nothing;

-- Memberships. branch_id NULL = whole restaurant; otherwise that one branch.
insert into public.memberships (restaurant_id, branch_id, user_id, role) values
  ('10000000-0000-4000-8000-000000000001', null,                                   '00000000-0000-4000-8000-000000000001', 'owner'),
  ('10000000-0000-4000-8000-000000000001', null,                                   '00000000-0000-4000-8000-000000000002', 'manager'),
  ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000003', 'cashier'),
  ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000004', 'kitchen'),
  ('10000000-0000-4000-8000-000000000001', null,                                   '00000000-0000-4000-8000-000000000005', 'auditor'),
  ('10000000-0000-4000-8000-000000000002', null,                                   '00000000-0000-4000-8000-000000000011', 'owner'),
  ('10000000-0000-4000-8000-000000000002', null,                                   '00000000-0000-4000-8000-000000000012', 'manager'),
  ('10000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000013', 'cashier'),
  ('10000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000014', 'kitchen'),
  ('10000000-0000-4000-8000-000000000002', null,                                   '00000000-0000-4000-8000-000000000015', 'auditor')
on conflict do nothing;
