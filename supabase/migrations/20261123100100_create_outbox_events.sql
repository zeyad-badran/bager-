-- =============================================================================
-- Purpose:      Create `outbox_events`: the transactional outbox that records
--               "this order became READY" in the same transaction as the status change.
-- Serves:       AT-05 (READY commits once and creates one notification event), FR-12 (READY
--               notifications, enqueue side only), AT-07 groundwork · blueprint §5.1
--               ("do not resend READY"), §7.4 (transactional outbox)
-- Depends on:   20261123100000 (orders)
-- Not included: any worker, dispatch, retry or delivery state. ADR-0004 (background
--               processing) is OPEN, so this table only holds pending events; the worker
--               slice adds statuses, indexes and its own access in a new migration.
--               No API access at all: RLS is enabled and no policy is ever granted to clients.
-- Rollback:     forward-only; undo by writing a new migration.
-- =============================================================================

create table public.outbox_events (
  id             uuid        not null default gen_random_uuid(),
  restaurant_id  uuid        not null,
  branch_id      uuid        not null,
  order_id       uuid        not null,
  event_type     text        not null,
  payload        jsonb       not null default '{}'::jsonb,
  status         text        not null default 'pending',
  available_at   timestamptz not null default now(),
  attempts       integer     not null default 0,
  created_at     timestamptz not null default now(),

  constraint outbox_events_pkey primary key (id),
  -- Composite FK: an event's tenant columns must be its order's (no cross-tenant events).
  constraint outbox_events_order_fkey
    foreign key (order_id, restaurant_id, branch_id)
    references public.orders (id, restaurant_id, branch_id) on delete cascade,
  -- IDEMPOTENT: at most one event of each type per order. For order.ready this is the
  -- database-level guarantee behind "do not resend READY" (blueprint §5.1, AT-05).
  constraint outbox_events_order_event_unique unique (order_id, event_type),

  constraint outbox_events_event_type_valid check (event_type in ('order.ready')),
  -- TODO(ADR-0004): the worker slice defines the remaining statuses (sent, failed, ...).
  constraint outbox_events_status_valid check (status in ('pending')),
  constraint outbox_events_payload_is_object check (jsonb_typeof(payload) = 'object'),
  constraint outbox_events_attempts_non_negative check (attempts >= 0)
);

comment on table  public.outbox_events is
  'Transactional outbox (blueprint §7.4): written in the same transaction as the business change; a worker (ADR-0004, not built) dispatches later.';
comment on column public.outbox_events.payload is
  'Identifiers only (order, restaurant, branch). Never customer data, tokens or push endpoints (blueprint §14.2).';
comment on column public.outbox_events.status is
  'Dispatch state. Only pending exists until the worker slice (ADR-0004).';
comment on column public.outbox_events.available_at is
  'Earliest UTC time a worker may pick the event up (for retry back-off later).';
comment on column public.outbox_events.attempts is 'Dispatch attempts so far. Maintained by the worker (ADR-0004).';

create index outbox_events_restaurant_id_idx on public.outbox_events (restaurant_id);

-- SECURITY: RLS on and no policy: API clients (anon, authenticated) can never see or
-- write events. Grants are revoked in 20261123100200.
alter table public.outbox_events enable row level security;
