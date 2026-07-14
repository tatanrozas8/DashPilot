import { describe, expect, it, vi } from "vitest";
import { persistDashboard, persistShareLink } from "@/lib/data-access";
import { chunkRows, getDatasetProfile, getDatasetRows, saveLocalDataset } from "@/lib/supabase/datasets";
import { isShareLinkValid } from "@/lib/supabase/share-links";
import type { DashboardSpec } from "@/types/dashboard";
import type { DataRow, DatasetProfile, FileParseResult } from "@/types/dataset";

describe("data access", () => {
  it("chunks dataset rows for batch inserts", () => {
    const rows = Array.from({ length: 1201 }, (_, index) => ({ id: index }));
    const batches = chunkRows(rows, 500);

    expect(batches).toHaveLength(3);
    expect(batches[0]).toHaveLength(500);
    expect(batches[2]).toHaveLength(201);
  });

  it("validates share expiration", () => {
    expect(isShareLinkValid({ expiresAt: "2099-01-01" })).toBe(true);
    expect(isShareLinkValid({ expiresAt: "2000-01-01" })).toBe(false);
    expect(isShareLinkValid({ expiresAt: "2099-01-01", isActive: false })).toBe(false);
  });

  it("falls back to local dashboard persistence without Supabase", async () => {
    const spec: DashboardSpec = {
      id: "dashboard_test",
      title: "Test",
      datasetId: "dataset_test",
      globalFilters: [],
      widgets: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const result = await persistDashboard({ spec, viewState: { filters: [] }, rows: [], profile: undefined });

    expect(result.mode).toBe("local");
    expect(window.localStorage.getItem("dashpilot:dashboard:dashboard_test")).toBeTruthy();
  });

  it("loads locally saved dataset profile and rows", async () => {
    window.localStorage.clear();
    const rows: DataRow[] = [{ region: "RM", ventas: 1200 }];
    const profile: DatasetProfile = {
      id: "dataset_local",
      fileName: "ventas_local.csv",
      rowCount: 1,
      columnCount: 2,
      columns: [
        {
          originalName: "Region",
          normalizedName: "region",
          displayName: "Region",
          inferredType: "geography",
          semanticType: "geo",
          nullCount: 0,
          nullPercentage: 0,
          uniqueCount: 1,
          sampleValues: ["RM"]
        },
        {
          originalName: "Ventas",
          normalizedName: "ventas",
          displayName: "Ventas",
          inferredType: "number",
          semanticType: "metric",
          nullCount: 0,
          nullPercentage: 0,
          uniqueCount: 1,
          sampleValues: [1200],
          min: 1200,
          max: 1200
        }
      ],
      detectedDateColumns: [],
      detectedMetricColumns: ["ventas"],
      detectedDimensionColumns: ["region"],
      detectedGeoColumns: ["region"],
      qualityWarnings: [],
      qualityScore: 100,
      createdAt: "2026-01-01T00:00:00.000Z"
    };
    const parsed: FileParseResult = {
      fileName: profile.fileName,
      fileType: "csv",
      fileSize: 12,
      selectedSheetName: "CSV",
      warnings: [],
      sheets: [
        {
          name: "CSV",
          rowCount: 1,
          columnCount: 2,
          isSelected: true,
          columns: [
            { originalName: "Region", normalizedName: "region", displayName: "Region", position: 0 },
            { originalName: "Ventas", normalizedName: "ventas", displayName: "Ventas", position: 1 }
          ],
          rows,
          previewRows: rows
        }
      ]
    };

    saveLocalDataset(profile.id, { parsed, profile, rows });

    await expect(getDatasetProfile(profile.id)).resolves.toMatchObject({ id: profile.id, rowCount: 1 });
    await expect(getDatasetRows(profile.id)).resolves.toEqual(rows);
  });

  it("creates a local share url without Supabase", async () => {
    vi.stubGlobal("crypto", crypto);
    const result = await persistShareLink({
      dashboardId: "dashboard_test",
      access: "public",
      expiresAt: "2099-01-01",
      allowFilters: true,
      allowDownload: false,
      origin: "http://localhost:3000"
    });

    expect(result.mode).toBe("local");
    expect(result.url).toContain("/share/share_");
  });
});
