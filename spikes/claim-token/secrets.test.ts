/**
 * Tests for token generation, hashing and constant-time comparison.
 *
 * Module:   spikes/claim-token (THROWAWAY)
 * Serves:   FR-08, AT-03 (spec item 1: >= 128-bit, URL-safe, hash only, constant-time compare)
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { describe, it } from "node:test";
import {
  DEFAULT_TOKEN_BYTES,
  MIN_TOKEN_BYTES,
  generateNumericCode,
  generateToken,
  hashSecret,
  secretsMatch,
} from "./secrets";

const KEY = randomBytes(32);

describe("AT-03 claim token generation", () => {
  it("defaults to 32 random bytes (256 bits), at least the 128-bit floor", () => {
    assert.ok(DEFAULT_TOKEN_BYTES * 8 >= 128);
    assert.equal(MIN_TOKEN_BYTES * 8, 128);
    assert.equal(Buffer.from(generateToken(), "base64url").length, DEFAULT_TOKEN_BYTES);
  });

  it("is URL-safe (base64url alphabet, no padding)", () => {
    for (let i = 0; i < 200; i += 1) assert.match(generateToken(), /^[A-Za-z0-9_-]+$/);
  });

  it("refuses to make a token below 128 bits", () => {
    assert.throws(() => generateToken(15), RangeError);
  });

  it("does not repeat over 10,000 tokens", () => {
    const seen = new Set(Array.from({ length: 10_000 }, () => generateToken()));
    assert.equal(seen.size, 10_000);
  });

  it("numeric codes have exactly the requested digits, leading zeros kept", () => {
    for (let i = 0; i < 500; i += 1) assert.match(generateNumericCode(6), /^\d{6}$/);
  });
});

describe("AT-03 only a hash is stored", () => {
  it("the hash is an HMAC-SHA256 (32 bytes) that does not contain the token", () => {
    const token = generateToken();
    const hash = hashSecret(token, KEY);
    assert.equal(hash.length, 32);
    assert.ok(!hash.toString("hex").includes(Buffer.from(token).toString("hex")));
  });

  it("depends on the server key: the same token under another key hashes differently", () => {
    const token = generateToken();
    assert.notDeepEqual(hashSecret(token, KEY), hashSecret(token, randomBytes(32)));
  });
});

describe("AT-03 constant-time comparison", () => {
  it("matches equal hashes and rejects different ones", () => {
    const token = generateToken();
    assert.equal(secretsMatch(hashSecret(token, KEY), hashSecret(token, KEY)), true);
    assert.equal(secretsMatch(hashSecret(token, KEY), hashSecret(`${token}x`, KEY)), false);
  });

  it("returns false (does not throw) for buffers of different length", () => {
    assert.equal(secretsMatch(Buffer.alloc(32), Buffer.alloc(16)), false);
  });

  it("a tampered token (one character changed) no longer matches", () => {
    const token = generateToken();
    const last = token.at(-1) === "A" ? "B" : "A";
    const tampered = token.slice(0, -1) + last;
    assert.equal(secretsMatch(hashSecret(token, KEY), hashSecret(tampered, KEY)), false);
  });
});
