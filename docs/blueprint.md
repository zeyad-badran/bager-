# Restaurant Queue & Digital Pager SaaS

_Product blueprint • Product requirements • Architecture • Security • Delivery roadmap_

**Planning and engineering master document**

Prepared from the project discussions and expanded with the product, technical, operational, security, QA, and commercial considerations needed to take the idea through discovery, MVP, pilot, and launch.

| Item | Value |
|---|---|
| Document version | 1.0 — Consolidated planning baseline |
| Prepared | 20 November 2026 |
| Product stage | Discovery / pre-build planning |
| Implementation status | Not started by this document; planning only |
| Initial platform | Web-only customer and restaurant experiences |
| Commercial model | Restaurant SaaS subscription |

> IMPORTANT PROJECT GUARDRAIL: This document is a planning blueprint, not authorization to begin implementation, create accounts, activate paid services, purchase subscriptions, or deploy production infrastructure. Any paid commitment requires explicit approval.

Prepared for internal product planning. Decisions are labeled as confirmed, recommended, or open so that proposals are not mistaken for approvals.

## Contents

- [1. Executive summary](#1-executive-summary)
- [2. Product vision, users, and scope](#2-product-vision-users-and-scope)
- [3. Confirmed decisions and open decisions](#3-confirmed-decisions-and-open-decisions)
- [4. End-to-end workflows](#4-end-to-end-workflows)
- [5. Functional requirements](#5-functional-requirements)
- [6. Non-functional requirements and quality targets](#6-non-functional-requirements-and-quality-targets)
- [7. Technical architecture](#7-technical-architecture)
- [8. Data architecture and database design](#8-data-architecture-and-database-design)
- [9. Customer order claiming and abuse prevention](#9-customer-order-claiming-and-abuse-prevention)
- [10. Web notifications and device compatibility](#10-web-notifications-and-device-compatibility)
- [11. Employee dashboard and restaurant administration](#11-employee-dashboard-and-restaurant-administration)
- [12. POS integration strategy](#12-pos-integration-strategy)
- [13. SaaS business model and commercial design](#13-saas-business-model-and-commercial-design)
- [14. Security, privacy, and compliance](#14-security-privacy-and-compliance)
- [15. QA, testing, and acceptance strategy](#15-qa-testing-and-acceptance-strategy)
- [16. Delivery roadmap — phased project plan](#16-delivery-roadmap--phased-project-plan)
- [17. MVP definition proposal](#17-mvp-definition-proposal)
- [18. Operations, support, and launch readiness](#18-operations-support-and-launch-readiness)
- [19. Tooling and service choices](#19-tooling-and-service-choices)
- [20. Risk register and mitigations](#20-risk-register-and-mitigations)
- [21. Decision log and next actions](#21-decision-log-and-next-actions)
- [22. Glossary](#22-glossary)
- [23. Final recommendation](#23-final-recommendation)

## 1. Executive summary

The product is a web-based restaurant queue and order-ready notification service intended to replace physical customer pagers/buzzers. It connects a restaurant’s existing point-of-sale (POS) order flow—or a manual employee workflow—to a customer-facing mobile web page. Customers scan a branch QR code, identify their order, register one or more devices, and receive a ready notification when authorized staff update the order.

The product is intended to be sold globally as a SaaS subscription. It must support multiple restaurants, branches, POS providers, manual order entry, multiple customer devices per order, and a web-only experience at launch. It should not require customers to install a native app or create a conventional customer account.

> Core product promise: let restaurants notify customers that an order is ready without handing out, charging, cleaning, or maintaining physical pagers.

### 1.1 What success looks like

- A restaurant can onboard a branch, configure its queue, connect a supported POS or use manual entry, and display its own QR code.
- A customer can scan the QR code, securely claim the correct active order, follow its status, and register more than one device if allowed.
- Authorized staff can move orders through a controlled lifecycle, with a clear audit trail and protection against conflicting actions.
- When an order becomes READY, the system attempts supported notifications and shows an in-page status update; it does not claim guaranteed vibration or delivery on every device.
- POS outages, webhook retries, customer disconnections, and push failures do not corrupt the order state or create duplicate queue entries.
- Restaurant data is isolated by tenant and branch, and subscriptions enforce plan entitlements.

### 1.2 Current stage

The project is in planning only. A working PRD draft and architecture direction have been discussed, but the PRD, architecture choices, security model for customer order claiming, first POS connector, target pilot country, and MVP acceptance criteria still require explicit decisions.

## 2. Product vision, users, and scope

### 2.1 Product vision

Provide a reliable, low-friction digital alternative to physical restaurant pagers. The restaurant keeps its POS and normal ticket-printing workflow; the service adds an order-status and customer-notification layer rather than attempting to replace the POS.

### 2.2 Primary users

| User | Needs / responsibilities |
|---|---|
| Customer | Scan branch QR, identify their active order, view status, register supported devices, receive READY notification, collect order. |
| Kitchen employee | View queue, start preparation, mark order READY where permission is granted. |
| Cashier / front-of-house employee | Create or reconcile manual orders, monitor queue, mark READY where permission is granted, mark COLLECTED if authorized. |
| Restaurant / branch manager | Configure branch, employees, roles, QR, POS integration, queue settings, review history and basic analytics. |
| Restaurant owner / billing admin | Manage restaurant account, branches, subscription, invoices, payment method, and account lifecycle. |
| Platform support / administrator | Support onboarding and incidents with tightly controlled, audited platform-level access. |

### 2.3 Product boundaries

| In scope for the product direction | Not assumed for the initial release |
|---|---|
| Web customer experience; restaurant dashboard; multi-tenant SaaS; POS connector framework; manual order entry; Web Push where supported; QR onboarding. | Native iOS/Android apps; replacing a POS; payment processing for restaurant orders; table reservations; delivery dispatch; full kitchen display system. |
| Multiple branches, role-based staff access, order status history, audit logs, subscription entitlements. | Universal integration with every POS at launch; guaranteed vibration on every phone/browser; customer profiles or loyalty accounts. |

### 2.4 Product principles

- POS-agnostic core: POS-specific details stay inside provider adapters.
- Own the service database: do not make the product depend on direct access to a restaurant’s internal POS database.
- Secure by design: an order number is an identifier, not a secret or proof of ownership.
- Graceful degradation: manual entry and visual status remain useful when an integration or push channel fails.
- No false guarantees: distinguish notification queued, accepted by push provider, delivered where observable, and seen by the customer.
- Web-first: customers should not need to install an app; browser and OS limitations must be explained honestly.
- Global-ready architecture, controlled market rollout: internationalization from the start does not mean launching everywhere simultaneously.

## 3. Confirmed decisions and open decisions

### 3.1 Decisions explicitly supplied by the product owner

| Area | Confirmed decision |
|---|---|
| POS strategy | Support multiple POS providers over time. |
| Order ingestion | Both automatic POS synchronization and manual employee entry. |
| READY authority | Both kitchen employees and cashiers may mark orders READY, subject to role permissions. |
| Business model | SaaS subscription. |
| Customer entry | Customer enters an order number; the security design for validating/claiming it remains unresolved. |
| Multiple devices | YES — more than one customer device may follow the same order. |
| Platform | WEB ONLY for the initial product; no native mobile app requirement. |
| Market ambition | GLOBAL from the beginning, with a practical staged rollout recommended. |

### 3.2 Recommended direction — not yet an approved decision

| Topic | Recommendation | Why |
|---|---|---|
| Application architecture | Modular monolith, not microservices. | Lower complexity for an early team while preserving module boundaries. |
| Backend baseline | Next.js + TypeScript with Supabase/PostgreSQL; server-side domain services. | One coherent web stack with managed database, auth, RLS, and realtime options. |
| POS integrations | Independent adapter per POS provider. | Keeps vendor schemas and failure behavior out of the core order engine. |
| Hosting | Vercel + Supabase as a starting candidate. | Fast deployment path; validate region, reliability, pricing, and compliance before commitment. |
| Background processing | Use a durable managed job/queue service after a short evaluation; alternatively a dedicated worker if justified. | Retries, scheduling, and asynchronous delivery should not be hidden inside request handlers. |
| Languages | Design internationalization from day one; English and Arabic are candidate first languages. | Supports LTR/RTL and future localization without rewriting interfaces. |
| Initial customer-device cap | Consider a configurable limit (for example, five active devices per order), but do not hard-code until abuse/cost testing. | Limits accidental or malicious fan-out while allowing family/group use. |
| Customer claim model | Use a secure claim token or equivalent verification, with controlled sharing for additional devices. | Order number alone is guessable and may repeat. |

### 3.3 Open decisions requiring product-owner approval

- Choose the initial POS provider(s) for the first integration; identify exact product editions and API capabilities.
- Approve the customer order-claiming model, including how the first device claims an order and how additional devices join.
- Choose the first pilot country and the first restaurant segment (quick service, food court, café, fast casual, etc.).
- Confirm initial languages and whether English + Arabic are the first launch pair.
- Set device limits, session expiry, and behavior after READY, COLLECTED, or CANCELLED.
- Define employee roles, who can cancel/reopen/collect orders, and manager override rules.
- Decide whether customer push permission is optional or required for a particular experience; recommended: optional with a useful visual fallback.
- Choose subscription billing provider only after country availability, merchant onboarding, tax, currency, and payout checks.
- Define retention periods for customer sessions, order records, notification logs, and audit/security logs.
- Approve hosting region, data residency approach, backup objectives, and incident response expectations.
- Approve the final MVP scope, acceptance criteria, and success metrics.
- Confirm whether restaurant branding is limited to logo/colors or includes custom domains and deeper white-labeling.

## 4. End-to-end workflows

### 4.1 Restaurant onboarding

- Owner creates a restaurant workspace and verifies ownership/contact information.
- Owner creates one or more branches, sets time zone, locale, display name, operating settings, and staff access.
- Manager configures queue rules and creates/downloads the branch-specific QR destination.
- Restaurant chooses POS integration if supported, or enables manual order entry.
- Integration credentials are stored encrypted and scoped to the restaurant/branch; connection is tested before activation.
- Staff receive invitations and role assignments; onboarding ends with a test order and test customer session.

### 4.2 POS-to-customer workflow

| Step | System behavior |
|---|---|
| 1. POS order created | Restaurant POS remains the system of record for its sale. It sends an event/webhook or the connector retrieves the order. |
| 2. Normalize and validate | Provider adapter maps vendor payload to the canonical internal order contract; validate branch, external ID, amount-independent fields, status, and timestamps. |
| 3. Idempotent ingest | Deduplicate using provider + branch + external order ID (and event identity where available); record source and integration event. |
| 4. Queue order | Create or update the internal order and queue state. Keep POS state and queue state distinct. |
| 5. Customer scans QR | QR identifies restaurant/branch, not a secret. Customer enters order number and completes the approved claim verification. |
| 6. Register devices | Create customer session(s) and push subscriptions per device, subject to rate limits and configured caps. |
| 7. Staff updates status | Authorized employee moves order through allowed transition; write status, actor, timestamp, and audit event atomically. |
| 8. Notify | READY event is written to transactional outbox; worker dispatches push and other enabled channels with retries and idempotency. |
| 9. Collect and expire | Staff marks COLLECTED; customer view changes; sessions/subscriptions expire or are cleaned up under defined retention policy. |

### 4.3 Manual order workflow

An authorized employee creates a manual order when POS synchronization is unavailable or the restaurant is not integrated. The manual order must use the same canonical order model, queue state machine, audit trail, notification pipeline, and duplicate-prevention rules as POS-originated orders. The UI must clearly identify its source as MANUAL.

### 4.4 Multiple devices

The model must support one order with multiple customer sessions and multiple push subscriptions. Device registration is not equivalent to creating another order. A device can be revoked independently. The product must define whether a shared invitation is transferable, how long it remains valid, and how many active devices are allowed.

### 4.5 Failure and recovery

- If the POS webhook is delayed or unavailable, show integration health and allow manual entry if the restaurant's operating procedure permits.
- If a webhook is retried, idempotency prevents duplicate queue orders.
- If the customer refreshes or reconnects, the server returns the latest authorized order status.
- If push permission is denied or revoked, the customer page continues to show live status while open.
- If push dispatch fails, READY remains committed; the notification worker retries according to policy and records the outcome.
- If two employees update an order simultaneously, the server accepts only a valid transition based on the current version/state.

## 5. Functional requirements

| ID | Requirement | Description | Priority |
|---|---|---|---|
| FR-01 | Multi-tenant restaurants | Platform supports many independent restaurant tenants with strict data isolation. | Must |
| FR-02 | Branch management | Restaurant can create/manage branches, time zones, QR destination, settings, and staff access. | Must |
| FR-03 | Staff identity and roles | Employees authenticate; permissions are enforced server-side and scoped to restaurant/branch. | Must |
| FR-04 | POS connector framework | Support multiple provider adapters with secure credential handling and health status. | Must |
| FR-05 | Automatic order ingestion | Receive POS events or poll supported APIs; normalize, validate, deduplicate, and reconcile. | Must for integrated pilot |
| FR-06 | Manual order entry | Authorized staff can create and manage orders manually. | Must |
| FR-07 | Customer QR entry | Branch QR opens a mobile web experience with restaurant identity and order entry. | Must |
| FR-08 | Secure order claim | Verify the customer is entitled to follow the order; order number alone is insufficient as a security factor. | Must |
| FR-09 | Multiple customer devices | Allow multiple authorized devices to follow one order; support revocation and limits. | Must |
| FR-10 | Queue status lifecycle | Support NEW, PREPARING, READY, COLLECTED, and CANCELLED with controlled transitions. | Must |
| FR-11 | Employee queue dashboard | Show orders by status and allow authorized updates with conflict protection. | Must |
| FR-12 | READY notifications | Attempt supported push notifications and show status in the web page; record dispatch attempts. | Must |
| FR-13 | Customer status page | Show current status, order reference, branch identity, and accessible visual feedback. | Must |
| FR-14 | Audit history | Record staff actions, status changes, sensitive admin actions, and integration events. | Must |
| FR-15 | Restaurant configuration | Manage branding basics, queue settings, QR, integrations, and employee access. | Must |
| FR-16 | SaaS subscription | Support plans, entitlements, billing lifecycle, usage controls, and account status. | Must before co mmercial launch |
| FR-17 | Observability | Provide logs, metrics, alerts, and integration/notification health visibility. | Must before pilot |
| FR-18 | Localization | Support locale-aware formatting, translation, RTL, and branch time zones. | Must in arc hitecture; launch languages to confirm |
| FR-19 | Data export/deletion | Provide controlled export and deletion workflows consistent with legal retention duties. | Must before public launch |
| FR-20 | Platform support controls | Provide audited, least-privilege support access and incident tools. | Should |

### 5.1 Order lifecycle and transition rules

| Current state | Allowed next state(s) | Notes |
|---|---|---|
| NEW | PREPARING, CANCELLED | A new POS/manual order enters NEW unless provider mapping supports another verified initial state. |
| PREPARING | READY, CANCELLED | READY can be set by authorized kitchen staff or cashier, as decided. |
| READY | COLLECTED | Do not resend READY notification on duplicate events or repeated clicks. |
| COLLECTED | None by default | Terminal state. Any correction/reopen path must be restricted, reasoned, and audited. |
| CANCELLED | None by default | Terminal state. Define POS cancellation reconciliation and customer messaging. |

Recommended implementation: enforce transitions in a server-side domain service and database transaction. A client-side button state is not a security boundary. Use optimistic concurrency/version checks so that two staff members cannot silently overwrite each other.

### 5.2 Important distinctions

- POS order status is not necessarily the same as queue status; map only known provider states.
- A ticket number is a display/reference value, not an internal database key.
- A customer session is not the order itself.
- A push subscription is a device endpoint, not a customer identity.
- READY is a committed business state; push delivery is a separate asynchronous outcome.

## 6. Non-functional requirements and quality targets

The following are proposed planning targets from the discussions, not measured guarantees. They should be validated against pilot conditions and revised using evidence.

| Quality area | Proposed target / requirement | Validation |
|---|---|---|
| Customer performance | Representative mobile customer page loads in under 2.5 seconds at agreed test conditions. | Real-device Lighthouse/performance tests; define network and percentile. |
| Dashboard freshness | Order updates visible to connected staff dashboard in under 1 second under normal pilot load. | Realtime integration tests and latency telemetry. |
| Notification dispatch | Begin dispatch within 3 seconds of READY commit under normal conditions. | Measure outbox-to-provider acceptance latency; separate provider latency. |
| POS sync | Supported webhook event normalized and committed within 5 seconds under normal conditions. | Provider sandbox and integration telemetry. |
| Availability | 99.9% monthly service availability is a proposed commercial target, not an MVP guarantee until infrastructure and support are proven. | SLO definitions, uptime monitoring, incident records. |
| Data integrity | No duplicate active queue order from repeated delivery of the same provider event. | Idempotency and replay tests. |
| Security | No cross-tenant/branch data access; least privilege; secret management; audit of sensitive actions. | RLS tests, authorization tests, penetration testing. |
| Accessibility | Target WCAG 2.2 AA for customer and staff critical flows. | Automated checks plus keyboard and screen-reader review. |
| Compatibility | Test current supported Safari/iOS, Chrome/Android, and desktop browsers; publish support matrix. | Real-device matrix, not emulator-only. |
| Maintainability | Typed contracts, migrations, automated tests, modular boundaries, documented operational runbooks. | Code review and CI gates. |

### 6.1 Reliability definitions

- API accepted: the application received and validated the request.
- State committed: the database transaction successfully persisted the order transition.
- Notification queued: an outbox/job record is durably stored.
- Push accepted: the push provider accepted the message for processing.
- Delivered/displayed/seen: only claim these when a platform provides reliable evidence; do not infer them from provider acceptance.
- Vibration: browser/OS/device dependent; never make it a universal guarantee.

## 7. Technical architecture

### 7.1 Recommended high-level architecture

> Recommended baseline (pending approval): modular monolith + independent POS adapters + durable background worker. Avoid microservices for the first product version.

| Layer | Candidate responsibility / technology |
|---|---|
| Web applications | Next.js + TypeScript: customer mobile web, employee dashboard, restaurant administration, platform administration. |
| UI system | Tailwind CSS + shadcn/ui or an equivalent accessible component system; responsive and RTL-aware. |
| Server-side domain | Modular application services for identity, tenants, orders, queue, integrations, notifications, billing, audit. |
| Database | Supabase-managed PostgreSQL as the service's own source of truth; schema migrations in Git. |
| Authentication | Supabase Auth or equivalent; staff login required. Customer flow should avoid conventional accounts but still use secure session tokens. |
| Authorization | Server-side permission checks plus PostgreSQL Row Level Security (RLS) as defense in depth. |
| Realtime | Supabase Realtime or another authenticated channel for dashboard/customer foreground updates. |
| Background work | Durable queue/job runner for POS sync, push dispatch, retries, cleanup, reconciliation, and billing webhooks. |
| Push | Web Push with service workers and VAPID where supported; visual fallback always available. |
| Hosting | Vercel + Supabase are candidates; validate data region, operational needs, and total cost. |
| Source control / CI | GitHub, pull requests, automated checks, migration review, staging and production environments. |
| Monitoring | Sentry or equivalent for errors; structured logs and metrics; PostHog or equivalent only where privacy-compliant and justified. |

### 7.2 Why own a separate service database?

The product should own its operational database from the beginning. Each restaurant owns its POS data and remains the authority for sales transactions. The SaaS stores only the data it needs to operate queue and notification workflows. This avoids depending on each restaurant's database design, credentials, uptime, or vendor-specific schema.

- Do not ask for unrestricted POS database credentials.
- Prefer official APIs and webhooks; use a controlled read-only connector only when the provider's supported integration model requires it.
- Never modify the restaurant's POS database.
- Normalize incoming orders into the product's canonical model.
- Keep provider-specific mappings, retries, and error handling inside the connector adapter.

### 7.3 POS adapter pattern

Each provider adapter should implement a stable internal contract. A provider-specific webhook/API payload is authenticated, validated, mapped, and converted to a canonical order event. The core order engine should not know vendor-specific field names.

| Adapter operation | Expected behavior |
|---|---|
| authenticate_event | Verify provider signature/token and reject forged or replayed events where applicable. |
| parse_event | Validate payload shape and provider event type. |
| normalize_order | Map external IDs, branch, ticket number, items/summary fields, timestamps, and provider status. |
| deduplicate | Use event IDs and stable external order identity; support safe retries. |
| reconcile | Retrieve current order state where needed to resolve out-of-order events. |
| health_check | Expose last successful sync, last error, credential status, and connection health. |

### 7.4 Background processing and transactional outbox

Do not send push notifications as part of the same synchronous request that changes an order to READY. Persist the state transition and an outbox event in one database transaction. A worker reads pending events, dispatches notifications, records attempts, and retries transient failures. This prevents a push outage from undoing the READY state and reduces lost-notification risk.

- Use idempotency keys for event ingestion and notification jobs.
- Use bounded exponential backoff with jitter for transient errors.
- Classify permanent errors (invalid subscription, unauthorized provider response) separately from retryable errors.
- Dead-letter or surface repeatedly failing jobs for investigation.
- Make worker handlers safe to execute more than once.
- Set retention/cleanup policies for completed jobs and verbose payload logs.

### 7.5 Realtime vs push

Realtime is appropriate for a customer page that is open and for staff dashboards. Web Push is needed for a customer who has moved away from the page or has it in the background, where the browser/OS supports it. These channels are complementary. Do not rely on a continuously open socket as the only customer notification mechanism.

### 7.6 Suggested repository/module structure

`apps/web` (Next.js UI and route handlers); `src/modules/identity`; `tenancy`; `orders`; `queue`; `integrations`; `notifications`; `billing`; `audit`; `shared`; `workers`; `supabase/migrations`; `tests`; `docs/runbooks`.

This is a conceptual layout. The exact monorepo structure should be chosen after the implementation team and deployment model are confirmed.

## 8. Data architecture and database design

### 8.1 Logical entity inventory

| Domain | Candidate entities | Purpose |
|---|---|---|
| Identity / access | profiles, platform_admins, memberships, roles, permissions, invitations | Staff identity and scoped authorization. |
| Tenant / branch | restaurants, branches, branch_settings, branding_settings | Tenant isolation and branch configuration. |
| POS integration | pos_providers, pos_integrations, integration_events, sync_cursors | Provider configuration, event trace, synchronization. |
| Orders | orders, order_items or order_summaries, order_events | Canonical order and business history. |
| Queue | queue_sessions or queue_entries, queue_settings | Queue behavior and customer-facing state. |
| Customer access | customer_sessions, session_claims, device_links, push_subscriptions | Secure customer order access and device management. |
| Notifications | outbox_events, notification_jobs, notification_attempts | Durable asynchronous dispatch and retry. |
| Governance | audit_logs, security_events, idempotency_keys | Traceability, abuse detection, replay safety. |
| SaaS | plans, plan_entitlements, subscriptions, billing_events, usage_records | Commercial plan and usage enforcement. |

### 8.2 Database rules

- Use internal UUID primary keys; never use a POS ticket/order number as a primary key.
- Scope external order identity by provider and branch; order numbers may repeat across branches and over time.
- Use foreign keys, check constraints, unique constraints, and indexes to enforce invariants.
- Store timestamps in UTC; render using branch time zone and customer locale.
- Keep customer sessions separate from orders and push subscriptions.
- Use soft deletion only where justified; define actual data retention and legal deletion behavior.
- Keep sensitive provider credentials out of normal application tables where possible; encrypt and restrict access.
- Avoid storing payment-card data; the product is not intended to process the restaurant's customer payments.
- Store only the minimum customer data needed for order notification.

### 8.3 Tenant isolation

Every tenant-owned record must be associated with a restaurant and, where relevant, a branch. Authorization must verify both membership and scope. RLS policies should be tested against adversarial cases: a staff member from Restaurant A must not read or mutate Restaurant B's records, even by guessing UUIDs or calling APIs directly.

### 8.4 Candidate order record fields

A canonical order may include: internal ID; restaurant ID; branch ID; source type (POS or MANUAL); provider ID; external order ID; display ticket number; status; status version; created/received/updated timestamps; optional customer-facing summary; and reconciliation metadata. Avoid copying unnecessary personal or payment data from the POS.

### 8.5 Retention and deletion

Retention periods are open decisions. Establish a retention matrix for operational orders, customer claim tokens, customer sessions, push endpoints, integration payloads, notification attempts, audit records, and security events. Retain only what is necessary for operations, security, dispute handling, and legal obligations. Expire claim tokens and device links promptly; do not retain raw webhook payloads indefinitely.

## 9. Customer order claiming and abuse prevention

> Critical security finding: an order number is not a secure credential. It may be visible on a receipt, guessed, repeated, or reused. A public QR code plus order number alone could let an unrelated person subscribe to another customer's order.

### 9.1 Required design outcome

A customer should be able to identify the order without creating a full account, but the backend must verify that the person/device is entitled to follow that order. The claim flow must also support multiple devices without turning a public ticket number into a public subscription key.

### 9.2 Candidate approach to evaluate

- The branch QR code identifies the branch only and contains no privileged secret.
- Customer enters the order number and completes an additional secure claim step. The exact factor must be chosen based on what the POS can provide and what the restaurant can operationally support.
- After the first device is verified, the service can issue a short-lived, high-entropy, revocable device-sharing invitation or equivalent enrollment mechanism for additional devices.
- Store only a hash of high-entropy claim/share tokens where feasible; apply expiry, one-time or bounded use, and revocation.
- Rate-limit order lookup and claim attempts by IP/device/session/branch; detect enumeration patterns.
- Avoid exposing whether arbitrary order numbers exist in a way that enables enumeration.
- Define how staff can assist a customer who cannot complete the claim flow without granting broad access.

### 9.3 Questions to resolve in Phase 2

- Can the POS provide a unique QR/barcode, secure short code, customer phone number, or another verifiable claim attribute?
- Can the receipt print a per-order secret or claim URL without changing core POS behavior?
- If no second factor is available, what controlled staff-assisted verification is operationally acceptable?
- How will a customer add a second device, and can the first device revoke it?
- What is the maximum number of active devices and the session expiry policy?
- What happens when a ticket number is reused after an earlier order is closed?

## 10. Web notifications and device compatibility

### 10.1 Product behavior

The customer web page should show live status while open. When the order becomes READY, the service should attempt a Web Push notification on supported browsers/devices, and the page should provide clear visual feedback. Optional sound or vibration may be used only where the browser/device allows it and after any required user gesture/permission.

### 10.2 Permission UX

- Explain the benefit before requesting notification permission.
- Do not show a browser permission prompt immediately on page load.
- Allow customers to continue even if they decline push permission.
- Show a clear state if notifications are unsupported, blocked, or revoked.
- Provide instructions to re-enable notifications only when relevant; avoid implying that the product can override OS settings.

### 10.3 Real-device validation matrix

| Environment | What to test |
|---|---|
| iPhone + Safari / installed web app mode where applicable | Permission flow, background delivery, lock-screen display, vibration behavior, service worker lifecycle, reopening after force-close. |
| Android + Chrome | Permission, background delivery, vibration behavior, battery optimization effects, service worker lifecycle. |
| Desktop Chrome / Edge / Safari | Permission, foreground/background delivery, notification click handling. |
| Private browsing / restricted modes | Unsupported behavior, subscription creation failure, graceful fallback. |
| Permission revoked after enrollment | Endpoint invalidation, cleanup, customer messaging, no endless retry loop. |
| Network offline/reconnect | Status recovery, stale page handling, queued push retry, no duplicate notification storm. |

Do not advertise guaranteed vibration across all phones. Browser push acceptance does not prove that the operating system displayed or the person noticed the notification.

## 11. Employee dashboard and restaurant administration

### 11.1 Employee queue view

A simple three-column board is a strong starting point: NEW, PREPARING, READY. Each card should show a readable ticket number, elapsed time, source (POS/manual), and only the order details needed to identify and prepare/hand over the order.

- Fast, large touch targets for busy restaurant environments.
- Search/filter by ticket number and status.
- Clear visual distinction for delayed or exceptional orders.
- Optimistic UI only when rollback/conflict messaging is clear; server remains authoritative.
- Handle simultaneous updates with a visible conflict message and latest-state refresh.
- Do not display unnecessary customer personal information.

### 11.2 Role model — proposal

| Role | Suggested permissions (must be approved) |
|---|---|
| Owner | All restaurant settings, branches, staff, integrations, subscription, and reporting. |
| Manager | Branch operations, staff management, queue configuration, integrations if delegated, cancellations/overrides. |
| Cashier | View branch queue, create manual order, mark READY, mark COLLECTED if permitted. |
| Kitchen | View relevant queue, move NEW to PREPARING, mark READY. |
| Read-only / auditor | View permitted order history and reports without changing statuses. |

### 11.3 Restaurant administration

- Branch settings, time zone, language, branding basics, QR management.
- Staff invitations, role assignments, branch scoping, and access revocation.
- POS integration connection status, credential rotation, test event, last successful sync, and error history.
- Order history and basic operational metrics.
- Notification settings and customer device/session controls.
- Plan, usage, invoices, and subscription status.

## 12. POS integration strategy

### 12.1 Integration priority

Do not attempt to integrate every POS system before the first pilot. Select a first provider based on access to official documentation, sandbox/test environment, webhook/API completeness, target restaurant demand, and supportability.

### 12.2 Provider evaluation checklist

- Official public API documentation and commercial approval requirements.
- Webhook support, signature verification, retries, event ordering, and delivery guarantees.
- Ability to retrieve order details and current status through API.
- Stable order IDs and branch/location IDs.
- Sandbox/test account and realistic sample payloads.
- Rate limits, pagination, token expiry, OAuth scopes, and credential rotation.
- POS vendor partner program, certification, fees, and reseller restrictions.
- Supported restaurant regions and versions/editions.
- Cancellation, refund, void, reopen, and ticket-number reuse semantics.
- Network/firewall requirements and whether a local connector agent is required.

### 12.3 Restaurant onboarding information needed

- POS provider name, product edition/version, and branch identifiers.
- Official API documentation and sandbox credentials (never request production passwords through informal channels).
- Sample order and status event payloads with sensitive data removed.
- Webhook configuration access or API scopes needed.
- Restaurant technical contact and POS vendor support contact.
- Network/firewall constraints, local server requirements, and operating hours.
- How the restaurant handles voids, cancellations, reprints, duplicate tickets, and manual corrections.

### 12.4 Fallback integration models

Preferred order: official webhook/API; then scheduled API polling if webhooks are unavailable; then a tightly controlled local integration agent only if necessary and justified. Direct database access should be exceptional, read-only, documented, and approved by the POS owner/vendor. The product should never modify POS records.

## 13. SaaS business model and commercial design

### 13.1 Commercial model

The confirmed business model is a restaurant SaaS subscription. A practical starting structure is restaurant-level subscription with branch limits or branch-based tiers. Pricing, trials, billing cadence, and feature packaging have not been decided.

### 13.2 Plan dimensions to consider

- Number of branches.
- Monthly order volume or notification volume, with transparent fair-use thresholds.
- Number of staff accounts.
- Number of supported POS integrations.
- Advanced reporting, export, and retention features.
- Priority support and SLA level.
- White-label/custom branding or custom domains, if included.

### 13.3 Billing provider decision

Do not choose a payment provider by brand familiarity alone. Research merchant eligibility in the first target country, supported countries for global customers, settlement currencies, fees, recurring billing, tax handling, dispute workflows, payout timing, and local legal requirements. Provider availability and commercial terms change; verify them at the time of selection.

### 13.4 Cost model

Build a unit-economics worksheet before public launch. Model per-restaurant fixed cost and variable cost drivers: database/storage, compute, realtime connections, push delivery, job execution, logs/monitoring, analytics, support, payment processing, and POS vendor fees. Test low, expected, and peak restaurant usage. Set plan limits based on observed costs, not guesswork.

### 13.5 Commercial readiness

- Terms of service and acceptable-use policy.
- Privacy notice and data-processing terms where applicable.
- Support contact and escalation process.
- Subscription cancellation, failed payment, grace period, and data export/deletion rules.
- Service availability statement and incident communication policy.
- Clear statement of supported devices, POS integrations, and notification limitations.

## 14. Security, privacy, and compliance

### 14.1 Security baseline

- Tenant/branch authorization enforced server-side and by RLS; never rely on frontend hiding.
- Staff authentication with secure session handling and appropriate account recovery.
- Least-privilege roles; sensitive actions require explicit permission and audit.
- Secrets stored in managed secret storage; no service-role keys or POS credentials in browser code.
- Validate all external inputs and verify webhook signatures where provider supports them.
- Rate-limit login, order lookup, customer claim, QR session creation, and push registration.
- Use CSRF protections where applicable, secure cookies, appropriate CORS, content security policy, and security headers.
- Protect against IDOR, tenant escape, replay, duplicate webhooks, token theft, and privilege escalation.
- Encrypt data in transit; use provider-managed encryption at rest and evaluate application-level encryption for sensitive secrets.
- Dependency scanning, secret scanning, code review, and security regression tests in CI.
- Backups and restore drills; access to production data tightly restricted and audited.
- Incident response plan for leaked credentials, cross-tenant access, compromised staff accounts, and push abuse.

### 14.2 Privacy principles

- Collect minimum data required to operate the queue.
- Do not import payment-card data or unnecessary POS customer profiles.
- Explain why push permission is requested and what notifications contain.
- Avoid putting sensitive customer/order details in lock-screen notification text.
- Define retention and deletion before production, including backups and legal exceptions.
- Provide a privacy contact and a process for customer/restaurant data requests.
- Review analytics and telemetry for personal data minimization and consent requirements.

### 14.3 Global legal review

Global-ready product architecture does not eliminate country-specific legal obligations. Before entering each market, review applicable privacy/data protection laws, cross-border transfers, data residency, consumer notice/consent, electronic communications rules, tax/VAT/sales tax, recurring billing requirements, and business registration obligations. This document is not legal advice; obtain qualified legal and tax review for the chosen markets.

### 14.4 Threat model starter

| Threat | Impact | Primary controls |
|---|---|---|
| Customer guesses another ticket number | Unauthorized order tracking or notification subscription. | Secure claim factor, rate limits, non-enumerating responses, short-lived tokens. |
| Tenant A accesses Tenant B | Data breach and business harm. | RLS, server authorization, scoped IDs, adversarial isolation tests. |
| Forged/replayed POS webhook | Fake orders or manipulated status. | Signature verification, timestamp/replay controls, idempotency. |
| Stolen push/share token | Unwanted device access. | High entropy, hashing, expiry, revocation, device limits. |
| Employee account takeover | Unauthorized order actions and data access. | MFA where practical, secure recovery, least privilege, audit and alerts. |
| Notification flood | Customer annoyance and cost spike. | Deduplication, rate limits, state transition rules, abuse monitoring. |
| Secrets exposed in frontend/logs | POS or platform compromise. | Secret management, redaction, code scanning, restricted access. |
| Worker processes event twice | Duplicate push or repeated state effects. | Idempotent handlers, unique job keys, outbox state machine. |

## 15. QA, testing, and acceptance strategy

### 15.1 Test layers

- Unit tests: state machine, permissions, canonical mapping, idempotency, token expiry, notification routing.
- Integration tests: PostgreSQL constraints/RLS, Supabase auth, outbox worker, POS adapter, Web Push provider integration.
- Contract tests: provider sample payloads and webhook/API schema changes.
- End-to-end tests: restaurant onboarding, QR customer claim, multiple devices, staff READY action, notification and collection.
- Security tests: tenant isolation, IDOR, brute force, replay, privilege escalation, token leakage, rate limiting.
- Load tests: simultaneous orders, dashboard users, webhook bursts, push fan-out, retry storms.
- Resilience tests: POS outage, DB/network interruption, worker crash, invalid push endpoint, provider throttling.
- Accessibility tests: keyboard navigation, screen reader labels, contrast, touch targets, RTL layout.

### 15.2 Critical acceptance scenarios

| ID | Scenario | Expected result |
|---|---|---|
| AT-01 | Repeated POS webhook for same order | Exactly one active internal order/queue entry; duplicate event recorded or safely ignored. |
| AT-02 | Two restaurants with same ticket number | Each order remains isolated by tenant/branch; no ambiguous customer access. |
| AT-03 | Unauthorized user guesses ticket number | Cannot subscribe without completing approved claim verification; rate limits apply. |
| AT-04 | One order followed on several devices | Each approved device sees the same current status; one device can be revoked without corrupting others. |
| AT-05 | Kitchen employee marks READY | Authorized action commits once and creates one notification event. |
| AT-06 | Cashier marks READY | Allowed according to confirmed role permission and fully audited. |
| AT-07 | Push provider unavailable | Order remains READY; job retries safely; dashboard/customer page still shows READY. |
| AT-08 | Customer denies push permission | Customer can still follow order while page is open and sees clear explanation. |
| AT-09 | Two employees act concurrently | Only valid transition succeeds; other user sees conflict/latest state. |
| AT-10 | POS cancellation after READY | Defined reconciliation rule prevents incorrect or misleading customer status. |
| AT-11 | Cross-tenant API request | No read/write access to another tenant even with guessed identifiers. |
| AT-12 | Subscription becomes past due | Entitlements and grace-period behavior follow approved policy without corrupting order history. |

### 15.3 Release gates

- No known critical/high security defects in core customer claim, tenant isolation, staff authorization, or webhook authentication.
- All critical acceptance scenarios pass in staging.
- Backup restore tested successfully.
- Monitoring, alerts, incident owner, and support contact established.
- POS integration tested against vendor sandbox and pilot restaurant workflow.
- iOS/Android real-device notification behavior documented; unsupported cases have a graceful fallback.
- Restaurant staff training and manual fallback procedure ready.
- Privacy/terms/legal review completed for the pilot market.

## 16. Delivery roadmap — phased project plan

The sequence below deliberately validates the highest-risk assumptions before a large build. Phases can overlap only where doing so does not hide unresolved dependencies. Each phase should end with an explicit review and approval gate.

### Phase 0 — Product definition and PRD

**Work:** Define target customer, use cases, terminology, MVP boundary, roles, order lifecycle, user journeys, requirements, success metrics, and acceptance criteria.

**Deliverables:** Approved PRD, scope, decision log, initial risk register, prioritized backlog.

**Exit gate:** No implementation until product scope and key decisions are approved.

### Phase 1 — UX/UI and service blueprint

**Work:** Map customer, employee, manager, owner, and platform-support journeys. Create responsive wireframes, prototypes, design system, RTL approach, empty/error/loading states.

**Deliverables:** Figma prototype, annotated flows, component inventory, usability findings.

**Exit gate:** Validate customer claim concept and high-speed staff workflow.

### Phase 2 — Technical feasibility spikes

**Work:** Test POS provider access, order mapping, webhook reliability, Web Push on real iOS/Android devices, vibration limits, claim security, and realtime behavior.

**Deliverables:** Feasibility report, POS provider scorecard, notification compatibility matrix, security decision proposal.

**Exit gate:** Do not lock architecture or promise device behavior before evidence.

### Phase 3 — Architecture and backend foundation

**Work:** Approve architecture, environments, database schema, migrations, auth, tenant model, RLS, audit, observability, CI/CD, backups.

**Deliverables:** Threat model, architecture decision records, tested schema, secure tenant foundation.

**Exit gate:** RLS and authorization tests must pass before business features.

### Phase 4 — POS framework and first connector

**Work:** Build canonical order contract, adapter interface, webhook/API ingestion, idempotency, reconciliation, health reporting, and manual fallback.

**Deliverables:** Working first POS connector in sandbox/pilot; integration runbook.

**Exit gate:** Only add further connectors after first adapter pattern is proven.

### Phase 5 — Customer web experience

**Work:** Build branch QR landing, secure order claim, order status, multiple-device enrollment, permission UX, visual fallback, expiry/revocation.

**Deliverables:** Customer flow passes mobile E2E tests on supported devices.

**Exit gate:** Security approval required for claim and device-sharing design.

### Phase 6 — Employee dashboard and restaurant admin

**Work:** Build queue board, role controls, manual entry, status transitions, staff management, branch configuration, QR management, order history.

**Deliverables:** Staff can operate a complete shift in staging without developer intervention.

**Exit gate:** Validate busy-shift usability with real staff.

### Phase 7 — Notification and background engine

**Work:** Build transactional outbox, worker, Web Push, retries, deduplication, invalid endpoint cleanup, observability, and reconciliation.

**Deliverables:** Reliable READY-to-notification pipeline with documented limits.

**Exit gate:** No READY state may depend on successful push dispatch.

### Phase 8 — Hardening, QA, and operational readiness

**Work:** Security review, penetration testing, load/resilience tests, accessibility, backups/restore, monitoring, privacy, runbooks, support procedures.

**Deliverables:** Release candidate, test evidence, incident and recovery playbooks.

**Exit gate:** No pilot launch with critical security/data-integrity gaps.

### Phase 9 — Controlled pilot and commercial launch

**Work:** Pilot with a small number of real branches, monitor usage and support, measure outcomes, refine pricing/limits, then staged rollout.

**Deliverables:** Pilot report, go/no-go decision, launch checklist, post-launch roadmap.

**Exit gate:** Expand POS coverage and markets based on evidence, not assumptions.

## 17. MVP definition proposal

The exact MVP is not yet approved. The following is a recommended narrow pilot scope designed to prove the core value without building an entire restaurant operations suite.

### 17.1 Recommended MVP

- One restaurant pilot customer with one or a small number of branches.
- One POS provider connector, chosen based on actual API/sandbox access; manual order entry available as fallback.
- Staff login and a small, explicit role set.
- NEW → PREPARING → READY → COLLECTED lifecycle plus CANCELLED handling.
- Branch QR code and mobile customer web page.
- Secure customer order claim; multiple devices through an approved controlled enrollment mechanism.
- Realtime status while page is open; Web Push on supported devices; visual fallback.
- Basic restaurant settings, staff management, integration health, and order history.
- Essential audit logs, monitoring, backup/restore, security tests, and operational runbooks.

### 17.2 Defer unless pilot evidence demands it

- Many POS connectors at once.
- Advanced analytics, forecasting, staff scheduling, inventory, loyalty, and marketing.
- Native mobile apps.
- Custom domains and deep white-labeling.
- Complex enterprise SSO, multi-region active-active deployment, and microservices.
- Sophisticated workflow automation beyond the order lifecycle.
- Broad global billing/tax automation before first market selection.

### 17.3 Pilot success metrics

| Metric | What it tells us | How to measure |
|---|---|---|
| Pager replacement rate | Whether customers/staff actually use the digital flow. | Eligible orders using the service / eligible orders. |
| Customer claim completion | Whether QR + claim process is low-friction. | Successful claims / claim attempts. |
| Notification success | Whether supported push attempts are working. | Provider accepted, expired endpoint, error, and observed delivery where available. |
| Time from READY to collection | Potential operational benefit. | READY timestamp to COLLECTED timestamp; compare with baseline cautiously. |
| Staff adoption | Whether dashboard fits real service flow. | Active staff use, manual workarounds, qualitative feedback. |
| Integration reliability | Whether POS sync is dependable. | Missing, duplicate, delayed, and rejected events. |
| Support burden | Whether onboarding/operation can scale. | Tickets and staff minutes per branch per week. |
| Unit cost per order/branch | Whether SaaS pricing can sustain gross margin. | Infra, messaging, monitoring, and support costs divided by usage. |

## 18. Operations, support, and launch readiness

### 18.1 Environments

- Local development with synthetic data.
- Shared staging environment with POS sandbox and test push subscriptions.
- Production environment with separate secrets, databases, and access controls.
- No production credentials in local sample files, Figma, prompts, or source control.

### 18.2 Monitoring and alerts

- API errors and latency by route/module.
- POS webhook volume, signature failures, processing delay, duplicate rate, and last successful sync per integration.
- Outbox backlog age, retry count, dead-letter count, push provider errors, and invalid subscriptions.
- Realtime connection errors and dashboard update latency.
- Database health, connection saturation, storage growth, and backup status.
- Authentication anomalies, rate-limit events, cross-tenant authorization denials, and suspicious claim attempts.

### 18.3 Operational runbooks

- POS integration disconnected or webhook backlog.
- Notification provider outage or elevated invalid subscriptions.
- Customer cannot claim order or receives wrong order status.
- Restaurant employee account compromised.
- Cross-tenant data exposure suspected.
- Database migration failure or production rollback.
- Backup restore and disaster recovery.
- Subscription billing webhook delay or duplicate event.

### 18.4 Backup and recovery objectives

Define recovery point objective (RPO) and recovery time objective (RTO) before pilot. A reasonable initial proposal is to agree explicit targets with the hosting/database provider and verify restore procedures rather than inventing an SLA. Backups are not sufficient until restore has been tested.

### 18.5 Launch checklist

- Product owner signs off PRD, scope, pricing hypothesis, and supported-market boundaries.
- Security review and critical test suite complete.
- POS vendor/restaurant permission confirmed.
- Privacy, terms, data processing, and local legal review complete.
- Staff training, QR placement, and manual fallback procedure ready.
- Support channel, escalation owner, monitoring, and runbooks active.
- Billing and subscription lifecycle tested in sandbox.
- Pilot success metrics and review date agreed.

## 19. Tooling and service choices

The user has selected Claude Code for coding and Figma for UI/UX design. Supabase is the backend/database platform under consideration and was recommended as the service's own PostgreSQL-backed source of truth. The remaining tools below are candidates, not purchases or activations.

| Tool / service | Potential use | Status / caution |
|---|---|---|
| Claude Code | Implementation, refactoring, debugging, tests, code review assistance. | User-selected coding tool. |
| Figma | User journeys, wireframes, high-fidelity UI, prototype, design system. | User-selected design tool. |
| Supabase | PostgreSQL, Auth, RLS, Realtime, Storage, migrations/tooling. | Recommended/under consideration; confirm project and plan before activation. |
| Next.js + TypeScript | Customer, staff, admin web app and server-side routes. | Recommended stack; pending architecture approval. |
| Tailwind CSS + shadcn/ui | Responsive UI and reusable components. | Candidate UI stack. |
| GitHub | Source control, PRs, CI, issue tracking, migrations. | Recommended. |
| Vercel | Web deployment and preview environments. | Candidate hosting; validate region, cost, and operational requirements. |
| Trigger.dev / Inngest / Supabase Queues | Durable background jobs and retries. | Evaluate one approach; do not adopt multiple overlapping systems by default. |
| Vitest + Playwright | Unit/integration and browser end-to-end tests. | Recommended test tooling. |
| Sentry | Error monitoring and diagnostics. | Candidate; check data handling and pricing. |
| PostHog | Product analytics and funnel measurement. | Optional; privacy review and data minimization required. |

> No paid service should be purchased, activated, upgraded, or given billing authority by an agent without explicit approval from the product owner.

## 20. Risk register and mitigations

| Severity | Risk | Impact | Mitigation |
|---|---|---|---|
| Critical | Order-number-only claiming | Unauthorized access to another customer's order/device subscriptions. | Design and test secure claim factor; short-lived tokens; rate limits; non-enumerating responses. |
| Critical | POS integration uncertainty | The chosen POS may lack usable APIs, webhooks, sandbox, or commercial access. | Research provider access before build; choose first provider by feasibility; manual fallback. |
| Critical | Web Push / iOS limitations | Customer may not receive background notification or vibration. | Real-device PoC; clear support matrix; visual fallback; no universal guarantee. |
| Critical | Tenant isolation failure | Restaurant data exposure across tenants. | RLS and server authorization; adversarial tests; independent security review. |
| High | Duplicate/out-of-order POS events | Duplicate orders or incorrect queue state. | Idempotency, event IDs, reconciliation, state versioning. |
| High | Concurrent staff actions | Invalid or conflicting order transitions. | Transactional state machine, optimistic concurrency, audit. |
| High | POS/network outage | Orders missing or delayed. | Health status, retries, polling where supported, manual fallback. |
| High | Push endpoint invalidation | Retry loops, wasted cost, missing alerts. | Endpoint cleanup, error classification, bounded retry. |
| High | Multiple-device abuse | Excess notifications, unwanted access, cost spikes. | Claimed device links, configurable cap, revocation, rate limits. |
| High | Global privacy/payment complexity | Regulatory, tax, payout, or data residency blockers. | Launch-market selection, qualified legal/tax review, provider due diligence. |
| Medium | Cost overrun | Realtime, jobs, monitoring, support costs exceed pricing. | Usage telemetry, load/cost model, plan limits, alerts. |
| Medium | Staff adoption | Employees bypass dashboard under peak pressure. | Observe real shift, fast UI, training, fallback process. |
| Medium | Ticket number reuse | Old session maps to a new order. | Internal UUID, active-order scope, expiry, claim token binding. |
| Medium | Analytics privacy leakage | Personal/order data captured unnecessarily. | Data minimization, event review, retention controls. |

## 21. Decision log and next actions

### 21.1 Decision status

| Decision | Status |
|---|---|
| Multiple POS providers over product lifetime | Confirmed by product owner |
| POS + manual order ingestion | Confirmed by product owner |
| Kitchen + cashier can mark READY | Confirmed by product owner; detailed role matrix open |
| SaaS subscription | Confirmed by product owner |
| Order number as customer input | Confirmed as input; security verification method not approved |
| Multiple devices per order | Confirmed by product owner |
| Web-only initial platform | Confirmed by product owner |
| Global market ambition | Confirmed by product owner; staged rollout recommended |
| Claude Code for coding | User-selected |
| Figma for UI/UX | User-selected |
| Supabase as own service database | Recommended direction; final architecture approval pending |
| Next.js modular monolith | Recommended direction; approval pending |
| Independent POS adapters | Recommended direction; approval pending |
| Vercel + Supabase hosting | Candidate; approval pending |
| Managed background job service | Evaluate; not selected |
| English + Arabic initial languages | Proposal only |
| Five-device cap | Illustrative proposal only; not approved |
| 99.9% availability / performance figures | Proposed targets only; not committed SLA |

### 21.2 Immediate next actions

- 1. Approve or revise the recommended architecture baseline: modular monolith vs separate backend; Next.js + Supabase vs other structure.
- 2. Select the target first pilot country and restaurant type.
- 3. Identify 2–3 candidate POS providers and obtain official integration documentation/sandbox access.
- 4. Define the secure customer order-claiming and multi-device sharing model.
- 5. Run a real-device Web Push feasibility test on current iOS/Safari and Android/Chrome.
- 6. Confirm initial language pair, branding scope, device/session policy, and employee role matrix.
- 7. Convert this blueprint into an approved PRD and prioritized MVP backlog.
- 8. Only then begin Phase 1/2 execution, keeping paid-service activation behind explicit approval.

### 21.3 Architecture questions carried forward

| Question | Recommended starting answer |
|---|---|
| Backend architecture? | Modular monolith: Next.js + TypeScript + Supabase/PostgreSQL; separate worker process/service for background jobs. |
| POS architecture? | Independent adapter per provider feeding a canonical internal order model. |
| Hosting? | Vercel + Supabase candidate, subject to region, compliance, cost, and operational validation. |
| Background processing? | Evaluate a durable managed job service or Supabase Queues; select one after a small proof of concept. |

## 22. Glossary

| Term | Meaning |
|---|---|
| POS | Point of Sale system used by the restaurant to create and manage sales/orders. |
| Tenant | A restaurant business account and its logically isolated data. |
| Branch | A physical restaurant location belonging to a tenant. |
| Canonical order | The product's normalized internal representation of an order, independent of POS vendor schema. |
| Adapter / connector | Provider-specific integration code that translates vendor events and API data into the canonical model. |
| Webhook | An HTTP event sent by an external provider when something happens, such as an order being created. |
| Idempotency | A property that makes repeated processing of the same request/event safe without creating duplicate effects. |
| RLS | PostgreSQL Row Level Security; database-enforced policies that restrict which rows a user/session can access. |
| Outbox pattern | Persisting a business change and an event to publish in the same database transaction, then dispatching asynchronously. |
| Web Push | Browser-based push notification mechanism supported by certain browsers and operating systems. |
| Service worker | Browser background script used for capabilities such as push event handling. |
| VAPID | Web Push application server identification/authentication mechanism. |
| RTL | Right-to-left layout direction used by languages such as Arabic. |
| SLO | Service Level Objective; a measurable reliability/performance target. |
| RPO / RTO | Recovery Point Objective (acceptable data loss window) / Recovery Time Objective (acceptable restoration time). |

## 23. Final recommendation

Treat this as a focused restaurant operations SaaS, not merely a QR page with a notification button. The difficult work is secure order claiming, POS reliability, tenant isolation, and real-device notification behavior. Validate those early. Keep the first pilot narrow: one market, one restaurant segment, one POS connector, a manual fallback, a robust customer web flow, and a fast staff dashboard.

The most important next decision is not which UI framework to use. It is how a customer securely proves they are entitled to follow an order while still keeping the experience accountless and supporting multiple devices. The second is which POS provider can be integrated reliably with real access. The third is what background notification behavior is genuinely supported on the target devices.

> Recommended project rule: do not start large-scale implementation until Phase 0 decisions are approved and Phase 2 feasibility evidence resolves the major unknowns.

This document consolidates the known discussion and adds a structured set of requirements and engineering controls. Any item labeled recommended, candidate, proposed, or open remains subject to review and approval.
