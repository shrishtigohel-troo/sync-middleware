/**
 * Serializes concurrent async work by key, so two overlapping webhook
 * deliveries for the same Shopify record can never both run their
 * "search HubSpot, then create if not found" check at the same time.
 *
 * Without this, two webhooks arriving within milliseconds of each other for
 * the same product/order/variant (which Shopify does routinely - e.g. a
 * "create" and an "update" event fired back to back) can each see "no
 * existing record yet" and both create one, producing a duplicate. This was
 * found via a live test: a create + update webhook landed ~1 second apart
 * and both created a HubSpot product for the same Shopify variant.
 *
 * This does NOT prevent duplicates across separate Node.js processes (e.g.
 * if the middleware is ever scaled horizontally) - it only serializes
 * within a single running process. For multi-instance deployments, this
 * would need to become a distributed lock (e.g. via Redis) - flagged here
 * rather than silently assumed to be sufficient.
 *
 * Note: the internal map of per-key chains grows for as long as the process
 * runs (one entry per distinct key ever locked) - acceptable for this
 * middleware's scale, but worth revisiting if it's ever handling a very
 * high cardinality of distinct keys over a long-lived process.
 */
export class ConcurrencyLock {
  constructor() {
    this.chains = new Map();
  }

  /** Runs `fn` exclusively for `key` - if another call for the same key is in
   * flight, this waits for it to finish (successfully or not) before running. */
  withLock(key, fn) {
    const previous = this.chains.get(key) ?? Promise.resolve();
    const result = previous.then(fn, fn);
    this.chains.set(key, result.then(
      () => undefined,
      () => undefined,
    ));
    return result;
  }
}
