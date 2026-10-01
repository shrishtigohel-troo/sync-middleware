# Deploying to Vercel

## What changed
- `src/index.js`: only calls `app.listen()` when not on Vercel; exports `app` as default.
- `api/index.js`: Vercel serverless entry that re-exports the Express app.
- `vercel.json`: routes all paths to `/api`, sets `maxDuration` to 60s.
- `.vercelignore`: keeps `node_modules` and `.env*` out of the upload.
- `src/middleware/webhookRouter.js`: background webhook work is registered with `waitUntil` (`@vercel/functions`) so it finishes after the 200 response is sent. Failure alert emails are included in that wait.

## Deploy steps
1. `npm i -g vercel`
2. `vercel login`, then `vercel link` in this folder.
3. In Vercel Project Settings, Environment Variables, add every variable from `.env.example` (Shopify B2B/B2C tokens and secrets, `HUBSPOT_ACCESS_TOKEN`, `RESEND_API_KEY`, etc.). Never commit `.env`.
4. `vercel --prod`
5. Check `GET https://<project>.vercel.app/health` returns `{"status":"ok"}`.
6. Point Shopify webhooks to `https://<project>.vercel.app/webhooks/shopify/<topic>`.

## Known limitations
- `WebhookIdempotencyStore` and `ConcurrencyLock` are in-memory. Serverless instances do not share memory, so duplicate-delivery protection and per-record locking are not reliable. Recommended follow-up: move both to Redis (e.g. Upstash via the Vercel Marketplace).
- `maxDuration: 60` requires a plan that allows it. Lower it in `vercel.json` if the deploy is rejected.
- The migration scripts (`npm run migrate:*`) are long-running and should be run locally, not on Vercel.
