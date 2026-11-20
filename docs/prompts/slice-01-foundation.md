# Slice 01 — Project foundation and tenant schema

Status: **partly delivered** on branch `feat/slice-01-foundation`; the rest moved to `slice-01b-nextjs-scaffold.md`
(ADR-0001 and ADR-0005 Accepted 2026-11-20)
Covers: FR-01, FR-02, FR-03 (foundation only), AT-02, AT-11
Phase: 3 — Architecture and backend foundation

Phase 2 spikes (Web Push, anonymous realtime, claim-token, POS access) run in parallel and may change
later slices; this slice only covers tenant isolation, which does not depend on them.

## Goal
A running Next.js + TypeScript app with a local Supabase database, CI, and a tenant/branch/membership
schema whose isolation is proven by adversarial tests. No customer or POS features yet.

## Read first
`CLAUDE.md`, `docs/code-style.md`, `docs/workflow.md`, `docs/traceability.md`, `docs/blueprint.md` §5 (FR-01..03), §7, §8, §14, §15, and ADR-0001, ADR-0005.

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
   constraints, indexes for tenant lookups. Follow `docs/code-style.md` §5: header comment, one purpose
   per file, RLS enabled in the same file as the table, `COMMENT ON` for non-obvious columns, and a
   read-only `supabase/verify/<name>.sql` per migration. Antigravity will push these files unchanged.
5. **RLS policies** on every table above: a member sees only rows for their restaurant (and branch
   where scoped); writes require the right role.
6. **Tests first** (Vitest against the local DB): see Acceptance.
7. **i18n skeleton**: message catalogue with English and Arabic placeholder strings, `dir` switching
   (LTR/RTL) on the root layout. No product copy yet.
8. **CI** (GitHub Actions): install, typecheck, lint, unit tests, `supabase start` + migration apply +
   RLS tests, secret scan.
9. `.env.example` for any variable added; update `CLAUDE.md` "Commands" with the real commands.
10. Every file has the header comment from `docs/code-style.md`; fill the matching rows in
    `docs/traceability.md` (FR-01..03, AT-02, AT-11).

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
- You find ADR-0001 or ADR-0005 conflict with this spec.
- You need a paid service, a hosted Supabase project, or any real secret.
- The role model in blueprint §11.2 is unclear for a permission you must encode (it is still a
  *proposal*). Encode the minimum and list the gap in the hand-off.

## Delivery record (2026-11-20)

Built in an environment without access to the npm registry and without the Supabase CLI, so only
what could be verified there was built. Honest split:

| Scope item | State |
|---|---|
| 1 Scaffold (Next.js, Tailwind, shadcn/ui, ESLint, Vitest, Playwright) | **Not done** → `slice-01b-nextjs-scaffold.md` |
| 2 Module skeleton + boundary rule | Done. Boundary rule is `scripts/check-module-boundaries.mjs` (not ESLint); `identity`, `tenancy`, `audit`, `shared` have code, the other five are stubs |
| 3 Supabase local setup | `config.toml` hand-written and **not checked with the CLI**; seed is synthetic |
| 4 Migrations + verify scripts | Done (7 migrations, 7 verify scripts) |
| 5 RLS policies | Done (15 policies) |
| 6 Tests first | Done as **SQL tests** against PostgreSQL 16 (99 assertions) instead of Vitest; unit tests use `node:test` |
| 7 i18n skeleton | Library part done (`shared/i18n`); root-layout `dir` switching needs the Next.js app (slice 01b) |
| 8 CI | Workflow written; **never run**. `database` job uses plain PostgreSQL; the real-Supabase job is experimental |
| 9 `.env.example`, `CLAUDE.md` Commands | Done |
| 10 Headers + traceability | Done (headers enforced by the checker) |

Deviations from this spec, for the product owner to accept or reject:
- `node:test` + `tsx` instead of Vitest for unit tests (no installs possible). Vitest can replace it in 01b.
- SQL-level tests instead of Vitest-against-local-DB. They test the same policies more directly; the
  `supabase` CI job reuses them against the real stack.
- The database tests ran on plain PostgreSQL 16 with a small stand-in for Supabase's `auth` schema and
  roles (`supabase/tests/support/00_stub_supabase.sql`). They have **not** run on the real Supabase stack.
- Known gap: `TODO(FR-03)` last-owner protection (an owner can remove the last owner of a restaurant).
