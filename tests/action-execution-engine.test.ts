import { describe, expect, it } from "vitest";
import { actionEnvelope } from "@/lib/ai/actions";
import { executeCopilotActions } from "@/lib/ai/action-execution-engine";
import { generateDashboardSpec } from "@/lib/dashboard-spec/generate-dashboard-spec";
import { demoRows } from "@/lib/data/demo-dataset";
import { profileDataset } from "@/lib/profiling/profile-dataset";
import { inferSemanticLayer } from "@/lib/semantic-layer";
import type { DataRow } from "@/types/dataset";
import type { DashboardAction } from "@/types/dashboard";

function context(userMessage = "ejecuta accion") {
  const datasetProfile = profileDataset(demoRows);
  const dashboardSpec = generateDashboardSpec(datasetProfile, demoRows);
  return {
    userMessage,
    datasetProfile,
    semanticModel: inferSemanticLayer(datasetProfile, demoRows),
    dashboardSpec,
    viewState: { filters: [] },
    rows: demoRows
  };
}

function customContext(userMessage: string, rows: DataRow[]) {
  const datasetProfile = profileDataset(rows, "ventas_custom.csv");
  const dashboardSpec = generateDashboardSpec(datasetProfile, rows);
  return {
    userMessage,
    datasetProfile,
    semanticModel: inferSemanticLayer(datasetProfile, rows),
    dashboardSpec,
    viewState: { filters: [], highlightedWidgetId: "sales_by_region" },
    rows
  };
}

describe("copilot action execution engine", () => {
  it("applies add_widget actions to DashboardSpec", () => {
    const ctx = context("agrega ventas por region");
    const action: DashboardAction = {
      type: "add_widget",
      widget: {
        id: "ai_sales_region",
        type: "bar_chart",
        title: "Ventas por Region",
        query: { metric: { field: "Ventas", aggregation: "sum" }, groupBy: ["Region"] },
        config: { generatedBy: "test" },
        position: { x: 0, y: 10, w: 6, h: 3 }
      }
    };
    const result = executeCopilotActions({ ...ctx, actions: [action] });

    expect(result.actions).toHaveLength(1);
    expect(result.updatedDashboardSpec.widgets.some((widget) => widget.id === "ai_sales_region")).toBe(true);
  });

  it("applies update_widget actions to an existing focused widget", () => {
    const ctx = context("cambia este grafico a barras");
    const result = executeCopilotActions({
      ...ctx,
      focusedWidgetId: "sales_by_month",
      actions: [{ type: "update_widget", widgetId: "sales_by_month", changes: { type: "bar_chart" } }]
    });

    expect(result.updatedDashboardSpec.widgets.find((widget) => widget.id === "sales_by_month")?.type).toBe("bar_chart");
    expect(result.updatedViewState.highlightedWidgetId).toBe("sales_by_month");
  });

  it("applies filter and visible column actions to ViewState/DataExplorerState", () => {
    const ctx = context("filtra y muestra columnas");
    const result = executeCopilotActions({
      ...ctx,
      actions: [
        { type: "add_or_update_filter", filter: { field: "Region", operator: "in", value: ["Norte"] } },
        { type: "select_visible_columns", columns: ["Fecha", "Region", "Ventas"] }
      ]
    });

    expect(result.updatedViewState.filters).toEqual([{ field: "Region", operator: "in", value: ["Norte"] }]);
    expect(result.updatedDataExplorerState?.visibleColumns).toEqual(["Fecha", "Region", "Ventas"]);
  });

  it("requires confirmation for destructive actions", () => {
    const ctx = context("elimina este grafico");
    const result = executeCopilotActions({
      ...ctx,
      envelopes: [actionEnvelope({ type: "remove_widget", widgetId: "sales_by_region" }, "Eliminar widget solicitado.", 0.9)]
    });

    expect(result.actions).toHaveLength(0);
    expect(result.pendingConfirmation?.action.type).toBe("remove_widget");
    expect(result.updatedDashboardSpec.widgets.some((widget) => widget.id === "sales_by_region")).toBe(true);
  });

  it("does not claim applied changes when validation fails", () => {
    const ctx = context("usa columna inventada");
    const result = executeCopilotActions({
      ...ctx,
      assistantMessage: "Intento aplicar el cambio solicitado.",
      actions: [{ type: "add_filter", filter: { field: "columna_inventada", operator: "in", value: ["x"] } }]
    });

    expect(result.actions).toHaveLength(0);
    expect(result.errors[0]).toContain("columna_inventada");
    expect(result.assistantMessage).toContain("No aplique cambios");
    expect(result.assistantMessage).not.toContain("Listo");
  });

  it("rejects provider actions that replace requested region with channel", () => {
    const prompt = "Necesito que me hagas un grafico de ventas por region a traves de los anos. Necesito que sea con grafico de barras, donde en el eje X se muestren las regiones, en el eje Y se mantengan las ventas y que los anos se vean reflejados con distintos colores.";
    const ctx = customContext(prompt, [
      { fecha: "2023-01-01", region: "RM", canal: "Retail", ventas: 100 },
      { fecha: "2023-02-01", region: "Biobio", canal: "Mayoristas", ventas: 120 },
      { fecha: "2024-01-01", region: "RM", canal: "Retail", ventas: 150 },
      { fecha: "2024-02-01", region: "Biobio", canal: "Mayoristas", ventas: 180 }
    ]);
    const originalWidget = ctx.dashboardSpec.widgets.find((widget) => widget.id === "sales_by_region");
    const result = executeCopilotActions({
      ...ctx,
      assistantMessage: "Listo. Actualice el widget solicitado.",
      actions: [
        {
          type: "update_widget",
          widgetId: "sales_by_region",
          changes: {
            type: "bar_chart",
            title: "region por canal",
            query: {
              metric: { field: "ventas", aggregation: "sum" },
              x: { field: "canal" },
              groupBy: ["canal"],
              seriesBy: "fecha",
              seriesGranularity: "year"
            },
            config: { generatedBy: "provider" }
          }
        }
      ]
    });
    const finalWidget = result.updatedDashboardSpec.widgets.find((widget) => widget.id === "sales_by_region");

    expect(result.actions).toHaveLength(0);
    expect(result.errors.join(" ")).toContain("El widget final no coincide");
    expect(result.assistantMessage).toContain("No aplique cambios");
    expect(result.assistantMessage).not.toContain("Listo");
    expect(finalWidget?.title).toBe(originalWidget?.title);
    expect(finalWidget?.query?.groupBy).not.toEqual(["canal"]);
  });

  it("creates and edits presentations through structured actions", () => {
    const ctx = context("crea presentacion");
    const created = executeCopilotActions({ ...ctx, actions: [{ type: "create_presentation", options: { theme: "executive", durationMinutes: 5 } }] });
    const noted = executeCopilotActions({ ...ctx, presentationSpec: created.updatedPresentationSpec, actions: [{ type: "generate_speaker_notes" }] });

    expect(created.updatedPresentationSpec?.slides.length).toBeGreaterThan(0);
    expect(noted.updatedPresentationSpec?.slides.every((slide) => slide.speakerNotes)).toBe(true);
  });
});
