import { describe, expect, it } from "vitest";
import { profileDataset } from "@/lib/profiling/profile-dataset";
import { inferSemanticLayer, resolveColumn } from "@/lib/semantic-layer";
import type { DataRow } from "@/types/dataset";

const rows: DataRow[] = [
  { Pais: "Chile", Vendedor: "Ana", Ventas: 1200, Fecha: "2024-01-01" },
  { Pais: "Peru", Vendedor: "Luis", Ventas: 900, Fecha: "2024-02-01" },
  { Pais: "Chile", Vendedor: "Ana", Ventas: 1500, Fecha: "2024-03-01" }
];

function context() {
  const datasetProfile = profileDataset(rows, "ventas_paises.csv");
  return {
    datasetProfile,
    semanticModel: inferSemanticLayer(datasetProfile, rows)
  };
}

describe("column resolver", () => {
  it("maps regiones to Pais when that is the real geography column", () => {
    const result = resolveColumn("pon las regiones", context(), "geography");

    expect(result.matchedColumn?.normalizedName).toBe("Pais");
    expect(result.confidence).toBeGreaterThan(0.45);
  });

  it("finds seller columns from business synonyms", () => {
    const result = resolveColumn("ranking por asesor comercial", context(), "seller");

    expect(result.matchedColumn?.normalizedName).toBe("Vendedor");
  });

  it("reports missing margin columns without inventing one", () => {
    const result = resolveColumn("analiza margen", context(), "margin");

    expect(result.matchedColumn).toBeUndefined();
    expect(result.alternatives.every((match) => match.column.normalizedName !== "Margen")).toBe(true);
  });
});
