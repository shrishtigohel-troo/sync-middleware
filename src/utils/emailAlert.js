import { env } from "../config/env.js";
import { logger } from "./logger.js";

/**
 * Sends a failure notification email via Resend - client chose Email over
 * Slack for this. This is intentionally simple (see docs/error-alerting.md):
 * one email per failure, no batching/throttling, no persistent retry queue.
 * If Resend itself is unreachable or misconfigured, this logs the problem
 * and returns rather than throwing - a broken alert channel must never
 * crash the webhook processing it's trying to report on.
 */
export async function sendFailureAlert({ subject, context }) {
  if (!env.RESEND_API_KEY) {
    logger.warn("RESEND_API_KEY not configured - skipping failure email alert");
    return;
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env.RESEND_FROM_EMAIL,
        to: env.ALERT_EMAIL_TO,
        subject: `[Shopify-HubSpot Sync] ${subject}`,
        text: JSON.stringify(context, null, 2),
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      logger.error({ status: response.status, body }, "Failed to send failure email alert via Resend");
    }
  } catch (error) {
    logger.error(
      { err: error instanceof Error ? error.message : String(error) },
      "Failed to send failure email alert - continuing, this must never block webhook processing",
    );
  }
}
