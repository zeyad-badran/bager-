-- =============================================================================
-- Purpose:      Create `profiles` (one per signed-in staff user) and
--               `memberships` (who has which role in which restaurant/branch).
-- Serves:       FR-03 (staff identity and roles), AT-02, AT-11 · blueprint §8.1, §11.2
-- Depends on:   20261120100000 (staff_role), 20261120100100 (restaurants, branches)
--               and Supabase's `auth.users` table.
-- Not included: policies, and the trigger that creates a profile on sign-up
--               (both arrive in later migrations). RLS is enabled here = deny all.
-- Rollback:     forward-only; undo by writing a new migration.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- profiles: app-level data for an auth user. Deliberately minimal (blueprint §14.2).
-- ---------------------------------------------------------------------------
create table public.profiles (
  id                uuid        not null,
  display_name      text,
  preferred_locale  text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint profiles_pkey primary key (id),
  constraint profiles_user_fkey
    foreign key (id) references auth.users (id) on delete cascade,
  constraint profiles_display_name_length
    check (display_name is null or char_length(btrim(display_name)) between 1 and 120),
  constraint profiles_preferred_locale_format
    check (preferred_locale is null or preferred_locale ~ '^[a-z]{2}(-[A-Z]{2})?$')
);

comment on table  public.profiles is 'One row per staff user (same id as auth.users). Customers have no profile (blueprint §2.4).';
comment on column public.profiles.display_name is 'Name shown to colleagues. Optional; no other personal data is stored here.';

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- memberships: a user's role inside a restaurant.
--   branch_id IS NULL     -> the role applies to every branch of the restaurant
--   branch_id IS NOT NULL -> the role applies to that one branch only
-- ---------------------------------------------------------------------------
create table public.memberships (
  id             uuid              not null default gen_random_uuid(),
  restaurant_id  uuid              not null,
  branch_id      uuid,
  user_id        uuid              not null,
  role           public.staff_role not null,
  created_at     timestamptz       not null default now(),

  constraint memberships_pkey primary key (id),
  constraint memberships_restaurant_fkey
    foreign key (restaurant_id) references public.restaurants (id) on delete cascade,
  constraint memberships_user_fkey
    foreign key (user_id) references auth.users (id) on delete cascade,
  -- Composite FK: when branch_id is set it must be a branch OF THIS restaurant.
  -- (When branch_id is null the check is skipped, which is what we want.)
  constraint memberships_branch_fkey
    foreign key (branch_id, restaurant_id)
    references public.branches (id, restaurant_id) on delete cascade,
  -- Owners always act on the whole restaurant (blueprint §11.2: "all restaurant settings").
  constraint memberships_owner_is_restaurant_wide
    check (role <> 'owner' or branch_id is null)
);

comment on table  public.memberships is 'Who holds which role where. Authorization is checked by RLS helper functions, never by the client (FR-03).';
comment on column public.memberships.branch_id is 'NULL = whole restaurant; otherwise the single branch this role is limited to.';

-- A user can hold at most one role per scope. Two partial unique indexes
-- because UNIQUE treats NULL branch_id values as distinct from each other.
create unique index memberships_restaurant_wide_unique
  on public.memberships (restaurant_id, user_id)
  where branch_id is null;

create unique index memberships_branch_scoped_unique
  on public.memberships (restaurant_id, user_id, branch_id)
  where branch_id is not null;

-- Lookups used by every RLS check: "what memberships does this user have?"
create index memberships_user_id_idx on public.memberships (user_id);
create index memberships_restaurant_id_idx on public.memberships (restaurant_id);

-- ---------------------------------------------------------------------------
-- Row Level Security: enabled now, policies come later (deny all until then).
-- ---------------------------------------------------------------------------
alter table public.profiles    enable row level security;
alter table public.memberships enable row level security;
