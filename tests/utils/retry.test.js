import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { withRetry } from "../../src/utils/retry.js";

describe("withRetry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the result on first success without retrying", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const result = await withRetry(fn, {
      maxRetries: 3,
      baseDelayMs: 10,
      isRetryable: () => true,
      label: "test",
    });

    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries a retryable failure and eventually succeeds", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("transient"))
      .mockRejectedValueOnce(new Error("transient"))
      .mockResolvedValue("ok");

    const promise = withRetry(fn, { maxRetries: 5, baseDelayMs: 10, isRetryable: () => true, label: "test" });
    await vi.runAllTimersAsync();

    expect(await promise).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("does not retry a non-retryable error", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("permanent"));

    await expect(
      withRetry(fn, { maxRetries: 5, baseDelayMs: 10, isRetryable: () => false, label: "test" }),
    ).rejects.toThrow("permanent");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("stops after maxRetries and rethrows the last error", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("always fails"));

    const promise = withRetry(fn, { maxRetries: 2, baseDelayMs: 10, isRetryable: () => true, label: "test" });
    const assertion = expect(promise).rejects.toThrow("always fails");
    await vi.runAllTimersAsync();
    await assertion;

    expect(fn).toHaveBeenCalledTimes(3); // initial attempt + 2 retries
  });

  it("honors a Retry-After hint over the computed backoff", async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error("throttled")).mockResolvedValue("ok");

    const promise = withRetry(fn, {
      maxRetries: 3,
      baseDelayMs: 10,
      isRetryable: () => true,
      getRetryAfterMs: () => 5,
      label: "test",
    });
    await vi.runAllTimersAsync();

    expect(await promise).toBe("ok");
  });
});
