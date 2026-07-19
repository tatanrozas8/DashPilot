import { describe, expect, it } from "vitest";
import { buildCopilotContext } from "@/lib/ai/context-builder";
import { toGovernedProviderContext } from "@/lib/copilot-command-bus/ai-gateway";
import { createCopilotPlan, resolveCopilotContext } from "@/lib/copilot-command-bus";
import { planCopilotBi, resolveBusinessIntent, buildDatasetIntelligence, resolveClarification, recommendVisualizations, validateBiPlan } from "@/lib/copilot-bi";
import { generateDashboardSpec } from "@/lib/dashboard-spec/generate-dashboard-spec";
import { demoRows } from "@/lib/data/demo-dataset";
import { profileDataset } from "@/lib/profiling/profile-dataset";
import { inferSemanticLayer } from "@/lib/semantic-layer";
import type { ResolvedCopilotContext } from "@/lib/copilot-command-bus";

function context(): ResolvedCopilotContext {
  const datasetProfile = profileDataset(demoRows, "ventas_demo.csv");
  const dashboardSpec = generateDashboardSpec(datasetProfile, demoRows);
  const semanticModel = inferSemanticLayer(datasetProfile, demoRows);
  const resolved = resolveCopilotContext({
    projectId: "project_1",
    dashboardId: dashboardSpec.id,
    revisionId: "rev_1",
    scope: "dashboard",
    userMessage: "Disenar dashboard ejecutivo completo para gerencia"
  }, {
    actor: { id: "user_1", role: "editor" },
    projectId: "project_1",
    dashboardId: dashboardSpec.id,
    currentRevisionId: "rev_1",
    dashboardSpec,
    viewState: { filters: [] },
    datasetProfile,
    semanticModel,
    messages: []
  });
  if (!resolved.success) throw new Error(resolved.error);
  return resolved.context;
}

describe("copilot BI expert layer", () => {
  it("profiles dataset intelligence without raw rows", () => {
    const datasetProfile = profileDataset(demoRows, "ventas_demo.csv");
    const semanticModel = inferSemanticLayer(datasetProfile, demoRows);
    const intelligence = buildDatasetIntelligence(datasetProfile, semanticModel);

    expect(intelligence.metrics.some((metric) => /ventas/i.test(metric.label))).toBe(true);
    expect(intelligence.dimensions.some((dimension) => /region/i.test(dimension.label))).toBe(true);
    expect(intelligence.primaryDate?.label).toMatch(/fecha/i);
    expect(intelligence.safeColumnSamples[0]).not.toHaveProperty("row");
  });

  it("resolves business intent, clarifications, and visualization recommendations", () => {
    const datasetProfile = profileDataset(demoRows, "ventas_demo.csv");
    const semanticModel = inferSemanticLayer(datasetProfile, demoRows);
    const intelligence = buildDatasetIntelligence(datasetProfile, semanticModel);
    const intent = resolveBusinessIntent("Hazme un dashboard de ventas por region, canal y ano.");
    const clarification = resolveClarification(intent, intelligence);
    const recommendations = recommendVisualizations(intent, intelligence);

    expect(intent.intent).toBe("create_full_dashboard");
    expect(intent.requestedMetric).toBe("revenue");
    expect(intent.requestedDimensions).toContain("geography");
    expect(clarification.needsClarification).toBe(false);
    expect(recommendations.some((item) => item.type === "bar_chart" && item.dimension?.label.match(/region/i))).toBe(true);
    expect(recommendations.some((item) => item.type === "line_chart" && item.date?.label.match(/fecha/i))).toBe(true);
  });

  it("asks before inventing profitability when margin/cost are absent", () => {
    const datasetProfile = profileDataset(demoRows, "ventas_demo.csv");
    const isMarginOrCost = (value: string) => /margen|costo|cost/i.test(value);
    const stripped = {
      ...datasetProfile,
      columns: datasetProfile.columns.filter((column) => !isMarginOrCost(`${column.normalizedName} ${column.originalName} ${column.displayName}`)),
      detectedMetricColumns: datasetProfile.detectedMetricColumns.filter((field) => !isMarginOrCost(field))
    };
    const semanticModel = inferSemanticLayer(stripped, []);
    const intelligence = buildDatasetIntelligence(stripped, semanticModel);
    const intent = resolveBusinessIntent("Muestrame rentabilidad.");
    const clarification = resolveClarification(intent, intelligence);

    expect(clarification.needsClarification).toBe(true);
    expect(clarification.question).toMatch(/rentabilidad/i);
    expect(clarification.options.length).toBeGreaterThan(0);
  });

  it("builds a full dashboard blueprint with widgets, table, insight, evidence and self-check", () => {
    const datasetProfile = profileDataset(demoRows, "ventas_demo.csv");
    const semanticModel = inferSemanticLayer(datasetProfile, demoRows);
    const plan = planCopilotBi({
      prompt: "Disenar dashboard ejecutivo completo para gerencia",
      rows: demoRows,
      datasetProfile,
      semanticModel
    });

    expect(plan.handled).toBe(true);
    expect(plan.needsClarification).toBe(false);
    expect(plan.blueprint?.pages[0].widgets.some((widget) => widget.type === "kpi_card")).toBe(true);
    expect(plan.actions.some((action) => action.type === "add_widget" && action.widget.type === "table")).toBe(true);
    expect(plan.actions.some((action) => action.type === "add_widget" && action.widget.type === "insight_text")).toBe(true);
    expect(plan.evidence.join(" ")).toContain("evidence_");
    expect(plan.selfCheck.passed).toBe(true);
    expect(validateBiPlan({ intelligence: plan.intelligence, actions: plan.actions }).passed).toBe(true);
  });

  it("routes full dashboard creation through the governed command bus plan", () => {
    const ctx = context();
    const plan = createCopilotPlan(ctx, "Disenar dashboard ejecutivo completo para gerencia");

    expect(plan.needsClarification).toBe(false);
    expect(plan.blueprint?.title).toMatch(/Ejecutivo|Ventas/);
    expect(plan.actions.some((action) => action.envelope.tool === "dashboard.createWidget")).toBe(true);
    expect(plan.actions.some((action) => action.envelope.tool === "dashboard.updateDashboardSubtitle")).toBe(true);
    expect(plan.expectedDiff.length).toBeGreaterThan(0);
    expect(plan.selfCheck?.passed).toBe(true);
  });

  it("does not send raw rows to the governed provider context by default", () => {
    const datasetProfile = profileDataset(demoRows, "ventas_demo.csv");
    const dashboardSpec = generateDashboardSpec(datasetProfile, demoRows);
    const copilotContext = buildCopilotContext({
      rows: demoRows.slice(0, 25),
      datasetProfile,
      dashboardSpec,
      viewState: { filters: [] }
    });
    const providerContext = toGovernedProviderContext(copilotContext);

    expect(providerContext.privacy.rawRowsIncluded).toBe(false);
    expect(providerContext.datasetChunks.every((chunk) => chunk.sampleRows.length === 0)).toBe(true);
  });
});
