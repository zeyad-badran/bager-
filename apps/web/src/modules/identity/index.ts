/**
 * Public API of the `identity` module: staff roles and the permission matrix (UI hint only).
 *
 * Module:   identity
 * Serves:   FR-03 (staff identity and roles)
 * Rule:     other modules import from here (`../identity`), never from files inside it.
 */
export { PERMISSIONS, can, type Permission } from "./permissions";
export { STAFF_ROLES, isStaffRole, type RoleGrant, type StaffRole } from "./roles";
