# Spike report: Web Push and vibration on real devices (evidence for ADR-0004 and the notification matrix)

- Spec: [`docs/prompts/spike-web-push.md`](../prompts/spike-web-push.md)
- Code: [`spikes/web-push/`](../../spikes/web-push) (throwaway; never imported by product code)
- Tester guide and matrix: [`web-push-matrix.md`](web-push-matrix.md), **to be filled by the product owner on real phones**
- Serves: FR-12, AT-07, AT-08 · blueprint §7.4, §10 · ADR-0004 (PoC part)
- Date and machine: 2026-11-25, Windows 11, Node 24.18.0
- Status: **evidence only, phones not yet tested**. ADR-0004 stays Open. Nothing here is a decision.

## How to run

```
pnpm exec tsx --test "spikes/web-push/**/*.test.ts"     # 49 tests with the fake provider, no network, no install needed
pnpm exec tsc -p spikes/web-push                         # strict type check (needs the install below)
pnpm install --dir spikes/web-push --ignore-workspace    # once: installs web-push@3.6.7 into spikes/web-push only
pnpm exec tsx spikes/web-push/generate-keys.ts           # once: VAPID keys into the git-ignored spikes/web-push/.env.local
pnpm exec tsx spikes/web-push/server.ts                  # the sender + test page on http://127.0.0.1:8787
cloudflared tunnel --url http://127.0.0.1:8787           # free quick tunnel (no account) so phones get HTTPS
```

Phones: follow [`web-push-matrix.md`](web-push-matrix.md) (install, run, stop, and tap-by-tap steps for iPhone and Android).

## What was built

| Piece | File(s) | What it does |
|---|---|---|
| Test page | `public/index.html`, `public/app.js`, `public/push-env.js` | Detects support and shows the state clearly: allowed / blocked / not asked / not supported / **Add to Home Screen first** (iPhone). Explains the benefit, then asks **only after a tap**. Subscribes, shows which push service the endpoint belongs to. Buttons for plain, vibrate and "stays until tapped", with a delay (15/30/60 s) and a countdown telling the tester to lock the phone or close the tab. Results refresh every 2 s; "Copy results" for the matrix. |
| Service worker | `public/sw.js` | Shows the notification (with `tag`, `vibrate`, `requireInteraction` as asked), tells the sender it ran, and opens or focuses the page on tap. |
| Sender | `server.ts`, `harness.ts`, `web-push-provider.ts`, `env.ts`, `generate-keys.ts` | Node `http` server bound to 127.0.0.1. Every send goes through the outbox (never inline), then `web-push` to the browser vendor's push service. VAPID keys are generated locally into the ignored `.env.local`; the private key is never printed or logged. |
| Outbox + fake provider | `outbox.ts`, `outbox-store.ts`, `backoff.ts`, `classify.ts`, `fake-provider.ts`, `forced-failures.ts` | The ADR-0004 PoC: idempotency key, lease per event, retry with backoff and jitter, 404/410 disables the subscription, 429/5xx retries (honouring Retry-After), other 4xx dead-letter, and a visible dead-letter list. |

## What the harness proves (tests, fake provider, no network)

| ADR-0004 / spec item | Proven | Test |
|---|---|---|
| Idempotency: READY sent once | Same key enqueued twice gives one event; a sent event is never sent again by later ticks or a re-enqueue; three concurrent ticks from two workers send once; each subscription of an order gets its own event | `outbox.test.ts` |
| At-least-once | A worker that dies holding an event loses its lease; another worker delivers it after the lease runs out | `outbox.test.ts` |
| Duplicate after a lost response | When the provider accepted but we saw a timeout, the event is sent twice (at-least-once) **with the same Topic and tag**, so the fake device shows one notification | `outbox.test.ts` |
| Retry with backoff + jitter | Ceiling doubles per attempt (1, 2, 4, 8 s in the test policy), capped; delay is in [ceiling/2, ceiling); no instant retry; 50 events get spread-out delays; no retry before the delay | `backoff.test.ts`, `outbox.test.ts` |
| Retryable errors | 429, 500, 502, 503, 504 and network errors retry; 429's Retry-After is honoured when longer; provider down ×3 then up: sent, never dropped (AT-07) | `backoff.test.ts`, `outbox.test.ts`, `forced-failures.test.ts` |
| Permanent errors | 404 and 410 disable the subscription and dead-letter the event, and later events to it are dead-lettered **without calling the provider** (no endless retry loop, blueprint §10.3); 400/401/403/413 dead-letter without retry and keep the subscription | `outbox.test.ts`, `harness.test.ts` |
| Dead-letter list | Retries exhausted, unknown subscription and permanent errors appear with their reason and attempt count | `outbox.test.ts` |
| Permission states (AT-08) | allowed / blocked / not asked / unsupported / "Add to Home Screen" (iOS tab) / old iOS installed without push → unsupported | `push-env.test.ts` |
| Input at the boundary | Only https endpoints with both keys; bounded test parameters | `validate.test.ts` |

## Automated desktop check (headless, not a substitute for the matrix)

To make sure the whole chain works before the owner's phone session, the page was driven in headless desktop browsers with
Playwright (a throwaway script in the session scratchpad, not committed), against `http://localhost` (secure without a tunnel).
Permission was granted by the automation, not by a person, and nothing was observed on a screen.

| Browser (Windows 11) | Push service | Plain send | Retry test (2 forced 503s) | "Send twice" | After the browser unsubscribed |
|---|---|---|---|---|---|
| Chrome (headless) | Google FCM | HTTP 201; service worker reported back in 1.0 s | 503, 503, 201; reported back after 7.0 s | one push sent, kept once | **FCM still answered 201** |
| Edge (headless) | Microsoft WNS | not run separately | 503, 503, 201; reported back after 6.6 s | not run | **WNS still answered 201** |

The last column is the most useful finding: **right after a browser unsubscribes, the push service still says "accepted"**. So a
201 is not proof that anything reached a device. A send made right after unsubscribing got 201, not 404/410. The matrix
tests I-14 and A-14 check how long it takes on phones before the push service reports the endpoint as gone.

## What remains for the devices (the owner's matrix)

Everything a person must see or feel, on iPhone (Safari tab vs Home Screen) and Android (Chrome, optionally installed and other
browsers): permission flow, notification shown in foreground / background / locked / app closed, vibration, sound, tap opens
the page, time to arrival, what happens after Don't Allow and after revoking, battery saving on Android. See the matrix.

## Claims we must not make until the matrix is filled

Following CLAUDE.md ("never claim delivered or seen unless the platform proves it") and blueprint §10.3:

1. **Not "delivered" or "seen".** We know two things only: the push service **accepted** the message (HTTP 201), and the
   phone's **service worker ran** (it reported back). Neither proves the notification was displayed, and neither proves a
   person noticed it. The headless check shows a 201 even for an unsubscribed browser.
2. **Not "works on iPhone"** in general. On iPhone, web push needs iOS 16.4+ **and** the page added to the Home Screen and
   opened from its icon. A Safari tab cannot receive it. Until the matrix says otherwise, the customer page must tell iPhone
   users this, and it must work without push.
3. **Not "the phone vibrates".** iPhone has no web vibration API and ignores the `vibrate` option. Android may ignore the
   pattern and use its own setting. Vibration is never promised (blueprint §10.3).
4. **Not "it makes a sound".** Sound depends on silent mode, Focus / Do Not Disturb and per-app settings that we cannot
   control or read.
5. **Not "arrives within N seconds"** in general. The only number is from one desktop in headless mode. Phone times depend on
   the push service, the network, and battery saving.
6. **Not "works when the app is closed or after a restart"** until rows I-8/A-7 are filled.
7. **Not "revoked permission is detected at once".** The push service can keep saying 201. Cleanup relies on a later
   404/410 (and the page re-checking its permission when it is opened).
8. **Not "exactly once".** Delivery is at-least-once. Duplicates are collapsed by the same Topic (for messages not yet
   delivered) and the same notification tag (on the device). Topic replacement by a real push service is **not** tested.
9. **Not "stays until tapped".** `requireInteraction` is ignored on many mobile systems.
10. **Not "fallback covers it".** The page must keep showing READY while it is open (AT-08). That is the realtime spike's
    job; it is not tested here.

## Notes for ADR-0004 (PoC part)

- The behaviour that ADR-0004 asks the PoC to show (transactional enqueue aside) fits in about 400 lines, comments
  included, with no job framework:
  lease, attempts, next-attempt time, status, last error and history per event. A database version needs the same
  columns, plus `FOR UPDATE SKIP LOCKED` (or the queue product's equivalent) instead of the in-process synchronous claim,
  and an idempotency key unique per subscription (`order.ready:<order>:<subscription>`). Today's outbox unique key is
  `(order_id, event_type)`, one event per order. Fan-out per device is therefore a step the worker must do idempotently.
- Values used (spike only, not decisions): harness retry ceiling 2 s doubling to 60 s, 6 attempts, 30 s lease, message TTL 15 min, urgency high.
- Not measured: cost at volume, worker hosting, and Supabase Queues/Edge Functions or a dedicated worker. This PoC is
  neutral between the ADR-0004 options.

## Deviations and choices

- `web-push` **3.6.7** (pinned exactly), not 4.0.0. Version 4.0.0 is a major release published 2026-11-06, under three weeks
  ago; 3.6.7 has been stable since January 2024.
- `spikes/web-push` has its own `package.json` and `pnpm-lock.yaml` and is **not** in the pnpm workspace, so the root
  lockfile and CI install are unchanged and the dependency stays inside the spike folder.
- Type declarations for `web-push` are hand-written (`web-push.d.ts`), and input validation is hand-written instead of zod, because no other dependency is allowed.
- The test page is English only and not i18n: it is a test tool for the owner, not product UI.
- `public/manifest.webmanifest` is JSON, so it can't carry a header comment. Its `description` field marks it as the spike's.
- Added beyond the spec, all inside the spike: delayed send with a countdown (how the "tab closed / screen locked" test
  works), forced-failure and "send twice" checkboxes (AT-07 and idempotency on a real phone), "Copy results" and "Vibrate now".

## Not tested

- **Any real phone.** That is the owner's matrix.
- Safari on macOS, Firefox, Samsung Internet, private browsing, in-app browsers, offline/reconnect.
- Whether a real push service replaces a message with the same Topic.
- How long it takes before a push service returns 404/410 after unsubscribe or revoke.
- A database-backed outbox, several worker processes, and the outbox-to-subscription fan-out from a real READY event.
- The cloudflared quick tunnel itself: I didn't install or run it on this machine. The owner installs and runs it from the guide.
