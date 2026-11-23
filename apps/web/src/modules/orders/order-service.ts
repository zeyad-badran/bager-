/**
 * Order service: the server-side entry point for creating orders and changing their status.
 *
 * Module:   orders
 * Serves:   FR-06 (manual order entry), FR-10 (transitions), AT-06, AT-09, AT-11
 *           · blueprint §5.1, docs/code-style.md §3 (handler -> service -> repository), §4
 * Protects: callers get stable DomainError codes (CONFLICT, INVALID_TRANSITION, NOT_ALLOWED,
 *           INVALID_INPUT) instead of database error text.
 *
 * Deliberately THIN: the rules (who may, which move, which version) are enforced inside the
 * database functions create_manual_order() / transition_order() (migration 20261123100300), in
 * one transaction with the audit row and the outbox event. This service validates input
 * shape, calls the repository and translates errors. No Next.js route handler exists yet.
 */
import { DomainError, type DomainErrorCode } from "../shared";
import { isOrderStatus, type OrderStatus } from "./transitions";

/** An order as the service returns it. Timestamps are ISO-8601 strings in UTC. */
export interface Order {
  readonly id: string;
  readonly restaurantId: string;
  readonly branchId: string;
  /** Display value only; repeats across restaurants and is reused (blueprint §5.2). */
  readonly ticketNumber: string;
  readonly source: "manual";
  readonly status: OrderStatus;
  /** Optimistic-concurrency counter; send it back as `expectedVersion` (AT-09). */
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly readyAt: string | null;
  readonly closedAt: string | null;
}

/**
 * The only code that talks to the database for orders. A Supabase-backed implementation
 * arrives with the first route handler; tests use a fake.
 * Implementations throw `OrderRepositoryError` carrying the database SQLSTATE on failure.
 */
export interface OrderRepository {
  createManualOrder(branchId: string, ticketNumber: string): Promise<Order>;
  transitionOrder(orderId: string, expectedVersion: number, toStatus: OrderStatus): Promise<Order>;
}

/** A failure reported by the database, with its SQLSTATE (for example `PT409`). */
export class OrderRepositoryError extends Error {
  readonly databaseCode: string;

  constructor(databaseCode: string, message: string) {
    super(message);
    this.name = "OrderRepositoryError";
    this.databaseCode = databaseCode;
  }
}

type ErrorMap = Readonly<Record<string, DomainErrorCode>>;

/** SQLSTATEs both order functions raise with the same meaning (migration 20261123100300). */
const COMMON_DATABASE_ERRORS: ErrorMap = {
  "42501": "NOT_ALLOWED", //   no permission, or the order/branch does not exist (AT-11)
  "22023": "INVALID_INPUT", // a required argument was missing
  "23514": "INVALID_INPUT", // check constraint, e.g. blank or too long ticket number
};

/**
 * Per-operation maps. PT422 means a different thing in each function, so the operation
 * decides: create_manual_order raises it for an inactive branch (migration 20261124100100),
 * transition_order for a move blueprint §5.1 does not allow. Anything not listed is
 * unexpected and is rethrown unchanged.
 */
const CREATE_ERRORS: ErrorMap = { ...COMMON_DATABASE_ERRORS, PT422: "BRANCH_INACTIVE" };
const TRANSITION_ERRORS: ErrorMap = {
  ...COMMON_DATABASE_ERRORS,
  PT409: "CONFLICT", //           version changed since read (AT-09)
  PT422: "INVALID_TRANSITION", // not allowed by blueprint §5.1
};

/** Canonical UUID text form, as Postgres prints it. */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertUuid(value: string, field: string): void {
  if (!UUID_PATTERN.test(value)) throw new DomainError("INVALID_INPUT", `${field} must be a UUID`);
}

/** Build a translator: a known database failure becomes a DomainError; everything else passes through. */
function translateWith(map: ErrorMap) {
  return (error: unknown): never => {
    if (error instanceof OrderRepositoryError) {
      const code = map[error.databaseCode];
      if (code !== undefined) throw new DomainError(code, error.message);
    }
    throw error;
  };
}

/** Build the order service around a repository (dependency injection keeps it testable). */
export function createOrderService(repository: OrderRepository) {
  return {
    /**
     * FR-06: create a manual order (status new, version 1) in a branch.
     * @throws DomainError INVALID_INPUT (bad branch id or blank ticket), NOT_ALLOWED,
     *         BRANCH_INACTIVE (the branch accepts no new orders)
     */
    async createManualOrder(branchId: string, ticketNumber: string): Promise<Order> {
      assertUuid(branchId, "branchId");
      const trimmed = ticketNumber.trim();
      if (trimmed === "") throw new DomainError("INVALID_INPUT", "ticketNumber must not be blank");
      return repository.createManualOrder(branchId, trimmed).catch(translateWith(CREATE_ERRORS));
    },

    /**
     * FR-10: move an order to `toStatus`, provided it is still at `expectedVersion`.
     * `toStatus` is `string` because it comes from untrusted input; it is checked here.
     * @throws DomainError INVALID_INPUT, NOT_ALLOWED, CONFLICT (refresh and retry),
     *         INVALID_TRANSITION
     */
    async transition(orderId: string, expectedVersion: number, toStatus: string): Promise<Order> {
      assertUuid(orderId, "orderId");
      if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
        throw new DomainError("INVALID_INPUT", "expectedVersion must be a positive whole number");
      }
      if (!isOrderStatus(toStatus)) throw new DomainError("INVALID_INPUT", "toStatus is not an order status");
      return repository.transitionOrder(orderId, expectedVersion, toStatus).catch(translateWith(TRANSITION_ERRORS));
    },
  };
}

export type OrderService = ReturnType<typeof createOrderService>;
