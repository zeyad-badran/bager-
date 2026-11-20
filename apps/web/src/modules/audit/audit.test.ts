/**
 * Tests for audit entry descriptions.
 *
 * Module:   audit
 * Serves:   FR-14 (audit history)
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { describeAuditEntry, type AuditEntry } from "./audit-entry";

const baseEntry: AuditEntry = {
  id: "audit-1",
  restaurantId: "restaurant-alpha",
  branchId: null,
  actorUserId: "user-1",
  action: "UPDATE",
  entityTable: "branches",
  entityId: "branch-1",
  details: { changed_columns: ["display_name", "time_zone"] },
  occurredAt: "2026-11-20T10:00:00Z",
};

describe("FR-14 describeAuditEntry", () => {
  it("lists the changed columns of an UPDATE", () => {
    assert.deepEqual(describeAuditEntry(baseEntry).changedColumns, ["display_name", "time_zone"]);
  });

  it("marks a change without an actor as a system change", () => {
    assert.equal(describeAuditEntry({ ...baseEntry, actorUserId: null }).actor, "system");
    assert.equal(describeAuditEntry(baseEntry).actor, "user");
  });

  it("returns no columns for INSERT and DELETE", () => {
    assert.deepEqual(describeAuditEntry({ ...baseEntry, action: "INSERT", details: {} }).changedColumns, []);
    assert.deepEqual(describeAuditEntry({ ...baseEntry, action: "DELETE", details: {} }).changedColumns, []);
  });

  it("ignores malformed details instead of throwing", () => {
    assert.deepEqual(describeAuditEntry({ ...baseEntry, details: { changed_columns: "name" } }).changedColumns, []);
    assert.deepEqual(describeAuditEntry({ ...baseEntry, details: { changed_columns: ["a", 7, null] } }).changedColumns, ["a"]);
    assert.deepEqual(describeAuditEntry({ ...baseEntry, details: {} }).changedColumns, []);
  });

  it("never copies row values into the description", () => {
    const description = describeAuditEntry({ ...baseEntry, details: { changed_columns: ["name"], secret: "x" } });
    assert.equal(JSON.stringify(description).includes("secret"), false);
  });
});
