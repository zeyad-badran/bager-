# Task specs for Claude Code

One spec = one branch = one small PR. Specs follow the template in `docs/workflow.md`.
Claude chat writes them; Claude Code implements exactly what they say.

## Order of work

| # | Spec | Status | Needs |
|---|---|---|---|
| 1 | [`slice-01-foundation.md`](slice-01-foundation.md) | partly delivered (PR #2) | merge PR #1, then #2 |
| 2 | [`slice-01b-nextjs-scaffold.md`](slice-01b-nextjs-scaffold.md) | ready | network access for npm + Docker |
| 3 | [`slice-02-orders-state-machine.md`](slice-02-orders-state-machine.md) | ready after #1 merged | nothing external |
| 4 | [`spike-claim-token.md`](spike-claim-token.md) | ready | nothing external; decides ADR-0006 |
| 5 | [`spike-anonymous-realtime.md`](spike-anonymous-realtime.md) | ready after 01b | local Supabase |
| 6 | [`spike-web-push.md`](spike-web-push.md) | ready | **owner tests on real phones** |

Specs 3, 4 and 6 are independent and can run in parallel in separate sessions/branches.
Spikes produce a report in `docs/spikes/<name>.md`; Claude chat turns the report into an ADR decision.

## Launch prompt (paste into Claude Code, replace the spec name)

```text
Read CLAUDE.md first, then docs/code-style.md and docs/workflow.md.
Implement docs/prompts/<SPEC>.md exactly as written, on its own branch from main.

Rules for this session:
- Follow the spec's Scope, Out of scope and Acceptance sections literally. If code and docs disagree, or a
  "Stop and ask if" condition is met, stop and ask me before continuing.
- No paid services, no accounts, no production or real credentials, no new dependency the spec does not name.
- Write the tests first where the spec says so. Run `pnpm check` (and `pnpm test:db` if you touched
  supabase/) before saying you are done. Never claim a check passed unless you ran it.
- Migrations are append-only: new files only, never edit an existing one.
- Every file gets the header comment from docs/code-style.md with its FR-/AT- IDs. Update docs/traceability.md.
- Commits: Conventional style with FR-/AT- IDs. Open one small PR.
- Finish with the hand-off block from docs/workflow.md, including everything you could NOT verify.
```
