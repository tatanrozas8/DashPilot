import { describe, expect, it } from "vitest";
import { demoRows } from "@/lib/data/demo-dataset";
import { applyDashboardFilters, executeDashboardQuery } from "@/lib/query-engine/execute-dashboard-query";
import { queryTableRows, searchRows, selectColumns } from "@/lib/query-engine/search";

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

  it("searches globally across the dataset", () => {
    const result = searchRows(demoRows, "Maria");

    expect(result.length).toBeGreaterThan(0);
    expect(result.some((row) => Object.values(row).some((value) => String(value).includes("Maria")))).toBe(true);
  });

  it("selects visible columns without changing row count", () => {
    const selected = selectColumns(demoRows.slice(0, 3), ["Region", "Ventas"]);

    expect(selected).toHaveLength(3);
    expect(Object.keys(selected[0] ?? {})).toEqual(["Region", "Ventas"]);
  });

  it("supports contains filters and count distinct", () => {
    const filtered = applyDashboardFilters(demoRows, [{ field: "Producto", operator: "contains", value: "Laptop" }]);
    const distinct = executeDashboardQuery(demoRows, { metric: { field: "Cliente", aggregation: "count_distinct" } });

    expect(filtered.every((row) => String(row.Producto).includes("Laptop"))).toBe(true);
    expect(distinct[0]?.value).toBeGreaterThan(1);
  });

  it("queries table rows with search, sort and projected columns", () => {
    const result = queryTableRows(demoRows, { search: "Norte", columns: ["Region", "Ventas"], sort: { field: "Ventas", direction: "desc" } });

    expect(result.filteredRows).toBeGreaterThan(0);
    expect(Object.keys(result.rows[0] ?? {})).toEqual(["Region", "Ventas"]);
    expect(Number(result.rows[0]?.Ventas ?? 0)).toBeGreaterThanOrEqual(Number(result.rows[1]?.Ventas ?? 0));
  });
});
