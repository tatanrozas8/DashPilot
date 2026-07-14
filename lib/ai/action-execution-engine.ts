import type { ChatMessage } from "@/types/ai";
import type { DataRow, DatasetCatalog, DatasetProfile } from "@/types/dataset";
import type { DashboardAction, DashboardSpec, DashboardViewState } from "@/types/dashboard";
import type { PresentationSpec } from "@/types/presentation";
import type { SemanticLayer } from "@/lib/semantic-layer";
import { actionEnvelope, type CopilotActionEnvelope } from "@/lib/ai/actions";
import { applyAction } from "@/lib/ai/apply-action";
import { buildAnalysisPlan, planAnalyticalChart, validateAnalysisPlan, validateWidgetMatchesPlan } from "@/lib/dashboard-spec/chart-planner";
import { generatePresentationSpec } from "@/lib/presentation-spec/generate-presentation-spec";
import { buildDatasetCatalog } from "@/lib/semantic-layer";
import { validateCopilotAction } from "@/lib/validation/copilot-actions";

export interface ActionExecutionInput {
  userMessage: string;
  datasetCatalog?: DatasetCatalog;
  rows?: DataRow[];
  datasetProfile: DatasetProfile;
  semanticModel: SemanticLayer;
  dashboardSpec: DashboardSpec;
  viewState: DashboardViewState;
  dataExplorerState?: DashboardViewState["dataExplorer"];
  presentationSpec?: PresentationSpec;
  focusedWidgetId?: string;
  activeRoute?: string;
  actions?: DashboardAction[];
  envelopes?: CopilotActionEnvelope[];
  assistantMessage?: string;
  source?: "mock" | "provider";
}

export interface ActionExecutionResult {
  assistantMessage: string;
  actions: DashboardAction[];
  actionEnvelopes: CopilotActionEnvelope[];
  pendingConfirmation?: CopilotActionEnvelope;
  updatedDashboardSpec: DashboardSpec;
  updatedViewState: DashboardViewState;
  updatedDataExplorerState?: DashboardViewState["dataExplorer"];
  updatedPresentationSpec?: PresentationSpec;
  warnings: string[];
  errors: string[];
}

function destructiveAction(action: DashboardAction) {
  return ["remove_widget", "clear_filters", "remove_filter"].includes(action.type);
}

function applyPresentationAction(presentation: PresentationSpec | undefined, dashboard: DashboardSpec, action: DashboardAction) {
  if (action.type === "generate_presentation" || action.type === "create_presentation") {
    return {
      presentation: generatePresentationSpec(dashboard, action.options?.theme ?? "executive"),
      message: "Cree una presentacion desde el dashboard vivo."
    };
  }
  if (!presentation) return { presentation, message: "No hay una presentacion activa para modificar." };
  if (action.type === "add_slide") {
    return {
      presentation: { ...presentation, slides: [...presentation.slides, action.slide], updatedAt: new Date().toISOString() },
      message: `Agregue la slide "${action.slide.title}".`
    };
  }
  if (action.type === "generate_speaker_notes") {
    return {
      presentation: {
        ...presentation,
        slides: presentation.slides.map((slide) => ({
          ...slide,
          speakerNotes: slide.speakerNotes ?? `Presentar ${slide.title} conectando el insight con una decision concreta.`
        })),
        updatedAt: new Date().toISOString()
      },
      message: "Genere notas del presentador para las slides."
    };
  }
  return { presentation, message: "" };
}

function envelopesFromInput(input: ActionExecutionInput) {
  if (input.envelopes) return { envelopes: input.envelopes, baseReply: input.assistantMessage ?? "Aplique acciones estructuradas validadas." };
  if (input.actions) {
    return {
      envelopes: input.actions.map((action) => actionEnvelope(action, "Accion propuesta por el Copiloto.", 0.74, destructiveAction(action))),
      baseReply: input.assistantMessage ?? "Aplique acciones estructuradas validadas."
    };
  }
  const plan = planAnalyticalChart({
    prompt: input.userMessage,
    rows: input.rows,
    datasetProfile: input.datasetProfile,
    semanticModel: input.semanticModel,
    dashboardSpec: input.dashboardSpec,
    viewState: input.viewState
  });
  if (!plan.handled) return { envelopes: [], baseReply: input.assistantMessage ?? "No encontre una accion ejecutable segura para aplicar." };
  return {
    envelopes: plan.actions.map((action) => actionEnvelope(action, "Plan de acciones generado por el motor operativo.", plan.confidence, destructiveAction(action))),
    baseReply: plan.reply
  };
}

export function executeCopilotActions(input: ActionExecutionInput): ActionExecutionResult {
  const catalog = input.datasetCatalog ?? buildDatasetCatalog(input.datasetProfile);
  const analysisPlan = buildAnalysisPlan({
    prompt: input.userMessage,
    rows: input.rows,
    datasetProfile: input.datasetProfile,
    semanticModel: input.semanticModel,
    dashboardSpec: input.dashboardSpec,
    viewState: input.viewState
  });
  const requiresPlanValidation = Boolean(analysisPlan.userIntent.xAxisIntent || analysisPlan.userIntent.yAxisIntent || analysisPlan.userIntent.seriesIntent);
  const planValidation = requiresPlanValidation ? validateAnalysisPlan(analysisPlan, catalog) : { success: true, errors: [], warnings: [] };
  const { envelopes, baseReply } = envelopesFromInput(input);
  let nextDashboard = input.dashboardSpec;
  let nextViewState = input.focusedWidgetId ? { ...input.viewState, highlightedWidgetId: input.focusedWidgetId } : input.viewState;
  let nextPresentation = input.presentationSpec;
  const appliedActions: DashboardAction[] = [];
  const appliedEnvelopes: CopilotActionEnvelope[] = [];
  const messages: string[] = [];
  const warnings: string[] = [...planValidation.warnings];
  const errors: string[] = [];
  let pendingConfirmation: CopilotActionEnvelope | undefined;

  if (!planValidation.success) {
    return {
      assistantMessage: `No aplique cambios porque el plan no coincide con la instruccion: ${planValidation.errors.join(" ")}`,
      actions: [],
      actionEnvelopes: [],
      updatedDashboardSpec: nextDashboard,
      updatedViewState: nextViewState,
      updatedDataExplorerState: nextViewState.dataExplorer,
      updatedPresentationSpec: nextPresentation,
      warnings: planValidation.warnings,
      errors: planValidation.errors
    };
  }

  for (const envelope of envelopes) {
    const withConfirmation = destructiveAction(envelope.action) ? { ...envelope, requiresConfirmation: true } : envelope;
    const validation = validateCopilotAction(withConfirmation.action, {
      datasetProfile: input.datasetProfile,
      semanticModel: input.semanticModel,
      dashboardSpec: nextDashboard,
      viewState: nextViewState
    });
    if (!validation.success) {
      errors.push(validation.error);
      continue;
    }
    if (withConfirmation.requiresConfirmation) {
      pendingConfirmation = { ...withConfirmation, action: validation.action };
      warnings.push(`La accion ${withConfirmation.type} requiere confirmacion antes de aplicarse.`);
      continue;
    }
    if (["generate_presentation", "create_presentation", "add_slide", "generate_speaker_notes"].includes(validation.action.type)) {
      const applied = applyPresentationAction(nextPresentation, nextDashboard, validation.action);
      nextPresentation = applied.presentation;
      appliedActions.push(validation.action);
      appliedEnvelopes.push(withConfirmation);
      messages.push(applied.message);
      continue;
    }
    if (validation.action.type === "ask_clarification" || validation.action.type === "explain_limitation") {
      messages.push(validation.action.type === "ask_clarification" ? validation.action.question : validation.action.message);
      continue;
    }
    const previousDashboard = nextDashboard;
    const previousViewState = nextViewState;
    const applied = applyAction(nextDashboard, nextViewState, validation.action);
    nextDashboard = applied.spec;
    nextViewState = applied.viewState;
    if (requiresPlanValidation && (validation.action.type === "add_widget" || validation.action.type === "update_widget")) {
      const widgetId = validation.action.type === "add_widget" ? validation.action.widget.id : validation.action.widgetId;
      const widget = nextDashboard.widgets.find((item) => item.id === widgetId);
      const widgetValidation = validateWidgetMatchesPlan(widget, analysisPlan);
      if (!widgetValidation.success) {
        nextDashboard = previousDashboard;
        nextViewState = previousViewState;
        errors.push(`El widget final no coincide con la instruccion: ${widgetValidation.errors.join(" ")}`);
        warnings.push(...widgetValidation.warnings);
        continue;
      }
      warnings.push(...widgetValidation.warnings);
    }
    appliedActions.push(validation.action);
    appliedEnvelopes.push(withConfirmation);
    messages.push(applied.message);
  }

  const actionSummary = messages.length
    ? messages
    : errors.length
      ? "No aplique cambios porque las acciones no pasaron la validacion."
      : pendingConfirmation
        ? "Necesito confirmacion antes de ejecutar la accion solicitada."
        : "";
  const shouldKeepBaseReply = appliedActions.length > 0 || Boolean(pendingConfirmation) || (!errors.length && !messages.length);
  const assistantContent = [shouldKeepBaseReply ? baseReply : "", actionSummary].filter(Boolean).join(" ");

  return {
    assistantMessage: assistantContent,
    actions: appliedActions,
    actionEnvelopes: pendingConfirmation ? [...appliedEnvelopes, pendingConfirmation] : appliedEnvelopes,
    pendingConfirmation,
    updatedDashboardSpec: nextDashboard,
    updatedViewState: nextViewState,
    updatedDataExplorerState: nextViewState.dataExplorer,
    updatedPresentationSpec: nextPresentation,
    warnings,
    errors
  };
}

export function executionAssistantMessage(content: string, structuredAction?: DashboardAction): ChatMessage {
  return { id: crypto.randomUUID(), role: "assistant", content, structuredAction, createdAt: new Date().toISOString() };
}
