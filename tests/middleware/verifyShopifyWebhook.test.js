import { describe, it, expect, vi } from "vitest";
import crypto from "node:crypto";
import { verifyShopifyWebhook } from "../../src/middleware/verifyShopifyWebhook.js";

const SECRET = "test-webhook-secret";

function buildReq(rawBody, hmacHeader) {
  return {
    rawBody,
    get: (name) => (name === "X-Shopify-Hmac-Sha256" ? hmacHeader : undefined),
  };
}

function buildRes() {
  const res = {};
  res.status = vi.fn((code) => {
    res.statusCode = code;
    return res;
  });
  res.json = vi.fn((body) => {
    res.body = body;
    return res;
  });
  return res;
}

function sign(body, secret) {
  return crypto.createHmac("sha256", secret).update(body).digest("base64");
}

describe("verifyShopifyWebhook", () => {
  it("calls next() when the signature is valid", () => {
    const body = Buffer.from(JSON.stringify({ id: 123 }));
    const req = buildReq(body, sign(body, SECRET));
    const res = buildRes();
    const next = vi.fn();

    verifyShopifyWebhook(SECRET)(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("rejects with 401 when the signature does not match", () => {
    const body = Buffer.from(JSON.stringify({ id: 123 }));
    const req = buildReq(body, sign(body, "wrong-secret"));
    const res = buildRes();
    const next = vi.fn();

    verifyShopifyWebhook(SECRET)(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  it("rejects with 401 when the body has been tampered with", () => {
    const originalBody = Buffer.from(JSON.stringify({ id: 123 }));
    const tamperedBody = Buffer.from(JSON.stringify({ id: 999 }));
    const req = buildReq(tamperedBody, sign(originalBody, SECRET));
    const res = buildRes();
    const next = vi.fn();

    verifyShopifyWebhook(SECRET)(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  it("rejects with 401 when the signature header is missing", () => {
    const body = Buffer.from(JSON.stringify({ id: 123 }));
    const req = buildReq(body, undefined);
    const res = buildRes();
    const next = vi.fn();

    verifyShopifyWebhook(SECRET)(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });
});
