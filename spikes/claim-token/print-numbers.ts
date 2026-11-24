/**
 * Prints the entropy and guess-resistance numbers quoted in docs/spikes/claim-token.md.
 * Run: pnpm exec tsx spikes/claim-token/print-numbers.ts
 *
 * Module:   spikes/claim-token (THROWAWAY, never imported by product code)
 * Serves:   AT-03 · spec item 8 (numbers computed, not estimated)
 * Inputs:   the limits proposed in the report (IP/device 10 per 15 min, branch 300 per 15 min)
 *           and the TTLs used in the tests. All are parameters, not decisions.
 */
import { attemptsAllowed, codeEntropyBits, successProbability, tokenEntropyBits } from "./numbers";

const MINUTE = 60_000;
const WINDOW_MS = 15 * MINUTE;
const PER_IP_LIMIT = 10;
const PER_BRANCH_LIMIT = 300;

const secrets = [
  { name: "QR/link token, 16 bytes", bits: tokenEntropyBits(16), space: 2 ** 128 },
  { name: "QR/link token, 32 bytes (default)", bits: tokenEntropyBits(32), space: 2 ** 256 },
  { name: "typed code, 6 digits", bits: codeEntropyBits(6), space: 10 ** 6 },
  { name: "typed code, 8 digits", bits: codeEntropyBits(8), space: 10 ** 8 },
];

/** How long a guesser has: receipt secret lifetime, staff code lifetime, one day of hammering. */
const periods = [
  { name: "staff code TTL (5 min)", ms: 5 * MINUTE },
  { name: "receipt secret TTL (2 h)", ms: 120 * MINUTE },
  { name: "24 h", ms: 24 * 60 * MINUTE },
];

function format(probability: number): string {
  return probability === 0 || probability < 1e-30 ? probability.toExponential(2) : probability.toPrecision(3);
}

console.log("Entropy");
for (const secret of secrets) console.log(`  ${secret.name}: ${secret.bits.toFixed(2)} bits, ${secret.space.toExponential(3)} values`);

console.log(`\nAttempts let through (sliding window ${WINDOW_MS / MINUTE} min, upper bound)`);
for (const period of periods) {
  console.log(
    `  ${period.name}: one IP/device ${attemptsAllowed(PER_IP_LIMIT, WINDOW_MS, period.ms)}, ` +
      `whole branch (rotating IPs) ${attemptsAllowed(PER_BRANCH_LIMIT, WINDOW_MS, period.ms)}`,
  );
}

console.log("\nChance one attacker guesses ONE given order's secret (upper bound, no repeats)");
for (const secret of secrets) {
  for (const period of periods) {
    const single = successProbability(attemptsAllowed(PER_IP_LIMIT, WINDOW_MS, period.ms), secret.space);
    const branch = successProbability(attemptsAllowed(PER_BRANCH_LIMIT, WINDOW_MS, period.ms), secret.space);
    console.log(`  ${secret.name}, ${period.name}: one IP ${format(single)}, rotating IPs ${format(branch)}`);
  }
}

console.log("\nWithout any limiter: 10,000 guesses at a 6-digit code");
console.log(`  success probability ${format(successProbability(10_000, 10 ** 6))}`);
