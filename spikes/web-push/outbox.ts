/**
 * Minimal outbox worker: takes due events, sends them through a push provider, and records accept, retry,
 * subscription-gone or dead-letter.
 *
 * Module:   spikes/web-push (THROWAWAY, never imported by product code)
 * Serves:   FR-12, AT-07 · blueprint §7.4 · ADR-0004 PoC (at-least-once, idempotency, backoff with jitter,
 *           permanent vs retryable errors, dead-letter visibility, safe to run twice)
 * Protects: READY is pushed once per subscription in the normal case; when a duplicate is unavoidable
 *           (response lost after accept), the same Topic and tag make the device show it once.
 */
import { createHash } from "node:crypto";
import { backoffDelayMs, type RetryPolicy } from "./backoff";
import { classifyResult, type ProviderResult } from "./classify";
import type { AttemptRecord, CompletionNext, OutboxEvent, OutboxStore, SubscriptionRecord } from "./outbox-store";

export { OutboxStore } from "./outbox-store";
export type { OutboxEvent, SubscriptionRecord } from "./outbox-store";

/** What is handed to a provider for one attempt. */
export interface PushMessage {
  eventId: string;
  payload: string;
  /** RFC 8030 Topic: the push service replaces an undelivered message with the same topic. */
  topic: string;
  /** Notification tag for the service worker: a new notification with the same tag replaces the old one. */
  tag: string;
  ttlSeconds: number;
  urgency: "high";
}

/** A Web Push sender (real `web-push`, or the fake). Must not throw for HTTP errors; return them. */
export interface PushProvider {
  send(subscription: SubscriptionRecord, message: PushMessage): Promise<ProviderResult>;
}

export interface WorkerOptions {
  store: OutboxStore;
  provider: PushProvider;
  now: () => number;
  random: () => number;
  policy: RetryPolicy;
  leaseMs: number;
  /** Events taken per tick. */
  batchSize?: number;
  /** How long the push service keeps an undelivered message. A READY that arrives after pickup is noise. */
  ttlSeconds?: number;
}

const DEFAULT_BATCH_SIZE = 20;
/** 15 minutes: assumption for the spike, not a product decision (an order is normally collected sooner). */
const DEFAULT_TTL_SECONDS = 15 * 60;
/** RFC 8030 §5.4: a topic is at most 32 characters of the URL-safe base64 alphabet. */
const TOPIC_MAX_LENGTH = 32;

/** Stable Topic header for an idempotency key (hashed, so no order data leaks to the push service). */
export function topicFor(idempotencyKey: string): string {
  return createHash("sha256").update(idempotencyKey).digest("base64url").slice(0, TOPIC_MAX_LENGTH);
}

export class OutboxWorker {
  private readonly batchSize: number;
  private readonly ttlSeconds: number;

  constructor(private readonly options: WorkerOptions) {
    this.batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
    this.ttlSeconds = options.ttlSeconds ?? DEFAULT_TTL_SECONDS;
  }

  /**
   * IDEMPOTENT: one pass over due events. Safe to call from several workers at once and to call again
   * after a crash; returns how many events were attempted.
   */
  async tick(): Promise<number> {
    const claimed = this.options.store.claimDue(this.options.leaseMs, this.batchSize);
    await Promise.all(claimed.map(({ event, leaseToken }) => this.process(event, leaseToken)));
    return claimed.length;
  }

  private async process(event: OutboxEvent, leaseToken: string): Promise<void> {
    const { store } = this.options;
    const subscription = store.getSubscription(event.subscriptionId);
    if (!subscription || subscription.disabledAt !== null) {
      const reason = subscription
        ? `subscription disabled (${subscription.disabledReason ?? "unknown"})`
        : "unknown subscription";
      store.complete(event, leaseToken, this.attempt("skipped", reason), { kind: "dead", reason });
      return;
    }

    event.attempts += 1;
    const result = await this.safeSend(subscription, event);
    const { attempt, next } = this.decide(event, result);
    // CONCURRENCY: `complete` ignores us if our lease was taken over while we were waiting.
    const isCurrent = store.complete(event, leaseToken, attempt, next);
    if (isCurrent && attempt.outcome === "subscription-gone") store.disableSubscription(subscription.id, attempt.detail);
  }

  private async safeSend(subscription: SubscriptionRecord, event: OutboxEvent): Promise<ProviderResult> {
    try {
      return await this.options.provider.send(subscription, {
        eventId: event.id,
        payload: event.payload,
        topic: topicFor(event.idempotencyKey),
        tag: event.idempotencyKey,
        ttlSeconds: this.ttlSeconds,
        urgency: "high",
      });
    } catch (error) {
      return { kind: "network-error", message: error instanceof Error ? error.message : String(error) };
    }
  }

  private decide(event: OutboxEvent, result: ProviderResult): { attempt: AttemptRecord; next: CompletionNext } {
    const detail = result.kind === "response" ? `HTTP ${result.statusCode}` : `network error: ${result.message}`;
    const classified = classifyResult(result);
    switch (classified.kind) {
      case "accepted":
        return { attempt: this.attempt("accepted", detail), next: { kind: "sent" } };
      case "subscription-gone":
        return {
          attempt: this.attempt("subscription-gone", detail),
          next: { kind: "dead", reason: `subscription gone (${detail})` },
        };
      case "permanent":
        return { attempt: this.attempt("permanent", detail), next: { kind: "dead", reason: `permanent error (${detail})` } };
      case "retry": {
        const { policy, random } = this.options;
        if (event.attempts >= policy.maxAttempts) {
          const reason = `retries exhausted after ${event.attempts} attempts (last: ${detail})`;
          return { attempt: this.attempt("retry", detail), next: { kind: "dead", reason } };
        }
        const delay = Math.max(backoffDelayMs(event.attempts, policy, random), classified.retryAfterMs ?? 0);
        return { attempt: this.attempt("retry", detail), next: { kind: "retry", at: this.options.now() + delay } };
      }
    }
  }

  private attempt(outcome: AttemptRecord["outcome"], detail: string): AttemptRecord {
    return { at: this.options.now(), outcome, detail };
  }
}
