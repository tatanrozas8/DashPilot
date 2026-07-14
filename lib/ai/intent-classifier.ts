import type { DashboardAction } from "@/types/dashboard";

export type CopilotIntent =
  | "create_new_widget"
  | "update_selected_widget"
  | "replace_selected_widget"
  | "update_visual_only"
  | "update_data_logic"
  | "add_filter"
  | "remove_filter"
  | "clear_filters"
  | "show_data_explorer"
  | "select_columns"
  | "sort_table"
  | "search_table"
  | "update_dashboard"
  | "create_presentation"
  | "update_presentation"
  | "correction_with_action"
  | "correction_without_action"
  | "undo"
  | "clarification_answer"
  | "ask_clarification";

export interface IntentClassification {
  intent: CopilotIntent;
  intents: CopilotIntent[];
  actionTypes: DashboardAction["type"][];
  isCorrection: boolean;
  hasExecutableAction: boolean;
  usesPreviousActionableInstruction: boolean;
  confidence: number;
  reason: string;
}

export function normalizeIntentText(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function includesAny(text: string, values: string[]) {
  return values.some((value) => text.includes(value));
}

export function classifyIntent(message: string): IntentClassification {
  const text = normalizeIntentText(message);
  const intents: CopilotIntent[] = [];
  const actionTypes: DashboardAction["type"][] = [];
  const isCorrection = includesAny(text, [
    "no,",
    "no ",
    "eso no",
    "no era",
    "no te pedi",
    "solo queria",
    "solo cambia",
    "no cambies",
    "mantener la logica",
    "manten la logica"
  ]);
  const undo = includesAny(text, ["deshaz", "vuelve atras", "vuelve al anterior", "restaura", "revertir", "revierte"]);
  const previous = includesAny(text, ["instrucciones anteriores", "instruccion anterior", "instrucciones que te di", "lo que te dije", "lo anterior", "previas"]);
  const visual = includesAny(text, ["vertical", "horizontal", "orientacion", "color", "colores", "leyenda", "titulo", "tipo de grafico", "barras", "linea", "dona"]);
  const dataLogic = includesAny(text, ["eje x", "eje y", "metrica", "ventas", "margen", "region", "regiones", "canal", "fecha", "anos", "agregacion", "serie"]);
  const create = includesAny(text, ["crea", "crear", "agrega un grafico", "nuevo grafico", "nuevo widget", "uno nuevo"]);
  const replace = includesAny(text, ["reemplaza", "reemplazalo", "reemplazarlo", "sustituye", "sustituyelo"]);

  if (undo) {
    return {
      intent: "undo",
      intents: ["undo"],
      actionTypes: ["undo_last_action"],
      isCorrection,
      hasExecutableAction: true,
      usesPreviousActionableInstruction: false,
      confidence: 0.94,
      reason: "El usuario pidio deshacer o volver al estado anterior."
    };
  }
  if (create) {
    intents.push("create_new_widget");
    actionTypes.push("add_widget");
  }
  if (replace) {
    intents.push("replace_selected_widget");
    actionTypes.push("replace_widget");
  }
  if (!create && !replace && includesAny(text, ["este grafico", "este widget", "seleccion", "cambialo", "muestalo", "muestralo"])) {
    intents.push("update_selected_widget");
    actionTypes.push("update_widget");
  }
  if (visual) {
    intents.push("update_visual_only");
    if (includesAny(text, ["vertical", "horizontal", "orientacion"])) actionTypes.push("update_widget_visual_config");
    if (includesAny(text, ["barras", "linea", "dona", "tipo de grafico"])) actionTypes.push("change_chart_type");
  }
  if (dataLogic && !includesAny(text, ["no cambies la logica", "mantener la logica", "manten la logica"])) {
    intents.push("update_data_logic");
    actionTypes.push("update_widget");
  }
  if (includesAny(text, ["filtra", "filtro ", "solo "]) && !isCorrection) {
    intents.push("add_filter");
    actionTypes.push("add_or_update_filter");
  }
  if (includesAny(text, ["quita filtro", "elimina filtro"])) {
    intents.push("remove_filter");
    actionTypes.push("remove_filter");
  }
  if (includesAny(text, ["limpia filtros", "borra filtros", "clear filters"])) {
    intents.push("clear_filters");
    actionTypes.push("clear_filters");
  }
  if (includesAny(text, ["explorador", "tabla completa", "ver datos"])) {
    intents.push("show_data_explorer");
    actionTypes.push("show_data_explorer");
  }
  if (includesAny(text, ["columnas visibles", "muestra solo las columnas", "selecciona columnas"])) {
    intents.push("select_columns");
    actionTypes.push("select_visible_columns");
  }
  if (includesAny(text, ["ordena", "ordenar"])) {
    intents.push("sort_table");
    actionTypes.push("sort_table");
  }
  if (includesAny(text, ["busca", "buscar"])) {
    intents.push("search_table");
    actionTypes.push("search_table");
  }
  if (includesAny(text, ["dashboard", "tablero"])) intents.push("update_dashboard");
  if (includesAny(text, ["presentacion", "slides"])) intents.push("create_presentation");

  if (isCorrection) intents.unshift(intents.some((intent) => intent !== "correction_without_action") ? "correction_with_action" : "correction_without_action");
  if (previous && !intents.includes("replace_selected_widget")) intents.push("replace_selected_widget");

  const uniqueIntents = [...new Set(intents.length ? intents : isCorrection ? ["correction_without_action"] : ["ask_clarification"])] as CopilotIntent[];
  const executable = uniqueIntents.some((intent) => !["correction_without_action", "ask_clarification", "clarification_answer"].includes(intent));

  return {
    intent: uniqueIntents[0],
    intents: uniqueIntents,
    actionTypes: [...new Set(actionTypes)],
    isCorrection,
    hasExecutableAction: executable,
    usesPreviousActionableInstruction: previous,
    confidence: executable || isCorrection ? 0.88 : 0.58,
    reason: previous
      ? "El mensaje referencia una instruccion accionable anterior."
      : isCorrection && executable
        ? "La correccion contiene una accion ejecutable."
        : isCorrection
          ? "La correccion no trae una accion suficiente."
          : "Clasificacion local por intenciones y verbos de accion."
  };
}
