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
 * Derives the HubSpot Order pipeline stage from Shopify's order status, the
 * same way HubSpot's native Shopify integration does - compared live against
 * its stages on 538 recent orders:
 *
 * - Cancelled: the order is cancelled (always wins)
 * - Delivered: fulfilled, and the carrier has delivered every shipment
 * - Shipped:   fulfilled, but not every shipment is delivered yet (in
 *              transit, out for delivery, failed, or no tracking update)
 * - Processed: paid or refunded, not fully fulfilled (includes partially
 *              fulfilled)
 * - Open:      anything else (e.g. payment pending)
 *
 * `shipmentStatuses` is one entry per non-cancelled fulfillment, in either
 * Shopify form: REST `shipment_status` ("delivered", null) or GraphQL
 * `displayStatus` ("DELIVERED", "IN_TRANSIT", "FULFILLED").
 */
const PROCESSED_FINANCIAL_STATUSES = new Set(["paid", "partially_refunded", "refunded"]);

export function getOrderPipelineStageId({ cancelled, financialStatus, fulfillmentStatus, shipmentStatuses = [] }) {
  if (cancelled) return ORDER_PIPELINE_STAGES.CANCELLED;
  if ((fulfillmentStatus ?? "").toLowerCase() === "fulfilled") {
    const delivered =
      shipmentStatuses.length > 0 && shipmentStatuses.every((status) => (status ?? "").toLowerCase() === "delivered");
    return delivered ? ORDER_PIPELINE_STAGES.DELIVERED : ORDER_PIPELINE_STAGES.SHIPPED;
  }
  if (PROCESSED_FINANCIAL_STATUSES.has((financialStatus ?? "").toLowerCase())) return ORDER_PIPELINE_STAGES.PROCESSED;
  return ORDER_PIPELINE_STAGES.OPEN;
}
