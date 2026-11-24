/**
 * The real provider: sends through the `web-push` package to the browser vendor's push service (FCM, Apple,
 * Mozilla, WNS). Free, no account; the VAPID keys come from the ignored `.env.local`.
 *
 * Module:   spikes/web-push (THROWAWAY, never imported by product code)
 * Serves:   FR-12 · spike scope item 2
 * Protects: HTTP errors are returned, not thrown, so the outbox classifies them (classify.ts). The VAPID private
 *           key is held in memory only and never logged.
 */
import webpush from "web-push";
import { parseRetryAfter, type ProviderResult } from "./classify";
import type { PushMessage, PushProvider, SubscriptionRecord } from "./outbox";

export interface VapidConfig {
  subject: string;
  publicKey: string;
  privateKey: string;
}

/** Fail an attempt that hangs, so the worker's lease is not held forever. */
const SEND_TIMEOUT_MS = 10_000;
export class WebPushProvider implements PushProvider {
  constructor(private readonly vapid: VapidConfig) {}

  async send(subscription: SubscriptionRecord, message: PushMessage): Promise<ProviderResult> {
    // The service worker reads eventId (to report receipt) and tag (to collapse duplicates) from the payload.
    const body = JSON.stringify({ ...JSON.parse(message.payload), eventId: message.eventId, tag: message.tag });
    try {
      const result = await webpush.sendNotification({ endpoint: subscription.endpoint, keys: subscription.keys }, body, {
        TTL: message.ttlSeconds,
        topic: message.topic,
        urgency: message.urgency,
        timeout: SEND_TIMEOUT_MS,
        vapidDetails: this.vapid,
      });
      return { kind: "response", statusCode: result.statusCode };
    } catch (error) {
      if (error instanceof webpush.WebPushError) {
        const retryAfterMs = parseRetryAfter(error.headers["retry-after"], Date.now());
        return retryAfterMs === undefined
          ? { kind: "response", statusCode: error.statusCode }
          : { kind: "response", statusCode: error.statusCode, retryAfterMs };
      }
      return { kind: "network-error", message: error instanceof Error ? error.message : String(error) };
    }
  }
}
