import { describe, expect, it } from "vitest";
import { demoRows } from "@/lib/data/demo-dataset";
import { profileDataset } from "@/lib/profiling/profile-dataset";

describe("profileDataset", () => {
  it("infers core dataset shape and semantic columns", () => {
    const profile = profileDataset(demoRows, "ventas_junio_2025.xlsx");

    expect(profile.rowCount).toBeGreaterThan(50);
    expect(profile.columnCount).toBeGreaterThan(8);
    expect(profile.detectedDateColumns).toContain("Fecha");
    expect(profile.detectedMetricColumns).toContain("Ventas");
    expect(profile.detectedGeoColumns).toContain("Region");
  });
});
