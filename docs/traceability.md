# Traceability matrix

Maps each requirement in `docs/blueprint.md` to the code, migrations and tests that implement it.
Update this file in the **same PR** that adds the code. A row with no tests is not done.

Migration numbers are the timestamp prefix in `supabase/migrations/` (all start `20261120`; `100100` means `20261120100100_...`).

Status: `—` not started · `spike` evidence only · `partial` · `done`

## Functional requirements (blueprint §5)

| ID | Requirement | Module(s) | Migration(s) | Tests | Status |
|---|---|---|---|---|---|
| FR-01 | Multi-tenant restaurants | `tenancy` | `100100` restaurants/branches, `100200` profiles/memberships, `100600` create_restaurant + sign-up profile | `supabase/tests/fr01_create_restaurant_and_profile.sql`, `tenancy.test.ts` | partial (database layer; sign-up UI not built) |
| FR-02 | Branch management | `tenancy` | `100100`, `100200`, `100500` policies | `supabase/tests/fr02_branch_scope.sql`, `tenancy.test.ts` | partial (database layer; no branch screens) |
| FR-03 | Staff identity and roles | `identity` | `100000` staff_role, `100300` helpers, `100500` policies | `supabase/tests/fr03_roles_and_no_membership.sql`, `identity.test.ts` | partial (`TODO(FR-03)`: last-owner protection; staff invitation flow not built) |
| FR-04 | POS connector framework | | | | — |
| FR-05 | Automatic order ingestion | | | | — |
| FR-06 | Manual order entry | | | | — |
| FR-07 | Customer QR entry | | | | — |
| FR-08 | Secure order claim | | | | — |
| FR-09 | Multiple customer devices | | | | — |
| FR-10 | Queue status lifecycle | | | | — |
| FR-11 | Employee queue dashboard | | | | — |
| FR-12 | READY notifications | | | | — |
| FR-13 | Customer status page | | | | — |
| FR-14 | Audit history | `audit` | `100400` audit_logs + triggers, `100500` read policy | `supabase/tests/fr14_audit_trail.sql`, `audit.test.ts` | partial (tenancy tables only; order events arrive with the orders module) |
| FR-15 | Restaurant configuration | | | | — |
| FR-16 | SaaS subscription | | | | — |
| FR-17 | Observability | | | | — |
| FR-18 | Localization | `shared` (i18n) | — | `i18n.test.ts` | partial (skeleton: locales, direction, catalogues; Arabic strings are placeholders) |
| FR-19 | Data export/deletion | | | | — |
| FR-20 | Platform support controls | | | | — |

## Critical acceptance scenarios (blueprint §15.2)

| ID | Scenario | Test file | Status |
|---|---|---|---|
| AT-01 | Repeated POS webhook for same order | | — |
| AT-02 | Two restaurants with same ticket number | `supabase/tests/at02_at11_tenant_isolation.sql` (isolation half only; the same-ticket-number half needs the orders table) | partial |
| AT-03 | Unauthorized user guesses ticket number | | — |
| AT-04 | One order followed on several devices | | — |
| AT-05 | Kitchen employee marks READY | | — |
| AT-06 | Cashier marks READY | | — |
| AT-07 | Push provider unavailable | | — |
| AT-08 | Customer denies push permission | | — |
| AT-09 | Two employees act concurrently | | — |
| AT-10 | POS cancellation after READY | | — |
| AT-11 | Cross-tenant API request | `supabase/tests/at02_at11_tenant_isolation.sql` (database/RLS layer only; no API exists yet) | partial |
| AT-12 | Subscription becomes past due | | — |
