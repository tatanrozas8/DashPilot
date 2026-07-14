import { describe, expect, it } from "vitest";
import { buildActionPlan } from "@/lib/ai/action-plan";
import { buildCopilotMemory, retrieveRelevantPreviousInstruction } from "@/lib/ai/copilot-memory";
import { classifyIntent } from "@/lib/ai/intent-classifier";
import { verifyExecution } from "@/lib/ai/verify-execution";
import { createMockCopilotResponse } from "@/lib/ai/copilot-service";
import { applyDashboardAction } from "@/lib/dashboard-spec/apply-dashboard-action";
import { generateDashboardSpec } from "@/lib/dashboard-spec/generate-dashboard-spec";
import { profileDataset } from "@/lib/profiling/profile-dataset";
import { inferSemanticLayer } from "@/lib/semantic-layer";
import type { ChatMessage } from "@/types/ai";
import type { DataRow } from "@/types/dataset";
import type { DashboardViewState } from "@/types/dashboard";

const temporalRows: DataRow[] = [
  { fecha: "2023-01-01", region: "RM", canal: "Retail", ventas: 100 },
  { fecha: "2023-02-01", region: "Biobio", canal: "Mayoristas", ventas: 120 },
  { fecha: "2024-01-01", region: "RM", canal: "Retail", ventas: 180 },
  { fecha: "2024-02-01", region: "Biobio", canal: "Mayoristas", ventas: 160 }
];

function selectedContext(prompt: string, messages: ChatMessage[] = []) {
  const datasetProfile = profileDataset(temporalRows, "ventas_custom.csv");
  const dashboardSpec = generateDashboardSpec(datasetProfile, temporalRows);
  const selected = dashboardSpec.widgets.find((widget) => widget.id === "sales_by_region");
  const viewState: DashboardViewState = {
    filters: [],
    highlightedWidgetId: "sales_by_region",
    selectedTargetType: "widget",
    selectedTargetId: "sales_by_region",
    selectedTargetTitle: selected?.title,
    selectedTargetSpec: selected,
    selectedTargetCapabilities: ["change_chart_type", "update_query", "orientation"]
  };
  return {
    prompt,
    datasetProfile,
    semanticModel: inferSemanticLayer(datasetProfile, temporalRows),
    dashboardSpec,
    viewState,
    messages,
    rows: temporalRows
  };
}

describe("copilot agent loop", () => {
  it("uses lastActionableInstruction when replacing with previous instructions", () => {
    const previous = "Hazme un grafico de barras con regiones en X, ventas en Y y anos con colores.";
    const messages: ChatMessage[] = [{ id: "u1", role: "user", content: previous, createdAt: "2026-01-01T00:00:00.000Z" }];
    const result = createMockCopilotResponse(selectedContext("Reemplazalo por uno con las instrucciones anteriores.", messages));
    const widget = result.updatedDashboardSpec?.widgets.find((item) => item.id === "sales_by_region");

    expect(result.actions?.[0]?.type).toBe("replace_widget");
    expect(widget?.type).toBe("bar_chart");
    expect(widget?.query?.x?.field).toBe("region");
    expect(widget?.query?.metric?.field).toBe("ventas");
    expect(widget?.query?.seriesBy).toBe("fecha");
    expect(widget?.query?.seriesGranularity).toBe("year");
  });

  it("classifies correction with action separately from clarification", () => {
    const classification = classifyIntent("No cambies la logica, solo cambia orientacion vertical.");

    expect(classification.intents).toContain("correction_with_action");
    expect(classification.intents).toContain("update_visual_only");
    expect(classification.intent).not.toBe("ask_clarification");
  });

  it("retrieves the latest actionable instruction from memory", () => {
    const ctx = selectedContext("Reemplazalo por uno con las instrucciones anteriores.", [
      { id: "u1", role: "user", content: "No, eso no era", createdAt: "2026-01-01T00:00:00.000Z" },
      { id: "u2", role: "user", content: "Grafico de barras con regiones en X y ventas en Y.", createdAt: "2026-01-01T00:01:00.000Z" }
    ]);
    const memory = buildCopilotMemory({ messages: ctx.messages, dashboardSpec: ctx.dashboardSpec });

    expect(retrieveRelevantPreviousInstruction({ currentMessage: ctx.prompt, memory })).toContain("regiones");
  });

  it("plans visual-only orientation without changing data logic", () => {
    const ctx = selectedContext("No cambies la logica, solo vertical.");
    const plan = buildActionPlan({ prompt: ctx.prompt, dashboardSpec: ctx.dashboardSpec, viewState: ctx.viewState });

    expect(plan.intent).toBe("correction_with_action");
    expect(plan.action?.type).toBe("update_widget_visual_config");
    expect(plan.changesVisualOnly).toBe(true);
    expect(plan.changesDataLogic).toBe(false);
  });

  it("asks for selection when this chart has no selected target", () => {
    const ctx = selectedContext("Cambia este grafico a barras.");
    const plan = buildActionPlan({ prompt: ctx.prompt, dashboardSpec: ctx.dashboardSpec, viewState: { filters: [] } });

    expect(plan.needsClarification).toBe(true);
    expect(plan.missingInfo).toContain("selectedTargetId");
  });

  it("post-validation fails when requested chart type ends as line chart", () => {
    const ctx = selectedContext("Cambia este grafico a barras.");
    const plan = buildActionPlan({ prompt: ctx.prompt, dashboardSpec: ctx.dashboardSpec, viewState: ctx.viewState });
    const action = { type: "change_chart_type" as const, widgetId: "sales_by_region", chartType: "bar_chart" as const };
    const applied = applyDashboardAction(ctx.dashboardSpec, ctx.viewState, { ...action, chartType: "line_chart" });
    const verification = verifyExecution({
      plan,
      action,
      beforeDashboardSpec: ctx.dashboardSpec,
      afterDashboardSpec: applied.spec,
      beforeViewState: ctx.viewState,
      afterViewState: applied.viewState
    });

    expect(verification.success).toBe(false);
    expect(verification.errors.join(" ")).toContain("bar_chart");
  });

  it("undo returns a structured undo action", () => {
    const result = createMockCopilotResponse(selectedContext("No, vuelve atras."));

    expect(result.actions?.[0]?.type).toBe("undo_last_action");
  });

  it("filters multiple real values from a natural language solo request", () => {
    const result = createMockCopilotResponse(selectedContext("Muestrame solo RM y Biobio."));

    expect(result.actions?.[0]?.type).toBe("add_or_update_filter");
    expect(result.updatedViewState?.filters).toEqual([{ field: "region", operator: "in", value: ["RM", "Biobio"] }]);
  });

  it("selects visible table columns without requiring the word columnas", () => {
    const result = createMockCopilotResponse(selectedContext("Quiero ver fecha, region, canal y ventas."));

    expect(result.actions?.[0]?.type).toBe("select_visible_columns");
    expect(result.updatedViewState?.dataExplorer?.isOpen).toBe(true);
    expect(result.updatedViewState?.dataExplorer?.visibleColumns).toEqual(["fecha", "region", "canal", "ventas"]);
  });

  it("does not invent a filter value when the user only names the filter field", () => {
    const result = createMockCopilotResponse(selectedContext("Agrega un filtro por region."));

    expect(result.actions ?? []).toHaveLength(0);
    expect(result.updatedViewState?.filters).toEqual([]);
    expect(result.reply).toContain("necesito una columna y un valor");
  });

  it("creates a new sales by channel widget at the end of the dashboard", () => {
    const ctx = selectedContext("Crea un nuevo grafico de ventas por canal.");
    const result = createMockCopilotResponse(ctx);
    const added = result.updatedDashboardSpec?.widgets.at(-1);

    expect(result.actions?.[0]?.type).toBe("add_widget");
    expect(result.updatedDashboardSpec?.widgets).toHaveLength(ctx.dashboardSpec.widgets.length + 1);
    expect(added?.query?.groupBy).toEqual(["canal"]);
    expect(added?.query?.metric?.field).toBe("ventas");
  });
});
