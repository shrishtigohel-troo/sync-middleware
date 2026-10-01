import crypto from "node:crypto";

/**
 * Express middleware that verifies a Shopify webhook's HMAC signature
 * (X-Shopify-Hmac-Sha256 header) against the store's webhook secret, per
 * Shopify's documented webhook verification scheme:
 * https://shopify.dev/docs/apps/build/webhooks/subscribe/https#step-5-verify-the-webhook
 *
 * Must run AFTER a body parser that populates `req.rawBody` with the exact
 * bytes Shopify sent (signature verification fails on a re-serialized body).
 */
export function verifyShopifyWebhook(webhookSecret) {
  return (req, res, next) => {
    const hmacHeader = req.get("X-Shopify-Hmac-Sha256");
    if (!hmacHeader || !req.rawBody) {
      res.status(401).json({ error: "Missing webhook signature" });
      return;
    }

    const digest = crypto.createHmac("sha256", webhookSecret).update(req.rawBody).digest("base64");

    const digestBuffer = Buffer.from(digest, "utf8");
    const headerBuffer = Buffer.from(hmacHeader, "utf8");

    const valid =
      digestBuffer.length === headerBuffer.length && crypto.timingSafeEqual(digestBuffer, headerBuffer);

    if (!valid) {
      res.status(401).json({ error: "Invalid webhook signature" });
      return;
    }

    next();
  };
}

/**
 * express.json() with a `verify` hook that stashes the raw body bytes onto
 * the request before parsing - required by verifyShopifyWebhook above.
 */
export function captureRawBody(req, _res, buf) {
  req.rawBody = buf;
}
