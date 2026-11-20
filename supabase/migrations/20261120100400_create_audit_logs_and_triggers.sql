-- =============================================================================
-- Purpose:      Create the append-only `audit_logs` table and attach the audit
--               trigger to every tenant table created so far.
-- Serves:       FR-14 (audit history) · blueprint §5, §8.1, §14.1 ("sensitive actions
--               require explicit permission and audit")
-- Depends on:   20261120100100, 20261120100200 (the tables being audited)
-- Not included: policies (later migration); audit of business events such as
--               order status changes (added with the orders module).
-- Rollback:     forward-only; undo by writing a new migration.
-- =============================================================================

create table public.audit_logs (
  id             uuid        not null default gen_random_uuid(),
  restaurant_id  uuid        not null,
  branch_id      uuid,
  actor_user_id  uuid,
  action         text        not null,
  entity_table   text        not null,
  entity_id      uuid,
  details        jsonb       not null default '{}'::jsonb,
  occurred_at    timestamptz not null default now(),

  constraint audit_logs_pkey primary key (id),
  constraint audit_logs_action_valid check (action in ('INSERT', 'UPDATE', 'DELETE')),
  constraint audit_logs_details_is_object check (jsonb_typeof(details) = 'object')
);

comment on table  public.audit_logs is 'Append-only record of changes to tenant data (FR-14). Rows are never updated or deleted.';
comment on column public.audit_logs.restaurant_id is
  'Tenant the change belongs to. Intentionally NO foreign key: audit rows must be able to outlive the tenant record (retention is an open decision, blueprint §8.5).';
comment on column public.audit_logs.actor_user_id is 'auth.uid() of the person who made the change; NULL for system or service-role changes.';
comment on column public.audit_logs.details is
  'Minimal context only: for UPDATE the list of changed column names. Never row contents, to avoid copying personal data (blueprint §14.2).';

-- Read pattern: "show this restaurant's history, newest first".
create index audit_logs_restaurant_occurred_idx
  on public.audit_logs (restaurant_id, occurred_at desc);

alter table public.audit_logs enable row level security;

-- ---------------------------------------------------------------------------
-- Append-only guard: refuse UPDATE and DELETE, whoever is asking.
-- SECURITY: this also stops service-role code from quietly rewriting history.
-- (A database superuser can still disable triggers; that is out of scope here.)
-- ---------------------------------------------------------------------------
create function private.prevent_audit_log_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'audit_logs is append-only'
    using errcode = '42501';  -- insufficient_privilege
end;
$$;

create trigger audit_logs_prevent_update_delete
  before update or delete on public.audit_logs
  for each row execute function private.prevent_audit_log_mutation();

-- ---------------------------------------------------------------------------
-- Generic audit trigger: one function, attached to each audited table.
-- It works out which restaurant/branch/entity the row belongs to from the
-- row itself, so it needs no per-table configuration.
-- ---------------------------------------------------------------------------
create function private.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row            jsonb;
  v_restaurant_id  uuid;
  v_branch_id      uuid;
  v_entity_id      uuid;
  v_details        jsonb := '{}'::jsonb;
begin
  v_row := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;

  -- restaurants rows ARE the tenant; every other audited table carries restaurant_id.
  v_restaurant_id := case tg_table_name
    when 'restaurants' then (v_row ->> 'id')::uuid
    else (v_row ->> 'restaurant_id')::uuid
  end;

  -- branches rows ARE the branch; others may carry branch_id (NULL = restaurant-wide).
  v_branch_id := case tg_table_name
    when 'branches' then (v_row ->> 'id')::uuid
    else (v_row ->> 'branch_id')::uuid
  end;

  -- branch_settings is keyed by branch_id rather than id.
  v_entity_id := coalesce((v_row ->> 'id')::uuid, (v_row ->> 'branch_id')::uuid);

  if tg_op = 'UPDATE' then
    -- Record WHICH columns changed, never their values (privacy, blueprint §14.2).
    select coalesce(jsonb_build_object('changed_columns', jsonb_agg(n.key order by n.key)), '{}'::jsonb)
      into v_details
      from jsonb_each(to_jsonb(new)) as n
      join jsonb_each(to_jsonb(old)) as o using (key)
     where n.value is distinct from o.value
       and n.key <> 'updated_at';
  end if;

  insert into public.audit_logs
    (restaurant_id, branch_id, actor_user_id, action, entity_table, entity_id, details)
  values
    (v_restaurant_id, v_branch_id, (select auth.uid()), tg_op, tg_table_name, v_entity_id, v_details);

  return null;  -- AFTER trigger: return value is ignored
end;
$$;

comment on function private.audit_row_change() is
  'AFTER INSERT/UPDATE/DELETE row trigger: writes one audit_logs row (who, what, where; no row contents).';

-- Attach to every tenant table created so far. New tenant tables must do the same
-- in the migration that creates them (checked in docs/code-style.md reviewer list).
create trigger restaurants_audit
  after insert or update or delete on public.restaurants
  for each row execute function private.audit_row_change();

create trigger branches_audit
  after insert or update or delete on public.branches
  for each row execute function private.audit_row_change();

create trigger branch_settings_audit
  after update on public.branch_settings   -- inserts/deletes follow the branch, already audited
  for each row execute function private.audit_row_change();

create trigger memberships_audit
  after insert or update or delete on public.memberships
  for each row execute function private.audit_row_change();
