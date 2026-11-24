/**
 * Minimal type declarations for the parts of `web-push` 3.6.7 the spike uses. Written by hand because the only
 * approved dependency is `web-push` itself (no `@types/web-push`).
 *
 * Module:   spikes/web-push (THROWAWAY, never imported by product code)
 * Serves:   FR-12 · spike scope item 2
 */
declare module "web-push" {
  interface PushSubscription {
    endpoint: string;
    keys: { p256dh: string; auth: string };
  }

  interface RequestOptions {
    TTL?: number;
    topic?: string;
    urgency?: "very-low" | "low" | "normal" | "high";
    timeout?: number;
    vapidDetails?: { subject: string; publicKey: string; privateKey: string };
  }

  interface SendResult {
    statusCode: number;
    body: string;
    headers: Record<string, string | undefined>;
  }

  /** Rejected by `sendNotification` when the push service answers with a non-2xx status. */
  class WebPushError extends Error {
    statusCode: number;
    headers: Record<string, string | undefined>;
    body: string;
    endpoint: string;
  }

  interface WebPush {
    sendNotification(subscription: PushSubscription, payload?: string | null, options?: RequestOptions): Promise<SendResult>;
    generateVAPIDKeys(): { publicKey: string; privateKey: string };
    WebPushError: typeof WebPushError;
  }

  const webpush: WebPush;
  export default webpush;
}
