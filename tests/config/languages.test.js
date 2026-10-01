import { describe, it, expect } from "vitest";
import { resolvePreferredLanguage } from "../../src/config/languages.js";

describe("resolvePreferredLanguage", () => {
  it("matches an exact locale", () => {
    expect(resolvePreferredLanguage("es-MX")).toBe("Spanish");
  });

  it("falls back to the base language subtag", () => {
    expect(resolvePreferredLanguage("fr-CA")).toBe("French");
  });

  it("returns undefined for an unmapped locale rather than guessing", () => {
    expect(resolvePreferredLanguage("de-DE")).toBeUndefined();
  });

  it("returns undefined for null/undefined input", () => {
    expect(resolvePreferredLanguage(null)).toBeUndefined();
    expect(resolvePreferredLanguage(undefined)).toBeUndefined();
  });
});
