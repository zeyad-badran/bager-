# Traceability matrix

Maps each requirement in `docs/blueprint.md` to the code, migrations and tests that implement it.
Update this file in the **same PR** that adds the code. A row with no tests is not done.

Status: `—` not started · `spike` evidence only · `partial` · `done`

## Functional requirements (blueprint §5)

| ID | Requirement | Module(s) | Migration(s) | Tests | Status |
|---|---|---|---|---|---|
| FR-01 | Multi-tenant restaurants | | | | — |
| FR-02 | Branch management | | | | — |
| FR-03 | Staff identity and roles | | | | — |
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
| FR-14 | Audit history | | | | — |
| FR-15 | Restaurant configuration | | | | — |
| FR-16 | SaaS subscription | | | | — |
| FR-17 | Observability | | | | — |
| FR-18 | Localization | | | | — |
| FR-19 | Data export/deletion | | | | — |
| FR-20 | Platform support controls | | | | — |

## Critical acceptance scenarios (blueprint §15.2)

| ID | Scenario | Test file | Status |
|---|---|---|---|
| AT-01 | Repeated POS webhook for same order | | — |
| AT-02 | Two restaurants with same ticket number | | — |
| AT-03 | Unauthorized user guesses ticket number | | — |
| AT-04 | One order followed on several devices | | — |
| AT-05 | Kitchen employee marks READY | | — |
| AT-06 | Cashier marks READY | | — |
| AT-07 | Push provider unavailable | | — |
| AT-08 | Customer denies push permission | | — |
| AT-09 | Two employees act concurrently | | — |
| AT-10 | POS cancellation after READY | | — |
| AT-11 | Cross-tenant API request | | — |
| AT-12 | Subscription becomes past due | | — |
