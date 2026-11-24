# ADR-0006: Customer order claim and multi-device model

- Status: **Accepted** by the product owner on 2026-11-24, with a risk the owner has knowingly accepted (see Decision)
- Date: 2026-11-20
- Decided by: product owner (2026-11-24). The recommended hardening is **deferred, not rejected**: see `docs/future-plan.md`
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
**The customer claims an order with the branch QR plus the order number alone.** The branch QR identifies the branch,
the customer types the order number, and the page then follows that order and notifies the phone when staff mark it READY.
No pickup code and no per-order QR in the first version.

**Owner-accepted risk (blueprint §9, FR-08, AT-03):** the spike (`docs/spikes/claim-token.md`) recommended a second factor.
The owner decided to start without it, on the expectation that restaurants use long alphanumeric order numbers. The risk is
that an order number is not a secret: it can be read off a receipt or screen, may be sequential, and short queue numbers
(1 to 3 digits) are easy to guess. Someone who obtains a number can follow, and be notified for, another customer's order.
The owner will fix this later if a client or a security review asks for it (`docs/future-plan.md`).

**Safeguards that stay mandatory** (they cost the customer nothing and limit the damage):
- Rate-limit lookups and claims by IP, device and branch. Do not reveal whether an order number exists: unknown number,
  wrong branch and closed order all return the same response, in the same time (reuse the spike's library design).
- A claim binds to the **order instance**, never just the number, so a reused number cannot open an old order and an old
  claim cannot follow a new one. A claim ends when the order is COLLECTED or CANCELLED.
- Customers never read tables directly. Reads go through server routes with a signed, revocable session token.
- No endpoint lists or searches orders. Show the customer only their own order's status, never other customers' numbers.
- A device cap per order (a setting, not a constant). Extra phones simply claim the same way, so the invitation mechanism
  (option 4) is not needed yet.
- Audit claims with ids only, never the order number in logs beyond what the order record already holds.

**Compensating control, owner decision 2026-11-24: receipt check at pickup.** The customer shows the receipt when collecting and
staff check that its order number matches before handing over the food. This protects what matters most (the food goes
only to the person holding the receipt), so a stranger who followed someone else's order gains nothing physical.
What it does **not** cover: a stranger still sees that order's status and gets its alert, and could use up the per-order
device cap before the real customer claims. Those are accepted as low impact for v1.
Product consequence: the staff screen shows the order number large and clear, and marking COLLECTED is a deliberate action
taken after the receipt check. The check is an operating procedure, not something the software can enforce, so it belongs
in the restaurant onboarding checklist.

Because the order number is the only factor, **ticket-number quality is the restaurant's security level.** The product must
not claim stronger security than that, and must say so in the pilot onboarding.

## Questions still open (not blocking)
- Can a restaurant be forced to use a minimum ticket length or randomness? (A cheap future guard; see future plan.)
- Maximum active devices and session expiry values (settings, to be chosen with real data).

## Consequences (design constraints already clear)
- Rate-limit lookups and claims by IP/device/session/branch; do not reveal whether an arbitrary order
  number exists (no enumeration).
- Customer reads go through server routes with a signed session token, not direct table access, so RLS
  does not have to model anonymous users (relates to ADR-0001 and the realtime spike).
- Customer session ≠ order ≠ push subscription (blueprint §5.2).

## Evidence
Claim-token spike report `docs/spikes/claim-token.md` (PR #10). A security review is still required before the pilot, and it must
confirm the owner-accepted risk above or trigger the hardening in `docs/future-plan.md`.
