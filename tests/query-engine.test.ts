import { describe, expect, it } from "vitest";
import { demoRows } from "@/lib/data/demo-dataset";
import { applyDashboardFilters, executeDashboardQuery } from "@/lib/query-engine/execute-dashboard-query";

describe("query engine", () => {
  it("aggregates by month", () => {
    const result = executeDashboardQuery(demoRows, {
      metric: { field: "Ventas", aggregation: "sum" },
      x: { field: "Fecha", granularity: "month" }
    });

    expect(result).toHaveLength(6);
    expect(result[0]?.value).toBeGreaterThan(0);
  });

  it("applies in filters", () => {
    const filtered = applyDashboardFilters(demoRows, [{ field: "Region", operator: "in", value: ["Norte"] }]);

    expect(filtered.length).toBeGreaterThan(0);
    expect(filtered.every((row) => row.Region === "Norte")).toBe(true);
  });

  it("supports temporal granularities", () => {
    const rows = [
      { Fecha: "2024-04-01", Ventas: 10 },
      { Fecha: "2024-04-15", Ventas: 20 },
      { Fecha: "2024-07-01", Ventas: 30 }
    ];

    expect(executeDashboardQuery(rows, { metric: { field: "Ventas", aggregation: "sum" }, x: { field: "Fecha", granularity: "day" } })).toHaveLength(3);
    expect(executeDashboardQuery(rows, { metric: { field: "Ventas", aggregation: "sum" }, x: { field: "Fecha", granularity: "quarter" } })[0]?.label).toBe("Q2 2024");
    expect(executeDashboardQuery(rows, { metric: { field: "Ventas", aggregation: "sum" }, x: { field: "Fecha", granularity: "year" } })).toHaveLength(1);
  });
});
