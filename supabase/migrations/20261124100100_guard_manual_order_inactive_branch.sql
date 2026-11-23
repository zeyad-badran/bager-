-- =============================================================================
-- Purpose:      create_manual_order() refuses new orders in an inactive branch
--               (branches.is_active = false), with SQLSTATE PT422 'branch is inactive'.
-- Serves:       FR-06 (manual order entry), FR-02 (branches.is_active comment: "accept no new
--               queue activity") · slice 02b
-- Depends on:   20261123100300 (create_manual_order), 20261120100100 (branches.is_active)
-- Not included: transition_order() is NOT changed: orders that already exist in a branch that
--               becomes inactive can still move forward (and be cancelled), so none gets stuck.
-- Rollback:     forward-only; undo by writing a new migration.
-- =============================================================================

-- Same signature and return type, so CREATE OR REPLACE keeps the function's owner and its
-- grants (authenticated only). Only the inactive-branch check is new; everything else is
-- identical to 20261123100300.
--
-- ORDER OF CHECKS (SECURITY): membership first, activity second. A caller who is not staff of
-- the branch still gets 42501, exactly as before, so they cannot learn whether a branch they do
-- not belong to is active (AT-11). Only the branch's own staff see PT422.
-- PT422 is shared with "illegal transition"; the service tells them apart by operation
-- (create -> BRANCH_INACTIVE, transition -> INVALID_TRANSITION).
create or replace function public.create_manual_order(p_branch_id uuid, p_ticket_number text)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id        uuid := (select auth.uid());
  v_restaurant_id  uuid;
  v_is_active      boolean;
  v_order          public.orders;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_branch_id is null or p_ticket_number is null then
    raise exception 'branch id and ticket number are required' using errcode = '22023';
  end if;

  -- SECURITY: the restaurant is taken from the branch row, never from the caller.
  select b.restaurant_id, b.is_active into v_restaurant_id, v_is_active
    from public.branches b
   where b.id = p_branch_id;

  if v_restaurant_id is null
     or not private.has_branch_role(v_restaurant_id, p_branch_id,
                                    array['owner', 'manager', 'cashier', 'kitchen']::public.staff_role[]) then
    raise exception 'branch not found or not permitted' using errcode = '42501';
  end if;

  if not v_is_active then
    raise exception 'branch is inactive' using errcode = 'PT422';
  end if;

  -- The trimmed ticket number is checked by orders_ticket_number_length (23514).
  insert into public.orders (restaurant_id, branch_id, ticket_number, source)
  values (v_restaurant_id, p_branch_id, btrim(p_ticket_number), 'manual')
  returning * into v_order;

  return v_order;
end;
$$;

comment on function public.create_manual_order(uuid, text) is
  'FR-06: creates a manual order (status new, version 1) in an ACTIVE branch where the caller is staff (not auditor). Errors: 42501, PT422 (branch is inactive), 22023, 23514.';
