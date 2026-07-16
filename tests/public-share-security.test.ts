import { describe, expect, it } from "vitest";
import { buildPublicDashboardSnapshot, publicPayloadContainsSourceRows, validatePublicShareFilters } from "@/lib/share/public-snapshot";
import type { DataRow } from "@/types/dataset";
import type { DashboardSpec } from "@/types/dashboard";

function dashboardSpec(): DashboardSpec {
  return {
    id: "dashboard_public",
    title: "Public dashboard",
    datasetId: "dataset_private",
    datasetVersionId: "version_1",
    globalFilters: [{ id: "region_filter", field: "region", label: "Region", type: "single_select" }],
    widgets: [
      {
        id: "sales_kpi",
        type: "kpi_card",
        title: "Ventas",
        query: { metric: { field: "sales", aggregation: "sum" } },
        config: { format: "currency" },
        position: { x: 0, y: 0, w: 3, h: 2 }
      },
      {
        id: "source_table",
        type: "table",
        title: "Detalle fuente",
        config: { columns: ["region", "sales", "customer_secret"] },
        position: { x: 0, y: 2, w: 12, h: 4 }
      }
    ],
    createdAt: "2026-07-16T00:00:00.000Z",
    updatedAt: "2026-07-16T00:00:00.000Z"
  };
}

describe("public share snapshots", () => {
  it("returns allowlisted aggregate widget results without complete source rows", () => {
    const rows: DataRow[] = [
      { region: "north", sales: 100, customer_secret: "alpha@example.com" },
      { region: "south", sales: 150, customer_secret: "beta@example.com" }
    ];
    const dashboard = dashboardSpec();
    const snapshot = buildPublicDashboardSnapshot({ dashboard, viewState: { filters: [] }, rows });
    const payload = {
      dashboard,
      viewState: { filters: [] },
      widgetResults: snapshot.widgetResults,
      allowedFilters: snapshot.allowedFilters
    };

    expect(snapshot.widgetResults.find((result) => result.widgetId === "sales_kpi")?.rows[0]?.value).toBe(250);
    expect(snapshot.widgetResults.find((result) => result.widgetId === "source_table")?.rows).toEqual([]);
    expect(publicPayloadContainsSourceRows(payload, rows)).toBe(false);
    expect(JSON.stringify(payload)).not.toContain("alpha@example.com");
    expect(JSON.stringify(payload)).not.toContain("beta@example.com");
  });

  it("rejects arbitrary public filters outside the dashboard allowlist", () => {
    const dashboard = dashboardSpec();

    expect(validatePublicShareFilters(dashboard, [{ field: "region", operator: "eq", value: "north" }])).toBe(true);
    expect(validatePublicShareFilters(dashboard, [{ field: "customer_secret", operator: "eq", value: "alpha@example.com" }])).toBe(false);
    expect(validatePublicShareFilters(dashboard, [{ field: "region", operator: "contains", value: "north" }])).toBe(false);
  });
});
