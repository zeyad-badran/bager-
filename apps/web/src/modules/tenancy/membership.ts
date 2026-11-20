/**
 * Membership: a person's role in a restaurant, optionally limited to one branch.
 *
 * Module:   tenancy
 * Serves:   FR-02 (branches, branch-scoped staff), FR-03 (roles) · AT-02, AT-11
 * Mirrors:  table `public.memberships` and helper `private.can_access_branch`.
 *
 * SECURITY: UI hint only. Postgres RLS decides what a person can really read or write.
 */
import { can, type RoleGrant } from "../identity";

export interface Membership extends RoleGrant {
  readonly userId: string;
  readonly restaurantId: string;
}

/** True for staff who work across every branch (SQL: `branch_id is null`). */
export function isRestaurantWide(membership: Membership): boolean {
  return membership.branchId === null;
}

/**
 * May this person see the branch at all?
 *
 * Only memberships in the SAME restaurant count, so holding a role in tenant A can
 * never open a branch of tenant B (AT-02, AT-11).
 */
export function canAccessBranch(
  memberships: readonly Membership[],
  restaurantId: string,
  branchId: string,
): boolean {
  const inThisRestaurant = memberships.filter((m) => m.restaurantId === restaurantId);
  return can(inThisRestaurant, "branch.read", branchId);
}
