import { describe, expect, it } from "vitest";
import { demoRows } from "@/lib/data/demo-dataset";
import { applyDashboardFilters, evaluateCalculatedMetric, executeComparisonQuery, executeDashboardQuery } from "@/lib/query-engine/execute-dashboard-query";
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

  it("builds multi-series temporal rows by dimension", () => {
    const rows = [
      { Fecha: "2023-01-01", Region: "Norte", Ventas: 10 },
      { Fecha: "2023-03-01", Region: "Sur", Ventas: 20 },
      { Fecha: "2024-01-01", Region: "Norte", Ventas: 30 },
      { Fecha: "2024-04-01", Region: "Sur", Ventas: 40 }
    ];
    const result = executeDashboardQuery(rows, {
      metric: { field: "Ventas", aggregation: "sum" },
      x: { field: "Fecha", granularity: "year" },
      groupBy: ["Region"],
      seriesBy: "Region",
      orderBy: { field: "label", direction: "asc" }
    });

    expect(result).toEqual([
      { label: "2023", value: 30, Norte: 10, Sur: 20 },
      { label: "2024", value: 70, Norte: 30, Sur: 40 }
    ]);
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

  it("searches within a specific table column", () => {
    const result = queryTableRows(demoRows, { columnSearch: { field: "Vendedor", query: "Maria" }, columns: ["Vendedor", "Region"] });

    expect(result.filteredRows).toBeGreaterThan(0);
    expect(result.rows.every((row) => String(row.Vendedor).includes("Maria"))).toBe(true);
  });

  it("ignores empty table column searches", () => {
    const result = queryTableRows(demoRows, { columnSearch: { field: "Vendedor", query: " " }, columns: ["Vendedor", "Region"] });

    expect(result.filteredRows).toBe(demoRows.length);
    expect(result.rows).toHaveLength(demoRows.length);
  });

  it("ignores incomplete dashboard filters instead of hiding all rows", () => {
    const filtered = applyDashboardFilters(demoRows, [
      { field: "Region", operator: "in", value: [] },
      { field: "Fecha", operator: "between", value: ["", ""] },
      { field: "Producto", operator: "contains", value: "" }
    ]);

    expect(filtered).toHaveLength(demoRows.length);
  });

  it("handles LatAm money and day-first date ranges", () => {
    const rows = [
      { Fecha: "01/04/2024", Ventas: "$1.200,50", Region: "Norte" },
      { Fecha: "15/04/2024", Ventas: "$2.300,25", Region: "Sur" },
      { Fecha: "01/05/2024", Ventas: "$900,00", Region: "Norte" }
    ];

    const filtered = applyDashboardFilters(rows, [{ field: "Fecha", operator: "between", value: ["01/04/2024", "30/04/2024"] }]);
    const result = executeDashboardQuery(filtered, { metric: { field: "Ventas", aggregation: "sum" } });

    expect(filtered).toHaveLength(2);
    expect(result[0]?.value).toBeCloseTo(3500.75);
  });

  it("sorts table rows with formatted numeric values", () => {
    const rows = [
      { Cliente: "A", Ventas: "$9.900" },
      { Cliente: "B", Ventas: "$10.100" },
      { Cliente: "C", Ventas: "$1.200" }
    ];

    const result = queryTableRows(rows, { sort: { field: "Ventas", direction: "desc" } });

    expect(result.rows.map((row) => row.Cliente)).toEqual(["B", "A", "C"]);
  });

  it("calculates previous period comparisons from the query engine", () => {
    const rows = [
      { Fecha: "2024-01-01", Ventas: 100 },
      { Fecha: "2024-01-15", Ventas: 200 },
      { Fecha: "2024-02-01", Ventas: 300 },
      { Fecha: "2024-02-15", Ventas: 500 }
    ];
    const comparison = executeComparisonQuery(rows, { metric: { field: "Ventas", aggregation: "sum" } }, { filters: [], selectedDateRange: { from: "2024-02-01", to: "2024-02-29" } }, "Fecha");

    expect(comparison.current).toBe(800);
    expect(comparison.previous).toBe(200);
    expect(comparison.change).toBe(600);
  });

  it("evaluates simple calculated metrics without executing generated code", () => {
    expect(evaluateCalculatedMetric({ Ventas: 1000, Costo: 600 }, "(Ventas - Costo) / Ventas", ["Ventas", "Costo"])).toBeCloseTo(0.4);
    expect(evaluateCalculatedMetric({ Ventas: 1000 }, "process.exit()", ["Ventas"])).toBeNull();
  });
});
