import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { executeTableQuery, executeWidgetQuery, registerQueryableDataset } from "@/lib/query-service/client";
import { useDashPilotStore } from "@/lib/store/app-store";
import type { DataRow, DatasetColumnProfile, DatasetProfile, InferredColumnType, SemanticColumnType } from "@/types/dataset";
import type { DashboardWidget } from "@/types/dashboard";

const rows: DataRow[] = [
  { region: "Norte", ventas: 100, fecha: "2024-01-01" },
  { region: "Sur", ventas: 200, fecha: "2024-01-02" },
  { region: "Norte", ventas: 50, fecha: "2024-01-03" }
];

function column(name: string, inferredType: InferredColumnType, semanticType: SemanticColumnType): DatasetColumnProfile {
  return {
    originalName: name,
    normalizedName: name,
    displayName: name,
    inferredType,
    semanticType,
    nullCount: 0,
    nullPercentage: 0,
    uniqueCount: new Set(rows.map((row) => row[name])).size,
    sampleValues: rows.map((row) => row[name]).slice(0, 3)
  };
}

function profile(): DatasetProfile {
  return {
    id: "dataset-guardrail",
    datasetVersionId: "version-guardrail",
    fileName: "ventas.csv",
    rowCount: rows.length,
    columnCount: 3,
    columns: [
      column("region", "string", "dimension"),
      column("ventas", "number", "metric"),
      column("fecha", "date", "time")
    ],
    detectedDateColumns: ["fecha"],
    detectedMetricColumns: ["ventas"],
    detectedDimensionColumns: ["region"],
    detectedGeoColumns: [],
    qualityWarnings: [],
    qualityScore: 100,
    createdAt: "2026-07-17T00:00:00.000Z"
  };
}

describe("query-service UI guardrails", () => {
  it("does not expose rows or currentDataset from the product store", () => {
    useDashPilotStore.getState().loadDemo();
    const state = useDashPilotStore.getState();

    expect("rows" in state).toBe(false);
    expect("currentDataset" in state).toBe(false);
    expect(state.activeDatasetId).toBeTruthy();
    expect(state.profile.rowCount).toBeGreaterThan(0);
  });

  it("keeps dashboard UI from importing row-backed query engine paths", () => {
    const root = process.cwd();
    const files = [
      "components/dashboard/dashboard-renderer.tsx",
      "components/dashboard/data-explorer.tsx"
    ];
    for (const file of files) {
      const source = readFileSync(join(root, file), "utf8");
      expect(source).not.toMatch(/state\.rows/);
      expect(source).not.toMatch(/executeDashboardQuery|queryTableRows|applyDashboardFilters/);
    }
  });

  it("uses LocalQueryService for widget and table results behind one contract", async () => {
    const datasetProfile = profile();
    registerQueryableDataset({ datasetId: datasetProfile.id, profile: datasetProfile, rows });
    const widget: DashboardWidget = {
      id: "sales_by_region",
      type: "bar_chart",
      title: "Ventas por region",
      query: { metric: { field: "ventas", aggregation: "sum" }, groupBy: ["region"], orderBy: { field: "value", direction: "desc" } },
      config: {},
      position: { x: 0, y: 0, w: 6, h: 3 }
    };

    const widgetResult = await executeWidgetQuery({
      datasetId: datasetProfile.id,
      datasetVersionId: datasetProfile.datasetVersionId ?? datasetProfile.id,
      context: "local",
      widget,
      profile: datasetProfile,
      viewState: { filters: [{ field: "region", operator: "eq", value: "Norte" }] }
    });
    const tableResult = await executeTableQuery({
      datasetId: datasetProfile.id,
      context: "local",
      query: {
        datasetVersionId: datasetProfile.datasetVersionId ?? datasetProfile.id,
        columns: ["region", "ventas"],
        filters: [{ field: "region", operator: "eq", value: "Norte" }],
        orderBy: { field: "ventas", direction: "desc" },
        limit: 1,
        offset: 0
      }
    });

    expect(widgetResult && "filteredRows" in widgetResult).toBe(false);
    expect(widgetResult?.rows[0]?.value).toBe(150);
    expect(tableResult.rows).toEqual([{ region: "Norte", ventas: 100 }]);
    expect(tableResult.source).toBe("local");
  });

  it("keeps legacy dashboard column ids allowlisted even when they contain spaces or punctuation", async () => {
    const legacyRows: DataRow[] = [
      { Region: "Norte", "Costo Unitario": 10, "Descuento (%)": 0.1 },
      { Region: "Sur", "Costo Unitario": 20, "Descuento (%)": 0.2 }
    ];
    const legacyProfile: DatasetProfile = {
      ...profile(),
      id: "dataset-legacy-columns",
      datasetVersionId: "version-legacy-columns",
      rowCount: legacyRows.length,
      columnCount: 3,
      columns: [
        {
          ...column("Region", "string", "dimension"),
          originalName: "Region",
          normalizedName: "Region",
          displayName: "Region",
          uniqueCount: 2,
          sampleValues: ["Norte", "Sur"]
        },
        {
          ...column("Costo Unitario", "number", "metric"),
          originalName: "Costo Unitario",
          normalizedName: "Costo Unitario",
          displayName: "Costo Unitario",
          uniqueCount: 2,
          sampleValues: [10, 20]
        },
        {
          ...column("Descuento (%)", "number", "metric"),
          originalName: "Descuento (%)",
          normalizedName: "Descuento (%)",
          displayName: "Descuento (%)",
          uniqueCount: 2,
          sampleValues: [0.1, 0.2]
        }
      ],
      detectedMetricColumns: ["Costo Unitario", "Descuento (%)"],
      detectedDimensionColumns: ["Region"],
      detectedDateColumns: []
    };
    registerQueryableDataset({ datasetId: legacyProfile.id, profile: legacyProfile, rows: legacyRows });

    const result = await executeTableQuery({
      datasetId: legacyProfile.id,
      context: "local",
      query: {
        datasetVersionId: legacyProfile.datasetVersionId ?? legacyProfile.id,
        columns: ["Region", "Costo Unitario", "Descuento (%)"],
        filters: [{ field: "Region", operator: "eq", value: "Norte" }],
        limit: 10,
        offset: 0
      }
    });

    expect(result.errors).toEqual([]);
    expect(result.rows).toEqual([{ Region: "Norte", "Costo Unitario": 10, "Descuento (%)": 0.1 }]);
  });
});
