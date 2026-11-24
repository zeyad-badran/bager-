/**
 * The test harness's state: subscriptions, the outbox and its worker, and what each phone reported back
 * (received by the service worker, notification tapped). In memory; restarting the sender clears it.
 *
 * Module:   spikes/web-push (THROWAWAY, never imported by product code)
 * Serves:   FR-12, AT-07, AT-08 · spike scope items 2–4
 * Protects: every send goes through the outbox (never inline, blueprint §7.4), and "received" means only that
 *           the service worker ran: it is never reported as "seen" (CLAUDE.md).
 */
import { randomUUID } from "node:crypto";
import type { RetryPolicy } from "./backoff";
import { ForcedFailureProvider } from "./forced-failures";
import { OutboxStore, OutboxWorker, type OutboxEvent, type PushProvider } from "./outbox";
import { endpointKind } from "./public/push-env.js";
import type { NotificationKind, SendRequest, SubscriptionInput } from "./validate";

/** Spike values, not product decisions: about 2 minutes of retries in total before dead-lettering. */
const HARNESS_POLICY: RetryPolicy = { baseDelayMs: 2_000, maxDelayMs: 60_000, maxAttempts: 6 };
const HARNESS_LEASE_MS = 30_000;
/** The tunnel URL is public; cap how many subscriptions a stranger could add. */
export const MAX_SUBSCRIPTIONS = 50;
const MS_PER_SECOND = 1000;

/** Vibration pattern for the "vibrate" test: three pulses, easy to tell from a normal buzz. */
const VIBRATE_PATTERN = [300, 100, 300, 100, 300];

interface EventMeta {
  kind: NotificationKind;
  ticket: string;
  receivedAt: number | null;
  clickedAt: number | null;
  duplicateIgnored: boolean;
}

/** What the service worker needs to build the notification (sw.js reads exactly these fields). */
function notificationContent(kind: NotificationKind, ticket: string): Record<string, unknown> {
  const base = { title: `Order ${ticket} is ready`, url: "/", kind, ticket };
  if (kind === "vibrate") return { ...base, body: "Vibration test: did the phone buzz three times?", vibrate: VIBRATE_PATTERN };
  if (kind === "require-interaction") {
    return { ...base, body: "Stays until you tap or dismiss it (where supported).", requireInteraction: true };
  }
  return { ...base, body: "Plain notification test. Tap to open the test page." };
}

export class Harness {
  readonly store: OutboxStore;
  readonly worker: OutboxWorker;
  private readonly forced: ForcedFailureProvider;
  private readonly meta = new Map<string, EventMeta>();
  private ticketCounter = 0;

  constructor(provider: PushProvider, private readonly now: () => number = Date.now) {
    this.store = new OutboxStore(now);
    this.forced = new ForcedFailureProvider(provider);
    this.worker = new OutboxWorker({
      store: this.store,
      provider: this.forced,
      now,
      random: Math.random,
      policy: HARNESS_POLICY,
      leaseMs: HARNESS_LEASE_MS,
    });
  }

  /** Same endpoint again (page reopened) returns the same id, so results stay together. */
  subscribe(input: SubscriptionInput): { id: string; endpointKind: string } | { error: string } {
    const existing = this.store.findSubscriptionByEndpoint(input.endpoint);
    if (existing && existing.disabledAt === null) return { id: existing.id, endpointKind: endpointKind(existing.endpoint) };
    if (this.store.subscriptionCount() >= MAX_SUBSCRIPTIONS) return { error: "too many subscriptions; restart the sender" };
    const record = this.store.addSubscription({ id: randomUUID(), ...input });
    return { id: record.id, endpointKind: endpointKind(record.endpoint) };
  }

  /** One button press: enqueue (twice when `duplicate`), optionally delayed and with forced failures. */
  send(request: SendRequest): { eventId: string; ticket: string; duplicateIgnored: boolean } | { error: string } {
    if (!this.store.getSubscription(request.subscriptionId)) return { error: "unknown subscription; tap Turn on again" };
    this.ticketCounter += 1;
    const ticket = String(this.ticketCounter);
    const input = {
      // IDEMPOTENT: the same shape the product would use, `order.ready:<order>:<subscription>`.
      idempotencyKey: `order.ready:test-${ticket}:${request.subscriptionId}`,
      subscriptionId: request.subscriptionId,
      payload: JSON.stringify(notificationContent(request.kind, ticket)),
      availableAt: this.now() + request.delaySeconds * MS_PER_SECOND,
    };
    const { event } = this.store.enqueue(input);
    const duplicateIgnored = request.duplicate ? !this.store.enqueue(input).isNew : false;
    this.forced.failNext(event.id, request.failFirst);
    this.meta.set(event.id, { kind: request.kind, ticket, receivedAt: null, clickedAt: null, duplicateIgnored });
    return { eventId: event.id, ticket, duplicateIgnored };
  }

  /** The service worker ran for this event (it is NOT proof the notification was displayed or seen). */
  markReceived(eventId: string): boolean {
    const meta = this.meta.get(eventId);
    if (meta && meta.receivedAt === null) meta.receivedAt = this.now();
    return meta !== undefined;
  }

  markClicked(eventId: string): boolean {
    const meta = this.meta.get(eventId);
    if (meta && meta.clickedAt === null) meta.clickedAt = this.now();
    return meta !== undefined;
  }

  /** Results for one phone, newest first. Times are the sender's clock, in ms since epoch (UTC). */
  status(subscriptionId: string) {
    const subscription = this.store.getSubscription(subscriptionId);
    if (!subscription) return null;
    const events = this.store
      .events()
      .filter((e) => e.subscriptionId === subscriptionId)
      .map((e) => this.describe(e))
      .reverse();
    return {
      subscription: {
        id: subscription.id,
        endpointKind: endpointKind(subscription.endpoint),
        disabledAt: subscription.disabledAt,
        disabledReason: subscription.disabledReason,
      },
      events,
      deadLetters: events.filter((e) => e.status === "dead"),
    };
  }

  private describe(event: OutboxEvent) {
    const meta = this.meta.get(event.id);
    return {
      eventId: event.id,
      ticket: meta?.ticket ?? "?",
      kind: meta?.kind ?? "plain",
      status: event.status,
      attempts: event.attempts,
      history: event.history,
      availableAt: event.availableAt,
      sentAt: event.sentAt,
      receivedAt: meta?.receivedAt ?? null,
      clickedAt: meta?.clickedAt ?? null,
      // From "due to send" to "service worker reported back"; includes the report-back request itself.
      arrivalMs: meta?.receivedAt ? meta.receivedAt - event.availableAt : null,
      duplicateIgnored: meta?.duplicateIgnored ?? false,
      lastError: event.lastError,
    };
  }
}
