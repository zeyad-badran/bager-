/**
 * Order statuses and the allowed-transition table.
 *
 * Module:   orders
 * Serves:   FR-10 (queue status lifecycle), AT-05, AT-09 · blueprint §5.1
 * Mirrors:  SQL enum `public.order_status` (migration 20261123100000) and
 *           `private.is_order_transition_allowed` (migration 20261123100300).
 * Protects: the UI and services can ask "is this move valid?" without a round trip.
 *
 * SECURITY: like identity/permissions.ts this is a HINT (which buttons to show).
 *           The database function transition_order() decides for real; if the two ever
 *           disagree, the database wins and this file has a bug.
 */

/** The lifecycle states, in lifecycle order. Must match `public.order_status` exactly. */
export const ORDER_STATUSES = ["new", "preparing", "ready", "collected", "cancelled"] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

/**
 * Blueprint §5.1: the states each state may move to. An empty list means terminal.
 * READY moves only to COLLECTED, which is why READY can never be set twice (AT-05).
 */
const ALLOWED_TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  new: ["preparing", "cancelled"],
  preparing: ["ready", "cancelled"],
  ready: ["collected"],
  collected: [],
  cancelled: [],
};

export function isOrderStatus(value: unknown): value is OrderStatus {
  return typeof value === "string" && (ORDER_STATUSES as readonly string[]).includes(value);
}

/** The states an order in `from` may move to next (empty for terminal states). */
export function nextStatuses(from: OrderStatus): readonly OrderStatus[] {
  return ALLOWED_TRANSITIONS[from];
}

/** Is `from -> to` a valid move? Staying in the same state is never valid. */
export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

/** Collected and cancelled are terminal: no move leaves them (blueprint §5.1, "none by default"). */
export function isTerminalStatus(status: OrderStatus): boolean {
  return ALLOWED_TRANSITIONS[status].length === 0;
}
