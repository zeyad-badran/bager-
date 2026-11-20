# Code style and traceability

Goal: someone who did not write the code can read it, and can follow any requirement from the
blueprint to the code, the test and the migration that implement it. Applies to every agent and human.

## 1. Traceability

- **Every source file starts with a header comment**: one-line purpose, the module it belongs to,
  the requirement IDs it serves (`FR-xx`, `AT-xx`, blueprint section) and the invariant it protects.
- **Tests carry IDs in their names**: `describe("AT-02 tenant isolation", …)`.
- **Commits and PRs cite IDs**: `feat(orders): enforce transition rules (FR-10, AT-09)`.
- **`docs/traceability.md` is updated in the same PR** that adds the code, test or migration.
- **Business rules live in named functions** (for example `assertTransitionAllowed`) with a comment
  pointing to the blueprint section, never inline in route handlers or components.

TypeScript header example:

```ts
/**
 * Order status transitions.
 *
 * Module:   orders
 * Serves:   FR-10 (queue status lifecycle), AT-05, AT-09 · blueprint §5.1
 * Protects: only valid transitions are accepted, based on the current status
 *           and version, so two staff members cannot overwrite each other.
 */
```

SQL header example (migrations, see §5):

```sql
-- Purpose:   Create restaurants and branches (the tenant boundary).
-- Serves:    FR-01, FR-02, AT-02 · blueprint §8.3
-- Depends on: nothing
-- Not included: memberships and roles (next migration)
-- Rollback:  forward-only; undo by writing a new migration
```

## 2. Comments

- Comment the **why**: the constraint, the blueprint rule, the failure it prevents.
  Do not restate what the code plainly says.
- **Every exported function, type and module** has a doc comment: what it does, inputs and outputs,
  errors it can throw, side effects.
- Use tagged comments so risky spots can be searched:
  `// SECURITY:` (access, tokens, tenant boundary) · `// CONCURRENCY:` (races, versions, retries) ·
  `// IDEMPOTENT:` (safe to run twice) · `// TODO(ADR-0006):` (pending decision; always cite the ADR or issue,
  never a bare TODO).
- No commented-out code. Git remembers.

## 3. Structure and naming

- Layers: **route handler (thin) → service (rules) → repository (database)**. Handlers parse and
  validate input and call a service. Services hold the rules. Repositories are the only code that
  touches SQL.
- A module exposes only its `index.ts`; other modules import through it and never reach inside.
- Small units: aim for files under ~200 lines and functions under ~40. One responsibility each.
- Names use the glossary words (tenant/restaurant, branch, order, ticket, claim, session, outbox).
  No cryptic abbreviations. Booleans read as `isX`, `hasX`, `canX`.
- Order statuses are one string-literal union that matches the database enum exactly.
- No magic numbers or strings: named constants with a comment saying where the value comes from
  (for example the customer-device cap is configuration, not hard-coded; blueprint §3.2).

## 4. Types, errors, logging

- TypeScript `strict`; no `any`; no non-null assertions to silence the compiler.
- Validate all external input (requests, webhooks, provider payloads) at the boundary with a schema
  and convert to internal types. The schema library is a new dependency, so it needs approval in the
  scaffolding slice (proposed: zod).
- Use typed domain errors with stable codes (`ORDER_TRANSITION_NOT_ALLOWED`). Never swallow errors.
  Return safe messages to clients; keep detail in logs.
- Structured logs with ids and codes; never log secrets, tokens, or customer personal data.
- Time is UTC internally; convert only at the edges (branch time zone, customer locale).

## 5. SQL migrations (applied unchanged by the database step)

The database tool applies migration files **exactly as committed** and never edits them
(ADR-0005). So a migration must be correct and self-explanatory *before* it is merged.

- File name: `YYYYMMDDHHMMSS_<verb>_<subject>.sql`.
- Header comment as in §1: purpose, requirement IDs, dependencies, what is not included, rollback note.
- **One purpose per file.** Forward-only. Never mix schema changes with data fixes.
- No environment-specific values, no secrets, no seed data (seed data lives in `supabase/seed.sql`,
  local only).
- Name every constraint and index explicitly. Add `COMMENT ON TABLE/COLUMN` for anything not obvious.
- **Enable RLS in the same migration that creates the table.** A table with RLS on and no policy
  denies everything, so policies may follow in a later migration, but they must arrive before the
  table is used. Name policies `<table>_<role>_<action>`. Grant API roles only the columns and
  operations they need (revoke first, then grant).
- Must apply cleanly to an empty database and on top of all earlier migrations. CI proves this with
  `supabase db reset` and then runs the RLS tests.
- **Read-only verify script** for each migration at `supabase/verify/<same name>.sql`: queries only,
  with the expected result in a comment. The database tool may run these after the push to check the
  result, so it never needs to touch the migration itself.

## 6. Tests

- Arrange / Act / Assert, with the behaviour and the requirement ID in the test name.
- Adversarial cases are first-class: guessed UUIDs, other tenants, replayed webhooks, double
  submissions, concurrent updates.
- A bug fix starts with a test that fails for the right reason.

## 7. Reviewer checklist (60 seconds per PR)

1. Does every new file have a header naming its requirement IDs?
2. Are the rules in services and named functions, not in handlers or components?
3. Do comments explain why, and do tagged comments mark security and concurrency spots?
4. Are there tests named with `FR`/`AT` IDs, and does `docs/traceability.md` show them?
5. For migrations: header, single purpose, RLS in the same file, verify script present?
