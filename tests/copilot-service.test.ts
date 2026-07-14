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
    viewState: { filters: [] },
    rows: demoRows
  };
}

function customContext(prompt: string, rows: DataRow[]): CopilotRequestContext {
  const datasetProfile = profileDataset(rows, "ventas_custom.csv");
  return {
    prompt,
    datasetProfile,
    semanticModel: inferSemanticLayer(datasetProfile, rows),
    dashboardSpec: generateDashboardSpec(datasetProfile, rows),
    viewState: { filters: [] },
    rows
  };
}

function selectedCustomContext(prompt: string, rows: DataRow[], selectedTargetId = "sales_by_region"): CopilotRequestContext {
  const ctx = customContext(prompt, rows);
  const selected = ctx.dashboardSpec.widgets.find((widget) => widget.id === selectedTargetId);
  return {
    ...ctx,
    viewState: {
      ...ctx.viewState,
      highlightedWidgetId: selectedTargetId,
      selectedTargetType: selected?.type === "kpi_card" ? "kpi" : selected?.type === "table" ? "table" : "widget",
      selectedTargetId,
      selectedTargetTitle: selected?.title,
      selectedTargetSpec: selected,
      selectedTargetCapabilities: ["change_chart_type", "update_query", "orientation"]
    }
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

  it("applies dashboard design changes from natural language", () => {
    const ctx = context("haz el dashboard compacto verde con tarjetas bordeadas");
    const result = createMockCopilotResponse(ctx);

    expect(result.actions?.[0]?.type).toBe("update_dashboard_design");
    expect(result.updatedDashboardSpec?.design).toMatchObject({
      density: "compact",
      accentColor: "emerald",
      cardStyle: "bordered"
    });
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

  it("keeps derived margin metrics pending until explicit confirmation", () => {
    const ctx = customContext("analiza margen", [
      { Pais: "Chile", Ventas: 1200, Costo: 800, Fecha: "2024-01-01" },
      { Pais: "Peru", Ventas: 900, Costo: 700, Fecha: "2024-02-01" }
    ]);
    const result = createMockCopilotResponse(ctx);

    expect(result.pendingConfirmation?.action.type).toBe("create_calculated_metric");
    expect(result.actions ?? []).toHaveLength(0);
    expect(result.updatedDashboardSpec?.executiveSummary).not.toContain("Margen calculado");
  });

  it("applies filters using resolved columns and literal values", () => {
    const ctx = customContext("filtra Pais Chile", [
      { Pais: "Chile", Ventas: 1200, Fecha: "2024-01-01" },
      { Pais: "Peru", Ventas: 900, Fecha: "2024-02-01" }
    ]);
    const result = createMockCopilotResponse(ctx);

    expect(result.updatedViewState?.filters).toEqual([{ field: "Pais", operator: "in", value: ["Chile"] }]);
  });

  it("applies filters by finding a value in real column samples", () => {
    const ctx = customContext("filtra Chile", [
      { Pais: "Chile", Ventas: 1200, Fecha: "2024-01-01" },
      { Pais: "Peru", Ventas: 900, Fecha: "2024-02-01" }
    ]);
    const result = createMockCopilotResponse(ctx);

    expect(result.updatedViewState?.filters).toEqual([{ field: "Pais", operator: "in", value: ["Chile"] }]);
  });

  it("opens data explorer and searches the full table", () => {
    const ctx = context("busca Maria Lopez");
    const result = createMockCopilotResponse(ctx);

    expect(result.actions?.[0]?.type).toBe("search_table");
    expect(result.updatedViewState?.dataExplorer?.isOpen).toBe(true);
    expect(result.updatedViewState?.dataExplorer?.search).toBe("Maria Lopez");
  });

  it("selects requested visible columns for the data explorer", () => {
    const ctx = customContext("muestra solo las columnas pais y ventas", [
      { Pais: "Chile", Ventas: 1200, Canal: "Directo" },
      { Pais: "Peru", Ventas: 900, Canal: "Partner" }
    ]);
    const result = createMockCopilotResponse(ctx);

    expect(result.actions?.[0]?.type).toBe("select_visible_columns");
    expect(result.updatedViewState?.dataExplorer?.visibleColumns).toEqual(["Pais", "Ventas"]);
  });

  it("creates sales by country widgets from natural language", () => {
    const ctx = customContext("crea un grafico de ventas por pais", [
      { Pais: "Chile", Ventas: 1200 },
      { Pais: "Peru", Ventas: 900 }
    ]);
    const result = createMockCopilotResponse(ctx);

    expect(result.updatedDashboardSpec?.widgets.some((widget) => widget.query?.groupBy?.includes("Pais") && widget.query.metric?.field === "Ventas")).toBe(true);
  });

  it("creates a temporal region chart when the prompt asks sales by region through years", () => {
    const ctx = customContext("Necesito un grafico de ventas por region a traves de los anos", [
      { fecha: "2023-01-01", region: "RM", venta_neta_clp: 100 },
      { fecha: "2023-02-01", region: "Biobio", venta_neta_clp: 120 },
      { fecha: "2024-01-01", region: "RM", venta_neta_clp: 180 },
      { fecha: "2024-02-01", region: "Biobio", venta_neta_clp: 160 }
    ]);
    const result = createMockCopilotResponse(ctx);
    const updated = result.updatedDashboardSpec?.widgets.find((widget) => widget.id === result.updatedViewState?.highlightedWidgetId);

    expect(updated?.type).toBe("line_chart");
    expect(updated?.query?.x).toEqual({ field: "fecha", granularity: "year" });
    expect(updated?.query?.groupBy).toEqual(["region"]);
    expect(updated?.query?.seriesBy).toBe("region");
    expect(updated?.query?.metric?.field).toBe("venta_neta_clp");
    expect(updated?.type).not.toBe("bar_chart");
  });

  it("creates the requested explicit bar chart with regions on X and years as colors", () => {
    const ctx = customContext("Necesito que me hagas un grafico de ventas por region a traves de los anos. Necesito que sea con grafico de barras, donde en el eje X se muestren las regiones, en el eje Y se mantengan las ventas y que los anos se vean reflejados con distintos colores.", [
      { fecha: "2023-01-01", region: "RM", canal: "Retail", ventas: 100 },
      { fecha: "2023-02-01", region: "Biobio", canal: "Mayoristas", ventas: 120 },
      { fecha: "2024-01-01", region: "RM", canal: "Retail", ventas: 180 },
      { fecha: "2024-02-01", region: "Biobio", canal: "Mayoristas", ventas: 160 }
    ]);
    const result = createMockCopilotResponse(ctx);
    const updated = result.updatedDashboardSpec?.widgets.find((widget) => widget.id === result.updatedViewState?.highlightedWidgetId);

    expect(updated?.type).toBe("bar_chart");
    expect(updated?.query?.x?.field).toBe("region");
    expect(updated?.query?.metric?.field).toBe("ventas");
    expect(updated?.query?.metric?.aggregation).toBe("sum");
    expect(updated?.query?.seriesBy).toBe("fecha");
    expect(updated?.query?.seriesGranularity).toBe("year");
    expect(updated?.query?.groupBy).toEqual(["region"]);
    expect(updated?.query?.x?.field).not.toBe("canal");
    expect(updated?.title.toLowerCase()).not.toContain("canal");
  });

  it("does not create a static region bar chart when the prompt asks through years", () => {
    const ctx = customContext("ventas por region a traves de los anos", [
      { fecha: "2023-01-01", region: "RM", ventas: 100 },
      { fecha: "2024-01-01", region: "RM", ventas: 200 }
    ]);
    const result = createMockCopilotResponse(ctx);
    const changed = result.updatedDashboardSpec?.widgets.find((widget) => widget.id === result.updatedViewState?.highlightedWidgetId);

    expect(changed?.query?.x?.granularity).toBe("year");
    expect(changed?.query?.seriesBy).toBe("region");
    expect(changed?.type).toBe("line_chart");
  });

  it("does not interpret correction text as a filter", () => {
    const ctx = selectedCustomContext("No, no te pedi cambiar la logica", [
      { fecha: "2024-01-01", region: "RM", canal: "Retail", ventas: 100 },
      { fecha: "2024-01-02", region: "Biobio", canal: "Mayoristas", ventas: 120 }
    ]);
    const result = createMockCopilotResponse(ctx);

    expect(result.actions?.some((action) => action.type === "add_or_update_filter" || action.type === "add_filter")).toBe(false);
    expect(result.updatedViewState?.filters).toEqual([]);
    expect(result.reply).not.toContain("Listo");
  });

  it("changes only selected bar chart orientation when requested", () => {
    const ctx = selectedCustomContext("Actualmente el grafico se ve horizontal y quiero que lo muestre vertical.", [
      { fecha: "2024-01-01", region: "RM", canal: "Retail", ventas: 100 },
      { fecha: "2024-01-02", region: "Biobio", canal: "Mayoristas", ventas: 120 }
    ]);
    const before = ctx.dashboardSpec.widgets.find((widget) => widget.id === "sales_by_region");
    const result = createMockCopilotResponse(ctx);
    const after = result.updatedDashboardSpec?.widgets.find((widget) => widget.id === "sales_by_region");

    expect(result.actions?.[0]?.type).toBe("update_widget_visual_config");
    expect(after?.config.visualConfig?.orientation).toBe("vertical");
    expect(after?.query).toEqual(before?.query);
    expect(result.updatedViewState?.filters).toEqual([]);
  });

  it("returns undo action for correction asking to go back", () => {
    const ctx = selectedCustomContext("No, vuelve atras", [
      { fecha: "2024-01-01", region: "RM", ventas: 100 },
      { fecha: "2024-01-02", region: "Biobio", ventas: 120 }
    ]);
    const result = createMockCopilotResponse(ctx);

    expect(result.actions?.[0]?.type).toBe("undo_last_action");
  });

  it("creates a new chart instead of replacing the selected widget", () => {
    const ctx = selectedCustomContext("Crea un nuevo grafico de ventas por region", [
      { fecha: "2024-01-01", region: "RM", canal: "Retail", ventas: 100 },
      { fecha: "2024-01-02", region: "Biobio", canal: "Mayoristas", ventas: 120 }
    ]);
    const result = createMockCopilotResponse(ctx);

    expect(result.actions?.[0]?.type).toBe("add_widget");
    expect(result.updatedDashboardSpec?.widgets).toHaveLength(ctx.dashboardSpec.widgets.length + 1);
    expect(result.updatedDashboardSpec?.widgets.find((widget) => widget.id === "sales_by_region")?.query).toEqual(ctx.dashboardSpec.widgets.find((widget) => widget.id === "sales_by_region")?.query);
  });

  it("updates selected chart when prompt says this chart", () => {
    const ctx = selectedCustomContext("Cambia este grafico a barras", [
      { fecha: "2024-01-01", region: "RM", ventas: 100 },
      { fecha: "2024-01-02", region: "Biobio", ventas: 120 }
    ], "sales_by_month");
    const result = createMockCopilotResponse(ctx);

    expect(result.actions?.[0]?.type).toBe("change_chart_type");
    expect(result.updatedDashboardSpec?.widgets.find((widget) => widget.id === "sales_by_month")?.type).toBe("bar_chart");
  });

  it("asks for selection when prompt says this chart without selected target", () => {
    const ctx = customContext("Cambia este grafico a barras", [
      { fecha: "2024-01-01", region: "RM", ventas: 100 },
      { fecha: "2024-01-02", region: "Biobio", ventas: 120 }
    ]);
    const result = createMockCopilotResponse({ ...ctx, viewState: { filters: [] } });

    expect(result.actions?.[0]?.type).toBe("ask_clarification");
    expect(result.reply).toContain("Selecciona primero");
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
