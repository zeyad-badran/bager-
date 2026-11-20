# Spike — Customer claim token prototype (feeds ADR-0006)

Status: ready
Covers: FR-08, FR-09, AT-03, AT-04 (evidence only, nothing ships)
Phase: 2 — Technical feasibility spikes

## Goal
Prove, in code and tests, the security properties of the claim model proposed in ADR-0006
(per-order secret or second factor for the first device; short-lived revocable invitation for more devices;
staff-assisted fallback) so the owner can decide with evidence. Output is a small library plus a report, not product code.

## Read first
`CLAUDE.md`, blueprint §9 and §5.2, risks "Order-number-only claiming" and "Ticket number reuse" (§14/§16), ADR-0006.

## Scope
Branch `spike/claim-token`, code only in `spikes/claim-token/` (pure TypeScript, Node built-ins only: `node:crypto`, `node:test`; no
database, no network, no new dependency). Never imported by product code.
1. Token generation: ≥128-bit random, URL-safe; **store only a hash** (SHA-256 or HMAC with a server key passed in as a parameter;
   no real key in files); constant-time comparison.
2. Claim lookup by `(branch, ticket number, secret)`; the response for "unknown ticket", "wrong secret" and "expired" must be
   **indistinguishable** (no enumeration), also in timing, within a stated tolerance.
3. Ticket-number reuse: a claim bound to the *order instance*, so a reused number never resolves to the old order and an old
   token never unlocks the new order.
4. Additional devices: first device creates a short-lived (configurable TTL), bounded-use invitation; each joined device gets its
   own session; first device can revoke one device; device cap is a **parameter**, not a constant.
5. Rate limiting: an in-memory sliding-window limiter keyed by IP/device/branch with injectable clock; show that guessing
   10,000 six-digit codes is stopped long before it succeeds.
6. Staff-assisted fallback: a staff-issued one-time code with short TTL, usable once, audited event emitted.
7. Tests (`node:test`, names with AT-03/AT-04): the cases above plus replay, expiry boundaries, revoked device, cap reached,
   reused ticket, tampered token.
8. **Report** `docs/spikes/claim-token.md`: what was proven, measured entropy and guess-resistance numbers (computed, not
   estimated), which POS-provided attributes each option needs (open questions for the POS scorecard), a recommendation with
   trade-offs, and the data each option would store (minimum, privacy).

## Out of scope
Schema or migrations, HTTP routes, cookies/JWT libraries, UI, push, real POS calls, any decision written into an ADR (Claude chat does that).

## Acceptance
- `tsx --test "spikes/claim-token/**/*.test.ts"` passes; the report lists the exact command.
- `pnpm check:boundaries` and `pnpm check:secrets` pass (spikes still need the header comment).
- Report states clearly what was **not** tested.

## Stop and ask if
- You find a way to satisfy the model only by storing raw tokens or customer phone numbers.
- You need a dependency, a database or a network call.
