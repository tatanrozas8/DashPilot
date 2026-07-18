import { buildActionPlan } from "@/lib/ai/action-plan";
import { buildCopilotMemory, retrieveRelevantPreviousInstruction } from "@/lib/ai/copilot-memory";
import { planAnalyticalChart } from "@/lib/dashboard-spec/chart-planner";
import { createMockCopilotResponse } from "@/lib/ai/copilot-service";
import { dryRunCommands } from "@/lib/copilot-command-bus/bus";
import type { CommandEnvelope, CopilotIntent, CopilotPlan, CopilotToolName, ResolvedCopilotContext, ToolArgumentMap } from "@/lib/copilot-command-bus/types";
import type { DashboardAction } from "@/types/dashboard";

function newId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return `${prefix}_${crypto.randomUUID()}`;
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function riskFor(tool: CopilotToolName) {
  if (["dashboard.removeWidget", "dashboard.clearFilters", "dashboard.removeFilter", "presentation.removeSlide"].includes(tool)) return "high" as const;
  if (["dashboard.updateWidgetVisualConfig", "dashboard.renameWidget", "dashboard.renameDashboard", "dashboard.selectColumns", "dashboard.reorderWidget", "control.undo", "control.redo", "control.requestClarification"].includes(tool)) return "low" as const;
  return "medium" as const;
}

function actionToTool(action: DashboardAction): { tool: CopilotToolName; arguments: ToolArgumentMap[CopilotToolName] } | null {
  if (action.type === "add_widget") return { tool: "dashboard.createWidget", arguments: { widget: action.widget } };
  if (action.type === "update_widget") return { tool: action.changes.query && Object.keys(action.changes).length === 1 ? "dashboard.updateWidgetQuery" : "dashboard.updateWidget", arguments: action.changes.query && Object.keys(action.changes).length === 1 ? { widgetId: action.widgetId, query: action.changes.query } : { widgetId: action.widgetId, changes: action.changes } };
  if (action.type === "replace_widget") return { tool: "dashboard.replaceWidget", arguments: { widgetId: action.widgetId, widget: action.widget } };
  if (action.type === "remove_widget") return { tool: "dashboard.removeWidget", arguments: { widgetId: action.widgetId } };
  if (action.type === "update_widget_visual_config") return { tool: "dashboard.updateWidgetVisualConfig", arguments: { widgetId: action.widgetId, visualConfig: action.visualConfig } };
  if (action.type === "add_filter" || action.type === "add_or_update_filter" || action.type === "update_filter") return { tool: "dashboard.addFilter", arguments: { filter: action.filter } };
  if (action.type === "remove_filter") return { tool: "dashboard.removeFilter", arguments: { field: action.field } };
  if (action.type === "clear_filters") return { tool: "dashboard.clearFilters", arguments: {} };
  if (action.type === "select_visible_columns") return { tool: "dashboard.selectColumns", arguments: { columns: action.columns } };
  if (action.type === "reorder_widgets") return { tool: "dashboard.reorderWidget", arguments: { widgetIds: action.widgetIds } };
  if (action.type === "update_widget_title") return { tool: "dashboard.renameWidget", arguments: { widgetId: action.widgetId, title: action.title } };
  if (action.type === "update_dashboard_title") return { tool: "dashboard.renameDashboard", arguments: { title: action.title } };
  if (action.type === "undo_last_action") return { tool: "control.undo", arguments: {} };
  if (action.type === "ask_clarification") return { tool: "control.requestClarification", arguments: { question: action.question } };
  return null;
}

function intentFromActionPlan(intent: string): CopilotIntent {
  if (intent === "create_new_widget") return "create";
  if (intent === "replace_selected_widget") return "replace";
  if (intent === "update_visual_only") return "visual_change";
  if (intent === "update_data_logic") return "data_logic_change";
  if (intent === "undo") return "undo";
  if (intent === "ask_clarification") return "clarification";
  if (intent === "correction_with_action") return "correction_with_action";
  if (intent === "correction_without_action") return "correction_without_action";
  return "update";
}

function envelopeFor(context: ResolvedCopilotContext, tool: CopilotToolName, arguments_: unknown, reason: string, source: "manual" | "copilot" = "copilot"): CommandEnvelope {
  const riskLevel = riskFor(tool);
  return {
    actionRunId: newId("run"),
    actor: context.actor,
    projectId: context.projectId,
    dashboardId: context.dashboardId,
    revisionId: context.revisionId,
    baseRevision: context.revisionId,
    resource: context.selectedTarget,
    tool,
    arguments: arguments_,
    idempotencyKey: newId("idem"),
    riskLevel,
    reason,
    requiresConfirmation: riskLevel === "high",
    source
  };
}

function clarificationPlan(context: ResolvedCopilotContext, question = "Necesito una aclaracion antes de aplicar cambios."): CopilotPlan {
  const envelope = envelopeFor(context, "control.requestClarification", {
    question,
    options: ["Cambiar visualizacion", "Cambiar metrica", "Agregar filtro", "Crear nuevo grafico", "Mejorar layout"]
  }, "La instruccion es ambigua o incompleta.");
  return {
    intent: "clarification",
    target: context.selectedTarget,
    scope: context.scope,
    actions: [{ envelope }],
    dependencies: [],
    riskLevel: "low",
    requiresConfirmation: false,
    confidence: 0.8,
    semanticResolution: [],
    expectedDiff: [],
    warnings: context.warnings,
    needsClarification: true,
    clarification: {
      question,
      options: ["Cambiar visualizacion", "Cambiar metrica", "Agregar filtro", "Crear nuevo grafico", "Mejorar layout"]
    },
    usesPreviousInstruction: false
  };
}

export function createCopilotPlan(context: ResolvedCopilotContext, prompt: string): CopilotPlan {
  const memory = buildCopilotMemory({ messages: context.messages, dashboardSpec: context.dashboardSpec });
  const previousInstruction = retrieveRelevantPreviousInstruction({ currentMessage: prompt, memory });
  const contextual = buildActionPlan({ prompt, dashboardSpec: context.dashboardSpec, viewState: context.viewState, previousInstruction });
  if (contextual.needsClarification) return clarificationPlan(context, contextual.clarification);

  const localActions = contextual.action ? [contextual.action] : [];
  const analytical = localActions.length ? undefined : planAnalyticalChart({
    prompt: contextual.usesPreviousInstruction && previousInstruction ? previousInstruction : prompt,
    datasetProfile: context.datasetProfile,
    semanticModel: context.semanticModel,
    dashboardSpec: context.dashboardSpec,
    viewState: context.viewState
  });
  const fallback = localActions.length || analytical?.handled ? undefined : createMockCopilotResponse({
    prompt: contextual.usesPreviousInstruction && previousInstruction ? previousInstruction : prompt,
    datasetProfile: context.datasetProfile,
    semanticModel: context.semanticModel,
    dashboardSpec: context.dashboardSpec,
    viewState: context.viewState,
    presentationSpec: context.presentationSpec,
    messages: context.messages,
    rows: []
  });
  const actions = localActions.length ? localActions : analytical?.handled ? analytical.actions : fallback?.actions ?? [];
  if (!actions.length) return clarificationPlan(context, "No encontre una accion segura. Elige que tipo de mejora quieres aplicar.");

  const envelopes = actions
    .map((action) => {
      const mapped = actionToTool(action);
      return mapped ? envelopeFor(context, mapped.tool, mapped.arguments, contextual.reason) : null;
    })
    .filter((item): item is CommandEnvelope => Boolean(item));
  const dryRun = dryRunCommands(envelopes, context);
  const highestRisk = envelopes.some((envelope) => envelope.riskLevel === "high") ? "high" : envelopes.some((envelope) => envelope.riskLevel === "medium") ? "medium" : "low";

  return {
    intent: intentFromActionPlan(contextual.intent),
    target: context.selectedTarget,
    scope: context.scope,
    actions: envelopes.map((envelope) => ({ envelope, semanticResolution: analytical?.handled ? { confidence: analytical.confidence, reason: "Columnas resueltas desde catalogo semantico y perfil del dataset." } : undefined })),
    dependencies: [],
    riskLevel: highestRisk,
    requiresConfirmation: envelopes.some((envelope) => envelope.requiresConfirmation),
    confidence: contextual.confidence,
    semanticResolution: analytical?.handled ? [{ confidence: analytical.confidence, reason: "Columnas resueltas desde catalogo semantico y perfil del dataset." }] : [],
    expectedDiff: dryRun.flatMap((run) => run.diff),
    warnings: [...context.warnings, ...(analytical?.handled ? analytical.warnings ?? [] : [])],
    needsClarification: false,
    usesPreviousInstruction: contextual.usesPreviousInstruction
  };
}

export function manualCommandEnvelope<TTool extends CopilotToolName>(context: ResolvedCopilotContext, tool: TTool, arguments_: ToolArgumentMap[TTool], reason: string): CommandEnvelope<TTool, ToolArgumentMap[TTool]> {
  return envelopeFor(context, tool, arguments_, reason, "manual") as CommandEnvelope<TTool, ToolArgumentMap[TTool]>;
}

export function envelopeFromLegacyAction(context: ResolvedCopilotContext, action: DashboardAction, reason: string): CommandEnvelope | null {
  const mapped = actionToTool(action);
  return mapped ? envelopeFor(context, mapped.tool, mapped.arguments, reason) : null;
}
