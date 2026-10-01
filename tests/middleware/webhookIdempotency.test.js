import { describe, it, expect, vi } from "vitest";
import { WebhookIdempotencyStore } from "../../src/middleware/webhookIdempotency.js";

describe("WebhookIdempotencyStore", () => {
  it("returns true the first time a webhook id is seen", () => {
    const store = new WebhookIdempotencyStore();
    expect(store.markIfNew("abc-123")).toBe(true);
  });

  it("returns false for a duplicate delivery of the same webhook id", () => {
    const store = new WebhookIdempotencyStore();
    store.markIfNew("abc-123");
    expect(store.markIfNew("abc-123")).toBe(false);
  });

  it("treats different webhook ids independently", () => {
    const store = new WebhookIdempotencyStore();
    expect(store.markIfNew("id-1")).toBe(true);
    expect(store.markIfNew("id-2")).toBe(true);
  });

  it("allows reprocessing after the TTL has expired", () => {
    vi.useFakeTimers();
    const store = new WebhookIdempotencyStore(1000);
    store.markIfNew("expiring-id");

    vi.advanceTimersByTime(2000);

    expect(store.markIfNew("expiring-id")).toBe(true);
    vi.useRealTimers();
  });
});
