import pino from "pino";
import { env } from "../config/env.js";

const SECRET_KEY_PATTERN = /token|secret|authorization|password|api[_-]?key/i;

/** Recursively strips values whose key looks secret-shaped before logging. */
function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, SECRET_KEY_PATTERN.test(k) ? "[REDACTED]" : redact(v)]),
    );
  }
  return value;
}

export const logger = pino({
  level: env.LOG_LEVEL,
  formatters: {
    log(payload) {
      return redact(payload);
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

/**
 * fields: { objectType, sourceId, store, operation, success, errorCategory? }
 * objectType: "customer" | "company" | "product" | "variant" | "order" | "line_item" | "webhook"
 * operation: "create" | "update" | "match" | "skip" | "retry"
 */
export function logSyncEvent(fields, message) {
  if (fields.success) {
    logger.info(fields, message);
  } else {
    logger.error(fields, message);
  }
}
