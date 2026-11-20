# ADR-0003: Hosting — Vercel + Supabase as starting candidate

- Status: **Proposed** (blueprint §3.2, §19; "candidate, validate region, cost, compliance")
- Date: 2026-11-20
- Decided by: pending product owner
- Blueprint refs: §3.3 (hosting region, residency, backup objectives), §13.4, §18.4, §19

## Context
Fast deployment path wanted for the pilot. Region, data residency, reliability, pricing and RPO/RTO
are not yet decided, and no paid service may be activated without explicit approval.

## Options considered
1. Vercel (web) + Supabase (database/auth/realtime).
2. Self-managed container hosting + managed Postgres.
3. Another managed platform.

## Decision
_Pending._ Proposed: start local-only (Supabase local stack in Docker) and create hosted projects
only when the product owner approves the plan, region and cost.

## Consequences
- Development and early spikes need no paid account.
- Separate hosted projects for staging and production, with separate secrets (blueprint §18.1).
- RPO/RTO and a tested restore are required before any pilot (blueprint §18.4).

## Evidence needed
Region/residency requirement for the pilot country; cost model at low/expected/peak load
(blueprint §13.4).
