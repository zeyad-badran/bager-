# ADR-0006: Customer order claim and multi-device model

- Status: **Open** — the single most important unresolved design (blueprint §9, §23)
- Date: 2026-11-20
- Decided by: pending product owner, with security approval before Phase 5
- Blueprint refs: §9, §4.4, FR-08, FR-09, AT-03, AT-04, risks "Order-number-only claiming", "Ticket number reuse"

## Context
Customers have no accounts. The branch QR identifies only the branch. The customer types an order
number, but an order number can be seen on a receipt, guessed, and reused, so it cannot be proof of
ownership. Several devices must be able to follow one order, and each must be revocable.

## Options considered
1. **Per-order secret on the receipt/ticket** (QR or short code printed by the POS). Strong, depends on
   what the POS can print without changing core behaviour.
2. **Second factor the POS can provide** (customer phone number, unique code). Depends on POS data and
   privacy rules.
3. **Staff-assisted verification** at the counter for customers who cannot complete the claim.
4. **First device claims; short-lived, high-entropy, revocable invitation lets more devices join.**
   Store only a hash of tokens; expiry; one-time or bounded use; device cap (configurable, e.g. five;
   not hard-coded until abuse/cost testing).

Likely a combination: 1 or 2 for the first device, 4 for additional devices, 3 as the fallback.

## Decision
_Open._ Questions to resolve in Phase 2 (blueprint §9.3):
- Can the POS provide a unique QR/barcode, short code, phone number or other verifiable attribute?
- Can the receipt print a per-order secret or claim URL without changing core POS behaviour?
- If there is no second factor, what staff-assisted verification is operationally acceptable?
- How does a second device join, and can the first device revoke it?
- Maximum active devices and session expiry?
- What happens when a ticket number is reused after the earlier order closed?

## Consequences (design constraints already clear)
- Rate-limit lookups and claims by IP/device/session/branch; do not reveal whether an arbitrary order
  number exists (no enumeration).
- Customer reads go through server routes with a signed session token, not direct table access, so RLS
  does not have to model anonymous users (relates to ADR-0001 and the realtime spike).
- Customer session ≠ order ≠ push subscription (blueprint §5.2).

## Evidence needed
Phase 2 claim-token prototype plus the POS provider scorecard; security review before Phase 5.
