import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.string().default("info"),

  SHOPIFY_B2B_STORE_URL: z.string().optional(),
  SHOPIFY_B2B_ACCESS_TOKEN: z.string().optional(),
  SHOPIFY_B2B_API_VERSION: z.string().default("2024-10"),
  SHOPIFY_B2B_WEBHOOK_SECRET: z.string().optional(),
  // Webhooks registered via the app's own API connection (e.g. Company
  // events, which are not available as a topic on the store's Notifications
  // page) are signed with the app's Client Secret, not the store-wide
  // webhook secret above - see docs/object-matching-rules.md.
  SHOPIFY_B2B_APP_CLIENT_SECRET: z.string().optional(),
  // Only needed once, for scripts/oauth-get-token.js - not used by the running middleware.
  SHOPIFY_B2B_APP_CLIENT_ID: z.string().optional(),

  SHOPIFY_B2C_STORE_URL: z.string().optional(),
  SHOPIFY_B2C_ACCESS_TOKEN: z.string().optional(),
  SHOPIFY_B2C_API_VERSION: z.string().default("2024-10"),
  SHOPIFY_B2C_WEBHOOK_SECRET: z.string().optional(),
  SHOPIFY_B2C_APP_CLIENT_SECRET: z.string().optional(),

  HUBSPOT_ACCESS_TOKEN: z.string().optional(),
  HUBSPOT_API_BASE_URL: z.string().default("https://api.hubapi.com"),

  // Failure email alerts (see src/utils/emailAlert.js) - client chose Email
  // over Slack. RESEND_FROM_EMAIL defaults to Resend's own shared sandbox
  // sender, since no custom sending domain has been verified yet.
  RESEND_API_KEY: z.string().optional(),
  ALERT_EMAIL_TO: z.string().default("crm@trooinbound.com"),
  RESEND_FROM_EMAIL: z.string().default("onboarding@resend.dev"),

  HTTP_MAX_RETRIES: z.coerce.number().int().nonnegative().default(5),
  HTTP_RETRY_BASE_DELAY_MS: z.coerce.number().int().positive().default(500),

  MIGRATION_BATCH_SIZE: z.coerce.number().int().positive().default(50),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // Never log raw process.env - only the validation error paths/messages.
  const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
  throw new Error(`Invalid environment configuration: ${issues}`);
}

export const env = parsed.data;
