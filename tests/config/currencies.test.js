import { describe, it, expect } from "vitest";
import { isSupportedCurrency, assertSupportedCurrency, SUPPORTED_CURRENCIES } from "../../src/config/currencies.js";

describe("currencies", () => {
  it("recognizes all five client currencies", () => {
    for (const code of ["USD", "EUR", "MXN", "GTQ", "CRC"]) {
      expect(isSupportedCurrency(code)).toBe(true);
    }
  });

  it("rejects an unsupported currency", () => {
    expect(isSupportedCurrency("JPY")).toBe(false);
  });

  it("assertSupportedCurrency throws with a helpful message for unsupported codes", () => {
    expect(() => assertSupportedCurrency("JPY")).toThrow(/Unsupported currency "JPY"/);
  });

  it("assertSupportedCurrency returns the code unchanged when valid", () => {
    expect(assertSupportedCurrency("USD")).toBe("USD");
  });

  it("SUPPORTED_CURRENCIES matches the client's required list exactly", () => {
    expect([...SUPPORTED_CURRENCIES].sort()).toEqual(["CRC", "EUR", "GTQ", "MXN", "USD"]);
  });
});
