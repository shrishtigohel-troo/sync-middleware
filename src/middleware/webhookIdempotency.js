/**
 * Tracks which Shopify webhook deliveries have already been processed, so a
 * retried/duplicate delivery (Shopify redelivers on any non-2xx response, and
 * can occasionally redeliver even after a 200) is not processed twice.
 *
 * IMPORTANT: this is an in-memory store. It is correct for a single
 * long-running process, but does NOT survive a restart and does NOT
 * coordinate across multiple instances/replicas. Before running this behind
 * a load balancer or with auto-restarts in production, replace this with a
 * persistent store (e.g. a Redis SET with TTL, or a database table keyed on
 * webhook id) - do not treat this implementation as production-ready as-is.
 */
export class WebhookIdempotencyStore {
  constructor(ttlMs = 24 * 60 * 60 * 1000) {
    this.ttlMs = ttlMs;
    this.seen = new Map();
  }

  /** Returns true if this webhook id has already been processed (and records it if not). */
  markIfNew(webhookId) {
    this.evictExpired();
    if (this.seen.has(webhookId)) {
      return false;
    }
    this.seen.set(webhookId, Date.now());
    return true;
  }

  evictExpired() {
    const cutoff = Date.now() - this.ttlMs;
    for (const [id, seenAt] of this.seen) {
      if (seenAt < cutoff) this.seen.delete(id);
    }
  }
}
