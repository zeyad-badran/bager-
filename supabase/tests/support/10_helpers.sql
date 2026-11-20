-- =============================================================================
-- Tiny test toolkit for the SQL tests in supabase/tests/. Loaded by
-- scripts/test-db.sh before the tests run. Lives in its own `tests` schema so
-- it never mixes with application objects, and is never part of a migration.
--
-- Every helper runs with the privileges of the CURRENT role. After
-- tests.login_as(...) that is `authenticated`, so row level security applies
-- exactly as it would for a real signed-in user.
-- =============================================================================

create schema if not exists tests;
grant usage on schema tests to anon, authenticated, service_role;

-- Act as a signed-in user. The id goes into the same JWT claim that auth.uid()
-- reads in production. `set local` ends with the surrounding transaction.
create or replace function tests.login_as(p_user_id uuid)
returns void
language plpgsql
as $$
begin
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', p_user_id, 'role', 'authenticated')::text,
    true
  );
  execute 'set local role authenticated';
end;
$$;

-- Act as a visitor who is not signed in.
create or replace function tests.login_as_anon()
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims', '', true);
  execute 'set local role anon';
end;
$$;

-- Back to the database owner (the role that ran the migrations).
create or replace function tests.logout()
returns void
language plpgsql
as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end;
$$;

-- How many rows would this query return for the current role?
create or replace function tests.count_rows(p_sql text)
returns bigint
language plpgsql
as $$
declare
  v_count bigint;
begin
  execute 'select count(*) from (' || p_sql || ') as q' into v_count;
  return v_count;
end;
$$;

-- How many rows did this INSERT/UPDATE/DELETE actually change for the current role?
-- RLS filters rows silently on UPDATE/DELETE, so "0 rows" is how a block shows up.
create or replace function tests.rows_affected(p_sql text)
returns bigint
language plpgsql
as $$
declare
  v_count bigint;
begin
  execute p_sql;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Compare two values as text; stop the test run on a mismatch.
create or replace function tests.assert_equals(p_label text, p_actual text, p_expected text)
returns void
language plpgsql
as $$
begin
  if p_actual is distinct from p_expected then
    raise exception 'FAIL: % (expected %, got %)', p_label, p_expected, p_actual;
  end if;
  raise notice 'PASS: %', p_label;
end;
$$;

-- The statement must fail with exactly this SQLSTATE
-- (42501 = insufficient privilege / RLS violation, 23514 = check violation, ...).
create or replace function tests.assert_raises(p_label text, p_sql text, p_sqlstate text)
returns void
language plpgsql
as $$
begin
  execute p_sql;
  raise exception 'FAIL: % (expected error %, but the statement succeeded)', p_label, p_sqlstate
    using errcode = 'P0001';
exception
  when others then
    if sqlstate = p_sqlstate then
      raise notice 'PASS: %', p_label;
    elsif sqlstate = 'P0001' and sqlerrm like 'FAIL: %' then
      raise;  -- our own "it succeeded" failure above
    else
      raise exception 'FAIL: % (expected error %, got % - %)', p_label, p_sqlstate, sqlstate, sqlerrm;
    end if;
end;
$$;
