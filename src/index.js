import express from "express";
import { env } from "./config/env.js";
import { logger } from "./utils/logger.js";
import { captureRawBody } from "./middleware/verifyShopifyWebhook.js";
import { createWebhookRouter } from "./middleware/webhookRouter.js";

const app = express();
app.use(express.json({ verify: captureRawBody }));

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// Webhook plumbing (HMAC verification, per-store routing, idempotency) is
// wired up; the actual Shopify-payload -> HubSpot mapping is not yet
// implemented for any topic - see src/middleware/webhookRouter.js.
app.use("/webhooks/shopify", createWebhookRouter());

app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, nodeEnv: env.NODE_ENV }, "Middleware server listening");
});
