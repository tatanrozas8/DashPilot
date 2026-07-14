import { describe, expect, it } from "vitest";
import { parseAnalyticalIntent } from "@/lib/ai/intent-parser";
import { buildAnalysisPlan, planAnalyticalChart, resolveDimension, resolveMetric, resolveTimeColumn, validateAnalysisPlan, validateWidgetMatchesPlan } from "@/lib/dashboard-spec/chart-planner";
import { generateDashboardSpec } from "@/lib/dashboard-spec/generate-dashboard-spec";
import { profileDataset } from "@/lib/profiling/profile-dataset";
import { buildDatasetCatalog, inferSemanticLayer } from "@/lib/semantic-layer";
import type { DataRow } from "@/types/dataset";
import type { DashboardWidget } from "@/types/dashboard";

function planningContext(prompt: string, rows: DataRow[]) {
  const datasetProfile = profileDataset(rows, "ventas_region_tiempo.csv");
  return {
    prompt,
    rows,
    datasetProfile,
    semanticModel: inferSemanticLayer(datasetProfile, rows),
    dashboardSpec: generateDashboardSpec(datasetProfile, rows),
    viewState: { filters: [] }
  };
}

const explicitRegionYearBarPrompt = "Necesito que me hagas un grafico de ventas por region a traves de los anos. Necesito que sea con grafico de barras, donde en el eje X se muestren las regiones, en el eje Y se mantengan las ventas y que los anos se vean reflejados con distintos colores.";

describe("analytical intent parser and chart planner", () => {
  it("detects sales by region through years as a temporal dimension chart", () => {
    const intent = parseAnalyticalIntent("grafico de ventas por region a traves de los anos");

    expect(intent.metricIntent).toBe("ventas");
    expect(intent.dimensionIntent).toBe("region");
    expect(intent.timeIntent).toBe("year");
    expect(intent.chartIntent).toBe("time_series_by_dimension");
  });

  it("detects explicit bar chart axes and color series", () => {
    const intent = parseAnalyticalIntent("Hazme un grafico de barras con regiones en el eje X, ventas en el eje Y y anos con distintos colores");

    expect(intent.chartTypeIntent).toBe("bar_chart");
    expect(intent.xAxisIntent).toBe("region");
    expect(intent.yAxisIntent).toBe("ventas");
    expect(intent.seriesIntent).toBe("fecha");
    expect(intent.seriesGranularityIntent).toBe("year");
  });

  it("detects the exact explicit region-year bar chart prompt", () => {
    const intent = parseAnalyticalIntent(explicitRegionYearBarPrompt);

    expect(intent.chartTypeIntent).toBe("bar_chart");
    expect(intent.xAxisIntent).toBe("region");
    expect(intent.yAxisIntent).toBe("ventas");
    expect(intent.seriesIntent).toBe("fecha");
    expect(intent.seriesGranularityIntent).toBe("year");
  });

  it("detects margin by channel by month as a temporal dimension chart", () => {
    const intent = parseAnalyticalIntent("margen por canal por mes");

    expect(intent.metricIntent).toBe("margen");
    expect(intent.dimensionIntent).toBe("canal");
    expect(intent.timeIntent).toBe("month");
    expect(intent.chartIntent).toBe("time_series_by_dimension");
  });

  it("detects sales by region without time as a static breakdown", () => {
    const intent = parseAnalyticalIntent("ventas por region");

    expect(intent.metricIntent).toBe("ventas");
    expect(intent.dimensionIntent).toBe("region");
    expect(intent.timeIntent).toBeNull();
    expect(intent.chartIntent).toBe("breakdown_by_dimension");
  });

  it("resolves metric, dimension and date independently", () => {
    const rows: DataRow[] = [
      { fecha: "2023-01-01", region: "RM", venta_neta_clp: 100, forecast_venta_clp: 120 },
      { fecha: "2024-01-01", region: "Biobio", venta_neta_clp: 200, forecast_venta_clp: 220 }
    ];
    const ctx = planningContext("ventas por region a traves de los anos", rows);
    const intent = parseAnalyticalIntent(ctx.prompt);

    expect(resolveMetric(intent, ctx).matchedColumn?.normalizedName).toBe("venta_neta_clp");
    expect(resolveDimension(intent, ctx).matchedColumn?.normalizedName).toBe("region");
    expect(resolveTimeColumn(intent, ctx).matchedColumn?.normalizedName).toBe("fecha");
  });

  it("plans a line chart with year granularity and region series", () => {
    const rows: DataRow[] = [
      { fecha: "2023-01-01", region: "RM", venta_neta_clp: 100 },
      { fecha: "2023-02-01", region: "Biobio", venta_neta_clp: 120 },
      { fecha: "2024-01-01", region: "RM", venta_neta_clp: 150 },
      { fecha: "2024-02-01", region: "Biobio", venta_neta_clp: 180 }
    ];
    const result = planAnalyticalChart(planningContext("Necesito un grafico de ventas por region a traves de los anos", rows));
    const action = result.actions[0];
    const changes = action?.type === "update_widget" ? action.changes : action?.type === "add_widget" ? action.widget : undefined;

    expect(result.handled).toBe(true);
    expect(changes?.type).toBe("line_chart");
    expect(changes?.query?.x?.granularity).toBe("year");
    expect(changes?.query?.groupBy).toEqual(["region"]);
    expect(changes?.query?.seriesBy).toBe("region");
    expect(changes?.query?.metric?.field).toBe("venta_neta_clp");
  });

  it("respects explicit bar chart type for region X, sales Y and years as colors", () => {
    const rows: DataRow[] = [
      { fecha: "2023-01-01", region: "RM", ventas: 100 },
      { fecha: "2023-02-01", region: "Biobio", ventas: 120 },
      { fecha: "2024-01-01", region: "RM", ventas: 150 },
      { fecha: "2024-02-01", region: "Biobio", ventas: 180 }
    ];
    const result = planAnalyticalChart(planningContext("Hazme un grafico de barras con regiones en el eje X, ventas en el eje Y y anos con distintos colores", rows));
    const action = result.actions[0];
    const changes = action?.type === "update_widget" ? action.changes : action?.type === "add_widget" ? action.widget : undefined;

    expect(changes?.type).toBe("bar_chart");
    expect(changes?.type).not.toBe("line_chart");
    expect(changes?.query?.x?.field).toBe("region");
    expect(changes?.query?.metric?.field).toBe("ventas");
    expect(changes?.query?.seriesBy).toBe("fecha");
    expect(changes?.query?.seriesGranularity).toBe("year");
  });

  it("builds and validates an explicit analysis plan without substituting channel for region", () => {
    const rows: DataRow[] = [
      { fecha: "2023-01-01", region: "RM", canal: "Retail", ventas: 100 },
      { fecha: "2023-02-01", region: "Biobio", canal: "Mayoristas", ventas: 120 },
      { fecha: "2024-01-01", region: "RM", canal: "Retail", ventas: 150 },
      { fecha: "2024-02-01", region: "Biobio", canal: "Mayoristas", ventas: 180 }
    ];
    const ctx = planningContext(explicitRegionYearBarPrompt, rows);
    const plan = buildAnalysisPlan(ctx);
    const validation = validateAnalysisPlan(plan, buildDatasetCatalog(ctx.datasetProfile));

    expect(validation.success).toBe(true);
    expect(plan.chartType).toBe("bar_chart");
    expect(plan.metric?.normalizedName).toBe("ventas");
    expect(plan.aggregation).toBe("sum");
    expect(plan.xAxis?.normalizedName).toBe("region");
    expect(plan.yAxis?.normalizedName).toBe("ventas");
    expect(plan.dimension?.normalizedName).toBe("region");
    expect(plan.seriesBy?.normalizedName).toBe("fecha");
    expect(plan.colorBy?.normalizedName).toBe("fecha");
    expect(plan.timeGranularity).toBe("year");
    expect(plan.xAxis?.normalizedName).not.toBe("canal");
  });

  it("rejects an analysis plan that replaces requested region with channel", () => {
    const rows: DataRow[] = [
      { fecha: "2023-01-01", region: "RM", canal: "Retail", ventas: 100 },
      { fecha: "2024-01-01", region: "RM", canal: "Mayoristas", ventas: 150 }
    ];
    const ctx = planningContext(explicitRegionYearBarPrompt, rows);
    const plan = buildAnalysisPlan(ctx);
    const channel = ctx.datasetProfile.columns.find((column) => column.normalizedName === "canal");
    const validation = validateAnalysisPlan({ ...plan, xAxis: channel ?? null, dimension: channel ?? null }, buildDatasetCatalog(ctx.datasetProfile));

    expect(validation.success).toBe(false);
    expect(validation.errors.join(" ")).toContain("region");
  });

  it("validates the final widget against the explicit analysis plan", () => {
    const rows: DataRow[] = [
      { fecha: "2023-01-01", region: "RM", canal: "Retail", ventas: 100 },
      { fecha: "2024-01-01", region: "RM", canal: "Mayoristas", ventas: 150 }
    ];
    const plan = buildAnalysisPlan(planningContext(explicitRegionYearBarPrompt, rows));
    const widget: DashboardWidget = {
      id: "region_year_sales",
      type: "bar_chart",
      title: "Ventas por region por Ano",
      query: {
        metric: { field: "ventas", aggregation: "sum" },
        x: { field: "region" },
        groupBy: ["region"],
        seriesBy: "fecha",
        seriesGranularity: "year"
      },
      config: { generatedBy: "test" },
      position: { x: 0, y: 0, w: 6, h: 3 }
    };
    const wrongWidget: DashboardWidget = {
      ...widget,
      title: "region por canal",
      query: { ...widget.query, x: { field: "canal" }, groupBy: ["canal"] }
    };

    expect(validateWidgetMatchesPlan(widget, plan).success).toBe(true);
    expect(validateWidgetMatchesPlan(wrongWidget, plan).success).toBe(false);
  });

  it("returns a clear limitation when no date column exists", () => {
    const rows: DataRow[] = [
      { region: "RM", venta_neta_clp: 100 },
      { region: "Biobio", venta_neta_clp: 120 }
    ];
    const result = planAnalyticalChart(planningContext("ventas por region a traves de los anos", rows));

    expect(result.handled).toBe(true);
    expect(result.actions).toHaveLength(0);
    expect(result.reply).toContain("no encontre una columna temporal");
  });

  it("uses month granularity when year was requested but only one year exists", () => {
    const rows: DataRow[] = [
      { fecha: "2025-01-01", region: "RM", venta_neta_clp: 100 },
      { fecha: "2025-02-01", region: "RM", venta_neta_clp: 120 },
      { fecha: "2025-02-01", region: "Biobio", venta_neta_clp: 140 }
    ];
    const result = planAnalyticalChart(planningContext("ventas por region a traves de los anos", rows));
    const action = result.actions[0];
    const changes = action?.type === "update_widget" ? action.changes : action?.type === "add_widget" ? action.widget : undefined;

    expect(changes?.query?.x?.granularity).toBe("month");
    expect(result.reply).toContain("solo el ano 2025");
  });
});
