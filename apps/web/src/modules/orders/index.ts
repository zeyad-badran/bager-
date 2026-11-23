/**
 * Public API of the `orders` module: the status lifecycle and the order service.
 *
 * Module:   orders
 * Serves:   FR-06, FR-10 (manual order entry, queue status lifecycle), AT-05, AT-09
 * Rule:     other modules import from here (`../orders`), never from files inside it.
 */
export {
  ORDER_STATUSES,
  canTransition,
  isOrderStatus,
  isTerminalStatus,
  nextStatuses,
  type OrderStatus,
} from "./transitions";
export {
  OrderRepositoryError,
  createOrderService,
  type Order,
  type OrderRepository,
  type OrderService,
} from "./order-service";
