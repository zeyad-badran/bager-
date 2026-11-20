-- =============================================================================
-- Purpose:      (1) `create_restaurant(name)`: the one safe way for a signed-in
--               user to start a new tenant and become its owner.
--               (2) Create a `profiles` row automatically when a user signs up.
-- Serves:       FR-01, FR-03 · blueprint §4.1 (restaurant onboarding), §8.1
-- Depends on:   20261120100200 (profiles, memberships), 20261120100500 (policies)
-- Not included: invitations for additional staff (later slice).
-- Rollback:     forward-only; undo by writing a new migration.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- create_restaurant: restaurants cannot be inserted directly (no policy allows
-- it), because a new tenant needs its first owner membership in the SAME step.
-- Doing both here, atomically, means a restaurant can never exist without an owner.
-- ---------------------------------------------------------------------------
create function public.create_restaurant(p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id        uuid := (select auth.uid());
  v_restaurant_id  uuid;
begin
  -- SECURITY: the caller must be signed in. auth.uid() is read from the
  -- verified JWT, never from an argument, so nobody can create a restaurant
  -- "on behalf of" another user.
  if v_user_id is null then
    raise exception 'authentication required'
      using errcode = '42501';  -- insufficient_privilege
  end if;

  insert into public.restaurants (name)
  values (p_name)
  returning id into v_restaurant_id;

  -- The creator becomes the restaurant-wide owner (branch_id stays NULL).
  insert into public.memberships (restaurant_id, user_id, role)
  values (v_restaurant_id, v_user_id, 'owner');

  return v_restaurant_id;
end;
$$;

comment on function public.create_restaurant(text) is
  'Creates a restaurant and makes the signed-in caller its owner, atomically. Callable by authenticated users only.';

revoke all on function public.create_restaurant(text) from public, anon;
grant execute on function public.create_restaurant(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Sign-up trigger: every new auth user gets a profile.
-- IMPORTANT: this runs inside the sign-up transaction, so it must never fail.
-- A failure here would stop the person from signing up at all. Hence the
-- truncation to the column's 120-character limit and ON CONFLICT DO NOTHING.
-- ---------------------------------------------------------------------------
create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    left(nullif(btrim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), ''), 120)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

comment on function private.handle_new_user() is
  'AFTER INSERT trigger on auth.users: creates the matching profile. Must never raise.';

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();
