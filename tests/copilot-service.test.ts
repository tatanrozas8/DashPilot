import { describe, expect, it } from "vitest";
import { applyDashboardAction } from "@/lib/dashboard-spec/apply-dashboard-action";
import { createMockCopilotResponse } from "@/lib/ai/copilot-service";
import { generateDashboardSpec } from "@/lib/dashboard-spec/generate-dashboard-spec";
import { demoRows } from "@/lib/data/demo-dataset";
import { profileDataset } from "@/lib/profiling/profile-dataset";
import { inferSemanticLayer } from "@/lib/semantic-layer";
import { validateCopilotAction } from "@/lib/validation/copilot-actions";
import type { CopilotRequestContext } from "@/lib/ai/copilot-service";
import type { DataRow } from "@/types/dataset";

function context(prompt: string): CopilotRequestContext {
  const datasetProfile = profileDataset(demoRows);
  return {
    prompt,
    datasetProfile,
    semanticModel: inferSemanticLayer(datasetProfile, demoRows),
    dashboardSpec: generateDashboardSpec(datasetProfile, demoRows),
    viewState: { filters: [] }
  };
}

function customContext(prompt: string, rows: DataRow[]): CopilotRequestContext {
  const datasetProfile = profileDataset(rows, "ventas_custom.csv");
  return {
    prompt,
    datasetProfile,
    semanticModel: inferSemanticLayer(datasetProfile, rows),
    dashboardSpec: generateDashboardSpec(datasetProfile, rows),
    viewState: { filters: [] }
  };
}

describe("copilot service", () => {
  it("accepts valid structured actions against existing columns and widgets", () => {
    const ctx = context("cambia a barras");
    const result = validateCopilotAction({ type: "change_chart_type", widgetId: "sales_by_month", chartType: "bar_chart" }, ctx);

    expect(result.success).toBe(true);
  });

  it("rejects actions that invent columns", () => {
    const ctx = context("agrega filtro falso");
    const result = validateCopilotAction({ type: "add_filter", filter: { field: "columna_inventada", operator: "in", value: ["x"] } }, ctx);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("columna_inventada");
  });

  it("creates advanced mock actions using semantic context", () => {
    const ctx = context("agrega un nuevo grafico por producto");
    const result = createMockCopilotResponse(ctx);

    expect(result.source).toBe("mock");
    expect(result.action?.type).toBe("add_widget");
    if (result.action?.type === "add_widget") {
      expect(result.action.widget.query?.metric?.field).toBeTruthy();
      expect(result.action.widget.query?.groupBy?.[0]).toBeTruthy();
    }
  });

  it("adds or focuses a real geography analysis for region prompts", () => {
    const ctx = customContext("pon las regiones", [
      { Pais: "Chile", Ventas: 1200, Fecha: "2024-01-01" },
      { Pais: "Peru", Ventas: 900, Fecha: "2024-02-01" },
      { Pais: "Chile", Ventas: 1500, Fecha: "2024-03-01" }
    ]);
    const result = createMockCopilotResponse(ctx);

    expect(result.source).toBe("mock");
    expect(result.reply).toContain("Pais");
    expect(result.actions?.some((action) => action.type === "add_widget" || action.type === "focus_widget")).toBe(true);
    expect(result.updatedDashboardSpec?.widgets.some((widget) => widget.query?.groupBy?.includes("Pais"))).toBe(true);
  });

  it("creates a seller ranking with the real seller and revenue columns", () => {
    const ctx = context("ventas por vendedor");
    const result = createMockCopilotResponse(ctx);

    expect(result.actions?.[0]?.type).toBe("add_widget");
    if (result.actions?.[0]?.type === "add_widget") {
      expect(result.actions[0].widget.query?.groupBy?.[0]).toBe("Vendedor");
      expect(result.actions[0].widget.query?.metric?.field).toBe("Ventas");
    }
  });

  it("explains when margin is missing instead of inventing columns", () => {
    const ctx = customContext("analiza margen", [
      { Pais: "Chile", Ventas: 1200, Fecha: "2024-01-01" },
      { Pais: "Peru", Ventas: 900, Fecha: "2024-02-01" }
    ]);
    const result = createMockCopilotResponse(ctx);

    expect(result.actions ?? []).toHaveLength(0);
    expect(result.reply).toContain("No encontre");
  });

  it("applies filters using resolved columns and literal values", () => {
    const ctx = customContext("filtra Pais Chile", [
      { Pais: "Chile", Ventas: 1200, Fecha: "2024-01-01" },
      { Pais: "Peru", Ventas: 900, Fecha: "2024-02-01" }
    ]);
    const result = createMockCopilotResponse(ctx);

    expect(result.updatedViewState?.filters).toEqual([{ field: "Pais", operator: "in", value: ["Chile"] }]);
  });

  it("applies filter, clear and explain actions only to spec or view state", () => {
    const ctx = context("filtra norte");
    const filtered = applyDashboardAction(ctx.dashboardSpec, ctx.viewState, { type: "add_filter", filter: { field: "Region", operator: "in", value: ["Norte"] } });
    const explained = applyDashboardAction(filtered.spec, filtered.viewState, { type: "explain_widget", widgetId: "sales_by_region" });
    const cleared = applyDashboardAction(explained.spec, explained.viewState, { type: "clear_filters" });

    expect(filtered.viewState.filters).toHaveLength(1);
    expect(explained.viewState.highlightedWidgetId).toBe("sales_by_region");
    expect(cleared.viewState.filters).toHaveLength(0);
    expect(cleared.spec).toBe(ctx.dashboardSpec);
  });

  it("validates and applies richer dashboard actions", () => {
    const ctx = context("acciones avanzadas");
    const updated = applyDashboardAction(ctx.dashboardSpec, ctx.viewState, { type: "update_widget", widgetId: "sales_by_region", changes: { query: { metric: { field: "Ventas", aggregation: "sum" }, groupBy: ["Region"], limit: 3 } } });
    const duplicated = applyDashboardAction(updated.spec, updated.viewState, { type: "duplicate_widget", widgetId: "sales_by_region" });
    const renamed = applyDashboardAction(duplicated.spec, duplicated.viewState, { type: "update_dashboard_title", title: "Vista Ejecutiva" });
    const chart = applyDashboardAction(renamed.spec, renamed.viewState, { type: "change_chart_type", widgetId: "sales_by_region", chartType: "line_chart" });

    expect(validateCopilotAction({ type: "update_widget", widgetId: "sales_by_region", changes: { query: { metric: { field: "Ventas", aggregation: "sum" }, groupBy: ["Region"], limit: 3 } } }, ctx).success).toBe(true);
    expect(updated.spec.widgets.find((widget) => widget.id === "sales_by_region")?.query?.limit).toBe(3);
    expect(duplicated.spec.widgets.some((widget) => widget.id === "sales_by_region_copy")).toBe(true);
    expect(renamed.spec.title).toBe("Vista Ejecutiva");
    expect(chart.spec.widgets.find((widget) => widget.id === "sales_by_region")?.type).toBe("line_chart");
  });
});
