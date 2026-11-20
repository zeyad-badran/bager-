# Working workflow — Claude chat, Claude Code, database

How work moves from an idea to running code without agents drifting apart. The repo is the shared
memory: every agent reads the same `CLAUDE.md`, `docs/blueprint.md` and `docs/adr/`.

> Status: **Proposed by Claude chat on 2026-11-20, pending product-owner approval.** Items marked
> `[OPEN]` need an answer from the product owner.

## Roles

| Who | Does | Does not |
|---|---|---|
| **Product owner (you)** | Decides, approves gates, reviews PRs, holds all real credentials | — |
| **Claude chat** | Plans, resolves design questions, writes task specs in `docs/prompts/`, reviews hand-offs and results, updates ADRs | Write production code directly, touch the database |
| **Claude Code (VS Code)** | Implements one spec on a branch: tests, code, migration *files*, PR | Apply migrations to staging/prod, use real secrets, add paid services |
| **Antigravity** *(confirmed by owner, 2026-11-20)* | Receives the migration files, is connected to Supabase by you, and **pushes the migrations exactly as committed**; runs the read-only verify scripts; reports the output | Edit, rewrite, reorder, rename or "fix" a migration; write its own schema changes; run ad-hoc SQL that changes data or schema |

Why this split: the database step is where mistakes are expensive and hard to see. If any agent edits
the live database directly, the live schema stops matching `supabase/migrations` in Git, and nobody
can explain why a query behaves differently in staging and production.

## The loop

```
1. Claude chat   decide + write the task spec          → docs/prompts/<slice>.md (committed)
2. Claude Code   branch, tests first, code, migration  → PR (CI must pass)
3. You           review the PR, run the checks, merge
4. Database      apply to LOCAL → STAGING (→ PROD only with your explicit OK)
5. Hand-off      Claude Code / the DB step reports back → paste into Claude chat
6. Claude chat   reviews the result, updates ADRs, writes the next spec
```

## Task spec template (Claude chat → Claude Code)

Every spec in `docs/prompts/` uses this shape so nothing depends on chat memory:

```markdown
# <slice name>
Status: ready | blocked-by <ADR/slice> | done
Covers: FR-xx, AT-xx
Phase: <blueprint roadmap phase>

## Goal
One paragraph: what exists after this slice that did not before.

## Read first
Files and sections to read (CLAUDE.md, blueprint sections, ADRs, existing modules).

## Scope
What to build. Be specific about files/modules.

## Out of scope
What must NOT be touched or built.

## Acceptance
Commands that must pass, tests that must exist, behaviours to verify by hand.

## Stop and ask if
Conditions that require a human decision.
```

## Hand-off block (Claude Code → Claude chat)

Claude Code ends every task with this, short and factual:

```markdown
## Hand-off: <slice>
Branch / PR: <link>
Changed: <modules, migrations, key files>
Tests: <added/ran, result>
Verify: <exact steps/commands for the reviewer>
Deviations from spec: <none | list with reason>
Open questions: <none | list>
```

## Database path

| Environment | What it is | Who/what changes it |
|---|---|---|
| **Local** | Supabase local stack (`supabase start`, Docker) with synthetic data | Claude Code, freely: `supabase db reset` applies all migrations |
| **Staging** | Separate Supabase project, synthetic data only | `supabase db push` of the merged migration files, run by Antigravity unchanged (see "Antigravity hand-over" below) |
| **Production** | Separate Supabase project | Only after your explicit OK, ideally from CI on a protected branch. No agent holds these keys |

Rules:
- Schema changes exist only as files in `supabase/migrations/`, reviewed in a PR before any remote apply.
- RLS/tenant-isolation tests must pass locally and in CI *before* a migration touches staging.
- After applying, the DB step reports: command run, migration names applied, any error, and the
  result of the verification query named in the spec.
- Creating Supabase/Vercel/Sentry projects or upgrading a plan is a paid-service decision: you do it,
  or you approve it explicitly. Agents do not.

## Antigravity hand-over

Decision by the product owner: Antigravity is given the migration files, you connect it to Supabase,
and it pushes them **without changing anything in them**.

What it receives (from the merged branch, never from a draft):
1. The migration files in `supabase/migrations/`, untouched.
2. The matching read-only scripts in `supabase/verify/`.
3. The exact command and target (which Supabase project) written in the task spec.

What it does: pushes the migrations, then runs the verify scripts and reports the results.

If anything fails, it **stops and reports the error text verbatim**. It does not edit the migration
to make it pass. Claude chat decides the fix, Claude Code writes it as a **new** migration, and it goes
through a PR again. This is what keeps the database identical to Git.

Preconditions before handing over a migration: PR merged, CI green, `supabase db reset` clean locally,
RLS tests passing, verify script present, and the target project is the one you approved. Connect it
to **staging** first; production only after your explicit OK.

## Human gates

You approve before work continues when a change involves:

- schema, RLS, or auth changes
- a new dependency or tool
- secrets, environment variables, or deployment configuration
- anything paid (including per-message channels such as SMS/WhatsApp)
- a deviation from the blueprint or an ADR
- applying anything to production

Everything else flows through CI and a normal PR review.

## Definition of done (every slice)

- Acceptance in the spec passes; tests for the affected invariants exist and are green.
- CI green: typecheck, lint, unit/integration tests, migration check.
- No secrets in the diff; `.env.example` updated if a variable was added.
- Docs/ADR updated if a decision changed; hand-off block posted.

## Phase map — what is allowed now

| Blueprint phase | Status | What agents may do |
|---|---|---|
| 0 Product definition / PRD | In progress | Draft and refine docs, ADRs, backlog |
| 1 UX/UI | Not started | Figma/prototype work `[OPEN: is Figma still used?]` |
| 2 Feasibility spikes | **Start here** | Throwaway code under `spikes/`: Web Push on real iOS/Android, anonymous customer realtime, claim-token prototype, POS sandbox access |
| 3 Architecture & backend foundation | Blocked until ADR-0001/0003 are Accepted | Scaffold, schema, RLS tests (`docs/prompts/slice-01-foundation.md`) |
| 4+ | Blocked | Per blueprint exit gates |

The blueprint's own rule applies: no large-scale implementation until Phase 0 decisions are approved
and Phase 2 evidence resolves the major unknowns.

## Open workflow questions

- `[OPEN]` Which Supabase project is Antigravity connected to (staging or production)? Production
  should wait until staging has been proven.
- `[OPEN]` Separate dev/staging/prod Supabase projects, or a single project today?
- `[OPEN]` Team size, and who reviews PRs?
- `[OPEN]` Is Figma still part of the loop, or does Claude Code build UI directly?
- `[OPEN]` Pilot country and restaurant type (drives POS choice, languages, notification channels).
