/**
 * Tests for membership scoping and time-zone validation.
 *
 * Module:   tenancy
 * Serves:   FR-02 (branch scope), AT-02 / AT-11 (tenant isolation), FR-02 (branch time zone)
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DomainError } from "../shared";
import { canAccessBranch, isRestaurantWide, type Membership } from "./membership";
import { assertValidTimeZone, isValidTimeZone } from "./time-zone";

const ALPHA = "restaurant-alpha";
const BETA = "restaurant-beta";
const ALPHA_DOWNTOWN = "branch-alpha-downtown";
const ALPHA_MALL = "branch-alpha-mall";
const BETA_MAIN = "branch-beta-main";

const membership = (restaurantId: string, branchId: string | null): Membership => ({
  userId: "user-1",
  restaurantId,
  branchId,
  role: "cashier",
});

describe("FR-02 branch access", () => {
  it("restaurant-wide staff see every branch of their restaurant", () => {
    const grants = [membership(ALPHA, null)];
    assert.equal(canAccessBranch(grants, ALPHA, ALPHA_DOWNTOWN), true);
    assert.equal(canAccessBranch(grants, ALPHA, ALPHA_MALL), true);
  });

  it("branch-scoped staff see only their own branch", () => {
    const grants = [membership(ALPHA, ALPHA_DOWNTOWN)];
    assert.equal(canAccessBranch(grants, ALPHA, ALPHA_DOWNTOWN), true);
    assert.equal(canAccessBranch(grants, ALPHA, ALPHA_MALL), false);
  });

  it("isRestaurantWide reflects a null branch", () => {
    assert.equal(isRestaurantWide(membership(ALPHA, null)), true);
    assert.equal(isRestaurantWide(membership(ALPHA, ALPHA_MALL)), false);
  });
});

describe("AT-02 / AT-11 tenant isolation", () => {
  it("a role in restaurant A never opens a branch of restaurant B", () => {
    const grants = [membership(ALPHA, null)];
    assert.equal(canAccessBranch(grants, BETA, BETA_MAIN), false);
  });

  it("a branch id belonging to another tenant is not reachable even with a matching branch scope", () => {
    // Defensive case: a grant for branch X in tenant A says nothing about tenant B.
    const grants = [membership(ALPHA, BETA_MAIN)];
    assert.equal(canAccessBranch(grants, BETA, BETA_MAIN), false);
  });

  it("no memberships means no access", () => {
    assert.equal(canAccessBranch([], ALPHA, ALPHA_DOWNTOWN), false);
  });
});

describe("FR-02 time zone validation", () => {
  it("accepts real IANA names", () => {
    for (const zone of ["UTC", "Asia/Amman", "America/Argentina/Buenos_Aires", "Etc/GMT+1"]) {
      assert.equal(isValidTimeZone(zone), true, zone);
    }
  });

  it("rejects unknown names, wrong casing, blanks and non-strings", () => {
    for (const bad of ["Mars/Olympus", "asia/amman", "", " UTC", "Asia/", 42, null, undefined]) {
      assert.equal(isValidTimeZone(bad), false, String(bad));
    }
  });

  it("assertValidTimeZone throws a DomainError with a stable code", () => {
    assert.throws(
      () => assertValidTimeZone("Mars/Olympus"),
      (error: unknown) => error instanceof DomainError && error.code === "INVALID_INPUT",
    );
    assert.doesNotThrow(() => assertValidTimeZone("Asia/Amman"));
  });
});
