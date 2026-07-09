import { describe, expect, it } from "vitest";
import { applyDashboardAction } from "@/lib/dashboard-spec/apply-dashboard-action";
import { createMockCopilotResponse } from "@/lib/ai/copilot-service";
import { generateDashboardSpec } from "@/lib/dashboard-spec/generate-dashboard-spec";
import { demoRows } from "@/lib/data/demo-dataset";
import { profileDataset } from "@/lib/profiling/profile-dataset";
import { inferSemanticLayer } from "@/lib/semantic-layer";
import { validateCopilotAction } from "@/lib/validation/copilot-actions";
import type { CopilotRequestContext } from "@/lib/ai/copilot-service";

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
});
