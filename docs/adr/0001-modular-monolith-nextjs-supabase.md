# ADR-0001: Modular monolith on Next.js + TypeScript + Supabase

- Status: **Accepted** by the product owner on 2026-11-20 (recommendation from blueprint §3.2, §7.1).
  Still to be validated by the Phase 2 spikes; if they disprove it, supersede with a new ADR.
- Date: 2026-11-20
- Decided by: product owner
- Blueprint refs: §3.2, §7.1, §7.6, §19, NFR "Maintainability"

## Context
Small team, AI-assisted build, web-only product that needs multi-tenant isolation, staff auth,
realtime dashboards and an outbox-driven notification pipeline. Microservices would add operational
cost before the domain is proven.

## Options considered
1. **Modular monolith: Next.js + TypeScript (strict) + Supabase Postgres/Auth/RLS/Realtime.**
   One deployable, managed database, RLS as defense in depth. Risk: Supabase Realtime + RLS for
   anonymous customers is awkward (see ADR-0006); long-running workers do not fit serverless (ADR-0004).
2. **Separate backend service + web frontend.** Cleaner worker story, more moving parts and CI.
3. **Microservices.** Rejected for v1 by the blueprint.

## Decision
Option 1, with modules under `apps/web/src/modules/<name>` exposing a public
`index.ts` and no cross-module imports except through it. Layout deviates slightly from the
conceptual tree in blueprint §7.6 (which shows `src/modules` beside `apps/web`); chosen so a
second app (`apps/worker`) can be added later without restructuring. Package manager: pnpm.

## Consequences
- Domain rules (state machine, claim, ingest) live in server-side services, not in route handlers
  or the browser.
- Customers do not talk to Postgres tables directly; customer reads go through server routes (ADR-0006).
- Revisit if the worker or realtime spike shows the single-deployable model does not fit.

## Evidence needed
Phase 2 spikes: anonymous customer realtime, worker hosting, Web Push on real devices.
