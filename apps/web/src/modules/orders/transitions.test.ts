/**
 * Tests for the order status transition table.
 *
 * Module:   orders
 * Serves:   FR-10 (queue status lifecycle), AT-09 · blueprint §5.1
 *           The expected table below is copied from blueprint §5.1, NOT from transitions.ts,
 *           so a change to the code that is not also a change to the blueprint fails here.
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { ORDER_STATUSES, canTransition, isTerminalStatus, nextStatuses, type OrderStatus } from "./transitions";

/** Blueprint §5.1, row by row. */
const BLUEPRINT_5_1: Record<OrderStatus, readonly OrderStatus[]> = {
  new: ["preparing", "cancelled"],
  preparing: ["ready", "cancelled"],
  ready: ["collected"],
  collected: [],
  cancelled: [],
};

describe("FR-10 order statuses", () => {
  it("are exactly the five lifecycle states, matching the SQL enum public.order_status", () => {
    assert.deepEqual([...ORDER_STATUSES], ["new", "preparing", "ready", "collected", "cancelled"]);
  });
});

describe("FR-10 transition table (blueprint §5.1)", () => {
  it("allows exactly the blueprint's moves, checked over every from/to pair", () => {
    for (const from of ORDER_STATUSES) {
      for (const to of ORDER_STATUSES) {
        const expected = BLUEPRINT_5_1[from].includes(to);
        assert.equal(canTransition(from, to), expected, `${from} -> ${to}`);
      }
    }
  });

  it("lists the allowed next states for each state", () => {
    for (const from of ORDER_STATUSES) {
      assert.deepEqual([...nextStatuses(from)].sort(), [...BLUEPRINT_5_1[from]].sort(), from);
    }
  });

  it("never allows staying in the same state (no-op transitions are refused)", () => {
    for (const status of ORDER_STATUSES) {
      assert.equal(canTransition(status, status), false, status);
    }
  });

  it("READY can only move to COLLECTED, so READY is never set twice (AT-05)", () => {
    assert.deepEqual([...nextStatuses("ready")], ["collected"]);
    assert.equal(canTransition("ready", "ready"), false);
  });

  it("NEW cannot jump straight to READY or COLLECTED", () => {
    assert.equal(canTransition("new", "ready"), false);
    assert.equal(canTransition("new", "collected"), false);
  });
});

describe("FR-10 terminal states", () => {
  it("collected and cancelled are terminal; the others are not", () => {
    assert.deepEqual(
      ORDER_STATUSES.filter((status) => isTerminalStatus(status)),
      ["collected", "cancelled"],
    );
  });

  it("a terminal state allows no move at all", () => {
    for (const to of ORDER_STATUSES) {
      assert.equal(canTransition("collected", to), false, `collected -> ${to}`);
      assert.equal(canTransition("cancelled", to), false, `cancelled -> ${to}`);
    }
  });
});
