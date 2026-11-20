# ADR-0005: Database changes — migrations in Git, local → staging → prod

- Status: **Proposed** by Claude chat (workflow review, 2026-11-20); not in the original blueprint
- Owner-confirmed so far (2026-11-20): Antigravity applies the migration files **exactly as committed** and never edits them. Staging/production separation is still awaiting confirmation.
- Date: 2026-11-20
- Decided by: pending product owner
- Blueprint refs: §7.1 ("schema migrations in Git"), §14.1, §18.1, §18.4, risk "Database migration failure"

## Context
The working setup has several AI agents. If more than one can change the live database, the real
schema drifts from the code, RLS mistakes become invisible, and production credentials spread into
agent contexts — which blueprint §18.1 forbids.

## Options considered
1. **Migrations as SQL files in Git; apply local → staging → production through one controlled path.**
2. Agents edit the live database directly (SQL editor / MCP). Rejected: drift, no review, no rollback story.

## Decision
_Pending._ Proposed: option 1.
- Only Claude Code writes migrations, as new files in `supabase/migrations/`, via PR.
- Local development uses the Supabase local stack with synthetic data.
- Staging gets merged migrations by `supabase db push`, run by Antigravity (connected to Supabase by the
  owner) with the files unchanged. On any error it stops and reports; a fix is a new migration through a PR.
- Each migration has a read-only verify script in `supabase/verify/` that Antigravity may run afterwards.
- Production only after explicit owner approval, preferably from CI on a protected branch.
- No agent holds production or service-role keys.

## Consequences
- Every schema change is reviewable and reproducible (`supabase db reset` rebuilds from zero).
- RLS/tenant-isolation tests gate the staging push (AT-02, AT-11).
- Slightly slower than editing the live DB, which is the point.

## Evidence needed
Confirm how the current database tool connects and which credentials it holds (see
`docs/workflow.md` open questions).
