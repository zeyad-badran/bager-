# Spike — Web Push and vibration on real devices (feeds notification compatibility matrix, ADR-0004)

Status: ready — Claude Code builds the harness, **the product owner runs it on real phones**
Covers: FR-12, AT-07, AT-08 (evidence only)
Phase: 2 — Technical feasibility spikes

## Goal
Replace assumptions about browser notifications with evidence: what works on real iPhone and Android devices, in which browsers,
installed or not, screen locked or not. Also prove the retry/idempotency behaviour with a fake provider (ADR-0004 PoC part).

## Read first
`CLAUDE.md`, blueprint §5 FR-12, §7.4, §13 (notifications), ADR-0004, AT-07, AT-08.

## Scope
Branch `spike/web-push`, code in `spikes/web-push/` (standalone, throwaway; **local, synthetic**).
1. A minimal page + service worker: ask permission (from a user tap), subscribe, show the endpoint type, and display the
   permission state clearly (granted / denied / unsupported / needs "Add to Home Screen").
2. A tiny Node sender using the `web-push` package (Claude Code: **ask before adding it**, it is the only dependency expected) with
   VAPID keys **generated locally into an ignored `.env.local`**, never committed.
3. A button to send: plain notification, notification with `vibrate`, notification with `requireInteraction`, and a
   "tab closed / screen locked" instruction for the tester.
4. A **fake push provider** and a minimal outbox loop in the sender to prove ADR-0004 behaviour: at-least-once delivery, idempotency
   key so READY is sent once, retry with backoff and jitter, permanent error (410/404) disables the subscription, retryable error
   (429/5xx) retries, dead-letter list visible. Unit tests with `node:test`.
5. A **test matrix template** `docs/spikes/web-push-matrix.md` for the owner to fill: device, OS version, browser, installed to
   home screen (yes/no), permission result, notification shown (foreground / background / locked), vibration, sound, tap opens the page,
   time to arrival. Include step-by-step tester instructions and the HTTPS requirement.
6. Report `docs/spikes/web-push.md`: what the harness proves, what remains for devices, and the **claims we must not make** until the matrix is filled
   (CLAUDE.md: never claim delivered/seen without proof).

## Out of scope
Product code, schema, real READY events, any customer data, hosted services, paid tunnels or accounts.

## Acceptance
- `tsx --test "spikes/web-push/**/*.test.ts"` passes.
- `pnpm check:secrets` passes and `git status` shows no key material.
- The matrix and instructions are good enough for a non-developer to run on a phone.

## Stop and ask if
- Phones need a public HTTPS URL: **ask the owner** which free, account-less option is acceptable (e.g. a quick tunnel) before using any.
- You are about to create an account or use a paid service.
