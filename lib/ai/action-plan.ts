import type { DashboardAction, DashboardSpec, DashboardViewState, DashboardWidget } from "@/types/dashboard";
import { classifyIntent, normalizeIntentText, type CopilotIntent } from "@/lib/ai/intent-classifier";

export type CopilotMessageKind = "new_instruction" | "correction" | "clarification" | "confirmation" | "rejection" | "undo";
export type CopilotActionCategory = "visual" | "analytical" | "structural" | "filter" | "data_table" | "presentation" | "ambiguous";

export interface ActionPlan {
  intent: CopilotIntent;
  target?: DashboardWidget;
  actions: DashboardAction[];
  usesPreviousInstruction: boolean;
  changesVisualOnly: boolean;
  changesDataLogic: boolean;
  changesDashboardStructure: boolean;
  requiresConfirmation: boolean;
  confidence: number;
  missingInfo: string[];
  reason: string;
  messageKind: CopilotMessageKind;
  actionCategory: CopilotActionCategory;
  requestedCurrentTarget: boolean;
  createNewWidget: boolean;
  replaceSelectedWidget: boolean;
  orientation?: "horizontal" | "vertical";
  chartType?: DashboardWidget["type"];
  needsClarification: boolean;
  clarification?: string;
  action?: DashboardAction;
}

function includesAny(text: string, words: string[]) {
  return words.some((word) => text.includes(word));
}

function selectedWidget(spec: DashboardSpec, viewState: DashboardViewState) {
  const selectedId = viewState.selectedTargetType && viewState.selectedTargetType !== "dashboard" && viewState.selectedTargetType !== "none"
    ? viewState.selectedTargetId
    : undefined;
  return spec.widgets.find((widget) => widget.id === selectedId) ?? (viewState.highlightedWidgetId ? spec.widgets.find((widget) => widget.id === viewState.highlightedWidgetId) : undefined);
}

function orientationIntent(text: string): "horizontal" | "vertical" | undefined {
  if (includesAny(text, ["vertical", "parado", "columnas verticales"])) return "vertical";
  if (includesAny(text, ["horizontal", "acostado", "barras horizontales"])) return "horizontal";
  return undefined;
}

function chartTypeIntent(text: string): DashboardWidget["type"] | undefined {
  if (includesAny(text, ["barras", "barra"])) return "bar_chart";
  if (includesAny(text, ["lineas", "linea", "tendencia"])) return "line_chart";
  if (includesAny(text, ["dona", "donut", "torta"])) return "donut_chart";
  if (includesAny(text, ["tabla"])) return "table";
  if (includesAny(text, ["kpi", "indicador", "tarjeta"])) return "kpi_card";
  return undefined;
}

function basePlan(input: {
  intent: CopilotIntent;
  target?: DashboardWidget;
  actions?: DashboardAction[];
  usesPreviousInstruction?: boolean;
  changesVisualOnly?: boolean;
  changesDataLogic?: boolean;
  changesDashboardStructure?: boolean;
  requiresConfirmation?: boolean;
  confidence?: number;
  missingInfo?: string[];
  reason: string;
  messageKind: CopilotMessageKind;
  actionCategory: CopilotActionCategory;
  requestedCurrentTarget: boolean;
  createNewWidget: boolean;
  replaceSelectedWidget: boolean;
  orientation?: "horizontal" | "vertical";
  chartType?: DashboardWidget["type"];
  needsClarification: boolean;
  clarification?: string;
  action?: DashboardAction;
}): ActionPlan {
  return {
    intent: input.intent,
    target: input.target,
    actions: input.actions ?? (input.action ? [input.action] : []),
    usesPreviousInstruction: input.usesPreviousInstruction ?? false,
    changesVisualOnly: input.changesVisualOnly ?? false,
    changesDataLogic: input.changesDataLogic ?? false,
    changesDashboardStructure: input.changesDashboardStructure ?? false,
    requiresConfirmation: input.requiresConfirmation ?? false,
    confidence: input.confidence ?? 0.7,
    missingInfo: input.missingInfo ?? [],
    reason: input.reason,
    messageKind: input.messageKind,
    actionCategory: input.actionCategory,
    requestedCurrentTarget: input.requestedCurrentTarget,
    createNewWidget: input.createNewWidget,
    replaceSelectedWidget: input.replaceSelectedWidget,
    orientation: input.orientation,
    chartType: input.chartType,
    needsClarification: input.needsClarification,
    clarification: input.clarification,
    action: input.action
  };
}

export function buildActionPlan(input: { prompt: string; dashboardSpec: DashboardSpec; viewState: DashboardViewState; previousInstruction?: string }): ActionPlan {
  const text = normalizeIntentText(input.prompt);
  const classification = classifyIntent(input.prompt);
  const target = selectedWidget(input.dashboardSpec, input.viewState);
  const requestedCurrentTarget = /\b(este grafico|este widget|este kpi|esta tarjeta|esta tabla|mostrarlo|muestralo|cambialo|reemplazalo|sustituyelo|grafico seleccionado|seleccion actual)\b/.test(text) || /\blo\b/.test(text);
  const correction = classification.isCorrection;
  const undo = classification.intent === "undo";
  const explainWidget = classification.intents.includes("explain_widget");
  const orientation = orientationIntent(text);
  const chartType = chartTypeIntent(text);
  const createNewWidget = includesAny(text, ["crea un nuevo grafico", "crear un nuevo grafico", "crea uno nuevo", "agrega un grafico", "anade un grafico", "nuevo grafico", "nuevo widget"]);
  const usesPreviousInstruction = classification.usesPreviousActionableInstruction;
  const replaceSelectedWidget = includesAny(text, ["reemplaza este", "reemplazar este", "reemplazalo", "reemplazarlo", "sustituye este", "sustituyelo"]) || usesPreviousInstruction;
  const ambiguous = includesAny(text, ["hazlo mejor", "muestralo diferente", "ponlo mas ejecutivo", "cambia este grafico"]) && !orientation && !chartType && !replaceSelectedWidget;

  if (undo) {
    const action: DashboardAction = { type: "undo_last_action" };
    return basePlan({
      intent: "undo",
      target,
      action,
      reason: "El usuario pidio deshacer o volver al estado anterior.",
      messageKind: "undo",
      actionCategory: "structural",
      requestedCurrentTarget,
      createNewWidget: false,
      replaceSelectedWidget: false,
      needsClarification: false,
      confidence: 0.94
    });
  }

  if ((requestedCurrentTarget || replaceSelectedWidget) && !target) {
    return basePlan({
      intent: "ask_clarification",
      usesPreviousInstruction,
      reason: "El usuario se refirio al grafico actual, pero no hay objetivo seleccionado.",
      messageKind: correction ? "correction" : "new_instruction",
      actionCategory: "ambiguous",
      requestedCurrentTarget: true,
      createNewWidget,
      replaceSelectedWidget,
      needsClarification: true,
      clarification: "Selecciona primero el grafico que quieres modificar.",
      missingInfo: ["selectedTargetId"],
      confidence: 0.9
    });
  }

  if (explainWidget) {
    if (!target) {
      return basePlan({
        intent: "ask_clarification",
        usesPreviousInstruction,
        reason: "El usuario pidio explicar un grafico, pero no hay objetivo seleccionado.",
        messageKind: correction ? "correction" : "new_instruction",
        actionCategory: "ambiguous",
        requestedCurrentTarget: true,
        createNewWidget,
        replaceSelectedWidget,
        needsClarification: true,
        clarification: "Selecciona primero el grafico que quieres que explique.",
        missingInfo: ["selectedTargetId"],
        confidence: 0.88
      });
    }
    const action: DashboardAction = { type: "explain_widget", widgetId: target.id };
    return basePlan({
      intent: "explain_widget",
      target,
      action,
      reason: "El usuario pidio una explicacion del grafico seleccionado sin cambiar datos ni visuales.",
      messageKind: correction ? "clarification" : "new_instruction",
      actionCategory: "analytical",
      requestedCurrentTarget,
      createNewWidget,
      replaceSelectedWidget,
      changesVisualOnly: false,
      changesDataLogic: false,
      changesDashboardStructure: false,
      needsClarification: false,
      confidence: 0.9
    });
  }

  if (ambiguous) {
    return basePlan({
      intent: "ask_clarification",
      target,
      reason: "La instruccion es ambigua y podria tocar logica de datos sin permiso claro.",
      messageKind: correction ? "correction" : "new_instruction",
      actionCategory: "ambiguous",
      requestedCurrentTarget,
      createNewWidget,
      replaceSelectedWidget,
      needsClarification: true,
      clarification: "Quieres que cambie el tipo de grafico, el diseno visual o los datos que muestra?",
      confidence: 0.76
    });
  }

  if (usesPreviousInstruction && replaceSelectedWidget) {
    if (!input.previousInstruction) {
      return basePlan({
        intent: "ask_clarification",
        target,
        usesPreviousInstruction: true,
        reason: "La memoria no contiene una instruccion previa clara.",
        messageKind: "correction",
        actionCategory: "ambiguous",
        requestedCurrentTarget: true,
        createNewWidget: false,
        replaceSelectedWidget: true,
        needsClarification: true,
        clarification: "No encontre una instruccion accionable anterior para reutilizar.",
        missingInfo: ["lastActionableInstruction"],
        confidence: 0.86
      });
    }
    return basePlan({
      intent: "replace_selected_widget",
      target,
      usesPreviousInstruction: true,
      changesDataLogic: true,
      changesDashboardStructure: true,
      reason: "El usuario pidio reemplazar el objetivo seleccionado recuperando la ultima instruccion accionable.",
      messageKind: "correction",
      actionCategory: "structural",
      requestedCurrentTarget: true,
      createNewWidget: false,
      replaceSelectedWidget: true,
      chartType,
      needsClarification: false,
      confidence: 0.9
    });
  }

  if (orientation) {
    if (!target) {
      return basePlan({
        intent: "ask_clarification",
        usesPreviousInstruction,
        orientation,
        reason: "La orientacion es un cambio visual que necesita un widget objetivo.",
        messageKind: correction ? "correction" : "new_instruction",
        actionCategory: "visual",
        requestedCurrentTarget,
        createNewWidget,
        replaceSelectedWidget,
        changesVisualOnly: true,
        needsClarification: true,
        clarification: "Selecciona primero el grafico que quieres modificar.",
        missingInfo: ["selectedTargetId"],
        confidence: 0.88
      });
    }
    if (target.type !== "bar_chart") {
      return basePlan({
        intent: "ask_clarification",
        target,
        orientation,
        reason: "Solo los graficos de barras soportan orientacion horizontal o vertical.",
        messageKind: correction ? "correction" : "new_instruction",
        actionCategory: "visual",
        requestedCurrentTarget,
        createNewWidget,
        replaceSelectedWidget,
        changesVisualOnly: true,
        needsClarification: true,
        clarification: "Este tipo de grafico no admite orientacion. Puedo convertirlo a barras verticales si quieres.",
        confidence: 0.86
      });
    }
    const action: DashboardAction = { type: "update_widget_visual_config", widgetId: target.id, visualConfig: { orientation } };
    return basePlan({
      intent: correction ? "correction_with_action" : "update_visual_only",
      target,
      action,
      orientation,
      reason: "Cambio visual de orientacion solicitado sin tocar metrica, dimension ni filtros.",
      messageKind: correction ? "correction" : "new_instruction",
      actionCategory: "visual",
      requestedCurrentTarget,
      createNewWidget,
      replaceSelectedWidget,
      changesVisualOnly: true,
      needsClarification: false,
      confidence: 0.92
    });
  }

  if (chartType && target && requestedCurrentTarget) {
    const action: DashboardAction = { type: "change_chart_type", widgetId: target.id, chartType };
    return basePlan({
      intent: correction ? "correction_with_action" : "update_visual_only",
      target,
      action,
      chartType,
      reason: "Cambio visual de tipo de grafico sobre el objetivo seleccionado.",
      messageKind: correction ? "correction" : "new_instruction",
      actionCategory: "visual",
      requestedCurrentTarget,
      createNewWidget,
      replaceSelectedWidget,
      changesVisualOnly: true,
      needsClarification: false,
      confidence: 0.86
    });
  }

  return basePlan({
    intent: createNewWidget ? "create_new_widget" : replaceSelectedWidget ? "replace_selected_widget" : correction ? "correction_without_action" : "update_data_logic",
    target,
    usesPreviousInstruction,
    changesDataLogic: !correction || replaceSelectedWidget,
    changesDashboardStructure: createNewWidget || replaceSelectedWidget,
    reason: "No requiere manejo contextual previo.",
    messageKind: correction ? "correction" : "new_instruction",
    actionCategory: createNewWidget || replaceSelectedWidget ? "structural" : "analytical",
    requestedCurrentTarget,
    createNewWidget,
    replaceSelectedWidget,
    chartType,
    needsClarification: false,
    confidence: classification.confidence
  });
}
