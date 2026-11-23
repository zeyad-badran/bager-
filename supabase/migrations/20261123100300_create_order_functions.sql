-- =============================================================================
-- Purpose:      The only write paths for orders: `create_manual_order()` and
--               `transition_order()`, plus the allowed-transition table they use.
-- Serves:       FR-06 (manual order entry), FR-10 (status lifecycle), FR-14 (audit),
--               AT-05 (READY enqueues one outbox event), AT-06 (role rule), AT-09
--               (optimistic concurrency), AT-11 · blueprint §5.1, §7.4, §11.2
-- Depends on:   20261123100000 (orders), 20261123100100 (outbox_events),
--               20261120100300 (private.has_branch_role)
-- Not included: dispatching the outbox (ADR-0004 Open), POS ingest (FR-05), customer
--               access (ADR-0006 Open), reopen/correction paths (blueprint §5.1 "none by default").
-- Rollback:     forward-only; undo by writing a new migration.
-- =============================================================================

-- ERROR CODES (stable; apps/web/src/modules/orders/order-service.ts maps them):
--   42501  not allowed: not signed in, no staff role for the branch, OR the order/branch
--          does not exist. SECURITY: "missing" and "forbidden" look identical, so a guessed
--          UUID reveals nothing (AT-11).
--   PT409  version conflict: the order changed since the caller read it (AT-09).
--          (PostgREST turns SQLSTATE PTxyz into HTTP status xyz, so this arrives as 409.)
--   PT422  illegal transition for the current status (blueprint §5.1). HTTP 422.
--   22023  invalid input: a required argument is NULL.
--   23514  ticket number fails the orders check constraint (blank or longer than 20).
--
-- ROLE RULE (product owner, 2026-11-21): every staff role, meaning owner, manager, cashier and
-- kitchen, may perform every VALID transition, including cancel. The auditor is read-only.
-- Branch-scoped staff act on their own branch only. Blueprint §11.2 is still a proposal;
-- changing this is a new migration.

-- ---------------------------------------------------------------------------
-- Allowed transitions, blueprint §5.1. Mirrored in transitions.ts and checked by
-- supabase/verify/20261123100300_create_order_functions.sql over every pair.
-- ---------------------------------------------------------------------------
create function private.is_order_transition_allowed(
  p_from public.order_status,
  p_to   public.order_status
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select (p_from, p_to) in (
    ('new'::public.order_status,       'preparing'::public.order_status),
    ('new'::public.order_status,       'cancelled'::public.order_status),
    ('preparing'::public.order_status, 'ready'::public.order_status),
    ('preparing'::public.order_status, 'cancelled'::public.order_status),
    ('ready'::public.order_status,     'collected'::public.order_status)
  );
$$;

comment on function private.is_order_transition_allowed(public.order_status, public.order_status) is
  'Blueprint §5.1 transition table. collected and cancelled are terminal (no outgoing move).';

revoke all on function private.is_order_transition_allowed(public.order_status, public.order_status) from public;

-- ---------------------------------------------------------------------------
-- create_manual_order: staff type in a ticket number (FR-06). The order starts as `new`.
-- ---------------------------------------------------------------------------
create function public.create_manual_order(p_branch_id uuid, p_ticket_number text)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id        uuid := (select auth.uid());
  v_restaurant_id  uuid;
  v_order          public.orders;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_branch_id is null or p_ticket_number is null then
    raise exception 'branch id and ticket number are required' using errcode = '22023';
  end if;

  -- SECURITY: the restaurant is taken from the branch row, never from the caller.
  select b.restaurant_id into v_restaurant_id
    from public.branches b
   where b.id = p_branch_id;

  if v_restaurant_id is null
     or not private.has_branch_role(v_restaurant_id, p_branch_id,
                                    array['owner', 'manager', 'cashier', 'kitchen']::public.staff_role[]) then
    raise exception 'branch not found or not permitted' using errcode = '42501';
  end if;

  -- The trimmed ticket number is checked by orders_ticket_number_length (23514).
  insert into public.orders (restaurant_id, branch_id, ticket_number, source)
  values (v_restaurant_id, p_branch_id, btrim(p_ticket_number), 'manual')
  returning * into v_order;

  return v_order;
end;
$$;

comment on function public.create_manual_order(uuid, text) is
  'FR-06: creates a manual order (status new, version 1) in a branch where the caller is staff (not auditor). Errors: 42501, 22023, 23514.';

-- ---------------------------------------------------------------------------
-- transition_order: the one way to change an order's status (blueprint §5.1).
-- In ONE transaction: permission check, row lock, version check, transition check,
-- update (bumps version; the audit trigger writes the audit row), and for READY the
-- outbox event (blueprint §7.4). Any error rolls all of it back.
-- ---------------------------------------------------------------------------
create function public.transition_order(
  p_order_id         uuid,
  p_expected_version integer,
  p_to_status        public.order_status
)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id  uuid := (select auth.uid());
  v_order    public.orders;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_order_id is null or p_expected_version is null or p_to_status is null then
    raise exception 'order id, expected version and target status are required' using errcode = '22023';
  end if;

  -- SECURITY + CONCURRENCY: the role check is part of the WHERE clause, so a caller
  -- without permission never locks, and never learns anything about, the row.
  -- FOR UPDATE makes a concurrent caller WAIT here; after the first commits, READ COMMITTED
  -- re-reads the row, so the second caller sees the new version and gets PT409 below (AT-09).
  select o.* into v_order
    from public.orders o
   where o.id = p_order_id
     and private.has_branch_role(o.restaurant_id, o.branch_id,
                                 array['owner', 'manager', 'cashier', 'kitchen']::public.staff_role[])
     for update;

  if not found then
    raise exception 'order not found or not permitted' using errcode = '42501';
  end if;

  -- CONCURRENCY: optimistic version check. Checked before the transition rule so a caller
  -- with an outdated screen is told to refresh, whatever button they pressed.
  if v_order.version <> p_expected_version then
    raise exception 'order changed since it was read'
      using errcode = 'PT409',
            detail  = format('current status %s, current version %s', v_order.status, v_order.version);
  end if;

  if not private.is_order_transition_allowed(v_order.status, p_to_status) then
    raise exception 'transition % -> % is not allowed', v_order.status, p_to_status
      using errcode = 'PT422';
  end if;

  update public.orders o
     set status    = p_to_status,
         version   = o.version + 1,
         ready_at  = case when p_to_status = 'ready' then now() else o.ready_at end,
         closed_at = case when p_to_status in ('collected', 'cancelled') then now() else o.closed_at end
   where o.id = p_order_id
  returning o.* into v_order;

  -- IDEMPOTENT: READY is reachable only from preparing, so this runs at most once per order;
  -- outbox_events_order_event_unique enforces it again at the table level (AT-05).
  -- Payload carries ids only (blueprint §14.2).
  if p_to_status = 'ready' then
    insert into public.outbox_events (restaurant_id, branch_id, order_id, event_type, payload)
    values (v_order.restaurant_id, v_order.branch_id, v_order.id, 'order.ready',
            jsonb_build_object('order_id', v_order.id,
                               'restaurant_id', v_order.restaurant_id,
                               'branch_id', v_order.branch_id));
  end if;

  return v_order;
end;
$$;

comment on function public.transition_order(uuid, integer, public.order_status) is
  'FR-10: moves an order along blueprint §5.1 with a version check; READY also enqueues one order.ready outbox event. Errors: 42501, PT409, PT422, 22023.';

-- Signed-in staff only. Supabase grants new functions to anon by default: revoke first.
revoke all on function public.create_manual_order(uuid, text)                          from public, anon;
revoke all on function public.transition_order(uuid, integer, public.order_status)     from public, anon;
grant execute on function public.create_manual_order(uuid, text)                       to authenticated;
grant execute on function public.transition_order(uuid, integer, public.order_status)  to authenticated;
