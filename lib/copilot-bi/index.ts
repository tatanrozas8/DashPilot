import { buildDatasetIntelligence } from "@/lib/copilot-bi/dataset-intelligence";
import { resolveBusinessIntent } from "@/lib/copilot-bi/business-intent";
import { resolveClarification } from "@/lib/copilot-bi/clarification-engine";
import { buildDashboardBlueprint } from "@/lib/copilot-bi/dashboard-blueprint-builder";
import { validateBiPlan } from "@/lib/copilot-bi/self-check-validator";
import type { CopilotBiPlan, CopilotBiPlanningInput } from "@/lib/copilot-bi/types";

export * from "@/lib/copilot-bi/types";
export { buildDatasetIntelligence } from "@/lib/copilot-bi/dataset-intelligence";
export { resolveBusinessIntent } from "@/lib/copilot-bi/business-intent";
export { resolveClarification } from "@/lib/copilot-bi/clarification-engine";
export { recommendVisualizations } from "@/lib/copilot-bi/visualization-recommender";
export { planAnalyticalQueries } from "@/lib/copilot-bi/analytical-query-planner";
export { generateComputedInsights } from "@/lib/copilot-bi/insight-engine";
export { dashboardTitle, dashboardSubtitle, narrativeBullets } from "@/lib/copilot-bi/title-narrative-generator";
export { buildSummaryTableWidget } from "@/lib/copilot-bi/table-builder";
export { layoutWidgets } from "@/lib/copilot-bi/layout-planner";
export { validateBiPlan } from "@/lib/copilot-bi/self-check-validator";
export { buildDashboardBlueprint } from "@/lib/copilot-bi/dashboard-blueprint-builder";
export { planAnalyticalAnswer, formatAnalyticalAnswer } from "@/lib/copilot-bi/analytical-answer";

const actionableIntents = new Set([
  "create_full_dashboard",
  "create_executive_page",
  "create_operational_page",
  "create_detail_page",
  "create_table",
  "find_insight",
  "compare_periods",
  "explain_variation",
  "answer_analytical_question",
  "create_title",
  "create_narrative"
]);

export function planCopilotBi(input: CopilotBiPlanningInput): CopilotBiPlan {
  const intelligence = buildDatasetIntelligence(input.datasetProfile, input.semanticModel);
  const intent = resolveBusinessIntent(input.prompt);
  const clarification = resolveClarification(intent, intelligence);
  if (!actionableIntents.has(intent.intent) && !clarification.needsClarification) {
    return {
      handled: false,
      needsClarification: false,
      intent,
      intelligence,
      actions: [],
      evidence: [],
      selfCheck: { passed: true, items: [], warnings: [], errors: [] },
      warnings: [],
      confidence: intent.confidence
    };
  }
  if (clarification.needsClarification) {
    return {
      handled: true,
      needsClarification: true,
      clarification,
      intent,
      intelligence,
      actions: [],
      evidence: [`Clarificacion requerida: ${clarification.reason}`],
      selfCheck: { passed: false, items: [], warnings: [], errors: [clarification.reason] },
      warnings: [],
      confidence: clarification.confidence
    };
  }

  const blueprint = buildDashboardBlueprint({
    intent,
    intelligence,
    rows: input.rows,
    existingWidgetIds: []
  });
  const selfCheck = validateBiPlan({ intelligence, actions: blueprint.actions });
  return {
    handled: true,
    needsClarification: false,
    intent,
    intelligence,
    blueprint,
    actions: selfCheck.passed ? blueprint.actions : [],
    evidence: [
      `Blueprint: ${blueprint.title}`,
      `Queries: ${blueprint.queryPlans.map((query) => `${query.id}:${query.evidenceId}`).join(", ")}`,
      `Self-check: ${selfCheck.passed ? "aprobado" : "bloqueado"}`
    ],
    selfCheck,
    warnings: [...blueprint.warnings, ...selfCheck.warnings],
    confidence: Math.min(intent.confidence, selfCheck.passed ? 0.86 : 0.3)
  };
}
