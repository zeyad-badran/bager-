/**
 * In-memory outbox and subscription store for the web-push spike. Stands in for the `outbox_events` table and a
 * future push-subscriptions table; nothing is persisted.
 *
 * Module:   spikes/web-push (THROWAWAY, never imported by product code)
 * Serves:   FR-12, AT-07 · blueprint §7.4 · ADR-0004 PoC
 * Protects: one event per idempotency key; an event is held by at most one worker at a time (lease), and a
 *           crashed worker's lease runs out so the event is not lost (at-least-once).
 */
import { randomUUID } from "node:crypto";

/** A browser push subscription as the sender keeps it. `disabledAt` is set once the endpoint is known dead. */
export interface SubscriptionRecord {
  id: string;
  endpoint: string;
  keys: { p256dh: string; auth: string };
  disabledAt: number | null;
  disabledReason: string | null;
}

export type EventStatus = "pending" | "in-flight" | "sent" | "dead";

/** One send attempt as it is shown in the dead-letter list and the harness results. */
export interface AttemptRecord {
  at: number;
  outcome: "accepted" | "retry" | "subscription-gone" | "permanent" | "skipped";
  detail: string;
}

export interface OutboxEvent {
  id: string;
  /** IDEMPOTENT: e.g. `order.ready:<order id>:<subscription id>`; a second enqueue with it is ignored. */
  idempotencyKey: string;
  subscriptionId: string;
  /** Opaque JSON for the service worker. */
  payload: string;
  createdAt: number;
  availableAt: number;
  status: EventStatus;
  attempts: number;
  nextAttemptAt: number;
  leaseUntil: number | null;
  leaseToken: string | null;
  sentAt: number | null;
  lastError: string | null;
  history: AttemptRecord[];
}

export interface EnqueueInput {
  idempotencyKey: string;
  subscriptionId: string;
  payload: string;
  /** Earliest send time; defaults to now. */
  availableAt?: number;
}

/** In-memory store. `now` is injected so tests control time. */
export class OutboxStore {
  private readonly subscriptions = new Map<string, SubscriptionRecord>();
  private readonly byKey = new Map<string, OutboxEvent>();

  constructor(private readonly now: () => number) {}

  addSubscription(input: { id: string; endpoint: string; keys: { p256dh: string; auth: string } }): SubscriptionRecord {
    const record: SubscriptionRecord = { ...input, disabledAt: null, disabledReason: null };
    this.subscriptions.set(record.id, record);
    return record;
  }

  getSubscription(id: string): SubscriptionRecord | undefined {
    return this.subscriptions.get(id);
  }

  findSubscriptionByEndpoint(endpoint: string): SubscriptionRecord | undefined {
    return [...this.subscriptions.values()].find((s) => s.endpoint === endpoint);
  }

  subscriptionCount(): number {
    return this.subscriptions.size;
  }

  /** Marks an endpoint dead so no further event is sent to it (blueprint §10.3: no endless retry loop). */
  disableSubscription(id: string, reason: string): void {
    const record = this.subscriptions.get(id);
    if (record && record.disabledAt === null) {
      record.disabledAt = this.now();
      record.disabledReason = reason;
    }
  }

  /** IDEMPOTENT: returns the existing event when the key was seen before, whatever its status. */
  enqueue(input: EnqueueInput): { event: OutboxEvent; isNew: boolean } {
    const existing = this.byKey.get(input.idempotencyKey);
    if (existing) return { event: existing, isNew: false };
    const now = this.now();
    const availableAt = input.availableAt ?? now;
    const event: OutboxEvent = {
      id: randomUUID(),
      idempotencyKey: input.idempotencyKey,
      subscriptionId: input.subscriptionId,
      payload: input.payload,
      createdAt: now,
      availableAt,
      status: "pending",
      attempts: 0,
      nextAttemptAt: availableAt,
      leaseUntil: null,
      leaseToken: null,
      sentAt: null,
      lastError: null,
      history: [],
    };
    this.byKey.set(event.idempotencyKey, event);
    return { event, isNew: true };
  }

  /**
   * CONCURRENCY: takes a lease on up to `limit` due events and returns them with their lease token.
   * Due = pending and its time has come, or in flight with an expired lease (the worker died).
   * Runs synchronously, so two workers in one process never claim the same event; a database version would
   * use `FOR UPDATE SKIP LOCKED`.
   */
  claimDue(leaseMs: number, limit: number): { event: OutboxEvent; leaseToken: string }[] {
    const now = this.now();
    const due = [...this.byKey.values()].filter(
      (e) =>
        (e.status === "pending" && e.nextAttemptAt <= now) ||
        (e.status === "in-flight" && e.leaseUntil !== null && e.leaseUntil <= now),
    );
    return due.slice(0, limit).map((event) => {
      const leaseToken = randomUUID();
      event.status = "in-flight";
      event.leaseUntil = now + leaseMs;
      event.leaseToken = leaseToken;
      return { event, leaseToken };
    });
  }

  /**
   * Records the outcome of one attempt, but only if `leaseToken` still holds the lease: a slow worker whose
   * lease expired must not overwrite the result of the worker that took over.
   */
  complete(event: OutboxEvent, leaseToken: string, attempt: AttemptRecord, next: CompletionNext): boolean {
    if (event.leaseToken !== leaseToken) return false;
    event.history.push(attempt);
    event.leaseUntil = null;
    event.leaseToken = null;
    if (next.kind === "sent") {
      event.status = "sent";
      event.sentAt = attempt.at;
      event.lastError = null;
    } else if (next.kind === "retry") {
      event.status = "pending";
      event.nextAttemptAt = next.at;
      event.lastError = attempt.detail;
    } else {
      event.status = "dead";
      event.lastError = next.reason;
    }
    return true;
  }

  events(): OutboxEvent[] {
    return [...this.byKey.values()];
  }

  /** The dead-letter list (blueprint §7.4: "dead-letter or surface repeatedly failing jobs"). */
  deadLetters(): OutboxEvent[] {
    return this.events().filter((e) => e.status === "dead");
  }

  hasPendingWork(): boolean {
    return this.events().some((e) => e.status === "pending" || e.status === "in-flight");
  }
}

export type CompletionNext = { kind: "sent" } | { kind: "retry"; at: number } | { kind: "dead"; reason: string };
