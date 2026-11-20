-- =============================================================================
-- Minimal imitation of the parts of Supabase our migrations depend on.
--
-- !!  ONLY for plain PostgreSQL (CI service container, local scratch database).
-- !!  NEVER run this against a real Supabase project: it would clash with the
-- !!  real `auth` schema. scripts/test-db.sh loads it only in DB_MODE=plain.
--
-- What it provides (all of these already exist in a real Supabase database):
--   * roles anon, authenticated, service_role
--   * auth.users (only the columns our migrations and seed use) and auth.uid()
--   * Supabase's default privileges, so that our explicit REVOKEs are really tested
-- =============================================================================

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon')          then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role')  then create role service_role nologin bypassrls; end if;
end
$$;

create schema if not exists auth;

create table if not exists auth.users (
  id                 uuid primary key,
  email              text,
  aud                text,
  role               text,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- Same logic as Supabase's auth.uid(): the user id comes from the JWT claims
-- that PostgREST sets on each request.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

grant usage on schema public, auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;

-- Supabase grants new public tables/functions to the API roles by default.
-- Reproducing that here proves our migrations revoke what they must.
alter default privileges in schema public grant all on tables    to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
