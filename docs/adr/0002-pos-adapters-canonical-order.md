# ADR-0002: Independent POS adapter per provider, canonical order model

- Status: **Proposed** (blueprint §3.2, §7.3, §12)
- Date: 2026-11-20
- Decided by: pending product owner
- Blueprint refs: §7.2, §7.3, §12, FR-04, FR-05, AT-01, AT-10

## Context
The product must support many POS vendors over time without vendor field names leaking into the
core order engine. The restaurant's POS stays the system of record for sales.

## Options considered
1. **One adapter per provider** implementing a stable contract (`authenticate_event`, `parse_event`,
   `normalize_order`, `deduplicate`, `reconcile`, `health_check`) that emits a canonical order event.
2. Direct provider-specific code in the order engine. Rejected: couples core to vendors.
3. Read the restaurant's POS database. Rejected: fragile and a security risk (blueprint §7.2).

## Decision
_Pending._ Proposed: option 1. Integration preference order: official webhook/API → scheduled API
polling → tightly controlled read-only local agent as a last resort. Never write to a POS.

## Consequences
- The first connector is chosen by real API/sandbox access, not brand (blueprint §12.1). Only after
  the first adapter proves the pattern are more added.
- Manual entry uses the same canonical model, state machine, audit trail and notification pipeline.

## Evidence needed
Phase 2 POS provider scorecard (docs, sandbox, webhooks, ID stability, ticket-number reuse,
cancel/void semantics).

## Update 2026-11-24
The product owner deferred all POS connector work until the first client exists (no pilot restaurant, so no provider
to evaluate). The status stays Proposed. Manual entry (FR-06) is the first and only order source until then.
