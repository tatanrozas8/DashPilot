import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildCopilotContext } from "@/lib/ai/context-builder";
import { createMockCopilotResponse } from "@/lib/ai/copilot-service";
import { generateDashboardSpec } from "@/lib/dashboard-spec/generate-dashboard-spec";
import { createDatasetDiagnostics } from "@/lib/debug/dataset-diagnostics";
import { normalizeColumnName } from "@/lib/files/normalize-columns";
import { parseCsvFile } from "@/lib/files/parse-csv";
import { profileDataset } from "@/lib/profiling/profile-dataset";
import { inferSemanticLayer, resolveColumn } from "@/lib/semantic-layer";
import type { DataRow } from "@/types/dataset";

async function loadRegionCountryFixture() {
  const fixture = readFileSync(resolve("tests/fixtures/ventas_region_pais.csv"));
  const parsed = await parseCsvFile(new File([fixture], "ventas_region_pais.csv", { type: "text/csv" }));
  const sheet = parsed.sheets[0]!;
  const profile = profileDataset(sheet.rows, parsed.fileName, sheet.columns);
  const semanticModel = inferSemanticLayer(profile, sheet.rows);
  const dashboardSpec = generateDashboardSpec(profile, sheet.rows);
  return { parsed, sheet, profile, semanticModel, dashboardSpec };
}

describe("full dataset column understanding", () => {
  it("keeps the real region column when parsing CSV data", async () => {
    const { sheet } = await loadRegionCountryFixture();

    expect(sheet.columns.map((column) => column.normalizedName)).toContain("region");
    expect(sheet.rows[0]).toHaveProperty("region", "Norte");
    expect(sheet.previewRows.length).toBe(sheet.rows.length);
  });

  it("normalizes accented region names without losing display intent", () => {
    expect(normalizeColumnName("Región")).toBe("region");
    expect(normalizeColumnName("Región Cliente")).toBe("region_cliente");
    expect(normalizeColumnName("País")).toBe("pais");
  });

  it("profiles region and country as distinct geographic roles", async () => {
    const { profile } = await loadRegionCountryFixture();
    const region = profile.columns.find((column) => column.normalizedName === "region");
    const pais = profile.columns.find((column) => column.normalizedName === "pais");

    expect(region?.semanticType).toBe("geo");
    expect(region?.geoRole).toBe("region");
    expect(region?.uniqueCount).toBeGreaterThan(1);
    expect(pais?.semanticType).toBe("geo");
    expect(pais?.geoRole).toBe("country");
  });

  it("resolves region before country when both columns exist", async () => {
    const { profile, semanticModel } = await loadRegionCountryFixture();
    const region = resolveColumn("analiza por región", { datasetProfile: profile, semanticModel }, "geography");
    const pais = resolveColumn("analiza por país", { datasetProfile: profile, semanticModel }, "geography");

    expect(region.matchedColumn?.normalizedName).toBe("region");
    expect(region.matchType).not.toBe("fallback");
    expect(pais.matchedColumn?.normalizedName).toBe("pais");
  });

  it("uses region in automatic dashboard geographic breakdowns and filters", async () => {
    const { dashboardSpec } = await loadRegionCountryFixture();
    const regionWidget = dashboardSpec.widgets.find((widget) => widget.id === "sales_by_region");

    expect(regionWidget?.query?.groupBy).toEqual(["region"]);
    expect(dashboardSpec.globalFilters.map((filter) => filter.field)).toContain("region");
    expect(dashboardSpec.globalFilters.findIndex((filter) => filter.field === "region")).toBeLessThan(
      dashboardSpec.globalFilters.findIndex((filter) => filter.field === "pais")
    );
  });

  it("updates the Copilot region widget using the real region column", async () => {
    const { sheet, profile, semanticModel, dashboardSpec } = await loadRegionCountryFixture();
    const result = createMockCopilotResponse({
      prompt: "analiza por región",
      datasetProfile: profile,
      semanticModel,
      dashboardSpec,
      viewState: { filters: [] }
    });
    const regionWidget = result.updatedDashboardSpec?.widgets.find((widget) => widget.id === "sales_by_region");

    expect(result.reply).toContain("region");
    expect(regionWidget?.query?.groupBy).toEqual(["region"]);
    expect(sheet.rows.some((row) => row.region === "Norte")).toBe(true);
  });

  it("sends all profiled columns and geographic metadata to Copilot context", async () => {
    const { sheet, profile, dashboardSpec } = await loadRegionCountryFixture();
    const context = buildCopilotContext({ rows: sheet.rows, datasetProfile: profile, dashboardSpec, viewState: { filters: [] } });
    const diagnostics = createDatasetDiagnostics({ profile, dashboardSpec, copilotContext: context });

    expect(context.columns.map((column) => column.normalizedName)).toEqual(profile.columns.map((column) => column.normalizedName));
    expect(context.geographicColumns.find((column) => column.normalizedName === "region")?.geoRole).toBe("region");
    expect(diagnostics.copilotColumns).toContain("region");
    expect(diagnostics.dashboardColumns).toContain("region");
  });

  it("falls back to country only when region is absent", () => {
    const rows: DataRow[] = [
      { fecha: "2024-01-01", pais: "Chile", ventas: 1200 },
      { fecha: "2024-01-02", pais: "Peru", ventas: 900 }
    ];
    const profile = profileDataset(rows, "ventas_sin_region.csv");
    const semanticModel = inferSemanticLayer(profile, rows);
    const resolved = resolveColumn("analiza por región", { datasetProfile: profile, semanticModel }, "geography");

    expect(resolved.matchedColumn?.normalizedName).toBe("pais");
    expect(resolved.matchType).toBe("fallback");
    expect(resolved.reason).toContain("Fallback");
  });
});
