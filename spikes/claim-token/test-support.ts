/**
 * Test helpers for the claim-token spike: a controllable clock, a throwaway server key and
 * a service factory with small, explicit settings.
 *
 * Module:   spikes/claim-token (THROWAWAY, never imported by product code)
 * Serves:   FR-08, FR-09, AT-03, AT-04 (test fixtures) · ADR-0006 evidence
 */
import { randomBytes } from "node:crypto";
import { ClaimService, type ClaimConfig, type ClaimEvent } from "./claim-service";

/** A clock the test moves by hand, so expiry boundaries are exact. */
export function fakeClock(startMs = Date.UTC(2026, 10, 24, 12, 0, 0)) {
  let now = startMs;
  return {
    now: () => now,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

export const MINUTE = 60_000;

/** Settings small enough to reach every limit in a test. All of them are parameters (ADR-0006). */
export function testConfig(overrides: Partial<ClaimConfig> = {}): ClaimConfig {
  return {
    // A random key per test run: no real key ever lives in a file (spec item 1).
    serverKey: randomBytes(32),
    secretKind: "token",
    codeDigits: 6,
    claimSecretTtlMs: 120 * MINUTE,
    sessionTtlMs: 180 * MINUTE,
    inviteTtlMs: 10 * MINUTE,
    inviteMaxUses: 2,
    deviceCap: 3,
    staffCodeTtlMs: 5 * MINUTE,
    staffCodeDigits: 6,
    limits: [
      { name: "ip", limit: 1_000, windowMs: 15 * MINUTE },
      { name: "device", limit: 1_000, windowMs: 15 * MINUTE },
      { name: "branch", limit: 1_000, windowMs: 15 * MINUTE },
    ],
    ...overrides,
  };
}

export function makeService(overrides: Partial<ClaimConfig> = {}) {
  const clock = fakeClock();
  const events: ClaimEvent[] = [];
  const service = new ClaimService(testConfig(overrides), clock.now, (event) => events.push(event));
  return { service, clock, events };
}

export const CUSTOMER = { ip: "198.51.100.7", deviceId: "device-a" };
export const OTHER_DEVICE = { ip: "198.51.100.8", deviceId: "device-b" };
export const THIRD_DEVICE = { ip: "198.51.100.9", deviceId: "device-c" };
export const BRANCH = "20000000-0000-4000-8000-000000000001";
