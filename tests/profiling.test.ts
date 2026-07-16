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

  it("marks mixed and ambiguous parsed columns with actionable warnings", () => {
    const profile = profileDataset([
      { fecha: "2024-04-15", monto: 1200 },
      { fecha: "01/02/2024", monto: "sin dato" }
    ], "mixto.csv", [
      {
        id: "fecha",
        rawHeader: "Fecha",
        originalName: "Fecha",
        canonicalName: "fecha",
        normalizedName: "fecha",
        displayName: "Fecha",
        position: 0,
        parseSummary: {
          totalCount: 2,
          emptyCount: 0,
          parsedCount: 1,
          ambiguousCount: 1,
          invalidCount: 0,
          typeCounts: { date: 2 },
          warnings: ["Fecha ambigua"]
        }
      },
      {
        id: "monto",
        rawHeader: "Monto",
        originalName: "Monto",
        canonicalName: "monto",
        normalizedName: "monto",
        displayName: "Monto",
        position: 1,
        parseSummary: {
          totalCount: 2,
          emptyCount: 0,
          parsedCount: 1,
          ambiguousCount: 0,
          invalidCount: 1,
          typeCounts: { number: 1, string: 1 },
          warnings: ["Valor no compatible"]
        }
      }
    ]);

    expect(profile.columns.find((column) => column.normalizedName === "fecha")?.parseWarnings?.join(" ")).toContain("ambigua");
    expect(profile.columns.find((column) => column.normalizedName === "monto")?.mixedType).toBe(true);
    expect(profile.qualityWarnings.join(" ")).toContain("Corrige el tipo");
  });
});
