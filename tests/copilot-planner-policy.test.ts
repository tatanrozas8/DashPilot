import { describe, expect, it } from "vitest";
import { createCopilotPlan, evaluatePolicy, manualCommandEnvelope, resolveCopilotContext } from "@/lib/copilot-command-bus";
import { generateDashboardSpec } from "@/lib/dashboard-spec/generate-dashboard-spec";
import { demoRows } from "@/lib/data/demo-dataset";
import { profileDataset } from "@/lib/profiling/profile-dataset";
import { inferSemanticLayer } from "@/lib/semantic-layer";

function context(role: "viewer" | "editor" = "editor") {
  const datasetProfile = profileDataset(demoRows);
  const dashboardSpec = generateDashboardSpec(datasetProfile, demoRows);
  const selected = dashboardSpec.widgets.find((widget) => widget.id === "sales_by_region");
  const resolved = resolveCopilotContext({
    projectId: "project_1",
    dashboardId: dashboardSpec.id,
    revisionId: "rev_1",
    targetId: "sales_by_region",
    scope: "widget",
    userMessage: "x"
  }, {
    actor: { id: "user_1", role },
    projectId: "project_1",
    dashboardId: dashboardSpec.id,
    currentRevisionId: "rev_1",
    dashboardSpec,
    viewState: { filters: [], selectedTargetType: "widget", selectedTargetId: "sales_by_region", selectedTargetTitle: selected?.title },
    datasetProfile,
    semanticModel: inferSemanticLayer(datasetProfile, demoRows)
  });
  if (!resolved.success) throw new Error(resolved.error);
  return resolved.context;
}

describe("copilot planner and policy gate", () => {
  it("planner creates a widget plan without executing it", () => {
    const ctx = context();
    const plan = createCopilotPlan(ctx, "Crea un nuevo grafico de ventas por canal.");

    expect(plan.intent).toBe("create");
    expect(plan.actions[0]?.envelope.tool).toBe("dashboard.createWidget");
    expect(ctx.dashboardSpec.widgets).toHaveLength(generateDashboardSpec(profileDataset(demoRows), demoRows).widgets.length);
    expect(plan.expectedDiff.some((entry) => entry.kind === "created")).toBe(true);
  });

  it("ambiguous prompts request clarification with real options", () => {
    const plan = createCopilotPlan(context(), "Hazlo mejor.");

    expect(plan.needsClarification).toBe(true);
    expect(plan.clarification?.options).toEqual(["Cambiar visualizacion", "Cambiar metrica", "Agregar filtro", "Crear nuevo grafico", "Mejorar layout"]);
  });

  it("viewer cannot receive an authorized mutable plan", () => {
    const ctx = context("viewer");
    const command = manualCommandEnvelope(ctx, "dashboard.renameDashboard", { title: "No permitido" }, "viewer edit");

    const policy = evaluatePolicy([command], ctx);

    expect(policy.allowed).toBe(false);
    expect(policy.errors[0]).toContain("viewer");
  });
});
