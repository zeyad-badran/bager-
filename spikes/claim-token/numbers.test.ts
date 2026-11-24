/**
 * Tests for the entropy and guess-resistance arithmetic used in the report.
 *
 * Module:   spikes/claim-token (THROWAWAY)
 * Serves:   AT-03 · spec item 8 ("measured entropy and guess-resistance numbers (computed, not estimated)")
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  attemptsAllowed,
  codeEntropyBits,
  successProbability,
  tokenEntropyBits,
  windowsToReach,
} from "./numbers";

describe("AT-03 entropy", () => {
  it("random tokens carry 8 bits per byte", () => {
    assert.equal(tokenEntropyBits(16), 128);
    assert.equal(tokenEntropyBits(32), 256);
  });

  it("a 6-digit code carries log2(10^6), about 19.93 bits", () => {
    assert.ok(Math.abs(codeEntropyBits(6) - 19.9316) < 0.0001);
  });
});

describe("AT-03 guess resistance", () => {
  it("guessing one valid code among 10^6 with n tries succeeds with probability n / 10^6", () => {
    assert.equal(successProbability(10_000, 1_000_000), 0.01);
    assert.equal(successProbability(2_000_000, 1_000_000), 1);
  });

  it("a sliding window lets at most limit x (full windows + 1) attempts through in a period", () => {
    assert.equal(attemptsAllowed(10, 15 * 60_000, 15 * 60_000), 20);
    assert.equal(attemptsAllowed(10, 15 * 60_000, 60 * 60_000), 50);
  });

  it("number of windows needed to try a given number of codes", () => {
    assert.equal(windowsToReach(500_000, 10), 50_000);
  });
});
