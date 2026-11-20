-- =============================================================================
-- FR-01 / FR-03: starting a restaurant, and profiles created at sign-up.
-- Serves:  FR-01, FR-03, AT-02 · blueprint §4.1 (onboarding), §8.1
-- Setup:   supabase/seed.sql
-- =============================================================================
begin;

-- ---- Sign-up creates a profile, and sign-up can never fail because of it ---------
insert into auth.users (id, email, aud, role, raw_user_meta_data) values
  ('00000000-0000-4000-8000-000000000100', 'fresh@example.test',  'authenticated', 'authenticated', '{"display_name":"  Fresh User  "}'),
  ('00000000-0000-4000-8000-000000000101', 'long@example.test',   'authenticated', 'authenticated', jsonb_build_object('display_name', repeat('x', 300))),
  ('00000000-0000-4000-8000-000000000102', 'blank@example.test',  'authenticated', 'authenticated', '{"display_name":"   "}'),
  ('00000000-0000-4000-8000-000000000103', 'nometa@example.test', 'authenticated', 'authenticated', '{}');

select tests.assert_equals('FR-03 sign-up creates a profile with a trimmed display name',
  (select display_name from public.profiles where id = '00000000-0000-4000-8000-000000000100'), 'Fresh User');
select tests.assert_equals('FR-03 an over-long display name is cut to 120 characters instead of failing sign-up',
  (select char_length(display_name)::text from public.profiles where id = '00000000-0000-4000-8000-000000000101'), '120');
select tests.assert_equals('FR-03 a blank display name becomes empty (NULL)',
  (select coalesce(display_name, '<null>') from public.profiles where id = '00000000-0000-4000-8000-000000000102'), '<null>');
select tests.assert_equals('FR-03 sign-up without metadata still works',
  (select count(*)::text from public.profiles where id = '00000000-0000-4000-8000-000000000103'), '1');

-- ---- Starting a restaurant -----------------------------------------------------------
select tests.login_as('00000000-0000-4000-8000-000000000100');  -- fresh user

do $$
declare
  v_restaurant_id uuid;
begin
  v_restaurant_id := public.create_restaurant('  Fresh Falafel  ');

  perform tests.assert_equals('FR-01 create_restaurant returns the new restaurant id',
    (v_restaurant_id is not null)::text, 'true');
  perform tests.assert_equals('FR-01 the creator can see their new restaurant',
    tests.count_rows(format('select 1 from public.restaurants where id = %L', v_restaurant_id))::text, '1');
  perform tests.assert_equals('FR-03 the creator became a restaurant-wide owner',
    tests.count_rows(format($q$
      select 1 from public.memberships
       where restaurant_id = %L and role = 'owner' and branch_id is null
         and user_id = '00000000-0000-4000-8000-000000000100'
    $q$, v_restaurant_id))::text, '1');
  perform tests.assert_equals('FR-14 restaurant and owner membership creation were audited with the creator as actor',
    tests.count_rows(format($q$
      select 1 from public.audit_logs
       where restaurant_id = %L and action = 'INSERT'
         and entity_table in ('restaurants', 'memberships')
         and actor_user_id = '00000000-0000-4000-8000-000000000100'
    $q$, v_restaurant_id))::text, '2');
end;
$$;

select tests.assert_raises('FR-01 a blank restaurant name is rejected',
  $$ select public.create_restaurant('   ') $$, '23514');
select tests.assert_raises('FR-01 restaurants cannot be inserted directly (only through create_restaurant)',
  $$ insert into public.restaurants (name) values ('Direct Insert') $$, '42501');

-- ---- The new tenant is invisible to everyone else -------------------------------------
select tests.login_as('00000000-0000-4000-8000-000000000001');  -- alpha_owner
select tests.assert_equals('AT-02 another restaurant''s owner cannot see the new tenant',
  tests.count_rows($$ select 1 from public.restaurants where name = 'Fresh Falafel' $$)::text, '0');

select tests.logout();
rollback;
