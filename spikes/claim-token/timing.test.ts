/**
 * Timing check: "unknown ticket", "wrong secret" and "expired" must not be told apart by how
 * long the answer takes, within a stated tolerance.
 *
 * Module:   spikes/claim-token (THROWAWAY)
 * Serves:   AT-03 · spec item 2 (indistinguishable "also in timing, within a stated tolerance")
 *
 * TOLERANCE (stated): the median durations of the three failure cases may differ by at most
 * 10 % of the slowest median, or by at most 2 microseconds, whichever is larger. Medians over
 * many interleaved runs, so one slow run (GC, scheduler) cannot decide the result.
 * This measures the in-process library only; network jitter in a real deployment is far larger
 * and is NOT measured here (see the report's "not tested" list). The rate limiter is left out
 * of the measurement: it runs first and does the same work whatever the ticket or secret.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BRANCH, CUSTOMER, MINUTE, makeService } from "./test-support";

const RUNS_PER_CASE = 3_000;
const WARM_UP_RUNS = 500;
const RELATIVE_TOLERANCE = 0.1;
const ABSOLUTE_TOLERANCE_NS = 2_000n;

function median(values: bigint[]): bigint {
  const sorted = [...values].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return sorted[Math.floor(sorted.length / 2)] ?? 0n;
}

describe("AT-03 failure answers take the same time", () => {
  it("unknown ticket, wrong secret and expired secret have medians within the stated tolerance", (t) => {
    const { service, clock } = makeService({
      claimSecretTtlMs: 10 * MINUTE,
      limits: [], // measure the claim logic itself; the limiter costs the same for every case
    });
    const expired = service.registerOrder(BRANCH, "11");
    clock.advance(10 * MINUTE);
    const live = service.registerOrder(BRANCH, "10");

    const cases: Record<string, () => unknown> = {
      unknownTicket: () => service.claim(CUSTOMER, BRANCH, "999", live.claimSecret),
      wrongSecret: () => service.claim(CUSTOMER, BRANCH, "10", expired.claimSecret),
      expiredSecret: () => service.claim(CUSTOMER, BRANCH, "11", expired.claimSecret),
    };
    const names = Object.keys(cases);
    const samples: Record<string, bigint[]> = Object.fromEntries(names.map((name) => [name, []]));

    for (let i = 0; i < WARM_UP_RUNS; i += 1) for (const name of names) cases[name]?.();
    // Interleave the cases so any drift (CPU frequency, GC) hits all three equally.
    for (let i = 0; i < RUNS_PER_CASE; i += 1) {
      for (const name of names) {
        const start = process.hrtime.bigint();
        cases[name]?.();
        samples[name]?.push(process.hrtime.bigint() - start);
      }
    }

    const medians = names.map((name) => median(samples[name] ?? []));
    const slowest = medians.reduce((a, b) => (a > b ? a : b));
    const fastest = medians.reduce((a, b) => (a < b ? a : b));
    const spread = slowest - fastest;
    const relativeAllowance = BigInt(Math.round(Number(slowest) * RELATIVE_TOLERANCE));
    const allowance = relativeAllowance > ABSOLUTE_TOLERANCE_NS ? relativeAllowance : ABSOLUTE_TOLERANCE_NS;

    t.diagnostic(
      `median ns: ${names.map((name, i) => `${name}=${medians[i]}`).join(", ")}; spread=${spread} ns; allowed=${allowance} ns`,
    );
    assert.ok(spread <= allowance, `spread ${spread} ns exceeds the allowed ${allowance} ns`);
  });
});
