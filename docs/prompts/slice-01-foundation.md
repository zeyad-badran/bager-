# Slice 01 — Project foundation and tenant schema

Status: **blocked-by ADR-0001 (and ADR-0005) being Accepted**
Covers: FR-01, FR-02, FR-03 (foundation only), AT-02, AT-11
Phase: 3 — Architecture and backend foundation

Do not start this slice until the product owner has marked ADR-0001 and ADR-0005 **Accepted**.
Phase 2 spikes (Web Push, anonymous realtime, claim-token, POS access) come first and may change this spec.

## Goal
A running Next.js + TypeScript app with a local Supabase database, CI, and a tenant/branch/membership
schema whose isolation is proven by adversarial tests. No customer or POS features yet.

## Read first
`CLAUDE.md`, `docs/workflow.md`, `docs/blueprint.md` §5 (FR-01..03), §7, §8, §14, §15, and ADR-0001, ADR-0005.

## Scope
1. **Scaffold** `apps/web`: Next.js (App Router), TypeScript `strict`, Tailwind, shadcn/ui, ESLint,
   Vitest, Playwright (one smoke test), pnpm workspace at repo root.
2. **Module skeleton** under `apps/web/src/modules/`: `identity`, `tenancy`, `orders`, `queue`,
   `integrations`, `notifications`, `billing`, `audit`, `shared`. Each has `index.ts`; add an ESLint rule
   (or import restriction) forbidding cross-module imports except through `index.ts`. Only `identity`,
   `tenancy` and `audit` get real code in this slice; the rest are empty stubs.
3. **Supabase local setup**: `supabase/config.toml`, `supabase/migrations/`, `supabase/seed.sql`
   with **synthetic** data only (two restaurants, two branches each, users in each role).
4. **First migrations** (new files, append-only): `restaurants`, `branches`, `branch_settings`,
   `profiles`, `memberships` (restaurant/branch scoped role), `roles`/permissions as simple enums or
   table, `audit_logs`. UUID primary keys, `created_at/updated_at` in UTC, FK + check + unique
   constraints, indexes for tenant lookups.
5. **RLS policies** on every table above: a member sees only rows for their restaurant (and branch
   where scoped); writes require the right role.
6. **Tests first** (Vitest against the local DB): see Acceptance.
7. **i18n skeleton**: message catalogue with English and Arabic placeholder strings, `dir` switching
   (LTR/RTL) on the root layout. No product copy yet.
8. **CI** (GitHub Actions): install, typecheck, lint, unit tests, `supabase start` + migration apply +
   RLS tests, secret scan.
9. `.env.example` for any variable added; update `CLAUDE.md` "Commands" with the real commands.

## Out of scope
Customer pages, QR, claim tokens, POS adapters, orders/queue tables, outbox/worker, billing, push,
any hosted Supabase/Vercel project, any paid service, any real credential.

## Acceptance
- `pnpm install && pnpm typecheck && pnpm lint && pnpm test` pass locally.
- `supabase start && supabase db reset` rebuilds the schema and seed from zero.
- Tests prove, with the seeded users:
  - AT-02/AT-11: a member of restaurant A cannot select, insert, update or delete any row of
    restaurant B, including by guessing UUIDs and by calling the API/Supabase client directly.
  - A branch-scoped member cannot read other branches of the same restaurant.
  - A user without a membership sees nothing.
  - Role permissions: a read-only role cannot write.
  - Writes to tenant tables produce an `audit_logs` row (FR-14 foundation).
- CI is green on the PR.

## Stop and ask if
- ADR-0001 or ADR-0005 are not Accepted, or you find they conflict with this spec.
- You need a paid service, a hosted Supabase project, or any real secret.
- The role model in blueprint §11.2 is unclear for a permission you must encode (it is still a
  *proposal*). Encode the minimum and list the gap in the hand-off.
