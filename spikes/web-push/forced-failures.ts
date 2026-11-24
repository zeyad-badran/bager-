/**
 * Wraps a push provider and makes the first N attempts of a chosen event fail with 503, so the tester can watch
 * retry-with-backoff end in a real notification on a real phone.
 *
 * Module:   spikes/web-push (THROWAWAY, never imported by product code)
 * Serves:   AT-07 (push provider unavailable) · ADR-0004 ("forced failures")
 */
import type { ProviderResult } from "./classify";
import type { PushMessage, PushProvider, SubscriptionRecord } from "./outbox";

const HTTP_SERVICE_UNAVAILABLE = 503;

export class ForcedFailureProvider implements PushProvider {
  private readonly remaining = new Map<string, number>();

  constructor(private readonly inner: PushProvider) {}

  /** The next `count` attempts for `eventId` answer 503 without calling the real provider. */
  failNext(eventId: string, count: number): void {
    if (count > 0) this.remaining.set(eventId, count);
  }

  async send(subscription: SubscriptionRecord, message: PushMessage): Promise<ProviderResult> {
    const left = this.remaining.get(message.eventId) ?? 0;
    if (left > 0) {
      this.remaining.set(message.eventId, left - 1);
      return { kind: "response", statusCode: HTTP_SERVICE_UNAVAILABLE };
    }
    this.remaining.delete(message.eventId);
    return this.inner.send(subscription, message);
  }
}
