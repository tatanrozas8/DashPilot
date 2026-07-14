import type { DashboardAction, DashboardSpec, DashboardViewState, DashboardWidget } from "@/types/dashboard";

export type CopilotMessageKind = "new_instruction" | "correction" | "clarification" | "confirmation" | "rejection" | "undo";
export type CopilotActionCategory = "visual" | "analytical" | "structural" | "filter" | "data_table" | "presentation" | "ambiguous";

export interface ActionPlan {
  messageKind: CopilotMessageKind;
  actionCategory: CopilotActionCategory;
  target?: DashboardWidget;
  requestedCurrentTarget: boolean;
  createNewWidget: boolean;
  replaceSelectedWidget: boolean;
  orientation?: "horizontal" | "vertical";
  chartType?: DashboardWidget["type"];
  changesDataLogic: boolean;
  changesVisualOnly: boolean;
  needsClarification: boolean;
  clarification?: string;
  action?: DashboardAction;
  reason: string;
  confidence: number;
}

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
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

export function buildActionPlan(input: { prompt: string; dashboardSpec: DashboardSpec; viewState: DashboardViewState }): ActionPlan {
  const text = normalize(input.prompt);
  const target = selectedWidget(input.dashboardSpec, input.viewState);
  const requestedCurrentTarget = /\b(este grafico|este gráfico|este widget|este kpi|esta tarjeta|esta tabla|mostrarlo|muestralo|muéstralo|grafico seleccionado|seleccion actual)\b/.test(text) || /\blo\b/.test(text);
  const correction = includesAny(text, ["no,", "no ", "eso no", "no era", "no te pedi", "no te pedí", "solo queria", "solo quería", "mantén los datos", "manten los datos", "no cambies la logica", "no cambies la lógica"]);
  const undo = includesAny(text, ["deshaz", "vuelve atras", "vuelve atrás", "vuelve al anterior", "estado anterior", "revertir", "revierte"]);
  const orientation = orientationIntent(text);
  const chartType = chartTypeIntent(text);
  const createNewWidget = includesAny(text, ["crea un nuevo grafico", "crea un nuevo gráfico", "crear un nuevo grafico", "agrega un grafico", "agrega un gráfico", "anade un grafico", "añade un gráfico", "nuevo grafico", "nuevo gráfico"]);
  const replaceSelectedWidget = includesAny(text, ["reemplaza este", "reemplazar este", "sustituye este"]);
  const ambiguous = includesAny(text, ["hazlo mejor", "muestralo diferente", "muéstralo diferente", "ponlo mas ejecutivo", "ponlo más ejecutivo", "cambia este grafico", "cambia este gráfico"]) && !orientation && !chartType && !replaceSelectedWidget;

  if (undo) {
    return {
      messageKind: "undo",
      actionCategory: "structural",
      target,
      requestedCurrentTarget,
      createNewWidget: false,
      replaceSelectedWidget: false,
      changesDataLogic: false,
      changesVisualOnly: false,
      needsClarification: false,
      action: { type: "undo_last_action" },
      reason: "El usuario pidio deshacer o volver al estado anterior.",
      confidence: 0.94
    };
  }

  if (requestedCurrentTarget && !target) {
    return {
      messageKind: correction ? "correction" : "new_instruction",
      actionCategory: "ambiguous",
      requestedCurrentTarget,
      createNewWidget,
      replaceSelectedWidget,
      changesDataLogic: false,
      changesVisualOnly: false,
      needsClarification: true,
      clarification: "Selecciona primero el grafico que quieres modificar.",
      reason: "El usuario se refirio al grafico actual, pero no hay objetivo seleccionado.",
      confidence: 0.9
    };
  }

  if (ambiguous) {
    return {
      messageKind: correction ? "correction" : "new_instruction",
      actionCategory: "ambiguous",
      target,
      requestedCurrentTarget,
      createNewWidget,
      replaceSelectedWidget,
      changesDataLogic: false,
      changesVisualOnly: false,
      needsClarification: true,
      clarification: "Quieres que cambie el tipo de grafico, el diseno visual o los datos que muestra?",
      reason: "La instruccion es ambigua y podria tocar logica de datos sin permiso claro.",
      confidence: 0.76
    };
  }

  if (orientation) {
    if (!target) {
      return {
        messageKind: correction ? "correction" : "new_instruction",
        actionCategory: "visual",
        requestedCurrentTarget,
        createNewWidget,
        replaceSelectedWidget,
        orientation,
        changesDataLogic: false,
        changesVisualOnly: true,
        needsClarification: true,
        clarification: "Selecciona primero el grafico que quieres modificar.",
        reason: "La orientacion es un cambio visual que necesita un widget objetivo.",
        confidence: 0.88
      };
    }
    if (target.type !== "bar_chart") {
      return {
        messageKind: correction ? "correction" : "new_instruction",
        actionCategory: "visual",
        target,
        requestedCurrentTarget,
        createNewWidget,
        replaceSelectedWidget,
        orientation,
        changesDataLogic: false,
        changesVisualOnly: true,
        needsClarification: true,
        clarification: "Este tipo de grafico no admite orientacion. Puedo convertirlo a barras verticales si quieres.",
        reason: "Solo los graficos de barras soportan orientacion horizontal o vertical.",
        confidence: 0.86
      };
    }
    return {
      messageKind: correction ? "correction" : "new_instruction",
      actionCategory: "visual",
      target,
      requestedCurrentTarget,
      createNewWidget,
      replaceSelectedWidget,
      orientation,
      changesDataLogic: false,
      changesVisualOnly: true,
      needsClarification: false,
      action: { type: "update_widget_visual_config", widgetId: target.id, visualConfig: { orientation } },
      reason: "Cambio visual de orientacion solicitado sin tocar metrica, dimension ni filtros.",
      confidence: 0.92
    };
  }

  if (chartType && target && requestedCurrentTarget) {
    return {
      messageKind: correction ? "correction" : "new_instruction",
      actionCategory: "visual",
      target,
      requestedCurrentTarget,
      createNewWidget,
      replaceSelectedWidget,
      chartType,
      changesDataLogic: false,
      changesVisualOnly: true,
      needsClarification: false,
      action: { type: "change_chart_type", widgetId: target.id, chartType },
      reason: "Cambio visual de tipo de grafico sobre el objetivo seleccionado.",
      confidence: 0.86
    };
  }

  return {
    messageKind: correction ? "correction" : "new_instruction",
    actionCategory: createNewWidget || replaceSelectedWidget ? "structural" : "analytical",
    target,
    requestedCurrentTarget,
    createNewWidget,
    replaceSelectedWidget,
    chartType,
    changesDataLogic: !correction,
    changesVisualOnly: false,
    needsClarification: false,
    reason: "No requiere manejo contextual previo.",
    confidence: 0.7
  };
}
