/**
 * Shared helpers for the web-push spike tests: a fake clock, a scripted random source and a ready-made worker.
 *
 * Module:   spikes/web-push (THROWAWAY, never imported by product code)
 * Serves:   FR-12, AT-07 · ADR-0004 PoC (tests only, synthetic data)
 */
import type { RetryPolicy } from "./backoff";
import { FakePushProvider, type ScriptedOutcome } from "./fake-provider";
import { OutboxStore, OutboxWorker } from "./outbox";

export const SECOND = 1_000;

/** Retry policy used by the tests: small numbers so the arithmetic is easy to check by hand. */
export const TEST_POLICY: RetryPolicy = { baseDelayMs: 1_000, maxDelayMs: 30_000, maxAttempts: 5 };

/** Lease a worker holds on an event while it is sending (a crashed worker's lease runs out). */
export const TEST_LEASE_MS = 10_000;

/** A clock the test moves by hand. */
export function fakeClock(start = Date.UTC(2026, 10, 25, 12, 0, 0)) {
  let current = start;
  return {
    now: () => current,
    advance: (ms: number) => {
      current += ms;
    },
  };
}

/** Synthetic subscription: the endpoint host only matters for display, nothing is sent anywhere. */
export function syntheticSubscription(id: string) {
  return { id, endpoint: `https://push.example.test/${id}`, keys: { p256dh: "test-p256dh", auth: "test-auth" } };
}

/**
 * A store, a fake provider scripted per subscription, and one worker over them.
 * `random` defaults to 0.5 so retry delays are deterministic.
 */
export function makeWorld(script: Record<string, ScriptedOutcome[]> = {}, random: () => number = () => 0.5) {
  const clock = fakeClock();
  const store = new OutboxStore(clock.now);
  const provider = new FakePushProvider(script);
  const makeWorker = () =>
    new OutboxWorker({ store, provider, now: clock.now, random, policy: TEST_POLICY, leaseMs: TEST_LEASE_MS });
  store.addSubscription(syntheticSubscription("sub-1"));
  return { clock, store, provider, worker: makeWorker(), makeWorker };
}

/** Run worker ticks, moving the clock forward each time, until nothing is pending or the tick budget is used. */
export async function drain(world: ReturnType<typeof makeWorld>, stepMs = SECOND, maxTicks = 500) {
  for (let i = 0; i < maxTicks && world.store.hasPendingWork(); i += 1) {
    await world.worker.tick();
    world.clock.advance(stepMs);
  }
}
