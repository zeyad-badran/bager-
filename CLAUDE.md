# CLAUDE.md — Restaurant Queue & Digital Pager SaaS

Read this file first, every session. Keep it short; deep detail lives in `docs/`.

## What this project is

A web-only SaaS that replaces physical restaurant pagers. A customer scans a branch QR code,
securely claims their order, and gets a READY notification when staff update it. The restaurant keeps
its POS; we add the order-status and notification layer. Multi-tenant (restaurant → branches),
POS-agnostic, manual order entry always available, multiple customer devices per order.

**Current stage: Phase 2 spikes and Phase 3 foundation.** ADR-0001 (stack) and ADR-0005 (database
workflow) are **Accepted**. Other ADRs marked Proposed/Open are not approved: do not build irreversible
things on them (hosting, background worker, customer claim model).

## Source of truth (read before you code)

- `docs/blueprint.md` — product blueprint. Requirement IDs `FR-xx`, acceptance scenarios `AT-xx`,
  risks, roadmap phases. Cite these IDs in commits and PRs.
- `docs/adr/` — architecture decisions and their status (Proposed / Accepted / Open).
- `docs/code-style.md` and `docs/traceability.md` — how code is written and traced to requirements.
- `docs/workflow.md` — how Claude chat, Claude Code and the database step hand work to each other.
- `docs/prompts/` — task specs written by Claude chat. Implement exactly the spec you are given.

If code and docs disagree, stop and ask. Do not silently change a decision.

## Hard rules (never break these)

1. **No paid services.** Never create accounts, purchase, upgrade, or add billing to any service.
   Anything with a cost needs the product owner's explicit approval first.
2. **No production access.** Never use, request, print, or commit production credentials, service-role
   keys, or POS credentials. Local and synthetic data only. Real secrets live in the host's secret
   store, never in the repo, prompts, logs, or Figma.
3. **Migrations are append-only.** Schema changes are new SQL files in `supabase/migrations/`.
   Never edit a migration that has been applied or merged; write a new one. The database tool
   (Antigravity) pushes them exactly as committed, so each must be correct, commented and verified
   locally before it is merged.
4. **Stop and ask** before: changing schema/RLS/auth, adding a dependency, touching secrets or
   deployment config, or deviating from the task spec.
5. Never modify or require direct access to a restaurant's POS database (blueprint §7.2).

## Domain invariants (blueprint §5, §7, §9)

- An order number is an **identifier, not a secret**. Customer access needs a claim token or equivalent;
  order number + QR alone must never grant access (FR-08, AT-03).
- Internal UUID primary keys. External order identity is scoped by `provider + branch`; ticket numbers
  repeat and are reused.
- READY is a **committed business state**; push delivery is a separate async outcome. Write the state
  change and an outbox event in **one DB transaction**; a worker dispatches (blueprint §7.4).
- Status transitions are enforced **server-side** in a domain service with version checks
  (optimistic concurrency). UI button state is not a security boundary. Lifecycle:
  `NEW → PREPARING → READY → COLLECTED`, plus `CANCELLED` (blueprint §5.1).
- Ingest is idempotent (same provider event twice ⇒ one order, AT-01). Workers are safe to run twice.
- Every tenant-owned row carries `restaurant_id` (and `branch_id` where relevant). Authorization is
  checked in server code **and** by Postgres RLS. A user from tenant A must never read or write tenant B.
- Timestamps in UTC; render in branch time zone and customer locale. No payment-card data. Store the
  minimum customer data needed.
- Never claim a notification was "delivered" or "seen" unless the platform proves it. States:
  queued → accepted by push provider → delivered (if observable) → seen.
- All user-facing strings go through i18n from day one (English + Arabic candidates); layouts must
  work LTR and RTL.

## Stack (ADR-0001, Accepted)

Next.js + TypeScript (strict) · Supabase (Postgres, Auth, RLS, Realtime) · Tailwind + shadcn/ui ·
Vitest + Playwright · GitHub Actions · Vercel (candidate, ADR-0003 still Proposed) · background-job
approach decided by a spike (ADR-0004, Open). Modular monolith; each module under
`apps/web/src/modules/<name>` exposes a public `index.ts` and other modules import only through it.

## Code style and traceability

Follow `docs/code-style.md`. In short: a header comment on every file naming its `FR-`/`AT-` IDs;
comments explain *why*; thin handlers → services (rules) → repositories (SQL); small functions; no magic
numbers; tests named with requirement IDs; update `docs/traceability.md` in the same PR.

## Commands

Added by the first scaffolding slice. Until then there is nothing to run. Do not invent commands;
read `package.json` once it exists.

## How to work

- One task spec ⇒ one branch (`feat/<slice>`, `spike/<name>`, `fix/<name>`) ⇒ one small PR.
- Write the tests first for: the state machine, idempotent ingest, tenant isolation / RLS, concurrent
  updates (AT-01, AT-02, AT-09, AT-11). Run the full test suite before you say you are done.
- Reference `FR-`/`AT-` IDs in commit messages. Conventional style: `feat(orders): ...`.
- Spikes live in `spikes/<name>/`, are throwaway, and must never be imported by product code.
- When finished, reply with the hand-off block from `docs/workflow.md` (what changed, how to verify,
  open questions). Keep it factual.
