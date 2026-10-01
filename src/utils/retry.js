import { logger } from "./logger.js";

/**
 * options: {
 *   maxRetries: number,
 *   baseDelayMs: number,
 *   isRetryable: (error) => boolean,
 *   getRetryAfterMs?: (error) => number | undefined,
 *   label: string,
 * }
 */

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Executes `fn` with exponential backoff + jitter. Rethrows the last error
 * once retries are exhausted or the error is classified as non-retryable.
 */
export async function withRetry(fn, options) {
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (error) {
      const retryable = options.isRetryable(error);
      if (!retryable || attempt >= options.maxRetries) {
        throw error;
      }
      const hinted = options.getRetryAfterMs?.(error);
      const backoff = options.baseDelayMs * 2 ** attempt;
      const jitter = Math.random() * options.baseDelayMs;
      const delayMs = hinted ?? backoff + jitter;
      attempt += 1;
      logger.warn(
        { label: options.label, attempt, delayMs: Math.round(delayMs) },
        "Retrying after transient failure",
      );
      await sleep(delayMs);
    }
  }
}
