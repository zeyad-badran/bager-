# Spike — Anonymous customer live updates (feeds ADR-0001 follow-up, ADR-0006)

Status: ready after slice 01b (needs the Next.js app and local Supabase)
Covers: FR-09, FR-13, AT-03, AT-04, AT-08 (evidence only)
Phase: 2 — Technical feasibility spikes

## Goal
Decide how an account-less customer page gets live order updates without RLS having to model anonymous users and without
leaking other customers' orders. Compare options with measurements.

## Read first
`CLAUDE.md`, blueprint §6 (performance targets), §7, §9, ADR-0001, ADR-0006 (design constraint: customer reads go through server
routes with a signed session token).

## Scope
Branch `spike/anonymous-realtime`, code in `spikes/anonymous-realtime/` (a tiny standalone harness against **local** Supabase, synthetic data).
Compare, with the same fake "order changed" trigger:
1. **A.** Short polling a server route with a signed session token (ETag/304 aware).
2. **B.** Server-Sent Events from a server route that verifies the token.
3. **C.** Supabase Realtime Broadcast on a private, per-order topic, with authorization that accepts a server-minted token.
Measure for each (20 simulated customers, one-minute run, numbers in the report): p50/p95 delay from DB commit to client receive,
requests per minute, behaviour on reconnect and on a phone going to sleep/offline, and cost drivers (connections, messages).
Security checks per option (as tests): a client with a token for order X never receives events for order Y; an expired or
revoked token stops receiving; no way to learn whether another order exists.

## Out of scope
Product routes, migrations to the product schema, push, claim flow design (see `spike-claim-token`), hosted Supabase or Vercel, paid services.

## Acceptance
- A runnable `README` in the spike folder (exact commands) and a report `docs/spikes/anonymous-realtime.md` with the measurements and a recommendation.
- `pnpm check:boundaries` and `pnpm check:secrets` pass.
- Report lists what was not tested (real mobile networks, scale beyond 20 clients).

## Stop and ask if
- Option C needs a schema change in `supabase/migrations/` (spikes must not change product migrations; describe the need in the report).
- Any option needs a paid plan or a hosted project.
