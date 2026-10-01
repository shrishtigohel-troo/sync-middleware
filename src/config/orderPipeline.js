/**
 * HubSpot Order pipeline/stage IDs for this portal - confirmed live via
 * GET /crm/v3/pipelines/orders (single pipeline: "Order Pipeline").
 * These are portal-specific IDs, not just labels, and must be re-confirmed
 * if this middleware is ever pointed at a different HubSpot portal.
 */
export const ORDER_PIPELINE_ID = "14a2e10e-5471-408a-906e-c51f3b04369e";

export const ORDER_PIPELINE_STAGES = {
  OPEN: "4b27b500-f031-4927-9811-68a0b525cbae",
  PROCESSED: "937ea84d-0a4f-4dcf-9028-3f9c2aafbf03",
  SHIPPED: "aa99e8d0-c1d5-4071-b915-d240bbb1aed9",
  DELIVERED: "3725360f-519b-4b18-a593-494d60a29c9f",
  CANCELLED: "3c85a297-e9ce-400b-b42e-9f16853d69d6",
};

/**
 * Derives the HubSpot Order pipeline stage from Shopify's own order status
 * fields, so every order synced by this middleware shows a stage in
 * HubSpot, not just orders the native Shopify integration also touched.
 *
 * Priority: cancelled always wins, regardless of payment/fulfillment state.
 * Otherwise: fulfilled -> Delivered, paid (not yet fulfilled) -> Processed,
 * anything else -> Open.
 */
export function getOrderPipelineStageId({ cancelled, financialStatus, fulfillmentStatus }) {
  if (cancelled) return ORDER_PIPELINE_STAGES.CANCELLED;
  if ((fulfillmentStatus ?? "").toLowerCase() === "fulfilled") return ORDER_PIPELINE_STAGES.DELIVERED;
  if ((financialStatus ?? "").toLowerCase() === "paid") return ORDER_PIPELINE_STAGES.PROCESSED;
  return ORDER_PIPELINE_STAGES.OPEN;
}
