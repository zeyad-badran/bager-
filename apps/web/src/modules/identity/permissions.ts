/**
 * Permission matrix: which role may do what, and at which scope.
 *
 * Module:   identity
 * Serves:   FR-03 (roles and permissions), AT-02 / AT-11 (tenant isolation) · blueprint §8.3
 * Mirrors:  the RLS policies in migration 20261120100500 and the helper functions in
 *           20261120100300. Each rule below names the policy it copies.
 *
 * SECURITY: this file is a UI HINT (hide a button the person could not use anyway).
 *           It is NOT a security boundary. The database RLS policies and the server-side
 *           services decide for real; if this file and the policies ever disagree, the
 *           policies win and this file has a bug.
 */
import type { RoleGrant, StaffRole } from "./roles";

/** Actions that the tenancy tables support today. Order and delivery permissions join with their modules. */
export const PERMISSIONS = [
  "restaurant.read",
  "restaurant.update",
  "branch.read",
  "branch.create",
  "branch.update",
  "branch.delete",
  "branchSettings.read",
  "branchSettings.update",
  "membership.read",
  "membership.manage",
  "audit.read",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/**
 * How a rule looks at the person's grants:
 *  - "member":          any grant at all counts (SQL: is_restaurant_member)
 *  - "restaurant-wide": only a grant with branchId = null counts (SQL: has_restaurant_role)
 *  - "branch":          a restaurant-wide grant OR one scoped to the target branch counts
 *                       (SQL: has_branch_role / can_access_branch)
 */
type Scope = "member" | "restaurant-wide" | "branch";

interface Rule {
  readonly scope: Scope;
  /** Roles that satisfy the rule; `"any"` means every role. */
  readonly roles: readonly StaffRole[] | "any";
}

const OWNER_MANAGER: readonly StaffRole[] = ["owner", "manager"];

const RULES: Readonly<Record<Permission, Rule>> = {
  // restaurants_member_select
  "restaurant.read": { scope: "member", roles: "any" },
  // restaurants_owner_update
  "restaurant.update": { scope: "restaurant-wide", roles: ["owner"] },
  // branches_member_select
  "branch.read": { scope: "branch", roles: "any" },
  // branches_manager_insert (a new branch has no scope yet, so it needs a restaurant-wide role)
  "branch.create": { scope: "restaurant-wide", roles: OWNER_MANAGER },
  // branches_manager_update
  "branch.update": { scope: "branch", roles: OWNER_MANAGER },
  // branches_owner_delete
  "branch.delete": { scope: "restaurant-wide", roles: ["owner"] },
  // branch_settings_member_select
  "branchSettings.read": { scope: "branch", roles: "any" },
  // branch_settings_manager_update
  "branchSettings.update": { scope: "branch", roles: OWNER_MANAGER },
  // memberships_self_or_manager_select (the "see your own row" half is not role based)
  "membership.read": { scope: "restaurant-wide", roles: OWNER_MANAGER },
  // memberships_owner_insert / _update / _delete
  "membership.manage": { scope: "restaurant-wide", roles: ["owner"] },
  // audit_logs_reader_select
  "audit.read": { scope: "restaurant-wide", roles: ["owner", "manager", "auditor"] },
};

function grantSatisfies(grant: RoleGrant, rule: Rule, targetBranchId: string | undefined): boolean {
  if (rule.roles !== "any" && !rule.roles.includes(grant.role)) return false;

  switch (rule.scope) {
    case "member":
      return true;
    case "restaurant-wide":
      return grant.branchId === null;
    case "branch":
      // A branch-scoped rule is meaningless without a branch, so deny rather than guess.
      if (targetBranchId === undefined) return grant.branchId === null;
      return grant.branchId === null || grant.branchId === targetBranchId;
  }
}

/**
 * May a person holding `grants` (all within ONE restaurant) perform `permission`?
 *
 * @param grants         the person's role grants for the restaurant being acted on
 * @param permission     the action
 * @param targetBranchId the branch acted on; required for branch-scoped actions to allow
 *                       branch-limited staff (omit it and only restaurant-wide grants pass)
 */
export function can(
  grants: readonly RoleGrant[],
  permission: Permission,
  targetBranchId?: string,
): boolean {
  const rule = RULES[permission];
  return grants.some((grant) => grantSatisfies(grant, rule, targetBranchId));
}
