# Restaurant Queue & Digital Pager SaaS

A web-only SaaS that replaces physical restaurant pagers: customers scan a branch QR code, securely
claim their order, and get a notification when staff mark it READY. Works with a restaurant's POS
or with manual order entry. Multi-tenant, built to go global in stages.

**Stage:** planning / pre-build. No application code yet.

## Where things are

| Path | What |
|---|---|
| [`CLAUDE.md`](CLAUDE.md) | Rules and invariants every coding agent reads first |
| [`docs/blueprint.md`](docs/blueprint.md) | Product blueprint: requirements, architecture, security, roadmap |
| [`docs/adr/`](docs/adr/README.md) | Architecture decisions and their status |
| [`docs/workflow.md`](docs/workflow.md) | How Claude chat, Claude Code and the database step work together |
| [`docs/prompts/`](docs/prompts) | Task specs for the coding agent |

## Working rules in one paragraph

Decisions are labelled Accepted / Proposed / Open; agents build only on Accepted ones. No paid
service, production credential or real customer data is ever used by an agent. Database changes are
migration files in Git, applied local → staging → production with owner approval.
