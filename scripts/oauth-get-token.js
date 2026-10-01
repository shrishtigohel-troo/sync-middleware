import http from "node:http";
import crypto from "node:crypto";
import { env } from "../src/config/env.js";
import { logger } from "../src/utils/logger.js";

/**
 * One-time helper: completes Shopify's standard OAuth authorization-code
 * flow to obtain an Admin API access token for a Dev-Dashboard-created
 * custom app. Needed because Dev Dashboard (unlike the old legacy custom
 * app screen) does not display a store-specific Admin API access token
 * anywhere in its UI - confirmed by checking both the app's store-side page
 * and its Dev Dashboard settings.
 *
 * This is NOT part of the running middleware - it's a standalone script you
 * run once per store to fetch the token, then paste it into .env yourself.
 * The token is only ever printed to your own terminal, never sent anywhere.
 *
 * Usage: node scripts/oauth-get-token.js --shop=store-shrishti-plus-test.myshopify.com --port=3001
 *
 * Requires SHOPIFY_B2B_APP_CLIENT_ID and SHOPIFY_B2B_APP_CLIENT_SECRET to
 * already be set in .env, and the app's "Allowed redirection URL(s)" to
 * include http(s)://<your ngrok domain>/oauth/callback.
 */
const args = process.argv.slice(2);
const shop = args.find((a) => a.startsWith("--shop="))?.split("=")[1];
const port = Number(args.find((a) => a.startsWith("--port="))?.split("=")[1] ?? "3001");
const redirectUri = args.find((a) => a.startsWith("--redirect-uri="))?.split("=")[1];

if (!shop || !redirectUri) {
  logger.error(
    "Usage: node scripts/oauth-get-token.js --shop=<store>.myshopify.com --redirect-uri=https://<your-ngrok-domain>/oauth/callback [--port=3001]",
  );
  process.exitCode = 1;
  process.exit();
}

if (!env.SHOPIFY_B2B_APP_CLIENT_ID || !env.SHOPIFY_B2B_APP_CLIENT_SECRET) {
  logger.error(
    "SHOPIFY_B2B_APP_CLIENT_ID and SHOPIFY_B2B_APP_CLIENT_SECRET must both be set in .env before running this.",
  );
  process.exitCode = 1;
  process.exit();
}

// Read-only - confirmed the middleware never writes back to Shopify (only
// reads from it and writes to HubSpot), so write_ scopes are unnecessary.
// Override with --scopes= if a given app was configured with a different set.
const scopes =
  args.find((a) => a.startsWith("--scopes="))?.split("=")[1] ??
  "read_companies,read_customers,read_orders,read_products";
const state = crypto.randomBytes(16).toString("hex");

const authorizeUrl =
  `https://${shop}/admin/oauth/authorize?` +
  `client_id=${env.SHOPIFY_B2B_APP_CLIENT_ID}` +
  `&scope=${scopes}` +
  `&redirect_uri=${encodeURIComponent(redirectUri)}` +
  `&state=${state}`;

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  if (url.pathname !== "/oauth/callback") {
    res.writeHead(404);
    res.end();
    return;
  }

  const code = url.searchParams.get("code");
  const returnedState = url.searchParams.get("state");
  const returnedShop = url.searchParams.get("shop");

  if (returnedState !== state) {
    res.writeHead(400, { "Content-Type": "text/plain" });
    res.end("State mismatch - possible CSRF, aborting. Close this tab and re-run the script.");
    server.close();
    return;
  }

  if (!code || returnedShop !== shop) {
    res.writeHead(400, { "Content-Type": "text/plain" });
    res.end("Missing authorization code or shop mismatch.");
    server.close();
    return;
  }

  try {
    const tokenResponse = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: env.SHOPIFY_B2B_APP_CLIENT_ID,
        client_secret: env.SHOPIFY_B2B_APP_CLIENT_SECRET,
        code,
      }),
    });

    if (!tokenResponse.ok) {
      const body = await tokenResponse.text();
      throw new Error(`Token exchange failed (${tokenResponse.status}): ${body}`);
    }

    const { access_token: accessToken, scope: grantedScope } = await tokenResponse.json();

    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("Success - access token retrieved. Check your terminal, then close this tab.");

    logger.info({ shop, grantedScope }, "OAuth exchange succeeded");
    // Printed directly to stdout (not via the structured logger) so it's easy to copy-paste
    // and is never mixed into structured log output that might get saved/shared.
    console.log("\n--- COPY THIS INTO .env AS SHOPIFY_B2B_ACCESS_TOKEN ---");
    console.log(accessToken);
    console.log("--------------------------------------------------------\n");
  } catch (error) {
    res.writeHead(500, { "Content-Type": "text/plain" });
    res.end("Token exchange failed - check your terminal for details.");
    logger.error({ err: error instanceof Error ? error.message : String(error) }, "OAuth token exchange failed");
  } finally {
    server.close();
  }
});

server.listen(port, () => {
  logger.info({ port, redirectUri }, "Waiting for the OAuth redirect - make sure ngrok is forwarding this port");
  console.log("\nOpen this URL in your browser to authorize the app:\n");
  console.log(authorizeUrl);
  console.log("");
});
