import { describe, expect, it } from "vitest";
import { dryRunCommands, evaluatePolicy, knownCopilotTool, manualCommandEnvelope, resolveCopilotContext } from "@/lib/copilot-command-bus";
import { generateDashboardSpec } from "@/lib/dashboard-spec/generate-dashboard-spec";
import { demoRows } from "@/lib/data/demo-dataset";
import { profileDataset } from "@/lib/profiling/profile-dataset";
import { inferSemanticLayer } from "@/lib/semantic-layer";
import type { CommandEnvelope, ResolvedCopilotContext } from "@/lib/copilot-command-bus";

function context(): ResolvedCopilotContext {
  const datasetProfile = profileDataset(demoRows);
  const dashboardSpec = generateDashboardSpec(datasetProfile, demoRows);
  const resolved = resolveCopilotContext({
    projectId: "project_1",
    dashboardId: dashboardSpec.id,
    revisionId: "rev_1",
    targetId: "sales_by_region",
    scope: "widget",
    userMessage: "cambia visual"
  }, {
    actor: { id: "user_1", role: "editor" },
    projectId: "project_1",
    dashboardId: dashboardSpec.id,
    currentRevisionId: "rev_1",
    dashboardSpec,
    viewState: { filters: [] },
    datasetProfile,
    semanticModel: inferSemanticLayer(datasetProfile, demoRows)
  });
  if (!resolved.success) throw new Error(resolved.error);
  return resolved.context;
}

describe("copilot command bus", () => {
  it("keeps a closed tool registry", () => {
    expect(knownCopilotTool("dashboard.createWidget")).toBe(true);
    expect(knownCopilotTool("dashboard.dropDatabase")).toBe(false);
  });

  it("rejects unknown tools and invalid arguments before execution", () => {
    const ctx = context();
    const unknown = { ...manualCommandEnvelope(ctx, "dashboard.renameDashboard", { title: "Nuevo" }, "test"), tool: "dashboard.dropDatabase" } as unknown as CommandEnvelope;
    const invalid = { ...manualCommandEnvelope(ctx, "dashboard.renameWidget", { widgetId: "sales_by_region", title: "ok" }, "test"), arguments: { widgetId: "sales_by_region" } } as CommandEnvelope;

    expect(evaluatePolicy([unknown], ctx).errors[0]).toContain("Herramienta desconocida");
    expect(evaluatePolicy([invalid], ctx).errors[0]).toContain("Argumentos invalidos");
  });

  it("applies manual and copilot commands through the same bus result shape", () => {
    const ctx = context();
    const manual = manualCommandEnvelope(ctx, "dashboard.updateWidgetVisualConfig", { widgetId: "sales_by_region", visualConfig: { orientation: "vertical" } }, "Manual visual");
    const copilot = { ...manual, source: "copilot" as const, actionRunId: "run_copilot", idempotencyKey: "idem_copilot" };

    const [manualRun] = dryRunCommands([manual], ctx);
    const [copilotRun] = dryRunCommands([copilot], ctx);

    expect(manualRun.afterDashboardSpec.widgets.find((widget) => widget.id === "sales_by_region")?.config.visualConfig?.orientation).toBe("vertical");
    expect(copilotRun.afterDashboardSpec.widgets).toEqual(manualRun.afterDashboardSpec.widgets);
    expect(manualRun.diff.some((entry) => entry.path.includes("visualConfig"))).toBe(true);
  });

  it("requires confirmation for destructive commands", () => {
    const ctx = context();
    const remove = manualCommandEnvelope(ctx, "dashboard.removeWidget", { widgetId: "sales_by_region" }, "Eliminar grafico");

    const decision = evaluatePolicy([remove], ctx);

    expect(decision.allowed).toBe(false);
    expect(decision.requiresConfirmation).toBe(true);
  });
});
