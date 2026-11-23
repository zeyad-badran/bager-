/**
 * Tests for the order service: input checks and the mapping of database error codes
 * to stable domain error codes.
 *
 * Module:   orders
 * Serves:   FR-06 (manual order entry), FR-10 (transitions), AT-09 (conflict), AT-06 / AT-11
 *           (not allowed) · docs/code-style.md §4 (typed domain errors with stable codes)
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { DomainError, type DomainErrorCode } from "../shared";
import {
  OrderRepositoryError,
  createOrderService,
  type Order,
  type OrderRepository,
} from "./order-service";

const ORDER: Order = {
  id: "30000000-0000-4000-8000-000000000001",
  restaurantId: "10000000-0000-4000-8000-000000000001",
  branchId: "20000000-0000-4000-8000-000000000001",
  ticketNumber: "42",
  source: "manual",
  status: "preparing",
  version: 2,
  createdAt: "2026-11-23T10:00:00.000Z",
  updatedAt: "2026-11-23T10:01:00.000Z",
  readyAt: null,
  closedAt: null,
};

/** A repository double that records calls and either returns ORDER or throws the given error. */
function fakeRepository(error?: unknown) {
  const calls: string[] = [];
  const respond = async (): Promise<Order> => {
    if (error !== undefined) throw error;
    return ORDER;
  };
  const repository: OrderRepository = {
    createManualOrder: async (branchId, ticketNumber) => {
      calls.push(`create ${branchId} ${ticketNumber}`);
      return respond();
    },
    transitionOrder: async (orderId, expectedVersion, toStatus) => {
      calls.push(`transition ${orderId} ${expectedVersion} ${toStatus}`);
      return respond();
    },
  };
  return { repository, calls };
}

async function rejectsWithCode(promise: Promise<unknown>, code: DomainErrorCode): Promise<void> {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof DomainError, "expected a DomainError");
    assert.equal(error.code, code);
    return true;
  });
}

describe("FR-10 transition: success", () => {
  it("passes the call through to the repository and returns its order", async () => {
    const { repository, calls } = fakeRepository();
    const result = await createOrderService(repository).transition(ORDER.id, 2, "ready");
    assert.equal(result, ORDER);
    assert.deepEqual(calls, [`transition ${ORDER.id} 2 ready`]);
  });
});

describe("FR-10 transition: database error codes become domain error codes", () => {
  const cases: ReadonlyArray<[string, DomainErrorCode, string]> = [
    ["PT409", "CONFLICT", "AT-09 a stale version is a CONFLICT"],
    ["PT422", "INVALID_TRANSITION", "FR-10 an illegal move is INVALID_TRANSITION"],
    ["42501", "NOT_ALLOWED", "AT-06 / AT-11 no permission (or unknown order) is NOT_ALLOWED"],
    ["22023", "INVALID_INPUT", "bad input rejected by the database is INVALID_INPUT"],
    ["23514", "INVALID_INPUT", "a check-constraint violation is INVALID_INPUT"],
  ];

  for (const [databaseCode, domainCode, label] of cases) {
    it(label, async () => {
      const { repository } = fakeRepository(new OrderRepositoryError(databaseCode, "from the database"));
      await rejectsWithCode(createOrderService(repository).transition(ORDER.id, 2, "ready"), domainCode);
    });
  }

  it("an unknown database code is NOT turned into a domain error (unexpected failures surface as-is)", async () => {
    const original = new OrderRepositoryError("08006", "connection failure");
    const { repository } = fakeRepository(original);
    await assert.rejects(createOrderService(repository).transition(ORDER.id, 2, "ready"), (error: unknown) => {
      assert.equal(error, original);
      return true;
    });
  });

  it("a non-repository error is rethrown unchanged", async () => {
    const original = new TypeError("bug");
    const { repository } = fakeRepository(original);
    await assert.rejects(createOrderService(repository).transition(ORDER.id, 2, "ready"), (error: unknown) => {
      assert.equal(error, original);
      return true;
    });
  });
});

describe("FR-10 transition: input is checked before the database is called", () => {
  it("rejects a status that is not one of the five lifecycle states", async () => {
    const { repository, calls } = fakeRepository();
    await rejectsWithCode(createOrderService(repository).transition(ORDER.id, 2, "served"), "INVALID_INPUT");
    assert.deepEqual(calls, []);
  });

  it("rejects a version that is not a positive whole number", async () => {
    const { repository, calls } = fakeRepository();
    const service = createOrderService(repository);
    for (const version of [0, -1, 1.5, Number.NaN]) {
      await rejectsWithCode(service.transition(ORDER.id, version, "ready"), "INVALID_INPUT");
    }
    assert.deepEqual(calls, []);
  });

  it("rejects an order id that is not a UUID", async () => {
    const { repository, calls } = fakeRepository();
    await rejectsWithCode(createOrderService(repository).transition("42", 2, "ready"), "INVALID_INPUT");
    assert.deepEqual(calls, []);
  });
});

describe("FR-06 manual order creation", () => {
  it("trims the ticket number and passes the call through", async () => {
    const { repository, calls } = fakeRepository();
    const result = await createOrderService(repository).createManualOrder(ORDER.branchId, "  42 ");
    assert.equal(result, ORDER);
    assert.deepEqual(calls, [`create ${ORDER.branchId} 42`]);
  });

  it("rejects a blank ticket number or a non-UUID branch without calling the database", async () => {
    const { repository, calls } = fakeRepository();
    const service = createOrderService(repository);
    await rejectsWithCode(service.createManualOrder(ORDER.branchId, "   "), "INVALID_INPUT");
    await rejectsWithCode(service.createManualOrder("branch-1", "42"), "INVALID_INPUT");
    assert.deepEqual(calls, []);
  });

  it("maps a permission failure to NOT_ALLOWED", async () => {
    const { repository } = fakeRepository(new OrderRepositoryError("42501", "not allowed"));
    await rejectsWithCode(createOrderService(repository).createManualOrder(ORDER.branchId, "42"), "NOT_ALLOWED");
  });
});
