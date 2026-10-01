import { describe, it, expect } from "vitest";
import { getOrderPipelineStageId, ORDER_PIPELINE_STAGES } from "../../src/config/orderPipeline.js";

describe("getOrderPipelineStageId", () => {
  it("returns Cancelled when the order is cancelled, regardless of other status", () => {
    const stage = getOrderPipelineStageId({ cancelled: true, financialStatus: "paid", fulfillmentStatus: "fulfilled" });
    expect(stage).toBe(ORDER_PIPELINE_STAGES.CANCELLED);
  });

  it("returns Delivered when fulfilled", () => {
    const stage = getOrderPipelineStageId({ cancelled: false, financialStatus: "paid", fulfillmentStatus: "fulfilled" });
    expect(stage).toBe(ORDER_PIPELINE_STAGES.DELIVERED);
  });

  it("returns Processed when paid but not yet fulfilled", () => {
    const stage = getOrderPipelineStageId({ cancelled: false, financialStatus: "paid", fulfillmentStatus: "unfulfilled" });
    expect(stage).toBe(ORDER_PIPELINE_STAGES.PROCESSED);
  });

  it("returns Open when neither paid nor fulfilled", () => {
    const stage = getOrderPipelineStageId({ cancelled: false, financialStatus: "pending", fulfillmentStatus: "unfulfilled" });
    expect(stage).toBe(ORDER_PIPELINE_STAGES.OPEN);
  });

  it("is case-insensitive on the status strings", () => {
    const stage = getOrderPipelineStageId({ cancelled: false, financialStatus: "PAID", fulfillmentStatus: "UNFULFILLED" });
    expect(stage).toBe(ORDER_PIPELINE_STAGES.PROCESSED);
  });
});
