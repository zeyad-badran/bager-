# Restaurant Queue & Digital Pager SaaS

A web-only SaaS that replaces physical restaurant pagers: customers scan a branch QR code, securely
claim their order, and get a notification when staff mark it READY. Works with a restaurant's POS
or with manual order entry. Multi-tenant, built to go global in stages.

**Stage:** Phase 3 foundation. The tenant database (migrations, RLS, audit), the first TypeScript
modules and the Next.js app shell (English/Arabic, LTR/RTL) exist. No product screens yet.

## Where things are

| Path | What |
|---|---|
| [`CLAUDE.md`](CLAUDE.md) | Rules and invariants every coding agent reads first |
| [`docs/blueprint.md`](docs/blueprint.md) | Product blueprint: requirements, architecture, security, roadmap |
| [`docs/adr/`](docs/adr/README.md) | Architecture decisions and their status |
| [`docs/workflow.md`](docs/workflow.md) | How Claude chat, Claude Code and the database step work together |
| [`docs/prompts/`](docs/prompts) | Task specs for the coding agent |
| [`supabase/`](supabase) | Migrations (append-only), seed, read-only verify scripts and SQL tests |
| [`apps/web/src/modules/`](apps/web/src/modules) | Modular-monolith code; modules import each other only through `index.ts` |

## Working rules in one paragraph

Decisions are labelled Accepted / Proposed / Open; agents build only on Accepted ones. No paid
service, production credential or real customer data is ever used by an agent. Database changes are
migration files in Git, applied local → staging → production with owner approval.

## Checks

```
pnpm install
pnpm check        # typecheck + lint + unit tests (Vitest) + module boundaries + secret scan
pnpm dev          # app shell on http://localhost:3000
pnpm e2e          # Playwright smoke test (LTR + RTL)
pnpm test:db      # migrations + RLS tests (see scripts/test-db.sh for the two modes)
```
