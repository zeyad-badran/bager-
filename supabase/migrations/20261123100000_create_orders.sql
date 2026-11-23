-- =============================================================================
-- Purpose:      Create the `orders` table and its two enums (`order_status`,
--               `order_source`): tenant-scoped queue orders.
-- Serves:       FR-06 (manual order entry), FR-10 (queue status lifecycle), FR-14 (audit),
--               AT-01 (provider identity, creation half), AT-02 (ticket numbers repeat)
--               · blueprint §5.1, §5.2, §8.3
-- Depends on:   20261120100100 (branches), 20261120100400 (audit_row_change)
-- Not included: policies and grants (20261123100200); the create/transition functions
--               (20261123100300); outbox (20261123100100). RLS is ENABLED here with no
--               policy, so the table denies every API client until the policy migration.
-- Rollback:     forward-only; undo by writing a new migration.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- order_status: the lifecycle from blueprint §5.1. Which moves are allowed is
-- decided by private.is_order_transition_allowed() (20261123100300), mirrored in
-- apps/web/src/modules/orders/transitions.ts. Keep all three in step.
-- ---------------------------------------------------------------------------
create type public.order_status as enum ('new', 'preparing', 'ready', 'collected', 'cancelled');

comment on type public.order_status is
  'Queue status lifecycle (blueprint §5.1). Terminal: collected, cancelled.';

-- order_source: where the order came from. Only manual entry exists today (FR-06);
-- POS ingest (FR-05, ADR-0002 Proposed) adds a value in its own migration.
create type public.order_source as enum ('manual');

comment on type public.order_source is
  'Origin of an order. manual = typed in by staff (FR-06). POS sources arrive with FR-05.';

-- ---------------------------------------------------------------------------
-- orders
-- ---------------------------------------------------------------------------
create table public.orders (
  id             uuid                not null default gen_random_uuid(),
  restaurant_id  uuid                not null,
  branch_id      uuid                not null,
  ticket_number  text                not null,
  source         public.order_source not null default 'manual',
  provider       text,
  external_id    text,
  status         public.order_status not null default 'new',
  version        integer             not null default 1,
  created_at     timestamptz         not null default now(),
  updated_at     timestamptz         not null default now(),
  ready_at       timestamptz,
  closed_at      timestamptz,

  constraint orders_pkey primary key (id),
  -- Composite FK: the order's restaurant must be the branch's restaurant (no cross-tenant links).
  constraint orders_branch_fkey
    foreign key (branch_id, restaurant_id)
    references public.branches (id, restaurant_id) on delete cascade,
  -- Lets outbox_events prove its tenant columns match the order (composite FK there).
  constraint orders_id_tenant_unique unique (id, restaurant_id, branch_id),

  -- A ticket number is a short display value, never a key (blueprint §5.2): NOT unique.
  constraint orders_ticket_number_length check (char_length(btrim(ticket_number)) between 1 and 20),
  -- Provider identity comes as a pair: both set (POS order) or both null (manual order).
  constraint orders_provider_pair check ((provider is null) = (external_id is null)),
  constraint orders_provider_length check (provider is null or char_length(provider) between 1 and 64),
  constraint orders_external_id_length check (external_id is null or char_length(external_id) between 1 and 200),
  constraint orders_version_positive check (version >= 1),

  -- Timestamps follow the status, so a row can never claim READY without a ready time,
  -- or be open with a closing time. READY is reachable only from preparing, and
  -- cancel only from new/preparing (blueprint §5.1), so a cancelled order was never ready.
  constraint orders_ready_at_matches_status
    check ((status in ('ready', 'collected')) = (ready_at is not null)),
  constraint orders_closed_at_matches_status
    check ((status in ('collected', 'cancelled')) = (closed_at is not null))
);

comment on table  public.orders is
  'A queue order of one branch (FR-06, FR-10). Status changes only through public.transition_order().';
comment on column public.orders.ticket_number is
  'Number shown to the customer. Display value only: repeats across restaurants and is reused within a branch (blueprint §5.2, AT-02). Not a secret and never grants access (FR-08).';
comment on column public.orders.provider is
  'POS provider key for ingested orders (FR-05); NULL for manual orders.';
comment on column public.orders.external_id is
  'The provider''s order id. Unique per (branch, provider) so a repeated webhook cannot create a second order (AT-01).';
comment on column public.orders.version is
  'Optimistic-concurrency counter. Bumped by every transition; a caller must send the version it last saw (AT-09).';
comment on column public.orders.ready_at is 'UTC time the order became READY. Set only by transition_order().';
comment on column public.orders.closed_at is 'UTC time the order reached a terminal state (collected or cancelled).';

-- AT-01 (creation half): one internal order per provider order per branch.
-- Partial, because manual orders carry no provider identity.
create unique index orders_branch_provider_external_unique
  on public.orders (branch_id, provider, external_id)
  where provider is not null and external_id is not null;

-- Tenant lookups and the future queue view ("this branch's open orders, oldest first").
create index orders_restaurant_id_idx on public.orders (restaurant_id);
create index orders_branch_status_created_idx on public.orders (branch_id, status, created_at);

create trigger orders_set_updated_at
  before update on public.orders
  for each row execute function private.set_updated_at();

-- FR-14: every insert, transition and delete leaves an audit row (who, what, which columns).
create trigger orders_audit
  after insert or update or delete on public.orders
  for each row execute function private.audit_row_change();

alter table public.orders enable row level security;
