/**
 * Tests for staff roles and the permission matrix.
 *
 * Module:   identity
 * Serves:   FR-03 (roles and permissions), AT-02 (a user never reaches another tenant's data
 *           through branch scoping). The database tests in supabase/tests are the real proof;
 *           these keep the UI hint in step with them.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PERMISSIONS, can } from "./permissions";
import { STAFF_ROLES, isStaffRole, type RoleGrant } from "./roles";

const BRANCH_A = "branch-a";
const BRANCH_B = "branch-b";

const wide = (role: RoleGrant["role"]): RoleGrant[] => [{ role, branchId: null }];
const onlyA = (role: RoleGrant["role"]): RoleGrant[] => [{ role, branchId: BRANCH_A }];

describe("FR-03 roles", () => {
  it("lists exactly the roles of the SQL enum public.staff_role", () => {
    assert.deepEqual([...STAFF_ROLES], ["owner", "manager", "cashier", "kitchen", "auditor"]);
  });

  it("isStaffRole accepts only known roles", () => {
    assert.equal(isStaffRole("owner"), true);
    assert.equal(isStaffRole("admin"), false);
    assert.equal(isStaffRole(undefined), false);
  });
});

describe("FR-03 permission matrix (mirrors the RLS policies)", () => {
  it("owner can do everything restaurant-wide", () => {
    for (const permission of PERMISSIONS) {
      assert.equal(can(wide("owner"), permission, BRANCH_A), true, permission);
    }
  });

  it("manager manages branches and settings but not the restaurant record or memberships", () => {
    const manager = wide("manager");
    assert.equal(can(manager, "branch.create"), true);
    assert.equal(can(manager, "branch.update", BRANCH_A), true);
    assert.equal(can(manager, "branchSettings.update", BRANCH_A), true);
    assert.equal(can(manager, "membership.read"), true);
    assert.equal(can(manager, "audit.read"), true);
    assert.equal(can(manager, "restaurant.update"), false);
    assert.equal(can(manager, "branch.delete", BRANCH_A), false);
    assert.equal(can(manager, "membership.manage"), false);
  });

  it("cashier and kitchen can read their restaurant and branch but change nothing", () => {
    for (const role of ["cashier", "kitchen"] as const) {
      const grants = wide(role);
      assert.equal(can(grants, "restaurant.read"), true, role);
      assert.equal(can(grants, "branch.read", BRANCH_A), true, role);
      assert.equal(can(grants, "branchSettings.read", BRANCH_A), true, role);
      for (const denied of [
        "restaurant.update",
        "branch.create",
        "branch.update",
        "branch.delete",
        "branchSettings.update",
        "membership.read",
        "membership.manage",
        "audit.read",
      ] as const) {
        assert.equal(can(grants, denied, BRANCH_A), false, `${role} must not ${denied}`);
      }
    }
  });

  it("auditor reads the audit trail and nothing that changes data", () => {
    const auditor = wide("auditor");
    assert.equal(can(auditor, "audit.read"), true);
    assert.equal(can(auditor, "branch.update", BRANCH_A), false);
    assert.equal(can(auditor, "membership.read"), false);
  });

  it("a branch-limited role works on its own branch only (FR-02)", () => {
    const cashier = onlyA("cashier");
    assert.equal(can(cashier, "branch.read", BRANCH_A), true);
    assert.equal(can(cashier, "branch.read", BRANCH_B), false);

    const manager = onlyA("manager");
    assert.equal(can(manager, "branch.update", BRANCH_A), true);
    assert.equal(can(manager, "branch.update", BRANCH_B), false);
  });

  it("a branch-limited manager cannot create branches or read the audit trail (needs restaurant-wide)", () => {
    const manager = onlyA("manager");
    assert.equal(can(manager, "branch.create"), false);
    assert.equal(can(manager, "audit.read"), false);
    assert.equal(can(manager, "membership.read"), false);
  });

  it("a branch-scoped action without a target branch only passes for restaurant-wide staff", () => {
    assert.equal(can(onlyA("manager"), "branch.update"), false);
    assert.equal(can(wide("manager"), "branch.update"), true);
  });

  it("a person with no grants can do nothing", () => {
    for (const permission of PERMISSIONS) {
      assert.equal(can([], permission, BRANCH_A), false, permission);
    }
  });

  it("several grants combine: any one that satisfies the rule is enough", () => {
    const mixed: RoleGrant[] = [
      { role: "cashier", branchId: BRANCH_A },
      { role: "manager", branchId: BRANCH_B },
    ];
    assert.equal(can(mixed, "branch.update", BRANCH_B), true);
    assert.equal(can(mixed, "branch.update", BRANCH_A), false);
  });
});
