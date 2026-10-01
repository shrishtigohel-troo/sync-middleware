import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("sendFailureAlert", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("does nothing (and never throws) when RESEND_API_KEY isn't configured", async () => {
    vi.doMock("../../src/config/env.js", () => ({ env: { LOG_LEVEL: "silent", RESEND_API_KEY: undefined } }));
    global.fetch = vi.fn();

    const { sendFailureAlert } = await import("../../src/utils/emailAlert.js");
    await expect(sendFailureAlert({ subject: "Test", context: {} })).resolves.toBeUndefined();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("calls Resend's API with the expected payload when configured", async () => {
    vi.doMock("../../src/config/env.js", () => ({
      env: { LOG_LEVEL: "silent", RESEND_API_KEY: "re_test", ALERT_EMAIL_TO: "crm@trooinbound.com", RESEND_FROM_EMAIL: "onboarding@resend.dev" },
    }));
    global.fetch = vi.fn().mockResolvedValue({ ok: true });

    const { sendFailureAlert } = await import("../../src/utils/emailAlert.js");
    await sendFailureAlert({ subject: "Order webhook failed", context: { shopifyOrderId: 123 } });

    expect(global.fetch).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer re_test" }),
      }),
    );
    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.to).toBe("crm@trooinbound.com");
    expect(body.subject).toContain("Order webhook failed");
  });

  it("never throws even if the fetch call itself fails", async () => {
    vi.doMock("../../src/config/env.js", () => ({
      env: { LOG_LEVEL: "silent", RESEND_API_KEY: "re_test", ALERT_EMAIL_TO: "crm@trooinbound.com", RESEND_FROM_EMAIL: "onboarding@resend.dev" },
    }));
    global.fetch = vi.fn().mockRejectedValue(new Error("network down"));

    const { sendFailureAlert } = await import("../../src/utils/emailAlert.js");
    await expect(sendFailureAlert({ subject: "Test", context: {} })).resolves.toBeUndefined();
  });

  it("never throws when Resend responds with a non-ok status", async () => {
    vi.doMock("../../src/config/env.js", () => ({
      env: { LOG_LEVEL: "silent", RESEND_API_KEY: "re_test", ALERT_EMAIL_TO: "crm@trooinbound.com", RESEND_FROM_EMAIL: "onboarding@resend.dev" },
    }));
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401, text: async () => "unauthorized" });

    const { sendFailureAlert } = await import("../../src/utils/emailAlert.js");
    await expect(sendFailureAlert({ subject: "Test", context: {} })).resolves.toBeUndefined();
  });
});
