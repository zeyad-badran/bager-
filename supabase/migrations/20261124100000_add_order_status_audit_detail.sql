-- =============================================================================
-- Purpose:      Order status changes record FROM/TO status and the version before
--               and after in their (single) audit row.
-- Serves:       FR-14 (audit history), FR-10 · blueprint §5.1 ("audited"), slice 02b
-- Depends on:   20261123100000 (orders, trigger orders_audit), 20261120100400 (audit_logs)
-- Not included: any change to private.audit_row_change() or to the audit triggers of the
--               tenancy tables: their audit rows keep exactly their previous shape.
-- Rollback:     forward-only; undo by writing a new migration.
-- =============================================================================

-- DESIGN (least invasive, slice 02b delivery record):
--   The orders table gets its OWN audit trigger function. It writes the same row the generic
--   function wrote (same tenant, entity, actor and changed_columns logic) and, when the
--   status changed, adds four keys read straight from OLD and NEW:
--     from_status, to_status, version_from, version_to
--   Why not change the generic function: every tenancy table would run new code, the thing
--   the spec forbids. Why not a transaction-local setting set by transition_order(): it couples
--   the function to the trigger, and an update that does not go through the function would
--   be audited without the details. Reading OLD/NEW needs neither.
--   Still exactly ONE audit row per transition: the old trigger is replaced, not joined.
--   Privacy: statuses and version numbers are not personal data (blueprint §14.2), so recording
--   their values is allowed, unlike the other columns, which stay names-only.

create function private.audit_order_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row      public.orders;
  v_details  jsonb := '{}'::jsonb;
begin
  v_row := case when tg_op = 'DELETE' then old else new end;

  if tg_op = 'UPDATE' then
    -- Same as private.audit_row_change(): WHICH columns changed, never their values.
    select coalesce(jsonb_build_object('changed_columns', jsonb_agg(n.key order by n.key)), '{}'::jsonb)
      into v_details
      from jsonb_each(to_jsonb(new)) as n
      join jsonb_each(to_jsonb(old)) as o using (key)
     where n.value is distinct from o.value
       and n.key <> 'updated_at';

    -- FR-14: who moved the order from what to what (actor_user_id below is the "who").
    if new.status is distinct from old.status then
      v_details := v_details || jsonb_build_object(
        'from_status',  old.status,
        'to_status',    new.status,
        'version_from', old.version,
        'version_to',   new.version
      );
    end if;
  end if;

  insert into public.audit_logs
    (restaurant_id, branch_id, actor_user_id, action, entity_table, entity_id, details)
  values
    (v_row.restaurant_id, v_row.branch_id, (select auth.uid()), tg_op, tg_table_name, v_row.id, v_details);

  return null;  -- AFTER trigger: return value is ignored
end;
$$;

comment on function private.audit_order_change() is
  'AFTER INSERT/UPDATE/DELETE trigger on orders only: one audit row; status changes add from_status, to_status, version_from, version_to.';

revoke all on function private.audit_order_change() from public;

-- Swap the orders trigger to the orders-only function (same name, same events).
drop trigger orders_audit on public.orders;

create trigger orders_audit
  after insert or update or delete on public.orders
  for each row execute function private.audit_order_change();
