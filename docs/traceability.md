# Traceability matrix

Maps each requirement in `docs/blueprint.md` to the code, migrations and tests that implement it.
Update this file in the **same PR** that adds the code. A row with no tests is not done.

Migration numbers are the timestamp prefix in `supabase/migrations/`. Slice 01 files start `20261120` (`100100` means `20261120100100_...`); slice 02 files start `20261123` and are written with the day (`23:100300` means `20261123100300_...`).

Status: `—` not started · `spike` evidence only · `partial` · `done`

## Functional requirements (blueprint §5)

| ID | Requirement | Module(s) | Migration(s) | Tests | Status |
|---|---|---|---|---|---|
| FR-01 | Multi-tenant restaurants | `tenancy` | `100100` restaurants/branches, `100200` profiles/memberships, `100600` create_restaurant + sign-up profile | `supabase/tests/fr01_create_restaurant_and_profile.sql`, `tenancy.test.ts` | partial (database layer; sign-up UI not built) |
| FR-02 | Branch management | `tenancy` | `100100`, `100200`, `100500` policies | `supabase/tests/fr02_branch_scope.sql`, `tenancy.test.ts` | partial (database layer; no branch screens) |
| FR-03 | Staff identity and roles | `identity` | `100000` staff_role, `100300` helpers, `100500` policies | `supabase/tests/fr03_roles_and_no_membership.sql`, `identity.test.ts` | partial (`TODO(FR-03)`: last-owner protection; staff invitation flow not built) |
| FR-04 | POS connector framework | | | | — |
| FR-05 | Automatic order ingestion | | | | — |
| FR-06 | Manual order entry | `orders` (`order-service.ts` `createManualOrder`) | `23:100000` orders, `23:100200` read policy (no client writes), `23:100300` `create_manual_order()` | `supabase/tests/fr06_manual_order_entry.sql`, `order-service.test.ts` | partial (database + service; no route handler or UI) |
| FR-07 | Customer QR entry | | | | — |
| FR-08 | Secure order claim | | | | — |
| FR-09 | Multiple customer devices | | | | — |
| FR-10 | Queue status lifecycle | `orders` (`transitions.ts`, `order-service.ts` `transition`) | `23:100000` order_status enum, `23:100300` `transition_order()` + `private.is_order_transition_allowed()` | `supabase/tests/fr10_order_transitions.sql`, `transitions.test.ts`, `order-service.test.ts` | partial (backend only: no dashboard, realtime or route handler) |
| FR-11 | Employee queue dashboard | | | | — |
| FR-12 | READY notifications | — | `23:100100` outbox_events (enqueue only), `23:100300` READY writes `order.ready` | `supabase/tests/at05_ready_outbox_once.sql` | partial (event is enqueued in the READY transaction; no worker or push, ADR-0004 Open) |
| FR-13 | Customer status page | | | | — |
| FR-14 | Audit history | `audit` | `100400` audit_logs + triggers, `100500` read policy | `supabase/tests/fr14_audit_trail.sql`, `audit.test.ts`, `fr06_manual_order_entry.sql`, `at06_ready_roles_audited.sql` | partial (tenancy tables and orders, via `orders_audit` in `23:100000`; records changed column names, not from/to values) |
| FR-15 | Restaurant configuration | | | | — |
| FR-16 | SaaS subscription | | | | — |
| FR-17 | Observability | | | | — |
| FR-18 | Localization | `shared` (i18n: locales, catalogues, `localeFromAcceptLanguage`), app shell `src/app/layout.tsx` (`<html lang dir>`), `src/lib/request-locale.ts` | — | `i18n.test.ts`, `accept-language.test.ts`, `apps/web/e2e/smoke.spec.ts` (LTR + RTL in Chromium) | partial (skeleton + root layout; locale from Accept-Language only, profile/branch locale not wired; Arabic strings are placeholders) |
| FR-19 | Data export/deletion | | | | — |
| FR-20 | Platform support controls | | | | — |

## Critical acceptance scenarios (blueprint §15.2)

| ID | Scenario | Test file | Status |
|---|---|---|---|
| AT-01 | Repeated POS webhook for same order | `23:100000` unique `(branch_id, provider, external_id)` (verify script only; no ingest endpoint yet) | partial (creation half: constraint exists; ingest half is FR-05) |
| AT-02 | Two restaurants with same ticket number | `supabase/tests/at02_at11_tenant_isolation.sql`, `supabase/tests/at02_orders_same_ticket_number.sql` (same ticket number in two restaurants; reuse in one branch after collected) | done (database layer) |
| AT-03 | Unauthorized user guesses ticket number | | — |
| AT-04 | One order followed on several devices | | — |
| AT-05 | Kitchen employee marks READY | `supabase/tests/at05_ready_outbox_once.sql`, `supabase/tests/concurrency/at09_two_sessions_race.sh` (one event under a race) | partial (one outbox event per READY proven; dispatch is ADR-0004) |
| AT-06 | Cashier marks READY | `supabase/tests/at06_ready_roles_audited.sql` (owner rule 2026-11-21: any staff role; auditor read-only) | done (database layer; role rule may change with blueprint §11.2) |
| AT-07 | Push provider unavailable | | — |
| AT-08 | Customer denies push permission | | — |
| AT-09 | Two employees act concurrently | `supabase/tests/concurrency/at09_two_sessions_race.sh` (two connections), `fr10_order_transitions.sql` (stale version) | done (database layer) |
| AT-10 | POS cancellation after READY | | — |
| AT-11 | Cross-tenant API request | `supabase/tests/at02_at11_tenant_isolation.sql`, `supabase/tests/at11_orders_cross_tenant.sql` (database/RLS layer only; no API exists yet) | partial |
| AT-12 | Subscription becomes past due | | — |
