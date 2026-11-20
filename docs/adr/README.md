# Architecture decision records

One short file per decision that shapes the system. The status decides what agents may do:

- **Accepted** — approved by the product owner. Build on it.
- **Proposed** — recommended, not approved. Do not build irreversible things on it.
- **Open** — a question that still needs evidence or a decision.

To change a decision, add a new ADR that supersedes the old one; do not rewrite history.
Copy `0000-template.md` for new ones.

## Index

| ADR | Decision | Status |
|---|---|---|
| [0001](0001-modular-monolith-nextjs-supabase.md) | Modular monolith on Next.js + TypeScript + Supabase | **Accepted** |
| [0002](0002-pos-adapters-canonical-order.md) | Independent POS adapter per provider, canonical order model | Proposed |
| [0003](0003-hosting-vercel-supabase.md) | Hosting: Vercel + Supabase as starting candidate | Proposed |
| [0004](0004-background-processing.md) | Background processing and outbox worker | Open |
| [0005](0005-database-change-workflow.md) | Database changes: migrations in Git, local → staging → prod | **Accepted** |
| [0006](0006-customer-order-claim-model.md) | Customer order claim and multi-device model | Open |

## Decisions already confirmed by the product owner (blueprint §3.1)

Multiple POS providers over time · automatic POS sync **and** manual entry · kitchen and cashier can
both mark READY (role matrix still open) · SaaS subscription · customer enters an order number
(verification method unresolved, see ADR-0006) · multiple devices per order · web-only first ·
global ambition with staged rollout · Claude Code for coding · Figma for UI/UX ·
ADR-0001 (stack/architecture) and ADR-0005 (database workflow) accepted 2026-11-20.

## Decisions still open (blueprint §3.3)

First POS provider · claim model · pilot country and restaurant segment · launch languages · device
limits and session expiry · employee role matrix · push permission policy · billing provider ·
retention periods · hosting region, residency, backup objectives · MVP scope and metrics · branding
depth (logo/colors vs custom domains).
