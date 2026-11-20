## What and why
<!-- One or two sentences. Link the task spec in docs/prompts/ and the FR-/AT- IDs it covers. -->

Spec: `docs/prompts/…`
Covers: FR-…, AT-…

## Changes
<!-- Modules, migrations, key files. -->

## Verify
<!-- Exact commands/steps the reviewer should run. -->

## Gate checklist (tick or write N/A)
- [ ] Schema / RLS / auth change — migration is a **new** file; RLS and tenant tests included and passing
- [ ] New dependency or tool — justified below
- [ ] No secrets, production credentials or real customer data in the diff; `.env.example` updated if needed
- [ ] No paid service created or upgraded
- [ ] Docs/ADR updated if a decision changed
- [ ] Hand-off block (see `docs/workflow.md`) posted

## Deviations from the spec / open questions
<!-- "None" if none. -->
