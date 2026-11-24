# Spike report: customer claim token (evidence for ADR-0006)

- Spec: [`docs/prompts/spike-claim-token.md`](../prompts/spike-claim-token.md)
- Code: [`spikes/claim-token/`](../../spikes/claim-token) (throwaway; never imported by product code)
- Serves: FR-08, FR-09, AT-03, AT-04 · blueprint §9, §5.2 · risks "Order-number-only claiming", "Ticket number reuse"
- Date and machine: 2026-11-24, Windows 11, Node 24.18.0, in-process only (no database, no network)
- Status: **evidence only**. Nothing here is a decision; ADR-0006 stays Open until Claude chat and the owner decide.

## How to run

```
pnpm exec tsx --test "spikes/claim-token/**/*.test.ts"    # 52 tests, all pass
pnpm exec tsx spikes/claim-token/print-numbers.ts         # prints every number in "Numbers" below
pnpm exec tsc -p spikes/claim-token                       # strict type check of the spike
```

The spec's acceptance command is `tsx --test "spikes/claim-token/**/*.test.ts"`. `tsx` is a repo devDependency, so it runs as
`pnpm exec tsx ...` (or `npx tsx ...`).

## The model that was built

| Piece | How it works |
|---|---|
| Receipt secret (first device) | Per **order instance**: a 256-bit URL-safe token for a QR/link, or a short numeric code if the POS can only print digits. Returned once to print; only `HMAC-SHA256(server key, secret)` is kept. **Single-use**: consumed by the first successful claim. Expires after a configurable TTL or when the order closes. |
| Claim | `(branch, ticket number, secret)`. One HMAC, then a constant-time comparison against every order that used that number in that branch (or one dummy), no early exit. Every failure returns the same `CLAIM_FAILED`. |
| Device session | Each device gets its own 256-bit session token (stored as HMAC), bound to the order's internal id, with its own expiry and revocation. |
| More devices | Only the first device can create an invitation: 256-bit, configurable TTL, configurable max uses. Joining opens a new session. The device cap is a parameter. |
| Revocation | The first device can revoke any other device of the same order (not itself). Revoked sessions stop resolving at once; the others are untouched. |
| Staff fallback | Staff issue a one-time numeric code for an open order. It is valid only in that branch, has a short TTL, works once, and is stored as HMAC. Issue and redeem emit audit events with ids only. |
| Rate limiting | In-memory sliding-window log keyed by IP, device and branch, injectable clock. An attempt must pass every key and is counted against all of them; a blocked attempt is counted against none. |

## What was proven (tests)

| Spec item | Proven | Test file |
|---|---|---|
| 1 Token generation, hash only, constant-time compare | ≥128-bit (default 256), base64url, no repeats in 10,000; HMAC under a key passed as a parameter (random per test run, no key in files); different-length buffers compare false without throwing | `secrets.test.ts` |
| 2 No enumeration | Unknown ticket, wrong secret, expired, already used, closed order and wrong branch return a byte-identical answer | `claim.test.ts` |
| 2 Timing | Medians of unknown ticket / wrong secret / expired within the stated tolerance (see Numbers) | `timing.test.ts` |
| 3 Ticket-number reuse | A reused number gets a new order instance and secret; the old secret fails on the new order; an old session still points at the old order; two open orders with the same number are told apart by their own secrets | `claim.test.ts` |
| 4 Additional devices | Own session per device; invitation TTL boundary (works at TTL−1 ms, fails at TTL); max uses (replay of the invite); cap reached with `deviceCap = 2` and accepted with `deviceCap = 4`; revoking frees a place; only the first device invites and revokes; no cross-order revocation; session expiry boundary | `devices.test.ts` |
| 5 Rate limiting | Window slides at exactly `windowMs`; keys independent; multi-key rule; 10,000 six-digit guesses: see Numbers | `rate-limiter.test.ts` |
| 6 Staff fallback | Single use; TTL boundary; branch-bound; not issuable for a closed order; rate limited; audit events never contain the code | `staff-fallback.test.ts` |
| 7 Replay, expiry, revoked, cap, reuse, tampered | Receipt-secret replay fails; tampered secret, session and invite tokens fail | spread over the files above |
| 8 Numbers | Computed by `numbers.ts`, unit-tested in `numbers.test.ts`, printed by `print-numbers.ts` | below |

A mutation check on a throwaway copy proved the timing test can fail: an early return for "unknown ticket" (before the HMAC)
made `timing.test.ts` fail, answering in 300 ns against about 25,000 ns.

## Numbers (computed, from `print-numbers.ts` and the test diagnostics)

**Entropy**

| Secret | Bits | Possible values |
|---|---|---|
| QR/link token, 16 bytes | 128.00 | 3.403e+38 |
| QR/link token, 32 bytes (default) | 256.00 | 1.158e+77 |
| Typed code, 6 digits | 19.93 | 1.000e+6 |
| Typed code, 8 digits | 26.58 | 1.000e+8 |

**Limiter used for the numbers** (a proposal for testing, not a decision): 10 attempts per IP and per device, and 300 per
branch, per 15-minute sliding window. Attempts let through (upper bound):

| Period | One IP/device | Whole branch, attacker rotating IPs and devices |
|---|---|---|
| Staff code TTL, 5 min | 10 | 300 |
| Receipt secret TTL, 2 h | 90 | 2,700 |
| 24 h | 970 | 29,100 |

**Brute-force simulation** (spec item 5): 10,000 different six-digit guesses at one ticket, 10 per second (about 17 minutes,
two windows), the real code placed last:

| Attacker | Guesses that reached the secret check | Succeeded |
|---|---|---|
| One IP and device | 20 of 10,000 | no |
| New IP and device for every guess | 600 of 10,000 (the branch key stops it) | no |
| No limiter at all (computed) | 10,000 | 1.00 % chance |

**Chance of guessing one given order's secret** (upper bound, guessing without repeats):

| Secret | Within 2 h, one IP | Within 2 h, rotating IPs | Within 24 h, rotating IPs |
|---|---|---|---|
| Token, 128 bits | 2.64e-37 | 7.93e-36 | 8.55e-35 |
| Token, 256 bits | 7.77e-76 | 2.33e-74 | 2.51e-73 |
| Code, 6 digits | 0.009 % | **0.27 %** | 2.91 % |
| Code, 8 digits | 0.00009 % | 0.0027 % | 0.029 % |

The receipt secret is single-use and normally consumed within minutes, so the 2-hour column is already pessimistic. Spreading
guesses over several tickets does not help an attacker: each guess is checked only against secrets of orders with that ticket
number, so the chance per guess stays 1 in (number of possible secrets).

**Timing** (stated tolerance: medians may differ by at most 10 % of the slowest median, or 2 µs, whichever is larger; 3,000
interleaved runs per case after 500 warm-up runs; the limiter is excluded because it does the same work for every case):

| Run | Unknown ticket | Wrong secret | Expired | Spread | Allowed |
|---|---|---|---|---|---|
| Five separate runs | 23.7–25.8 µs | 24.2–26.3 µs | 24.2–26.3 µs | 0.4–0.7 µs | 2.4–2.6 µs |
| Inside the full suite (busier process) | 45.8 µs | 46.8 µs | 46.0 µs | 1.0 µs | 4.7 µs |

"Unknown ticket" is consistently about 0.5 µs (about 2 %) faster, most likely a map miss against the dummy entry. Over a network
that difference sits under milliseconds of jitter, and the limiter allows at most 10 attempts per IP per 15 minutes, far too
few samples to measure 0.5 µs. Worth re-measuring on real infrastructure, not treated as a finding.

## What each option needs from the POS (open questions for the POS scorecard)

| Option (ADR-0006) | Needs from the POS or restaurant | Open questions |
|---|---|---|
| 1a Per-order QR/link on the receipt (256-bit token) | Print a per-order QR code or URL; tell us the ticket number **and** a stable per-order id when the order is created (to bind the secret to the order instance) | Can the receipt template print a QR/URL we supply at order creation, without changing core POS behaviour? How fast does the POS call us (the secret must exist before printing)? |
| 1b Per-order short code on the receipt (6–8 digits) | Print a short code; same order-creation event | Can it print 8 digits instead of 6? Is a second printed line acceptable? |
| 2 Second factor from the POS (for example phone number) | Customer phone number or loyalty id per order | Not built: it would mean storing phone numbers (see "Stop and ask"); privacy rules per country |
| 3 Staff-assisted | Staff on a screen we provide (no POS change) | Is a 6-digit code read out at the counter acceptable operationally? Which roles may issue it? |
| 4 Invitations for more devices | Nothing from the POS | Device cap and session length (product decision) |

## Recommendation (for Claude chat and the owner; not a decision)

1. **First device: option 1a**, a 256-bit QR/link per order, printed on the receipt, single-use, bound to the order instance.
   Guessing is out of reach regardless of limits, and the customer does not type anything. Where the POS can print only text,
   use **option 1b with 8 digits**, not 6: with rotating IPs the 2-hour guess chance drops from 0.27 % to 0.0027 %.
2. **More devices: option 4**, invitations from the first device (short TTL, bounded use, revocable, cap as a setting).
3. **Fallback: option 3**, staff code, for customers without a printable receipt or whose secret was consumed or lost.
4. **Do not rely on option 2** unless the POS scorecard shows phone numbers are already present and privacy review allows it.

Trade-offs:
- **Branch-wide limit vs availability:** the branch key is what stops a rotating-IP attacker, but an attacker can also use
  it up and block real customers of that branch for one window. Option 1a does not need the branch key at all (256-bit
  secret), so it avoids this trade-off. Codes (1b, 3) need it.
- **Single-use receipt secret:** a photo of the receipt is useless after the claim, but a customer whose phone dies needs an
  invitation from another device or the staff fallback.
- **Blocked attempts are not counted:** a shared IP (a mall's Wi-Fi) is not locked out by one noisy device, but a persistent
  attacker gets a new allowance every window. The numbers above already include that.
- **In-memory limiter:** fine for a spike. Several server instances need a shared store; that belongs to ADR-0003/0004.

## Data each option would store (minimum, privacy)

| Option | Stored per order | Never stored |
|---|---|---|
| 1a / 1b receipt secret | HMAC of the secret, order id, branch id, expiry, consumed-at | The secret itself (it exists only on the receipt) |
| 4 device sessions | Per device: HMAC of the session token, order id, primary flag, expiry, revoked-at; invitations: HMAC, expiry, uses | Raw tokens, device fingerprints, IP addresses beyond the rate-limit window |
| 3 staff code | HMAC of (branch, code), order id, issuing staff id, expiry, used-at; audit events with ids only | The code itself, in storage or in audit events |
| Rate limiter | Attempt timestamps per IP/device/branch key, kept only for the window | Anything after the window |
| 2 phone factor | (not built) phone number or a hash of it | — |

No customer name, phone number or payment data is needed for options 1, 3 or 4. The server key is a parameter from the host's
secret store; rotating it invalidates live secrets and sessions, which needs a migration plan before production.

## Not tested

- **Real network timing**, real servers, TLS, a load balancer, or many concurrent requests. Timing was measured in-process only.
- **Persistence**: no database, no multi-instance limiter, no restart behaviour. Everything is in memory.
- **HTTP layer**: cookies, headers, CSRF, how IP and device id are taken from a request, proxies (`X-Forwarded-For`).
- **Real POS behaviour**: whether any POS can print a per-order QR/code, and how fast it notifies us.
- **Key rotation and key management.**
- **Phone-number factor (option 2)**: not built, by design (it would store customer phone numbers; spec "Stop and ask").
- **Usability**: QR scanning on real phones, typing codes, staff workflow at a busy counter.
- **Abuse detection beyond rate limits** (enumeration pattern alerts, blocking lists).
- **Side channels other than timing** (response size, logging).
