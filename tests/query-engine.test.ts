import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { demoRows } from "@/lib/data/demo-dataset";
import { parseCsvFile } from "@/lib/files/parse-csv";
import { applyDashboardFilters, evaluateCalculatedMetric, evaluateCalculatedMetricResult, executeComparisonQuery, executeDashboardQuery } from "@/lib/query-engine/execute-dashboard-query";
import { queryTableRows, searchRows, selectColumns } from "@/lib/query-engine/search";
import { parseLocaleNumber } from "@/lib/data/parse-values";
import type { DataRow } from "@/types/dataset";

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

  it("can keep full table rows after search and sort when projection is disabled", () => {
    const result = queryTableRows(demoRows, {
      search: "Norte",
      columns: ["Region", "Ventas"],
      projectColumns: false,
      sort: { field: "Ventas", direction: "desc" }
    });

    expect(result.filteredRows).toBeGreaterThan(0);
    expect(Object.keys(result.rows[0] ?? {})).toContain("Producto");
    expect(Object.keys(result.rows[0] ?? {})).toContain("Vendedor");
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
      { Fecha: "2024-04-01", Ventas: "$1.200,50", Region: "Norte" },
      { Fecha: "2024-04-15", Ventas: "$2.300,25", Region: "Sur" },
      { Fecha: "2024-05-01", Ventas: "$900,00", Region: "Norte" }
    ];

    const filtered = applyDashboardFilters(rows, [{ field: "Fecha", operator: "between", value: ["2024-04-01", "2024-04-30"] }]);
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

  it("does not coerce invalid numeric inputs to zero in sums or averages", () => {
    const rows: DataRow[] = [
      { Valor: null },
      {},
      { Valor: "" },
      { Valor: Number.NaN },
      { Valor: Number.POSITIVE_INFINITY },
      { Valor: "texto" },
      { Valor: 0 },
      { Valor: "$1.200,50" },
      { Valor: "15%" },
      { Valor: -20 }
    ];

    const sum = executeDashboardQuery(rows, { metric: { field: "Valor", aggregation: "sum" } })[0]!;
    const average = executeDashboardQuery(rows, { metric: { field: "Valor", aggregation: "avg" } })[0]!;

    expect(sum.value).toBeCloseTo(1195.5);
    expect(sum.result?.validCount).toBe(4);
    expect(sum.result?.excludedCount).toBe(6);
    expect(sum.result?.coverage).toBe(0.4);
    expect(sum.result?.state).toBe("partial");
    expect(average.value).toBeCloseTo(298.875);
    expect(average.result?.validCount).toBe(4);
  });

  it("returns null instead of a fake zero when a numeric aggregate has no valid values", () => {
    const rows = [{ Valor: null }, { Valor: "" }, { Valor: "sin dato" }, { Valor: Number.NEGATIVE_INFINITY }];
    const result = executeDashboardQuery(rows, { metric: { field: "Valor", aggregation: "sum" } })[0]!;

    expect(result.value).toBeNull();
    expect(result.result?.state).toBe("invalid");
    expect(result.result?.warnings.map((warning) => warning.code)).toContain("no_valid_numeric_values");
  });

  it("documents null treatment for count and count_distinct", () => {
    const rows: DataRow[] = [{ Cliente: null }, {}, { Cliente: "" }, { Cliente: "A" }, { Cliente: "A" }, { Cliente: "B" }];
    const count = executeDashboardQuery(rows, { metric: { field: "Cliente", aggregation: "count" } })[0]!;
    const distinct = executeDashboardQuery(rows, { metric: { field: "Cliente", aggregation: "count_distinct" } })[0]!;

    expect(count.value).toBe(6);
    expect(count.result?.excludedCount).toBe(0);
    expect(distinct.value).toBe(2);
    expect(distinct.result?.validCount).toBe(3);
    expect(distinct.result?.excludedCount).toBe(3);
  });

  it.each([
    ["null", null, null, "invalid"],
    ["missing", undefined, null, "invalid"],
    ["empty string", "", null, "invalid"],
    ["NaN", Number.NaN, null, "invalid"],
    ["infinity", Number.POSITIVE_INFINITY, null, "invalid"],
    ["text", "abc", null, "invalid"],
    ["real zero", 0, 0, "ok"],
    ["currency", "$1.200,50", 1200.5, "ok"],
    ["percentage", "12,5%", 12.5, "ok"],
    ["negative", -42, -42, "ok"]
  ])("classifies %s with explicit numeric semantics", (_label, value, expected, state) => {
    const rows: DataRow[] = value === undefined ? [{}] : [{ Valor: value }];
    const result = executeDashboardQuery(rows, { metric: { field: "Valor", aggregation: "sum" } })[0]!;

    if (expected === null) expect(result.value).toBeNull();
    else expect(result.value).toBeCloseTo(expected);
    expect(result.result?.state).toBe(state);
  });

  it("keeps invalid values out of numeric filters instead of treating them as zero", () => {
    const rows = [{ Valor: "abc" }, { Valor: null }, { Valor: 0 }, { Valor: -2 }];
    const filtered = applyDashboardFilters(rows, [{ field: "Valor", operator: "gte", value: 0 }]);

    expect(filtered).toEqual([{ Valor: 0 }]);
  });

  it("propagates calculated metric errors for division by zero and invalid operands", () => {
    const division = evaluateCalculatedMetricResult({ Ventas: 0, Costo: 10 }, "Costo / Ventas", ["Ventas", "Costo"]);
    const invalidOperand = evaluateCalculatedMetricResult({ Ventas: "sin dato", Costo: 10 }, "Costo / Ventas", ["Ventas", "Costo"]);

    expect(division.value).toBeNull();
    expect(division.state).toBe("indeterminate");
    expect(division.warnings[0]?.code).toBe("division_by_zero");
    expect(invalidOperand.value).toBeNull();
    expect(invalidOperand.state).toBe("invalid");
    expect(evaluateCalculatedMetric({ Ventas: 0, Costo: 10 }, "Costo / Ventas", ["Ventas", "Costo"])).toBeNull();
  });

  it("matches a SQL-style average reference that ignores non numeric values", () => {
    const values = [null, "", "abc", 0, "$1.200,50", -20, "10%"];
    const rows = values.map((Valor) => ({ Valor }));
    const valid = values.map(parseLocaleNumber).filter((value): value is number => value !== null);
    const referenceAverage = valid.reduce((sum, value) => sum + value, 0) / valid.length;
    const result = executeDashboardQuery(rows, { metric: { field: "Valor", aggregation: "avg" } })[0]!;

    expect(result.value).toBeCloseTo(referenceAverage);
    expect(result.result?.validCount).toBe(valid.length);
    expect(result.result?.excludedCount).toBe(values.length - valid.length);
  });

  it("runs the golden CSV fixture for nulls, text, percentages, currency and negatives", async () => {
    const fixture = readFileSync(resolve("tests/fixtures/query_semantics_golden.csv"));
    const parsed = await parseCsvFile(new File([fixture], "query_semantics_golden.csv", { type: "text/csv" }));
    const rows = parsed.sheets[0]!.rows;
    const valueSum = executeDashboardQuery(rows, { metric: { field: "valor", aggregation: "sum" } })[0]!;
    const ratioAverage = executeDashboardQuery(rows, { metric: { field: "ratio", aggregation: "avg" } })[0]!;

    expect(valueSum.value).toBeCloseTo(1180.5);
    expect(valueSum.result?.validCount).toBe(3);
    expect(valueSum.result?.excludedCount).toBe(4);
    expect(ratioAverage.value).toBeCloseTo(0.05 / 3);
    expect(ratioAverage.result?.validCount).toBe(3);
  });
});
