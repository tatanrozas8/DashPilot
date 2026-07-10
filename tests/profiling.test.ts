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

  it("profiles LatAm currency and dates as analytical fields", () => {
    const profile = profileDataset([
      { Fecha: "01/04/2024", Ventas: "$1.200,50", Pais: "Chile" },
      { Fecha: "15/04/2024", Ventas: "$2.300,25", Pais: "Peru" }
    ], "ventas_latam.csv");

    expect(profile.detectedDateColumns).toContain("Fecha");
    expect(profile.detectedMetricColumns).toContain("Ventas");
    expect(profile.columns.find((column) => column.normalizedName === "Ventas")?.max).toBe(2300.25);
  });
});
