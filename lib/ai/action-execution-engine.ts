import type { ChatMessage } from "@/types/ai";
import type { DataRow, DatasetCatalog, DatasetProfile } from "@/types/dataset";
import type { DashboardAction, DashboardSpec, DashboardViewState } from "@/types/dashboard";
import type { PresentationSpec } from "@/types/presentation";
import type { ExecutionMode } from "@/lib/observability/modes";
import type { SemanticLayer } from "@/lib/semantic-layer";
import { actionEnvelope, type CopilotActionEnvelope } from "@/lib/ai/actions";
import { buildActionPlan } from "@/lib/ai/action-plan";
import { applyAction } from "@/lib/ai/apply-action";
import { verifyExecution } from "@/lib/ai/verify-execution";
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
  source?: ExecutionMode;
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

function sameJson(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function visualOnlyPrompt(value: string) {
  const text = normalize(value);
  return /\b(vertical|horizontal|orientacion|visualizacion|visual)\b/.test(text) && !/\b(eje x|eje y|metrica|dimension|filtro|filtra|por region|por canal|por pais|por vendedor)\b/.test(text);
}

function widgetIdForAction(action: DashboardAction) {
  return "widgetId" in action ? action.widgetId : undefined;
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
  const { envelopes, baseReply } = envelopesFromInput(input);
  const nonAnalyticalActions = envelopes.length > 0 && envelopes.every((envelope) => ["ask_clarification", "explain_limitation", "explain_widget", "undo_last_action"].includes(envelope.action.type));
  const requiresPlanValidation = !nonAnalyticalActions && Boolean(analysisPlan.userIntent.xAxisIntent || analysisPlan.userIntent.yAxisIntent || analysisPlan.userIntent.seriesIntent);
  const planValidation = requiresPlanValidation ? validateAnalysisPlan(analysisPlan, catalog) : { success: true, errors: [], warnings: [] };
  const contextualPlan = buildActionPlan({ prompt: input.userMessage, dashboardSpec: input.dashboardSpec, viewState: input.viewState });
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
    const action = validation.action;
    if ((contextualPlan.changesVisualOnly || visualOnlyPrompt(input.userMessage)) && action.type === "update_widget" && action.changes.query) {
      errors.push("La instruccion era visual, pero la accion intento cambiar la logica de datos.");
      continue;
    }
    if (withConfirmation.requiresConfirmation) {
      pendingConfirmation = { ...withConfirmation, action };
      warnings.push(`La accion ${withConfirmation.type} requiere confirmacion antes de aplicarse.`);
      continue;
    }
    if (action.type === "undo_last_action") {
      appliedActions.push(action);
      appliedEnvelopes.push(withConfirmation);
      messages.push("Deshice el ultimo cambio del Copiloto.");
      continue;
    }
    if (["generate_presentation", "create_presentation", "add_slide", "generate_speaker_notes"].includes(action.type)) {
      const applied = applyPresentationAction(nextPresentation, nextDashboard, action);
      nextPresentation = applied.presentation;
      appliedActions.push(action);
      appliedEnvelopes.push(withConfirmation);
      messages.push(applied.message);
      continue;
    }
    if (action.type === "ask_clarification" || action.type === "explain_limitation") {
      appliedActions.push(action);
      appliedEnvelopes.push(withConfirmation);
      messages.push(action.type === "ask_clarification" ? action.question : action.message);
      continue;
    }
    const previousDashboard = nextDashboard;
    const previousViewState = nextViewState;
    const actionWidgetId = widgetIdForAction(action);
    const previousWidget = actionWidgetId ? nextDashboard.widgets.find((item) => item.id === actionWidgetId) : undefined;
    const applied = applyAction(nextDashboard, nextViewState, action);
    nextDashboard = applied.spec;
    nextViewState = applied.viewState;
    const producedChange = !sameJson(previousDashboard, nextDashboard) || !sameJson(previousViewState, nextViewState);
    if (action.type === "explain_widget") {
      appliedActions.push(action);
      appliedEnvelopes.push(withConfirmation);
      messages.push(applied.message);
      continue;
    }
    if (!producedChange) {
      errors.push("La accion validada no produjo cambios reales.");
      continue;
    }
    if (action.type === "update_widget_visual_config") {
      const nextWidget = nextDashboard.widgets.find((item) => item.id === action.widgetId);
      if (!sameJson(previousWidget?.query, nextWidget?.query)) {
        nextDashboard = previousDashboard;
        nextViewState = previousViewState;
        errors.push("El cambio visual intento modificar la logica de datos del widget.");
        continue;
      }
      const orientation = action.visualConfig.orientation;
      if (orientation && nextWidget?.config.visualConfig?.orientation !== orientation) {
        nextDashboard = previousDashboard;
        nextViewState = previousViewState;
        errors.push("La orientacion final no coincide con la instruccion visual.");
        continue;
      }
    }
    if (requiresPlanValidation && (action.type === "add_widget" || action.type === "update_widget")) {
      const widgetId = action.type === "add_widget" ? action.widget.id : action.widgetId;
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
    const executionVerification = verifyExecution({
      plan: contextualPlan,
      action,
      beforeDashboardSpec: previousDashboard,
      afterDashboardSpec: nextDashboard,
      beforeViewState: previousViewState,
      afterViewState: nextViewState
    });
    if (!executionVerification.success) {
      nextDashboard = previousDashboard;
      nextViewState = previousViewState;
      errors.push(`La verificacion posterior fallo: ${executionVerification.errors.join(" ")}`);
      warnings.push(...executionVerification.warnings);
      continue;
    }
    appliedActions.push(action);
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
