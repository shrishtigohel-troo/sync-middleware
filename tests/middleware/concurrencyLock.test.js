import { describe, it, expect, vi } from "vitest";
import { ConcurrencyLock } from "../../src/middleware/concurrencyLock.js";

function delay(ms, value) {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

describe("ConcurrencyLock", () => {
  it("runs calls for the same key one at a time, in order", async () => {
    const lock = new ConcurrencyLock();
    const order = [];

    const first = lock.withLock("variant-1", async () => {
      order.push("first-start");
      await delay(20);
      order.push("first-end");
      return "first";
    });

    const second = lock.withLock("variant-1", async () => {
      order.push("second-start");
      await delay(5);
      order.push("second-end");
      return "second";
    });

    const [firstResult, secondResult] = await Promise.all([first, second]);

    expect(firstResult).toBe("first");
    expect(secondResult).toBe("second");
    // second-start must not happen until first-end - that's the whole point
    // of the lock (this is the exact race condition that caused the
    // duplicate product bug: two overlapping handlers both starting before
    // either finished).
    expect(order).toEqual(["first-start", "first-end", "second-start", "second-end"]);
  });

  it("runs calls for different keys concurrently, not serialized", async () => {
    const lock = new ConcurrencyLock();
    const order = [];

    const a = lock.withLock("variant-1", async () => {
      order.push("a-start");
      await delay(20);
      order.push("a-end");
    });
    const b = lock.withLock("variant-2", async () => {
      order.push("b-start");
      await delay(5);
      order.push("b-end");
    });

    await Promise.all([a, b]);

    // Different keys don't block each other, so b (shorter delay) finishes
    // before a, and both start before either finishes.
    expect(order).toEqual(["a-start", "b-start", "b-end", "a-end"]);
  });

  it("continues processing the next call even if an earlier one throws", async () => {
    const lock = new ConcurrencyLock();
    const errorFn = vi.fn().mockRejectedValue(new Error("boom"));
    const okFn = vi.fn().mockResolvedValue("ok");

    const first = lock.withLock("key", errorFn);
    const second = lock.withLock("key", okFn);

    await expect(first).rejects.toThrow("boom");
    await expect(second).resolves.toBe("ok");
    expect(okFn).toHaveBeenCalledOnce();
  });
});
