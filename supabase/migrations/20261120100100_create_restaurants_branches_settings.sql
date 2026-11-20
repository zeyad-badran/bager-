-- =============================================================================
-- Purpose:      Create the tenant boundary: `restaurants`, `branches`,
--               `branch_settings`.
-- Serves:       FR-01 (multi-tenant restaurants), FR-02 (branch management),
--               AT-02, AT-11 · blueprint §8.1, §8.2, §8.3
-- Depends on:   20261120100000 (private schema, set_updated_at)
-- Not included: memberships and policies. RLS is ENABLED here with no policy,
--               which means "deny everything" until the policy migration.
-- Rollback:     forward-only; undo by writing a new migration.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- restaurants: one row per tenant (a restaurant business).
-- ---------------------------------------------------------------------------
create table public.restaurants (
  id          uuid        not null default gen_random_uuid(),
  name        text        not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint restaurants_pkey primary key (id),
  constraint restaurants_name_length check (char_length(btrim(name)) between 1 and 120)
);

comment on table  public.restaurants is 'Tenant: a restaurant business. Every tenant-owned row points here (blueprint §8.3).';
comment on column public.restaurants.name is 'Business display name, 1-120 characters.';

create trigger restaurants_set_updated_at
  before update on public.restaurants
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- branches: a physical location of a restaurant.
-- ---------------------------------------------------------------------------
create table public.branches (
  id             uuid        not null default gen_random_uuid(),
  restaurant_id  uuid        not null,
  name           text        not null,
  display_name   text,
  time_zone      text        not null default 'UTC',
  locale         text        not null default 'en',
  is_active      boolean     not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint branches_pkey primary key (id),
  constraint branches_restaurant_fkey
    foreign key (restaurant_id) references public.restaurants (id) on delete cascade,
  -- Lets other tables prove "this branch belongs to this restaurant" with a
  -- composite foreign key (restaurant_id, branch_id). Prevents cross-tenant links.
  constraint branches_id_restaurant_unique unique (id, restaurant_id),
  constraint branches_name_length check (char_length(btrim(name)) between 1 and 120),
  constraint branches_display_name_length
    check (display_name is null or char_length(btrim(display_name)) between 1 and 120),
  constraint branches_locale_format check (locale ~ '^[a-z]{2}(-[A-Z]{2})?$')
);

comment on table  public.branches is 'A physical restaurant location. Belongs to exactly one restaurant (blueprint §2.2, FR-02).';
comment on column public.branches.display_name is 'Customer-facing name. Falls back to `name` when null.';
comment on column public.branches.time_zone is 'IANA time zone name (for example Asia/Amman). Timestamps are stored in UTC and rendered in this zone (blueprint §8.2).';
comment on column public.branches.locale is 'Default customer-facing locale, for example en or ar (blueprint FR-18).';
comment on column public.branches.is_active is 'Inactive branches stay in history but accept no new queue activity.';

create index branches_restaurant_id_idx on public.branches (restaurant_id);

create trigger branches_set_updated_at
  before update on public.branches
  for each row execute function private.set_updated_at();

-- Reject unknown IANA zone names early with a clear error. A CHECK constraint
-- cannot query pg_timezone_names, so a trigger does the validation.
create function private.assert_valid_time_zone()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.time_zone) then
    raise exception 'invalid time zone: %', new.time_zone
      using errcode = '22023';  -- invalid_parameter_value
  end if;
  return new;
end;
$$;

comment on function private.assert_valid_time_zone() is
  'BEFORE INSERT/UPDATE trigger on branches: time_zone must be a known IANA zone.';

create trigger branches_assert_valid_time_zone
  before insert or update of time_zone on public.branches
  for each row execute function private.assert_valid_time_zone();

-- ---------------------------------------------------------------------------
-- branch_settings: operating settings, one row per branch.
-- The row is created automatically when a branch is created (trigger below),
-- so API clients never insert it directly.
-- ---------------------------------------------------------------------------
create table public.branch_settings (
  branch_id           uuid        not null,
  restaurant_id       uuid        not null,
  operating_settings  jsonb       not null default '{}'::jsonb,
  updated_at          timestamptz not null default now(),

  constraint branch_settings_pkey primary key (branch_id),
  -- Composite FK: the stored restaurant_id must match the branch's restaurant.
  constraint branch_settings_branch_fkey
    foreign key (branch_id, restaurant_id)
    references public.branches (id, restaurant_id) on delete cascade,
  constraint branch_settings_is_object check (jsonb_typeof(operating_settings) = 'object')
);

comment on table  public.branch_settings is 'Per-branch operating settings. Created automatically with the branch.';
comment on column public.branch_settings.operating_settings is
  'Free-form operating settings (JSON object). TODO(FR-15): replace with typed columns as queue settings are specified.';
comment on column public.branch_settings.restaurant_id is
  'Copy of the branch''s restaurant, kept so RLS policies and indexes can filter by tenant without a join.';

create index branch_settings_restaurant_id_idx on public.branch_settings (restaurant_id);

create trigger branch_settings_set_updated_at
  before update on public.branch_settings
  for each row execute function private.set_updated_at();

create function private.create_default_branch_settings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.branch_settings (branch_id, restaurant_id)
  values (new.id, new.restaurant_id);
  return new;
end;
$$;

comment on function private.create_default_branch_settings() is
  'AFTER INSERT trigger on branches: creates the matching branch_settings row.';

create trigger branches_create_default_settings
  after insert on public.branches
  for each row execute function private.create_default_branch_settings();

-- ---------------------------------------------------------------------------
-- Row Level Security: enabled now, policies come later.
-- With RLS enabled and no policy, every non-owner role sees zero rows.
-- ---------------------------------------------------------------------------
alter table public.restaurants     enable row level security;
alter table public.branches        enable row level security;
alter table public.branch_settings enable row level security;
