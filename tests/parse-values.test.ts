import { describe, expect, it } from "vitest";
import { compareDataValues, parseDateValue, parseLocaleNumber } from "@/lib/data/parse-values";

describe("parse-values", () => {
  it("parses common LatAm and US numeric formats", () => {
    expect(parseLocaleNumber("$1.234.567,89")).toBe(1234567.89);
    expect(parseLocaleNumber("1,234,567.89")).toBe(1234567.89);
    expect(parseLocaleNumber("12,5%")).toBe(12.5);
    expect(parseLocaleNumber("1.234")).toBe(1234);
  });

  it("parses Chilean day-first dates", () => {
    expect(parseDateValue("15/04/2024")?.toISOString().slice(0, 10)).toBe("2024-04-15");
    expect(parseDateValue("2024-04-15")?.toISOString().slice(0, 10)).toBe("2024-04-15");
    expect(parseDateValue("01/02/2024")).toBeNull();
  });

  it("compares dates and numbers using real data semantics", () => {
    expect(compareDataValues("15/04/2024", "01/04/2024")).toBeGreaterThan(0);
    expect(compareDataValues("$9.900", "$10.100")).toBeLessThan(0);
  });
});
