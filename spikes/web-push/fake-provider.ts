/**
 * A fake push provider whose answers are scripted per subscription, and a fake device that shows notifications.
 * Nothing leaves the process.
 *
 * Module:   spikes/web-push (THROWAWAY, never imported by product code)
 * Serves:   FR-12, AT-07 · ADR-0004 ("dispatch against a fake push provider, with forced failures and double delivery")
 */
import type { ProviderResult } from "./classify";
import type { PushMessage, PushProvider, SubscriptionRecord } from "./outbox";

/**
 * One scripted answer:
 * - a number: HTTP status code
 * - `{ statusCode, retryAfterMs }`: status code with a Retry-After hint
 * - `"network-error"`: the request failed before the provider took it
 * - `"accepted-but-response-lost"`: the provider took it, but we only see a timeout (forces a duplicate)
 */
export type ScriptedOutcome =
  | number
  | { statusCode: number; retryAfterMs: number }
  | "network-error"
  | "accepted-but-response-lost";

/** What the fake provider received, for assertions. */
export interface RecordedCall extends PushMessage {
  subscriptionId: string;
}

const HTTP_CREATED = 201;

/** Answers from the per-subscription script, in order; once the script is used up it answers 201. */
export class FakePushProvider implements PushProvider {
  readonly calls: RecordedCall[] = [];
  private readonly scripts: Map<string, ScriptedOutcome[]>;

  constructor(script: Record<string, ScriptedOutcome[]> = {}) {
    this.scripts = new Map(Object.entries(script).map(([id, outcomes]) => [id, [...outcomes]]));
  }

  /** Appends answers for a subscription whose id is only known after it was created. */
  script(subscriptionId: string, outcomes: ScriptedOutcome[]): void {
    this.scriptFor(subscriptionId).push(...outcomes);
  }

  private scriptFor(subscriptionId: string): ScriptedOutcome[] {
    const existing = this.scripts.get(subscriptionId);
    if (existing) return existing;
    const created: ScriptedOutcome[] = [];
    this.scripts.set(subscriptionId, created);
    return created;
  }

  async send(subscription: SubscriptionRecord, message: PushMessage): Promise<ProviderResult> {
    this.calls.push({ ...message, subscriptionId: subscription.id });
    const outcome = this.scripts.get(subscription.id)?.shift() ?? HTTP_CREATED;
    if (outcome === "network-error") return { kind: "network-error", message: "fake: connection reset" };
    if (outcome === "accepted-but-response-lost") return { kind: "network-error", message: "fake: timeout after accept" };
    if (typeof outcome === "number") return { kind: "response", statusCode: outcome };
    return { kind: "response", statusCode: outcome.statusCode, retryAfterMs: outcome.retryAfterMs };
  }
}

/**
 * A device's notification tray: a notification with the same tag replaces the previous one
 * (Notifications API `tag`), which is how a duplicate push stays one visible notification.
 */
export class FakeDevice {
  private readonly tray = new Set<string>();

  receive(tag: string): void {
    this.tray.add(tag);
  }

  visibleNotifications(): number {
    return this.tray.size;
  }
}
