# Slice 01b — Next.js scaffold, real tooling and first green CI

Status: **ready** (needs a machine with network access for npm and Docker for Supabase)
Covers: remainder of slice 01 (scope items 1, 7 and 8), FR-18 (skeleton)
Phase: 3 — Architecture and backend foundation

## Goal
Put the app shell, standard tooling and a **green CI run** around the code and database that slice 01
already delivered. No new product features and no schema changes.

## Read first
`CLAUDE.md`, `docs/prompts/slice-01-foundation.md` (see "Delivery record"), `docs/code-style.md`,
ADR-0001.

## Scope
1. Scaffold `apps/web` as a Next.js (App Router) + TypeScript `strict` app **inside the existing
   folder**, keeping `apps/web/src/modules/**` and `apps/web/tsconfig.json` settings (strict, `noUncheckedIndexedAccess`).
   Add Tailwind, shadcn/ui, ESLint, Vitest, Playwright (one smoke test). Stop and ask before adding any
   dependency not named here.
2. Commit `pnpm-lock.yaml`; switch CI to `--frozen-lockfile` (remove the TODO in `ci.yml`).
3. Root layout sets `<html lang dir>` from `shared` (`resolveLocale`, `getDirection`); all text goes
   through `translate`. Prove LTR and RTL with the Playwright smoke test.
4. Decide with the product owner whether to move unit tests from `node:test` to Vitest. If yes, migrate
   them without changing what they assert.
5. Replace the hand-written `supabase/config.toml` with one the CLI accepts (`supabase init` output
   plus our settings). Do **not** edit existing migrations (CLAUDE.md rule 3).
6. Run `supabase start && supabase db reset && DB_MODE=supabase pnpm test:db`; fix any difference
   between real Supabase and the stand-in **in the stand-in or in a new migration**, never in an applied one.
7. Get all CI jobs green, including the `supabase` job; then remove its `continue-on-error`.
8. Add an ESLint import-restriction mirroring `scripts/check-module-boundaries.mjs` if it is simple;
   keep the script as the CI check either way.

## Out of scope
Customer pages, QR, claim tokens, POS adapters, orders, outbox, billing, push, any hosted project,
paid service or real credential.

## Acceptance
- `pnpm install --frozen-lockfile && pnpm typecheck && pnpm lint && pnpm test:unit` pass.
- `pnpm check` and `pnpm test:db` (both modes) pass.
- CI is green on the PR, with no `continue-on-error` left.
- `CLAUDE.md` "Commands" lists `dev`, `build`, `lint`, `e2e`.

## Stop and ask if
- The real Supabase stack behaves differently from the stand-in in a way that needs a schema change.
- A dependency or paid service is needed that this spec does not name.
