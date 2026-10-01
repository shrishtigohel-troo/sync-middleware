import { GraphQLClient } from "graphql-request";
import { env } from "../config/env.js";
import { withRetry } from "../utils/retry.js";
import { logger } from "../utils/logger.js";

export class ShopifyGraphQLError extends Error {
  constructor(message, graphQLErrors, throttled) {
    super(message);
    this.name = "ShopifyGraphQLError";
    this.graphQLErrors = graphQLErrors;
    this.throttled = throttled;
  }
}

function isThrottled(errors) {
  return (errors ?? []).some((e) => e.extensions?.code === "THROTTLED");
}

/**
 * Thin wrapper around the Shopify Admin GraphQL API for a single store.
 * Handles auth headers, GraphQL-level error surfacing, throttling and
 * transient-failure retry. Never logs the access token.
 */
export class ShopifyClient {
  constructor(store) {
    this.storeId = store.storeId;
    this.channel = store.channel;
    const endpoint = `https://${store.storeUrl}/admin/api/${store.apiVersion}/graphql.json`;
    this.client = new GraphQLClient(endpoint, {
      headers: {
        "X-Shopify-Access-Token": store.accessToken,
        "Content-Type": "application/json",
      },
    });
  }

  async request(query, variables) {
    return withRetry(
      async () => {
        try {
          return await this.client.request(query, variables);
        } catch (error) {
          const gqlErrors = error?.response?.errors;
          const throttled = isThrottled(gqlErrors);
          throw new ShopifyGraphQLError(
            throttled ? "Shopify API throttled the request" : "Shopify GraphQL request failed",
            gqlErrors ?? error,
            throttled,
          );
        }
      },
      {
        label: `shopify:${this.storeId}`,
        maxRetries: env.HTTP_MAX_RETRIES,
        baseDelayMs: env.HTTP_RETRY_BASE_DELAY_MS,
        isRetryable: (error) => {
          if (error instanceof ShopifyGraphQLError) {
            return error.throttled;
          }
          const status = error?.response?.status;
          return status === 429 || (typeof status === "number" && status >= 500);
        },
      },
    );
  }
}

const clientCache = new Map();

export function getShopifyClient(store) {
  const cached = clientCache.get(store.storeId);
  if (cached) return cached;
  const client = new ShopifyClient(store);
  clientCache.set(store.storeId, client);
  logger.debug({ store: store.storeId }, "Initialized Shopify client");
  return client;
}
