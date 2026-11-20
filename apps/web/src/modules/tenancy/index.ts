/**
 * Public API of the `tenancy` module: restaurants, branches and who belongs where.
 *
 * Module:   tenancy
 * Serves:   FR-01, FR-02 (multi-tenant restaurants, branch management)
 * Rule:     other modules import from here (`../tenancy`), never from files inside it.
 */
export { canAccessBranch, isRestaurantWide, type Membership } from "./membership";
export { assertValidTimeZone, isValidTimeZone } from "./time-zone";
