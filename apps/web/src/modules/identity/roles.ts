/**
 * Staff roles.
 *
 * Module:   identity
 * Serves:   FR-03 (roles and permissions) · blueprint §8.3
 * Mirrors:  SQL enum `public.staff_role` (migration 20261120100000). Keep both lists identical;
 *           the unit test in `identity.test.ts` guards the order and the names.
 */

/** Every role a staff member can hold. Order is not significant for behaviour. */
export const STAFF_ROLES = ["owner", "manager", "cashier", "kitchen", "auditor"] as const;

export type StaffRole = (typeof STAFF_ROLES)[number];

export function isStaffRole(value: unknown): value is StaffRole {
  return typeof value === "string" && (STAFF_ROLES as readonly string[]).includes(value);
}

/**
 * One role held by one person, either for the whole restaurant (`branchId: null`)
 * or for exactly one branch. This is the minimum the permission rules need.
 */
export interface RoleGrant {
  readonly role: StaffRole;
  /** `null` = restaurant-wide. Otherwise the id of the single branch the role is limited to. */
  readonly branchId: string | null;
}
