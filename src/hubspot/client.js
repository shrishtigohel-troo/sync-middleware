import { env } from "../config/env.js";
import { withRetry } from "../utils/retry.js";
import { logger } from "../utils/logger.js";

export class HubSpotApiError extends Error {
  constructor(message, status, category, body) {
    super(message);
    this.name = "HubSpotApiError";
    this.status = status;
    this.category = category;
    this.body = body;
  }
}

function isRetryableStatus(status, category) {
  if (status === 429) return true;
  if (status >= 500) return true;
  // HubSpot signals transient concurrency conflicts this way.
  if (category === "CONFLICT") return true;
  return false;
}

/**
 * Thin wrapper around the HubSpot CRM REST API. Handles bearer-token auth,
 * rate-limit/5xx retry with backoff, and structured error surfacing. Never
 * logs the access token.
 */
export class HubSpotClient {
  constructor(token = env.HUBSPOT_ACCESS_TOKEN ?? "", baseUrl = env.HUBSPOT_API_BASE_URL) {
    if (!token) {
      throw new Error("HUBSPOT_ACCESS_TOKEN is not configured.");
    }
    this.token = token;
    this.baseUrl = baseUrl;
  }

  async request(method, path, body) {
    return withRetry(
      async () => {
        const response = await fetch(`${this.baseUrl}${path}`, {
          method,
          headers: {
            Authorization: `Bearer ${this.token}`,
            "Content-Type": "application/json",
          },
          body: body !== undefined ? JSON.stringify(body) : undefined,
        });

        if (response.status === 204) {
          return undefined;
        }

        const text = await response.text();
        const parsed = text ? JSON.parse(text) : undefined;

        if (!response.ok) {
          const category = parsed?.category;
          const message = parsed?.message ?? `HubSpot request failed (${response.status})`;
          throw new HubSpotApiError(message, response.status, category, parsed);
        }

        return parsed;
      },
      {
        label: `hubspot:${method}:${path}`,
        maxRetries: env.HTTP_MAX_RETRIES,
        baseDelayMs: env.HTTP_RETRY_BASE_DELAY_MS,
        isRetryable: (error) => {
          if (error instanceof HubSpotApiError) {
            return isRetryableStatus(error.status, error.category);
          }
          // Network-level failures (fetch throws TypeError on connection errors).
          return error instanceof TypeError;
        },
      },
    );
  }
}

let sharedClient;

export function getHubSpotClient() {
  if (!sharedClient) {
    sharedClient = new HubSpotClient();
    logger.debug("Initialized HubSpot client");
  }
  return sharedClient;
}
