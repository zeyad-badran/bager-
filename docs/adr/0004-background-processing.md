# ADR-0004: Background processing and the outbox worker

- Status: **Open** (blueprint §3.2, §7.4, §19: "evaluate one approach; do not adopt several")
- Date: 2026-11-20
- Decided by: pending, after a short proof of concept
- Blueprint refs: §7.4, FR-12, AT-05, AT-07, risk "Worker processes event twice"

## Context
READY must be committed in the database together with an outbox event in one transaction. A worker
then dispatches Web Push (and later other channels) with retries, backoff, dead-lettering and
idempotency. Request handlers must not send push inline. Serverless web functions are a poor home for
a long-running worker.

## Options considered
1. **Supabase Queues + scheduled/edge functions** — keeps one platform; limits to be checked.
2. **Trigger.dev or Inngest** — managed durable jobs; another vendor and cost.
3. **Dedicated worker process** (`apps/worker`) polling the outbox table — most control, one more
   thing to host and monitor.

## Decision
_Open._ Pick one after a small PoC covering: transactional enqueue, retries with jitter, permanent
vs retryable errors, idempotent handlers, dead-letter visibility, and cost at expected volume.

## Consequences
Do not adopt overlapping job systems. Whatever is chosen must satisfy AT-05 and AT-07.

## Evidence needed
Spike: enqueue + dispatch against a fake push provider, with forced failures and double delivery.
