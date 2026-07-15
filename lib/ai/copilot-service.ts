import type { ChatMessage } from "@/types/ai";
import type { DataRow, DatasetProfile } from "@/types/dataset";
import type { DashboardAction, DashboardSpec, DashboardViewState, DashboardWidget, WidgetType } from "@/types/dashboard";
import type { PresentationSpec } from "@/types/presentation";
import type { SemanticLayer } from "@/lib/semantic-layer";
import { executeCopilotActions } from "@/lib/ai/action-execution-engine";
import { buildActionPlan } from "@/lib/ai/action-plan";
import { buildCopilotAgentLoop } from "@/lib/ai/copilot-agent";
import { buildCopilotContext, toProviderContext, type CopilotContext } from "@/lib/ai/context-builder";
import { actionEnvelope, type CopilotActionEnvelope } from "@/lib/ai/actions";
import { planAnalyticalChart } from "@/lib/dashboard-spec/chart-planner";
import { compatibleWidgetTypes } from "@/lib/dashboard-spec/edit-dashboard-spec";
import { buildDatasetCatalog, missingColumnMessage, resolveColumn } from "@/lib/semantic-layer";
import { copilotOutputSchema } from "@/lib/validation/copilot-actions";

export interface CopilotRequestContext {
  prompt: string;
  datasetProfile: DatasetProfile;
  semanticModel: SemanticLayer;
  dashboardSpec: DashboardSpec;
  viewState: DashboardViewState;
  presentationSpec?: PresentationSpec;
  messages?: ChatMessage[];
  copilotContext?: CopilotContext;
  rows?: DataRow[];
}

export interface CopilotResult {
  reply: string;
  action?: DashboardAction;
  actions?: DashboardAction[];
  actionEnvelopes?: CopilotActionEnvelope[];
  pendingConfirmation?: CopilotActionEnvelope;
  warnings?: string[];
  rejectedActionReason?: string;
  updatedDashboardSpec?: DashboardSpec;
  updatedViewState?: DashboardViewState;
  updatedPresentationSpec?: PresentationSpec;
  source: "mock" | "provider";
}

export interface HandleCopilotMessageInput extends CopilotRequestContext {
  source?: "mock" | "provider";
  proposedActions?: DashboardAction[];
  providerReply?: string;
}

export const copilotOutputJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["reply", "action"],
  properties: {
    reply: { type: "string" },
    action: {
      anyOf: [
        { type: "null" },
        {
          type: "object",
          additionalProperties: true,
          required: ["type"],
          properties: {
            type: {
              enum: [
                "update_dashboard_title",
                "update_dashboard_design",
                "update_widget_title",
                "update_widget_visual_config",
                "update_dashboard_subtitle",
                "add_widget",
                "replace_widget",
                "select_target",
                "clear_selected_target",
                "undo_last_action",
                "update_widget",
                "remove_widget",
                "duplicate_widget",
                "change_chart_type",
                "resize_widget",
                "move_widget",
                "show_widget_data",
                "add_filter",
                "add_or_update_filter",
                "update_filter",
                "remove_filter",
                "clear_filters",
                "show_data_explorer",
                "search_table",
                "select_visible_columns",
                "sort_table",
                "group_by",
                "explain_dataset",
                "explain_column",
                "explain_widget",
                "focus_widget",
                "reorder_widgets",
                "create_calculated_metric",
                "generate_insight",
                "update_view_state",
                "create_presentation",
                "add_slide",
                "generate_speaker_notes",
                "ask_clarification",
                "explain_limitation",
                "generate_presentation"
              ]
            }
          }
        }
      ]
    }
  }
};

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function firstExisting(fields: (string | undefined)[], profile: DatasetProfile) {
  const columns = new Set(profile.columns.map((column) => column.normalizedName));
  return fields.find((field) => field && columns.has(field));
}

function columnProfile(profile: DatasetProfile, field?: string) {
  return profile.columns.find((column) => column.normalizedName === field);
}

function fieldLabel(profile: DatasetProfile, field?: string) {
  return profile.columns.find((column) => column.normalizedName === field)?.displayName ?? field ?? "campo";
}

function widgetExplanation(widget: DashboardWidget | undefined, profile: DatasetProfile) {
  if (!widget) return "Selecciona un grafico y te explico como leerlo.";
  const metric = fieldLabel(profile, widget.query?.metric?.field);
  const dimension = fieldLabel(profile, widget.query?.x?.field ?? widget.query?.groupBy?.[0]);
  const seriesField = widget.query?.seriesBy ?? (typeof widget.config.seriesBy === "string" ? widget.config.seriesBy : undefined);
  const series = fieldLabel(profile, seriesField);
  const granularity = widget.query?.seriesGranularity;
  const chartType = widget.type === "bar_chart" ? "grafico de barras" : widget.type === "line_chart" ? "grafico de lineas" : widget.type === "donut_chart" ? "grafico de dona" : "widget";
  const base = `${widget.title} es un ${chartType}. Mide ${metric}${dimension ? ` por ${dimension}` : ""}.`;
  if (seriesField) {
    const seriesText = granularity === "year"
      ? `Cada color representa un ano calculado desde ${series}.`
      : granularity
        ? `Cada color representa una serie de ${series} con granularidad ${granularity}.`
        : `Cada color representa un valor distinto de ${series}.`;
    return `${base} ${seriesText} La altura de cada barra o punto muestra el valor agregado de ${metric}.`;
  }
  return `${base} Este grafico no tiene una serie adicional: el color se usa como estilo visual, no como ano o categoria separada.`;
}

function chartWidgets(spec: DashboardSpec) {
  return spec.widgets.filter((widget) => compatibleWidgetTypes(widget).length > 1);
}

function widgetByText(spec: DashboardSpec, text: string) {
  const normalized = normalize(text);
  return spec.widgets.find((widget) => normalized.includes(normalize(widget.title)) || normalized.includes(normalize(widget.id)));
}

function preferredWidget(spec: DashboardSpec, prompt: string, viewState?: DashboardViewState) {
  const selectedId = viewState?.selectedTargetType && viewState.selectedTargetType !== "dashboard" && viewState.selectedTargetType !== "none" ? viewState.selectedTargetId : undefined;
  return (selectedId ? spec.widgets.find((widget) => widget.id === selectedId) : undefined)
    ?? (viewState?.highlightedWidgetId ? spec.widgets.find((widget) => widget.id === viewState.highlightedWidgetId) : undefined)
    ?? widgetByText(spec, prompt)
    ?? chartWidgets(spec)[0]
    ?? spec.widgets[0];
}

function nextWidgetId(spec: DashboardSpec, prefix = "ai_widget") {
  const ids = new Set(spec.widgets.map((widget) => widget.id));
  let index = spec.widgets.length + 1;
  let id = `${prefix}_${index}`;
  while (ids.has(id)) {
    index += 1;
    id = `${prefix}_${index}`;
  }
  return id;
}

function nextWidgetPosition(spec: DashboardSpec, width = 6) {
  return { x: 0, y: Math.max(0, ...spec.widgets.map((widget) => widget.position.y + widget.position.h)), w: width, h: 3 };
}

function createAnalysisWidget(context: CopilotRequestContext, options: { metric?: string; dimension?: string; title: string; aggregation?: "sum" | "avg" | "count" | "min" | "max"; format?: string; type?: WidgetType; limit?: number }) {
  const metric = firstExisting([
    options.metric,
    context.semanticModel.primaryMetric?.field,
    context.datasetProfile.detectedMetricColumns[0]
  ], context.datasetProfile);
  const dimension = firstExisting([
    options.dimension,
    context.semanticModel.primaryDimension?.field,
    context.datasetProfile.detectedDimensionColumns[0]
  ], context.datasetProfile);
  if (!metric || !dimension) return undefined;

  return {
    id: nextWidgetId(context.dashboardSpec),
    type: options.type ?? "bar_chart",
    title: options.title,
    query: { metric: { field: metric, aggregation: options.aggregation ?? "sum" }, groupBy: [dimension], orderBy: { field: "value" as const, direction: "desc" as const }, limit: options.limit ?? 5 },
    config: { format: options.format ?? "number", compact: true, generatedBy: "copilot", visualConfig: { orientation: "horizontal" }, horizontal: true },
    position: nextWidgetPosition(context.dashboardSpec)
  } satisfies DashboardWidget;
}

function breakdownWidgetActions(context: CopilotRequestContext, options: { dimension: string; metric?: string; title?: string; aggregation?: "sum" | "avg" | "count" | "min" | "max"; reason: string; confidence: number }) {
  const metric = firstExisting([
    options.metric,
    context.semanticModel.primaryMetric?.field,
    context.datasetProfile.detectedMetricColumns[0]
  ], context.datasetProfile);
  const dimensionLabel = fieldLabel(context.datasetProfile, options.dimension);
  const metricLabel = fieldLabel(context.datasetProfile, metric);
  const title = options.title ?? `${metric ? metricLabel : "Registros"} por ${dimensionLabel}`;
  const target = preferredWidget(context.dashboardSpec, context.prompt, context.viewState);
  const chartTarget = target && ["bar_chart", "line_chart", "area_chart", "donut_chart", "scatter_plot"].includes(target.type) ? target : widgetGroupedBy(context.dashboardSpec, options.dimension) ?? context.dashboardSpec.widgets.find((widget) => widget.id === "sales_by_region");
  const query = {
    ...(metric ? { metric: { field: metric, aggregation: options.aggregation ?? "sum" as const } } : {}),
    groupBy: [options.dimension],
    orderBy: { field: "value" as const, direction: "desc" as const },
    limit: 10
  };

  if (chartTarget) {
    const updateAction: DashboardAction = {
      type: "update_widget",
      widgetId: chartTarget.id,
      changes: {
        type: chartTarget.type === "line_chart" || chartTarget.type === "area_chart" ? chartTarget.type : "bar_chart",
        title,
        query,
        config: { ...chartTarget.config, visualConfig: { ...(chartTarget.config.visualConfig ?? {}), orientation: "horizontal" }, horizontal: true, generatedBy: "copilot" }
      }
    };
    const focusAction: DashboardAction = { type: "focus_widget", widgetId: chartTarget.id };
    return [updateAction, focusAction].map((action) => actionEnvelope(action, options.reason, options.confidence));
  }

  const widget = createAnalysisWidget(context, { metric, dimension: options.dimension, title, aggregation: options.aggregation, limit: 10 });
  return widget ? [actionEnvelope({ type: "add_widget", widget }, options.reason, options.confidence)] : [];
}

function widgetGroupedBy(spec: DashboardSpec, field?: string) {
  if (!field) return undefined;
  return spec.widgets.find((widget) => widget.query?.groupBy?.includes(field));
}

function firstWidgetByType(spec: DashboardSpec, type: DashboardWidget["type"]) {
  return spec.widgets.find((widget) => widget.type === type);
}

function comparisonTarget(context: CopilotRequestContext) {
  return context.dashboardSpec.widgets.find((widget) => widget.query?.x?.field) ?? firstWidgetByType(context.dashboardSpec, "line_chart") ?? firstWidgetByType(context.dashboardSpec, "kpi_card");
}

function extractQuotedTitle(prompt: string) {
  const quoted = prompt.match(/["“”']([^"“”']+)["“”']/)?.[1];
  if (quoted) return quoted.trim();
  return prompt.match(/(?:nombre|titulo|título)\s+(?:a|por|como)\s+(.+)$/i)?.[1]?.trim();
}

function filterValue(prompt: string) {
  const match = prompt.match(/(?:filtra|filtrar|filtro|solo|por)\s+(?:por\s+)?(?:region|zona|territorio|cliente|vendedor|producto|categoria|estado|pais|país|ciudad|comuna)?\s*(?:=|:|a|en|por)?\s+([a-zA-Z0-9 áéíóúÁÉÍÓÚñÑ_-]+)/i);
  const direct = match?.[1]?.trim().split(/\s+/).slice(0, 4).join(" ");
  if (direct) return direct;
  return prompt.replace(/filtra|filtrar|filtro|solo|por/gi, "").trim().split(/\s+/).slice(0, 4).join(" ");
}

function columnBySampleValue(value: string, context: CopilotRequestContext) {
  const target = normalize(value);
  return context.datasetProfile.columns.find((column) =>
    column.sampleValues.some((sample) => normalize(String(sample ?? "")) === target)
  ) ?? context.datasetProfile.columns.find((column) =>
    column.sampleValues.some((sample) => normalize(String(sample ?? "")).includes(target))
  );
}

function filterValueFromPrompt(prompt: string) {
  const match = prompt.match(/(?:filtra|filtrar|filtro|solo|por)\s+(?:por\s+)?(?:region|zona|territorio|cliente|cliente_id|vendedor|producto|sku|sku_id|categoria|canal|estado|pais|pa[ií]s|ciudad|comuna|fecha|ventas|margen)?\s*(?:=|:|a|en|por)?\s+([a-zA-Z0-9 aeiouAEIOUáéíóúÁÉÍÓÚñÑ_-]+)/i);
  const direct = match?.[1]?.trim().split(/\s+/).slice(0, 4).join(" ");
  if (direct) return direct;
  return filterValue(prompt);
}

function filterValuesFromPrompt(prompt: string, context: CopilotRequestContext) {
  const explicitColumn = resolveColumn(prompt, availableContext(context)).matchedColumn;
  const text = normalize(prompt);
  const incompleteFieldOnlyFilter = /\bfiltro\b/.test(text) && /\bpor\s+(region|pais|canal|cliente|producto|categoria|fecha)\b/.test(text) && !/(=|:|\bsolo\b|\bfiltra\b)/.test(text);
  if (incompleteFieldOnlyFilter) return { column: explicitColumn, values: [] as string[] };

  const keywordMatch = prompt.match(/(?:muestrame\s+solo|mostrar\s+solo|solo|filtra|filtrar|filtro)\s+(.+)$/i)?.[1];
  const afterKeyword = keywordMatch
    ?.replace(/^(?:por\s+)?(?:region|zona|territorio|cliente|cliente_id|vendedor|producto|sku|sku_id|categoria|canal|estado|pais|ciudad|comuna)\s*(?:=|:|a|en|por)?\s*/i, "")
    .trim();
  const rawValues = (afterKeyword ?? "")
    .replace(/[.?!]$/g, "")
    .split(/\s*,\s*|\s+y\s+|\s+e\s+/i)
    .map((value) => value.trim())
    .filter(Boolean);
  const values = rawValues.length > 1 ? rawValues : [filterValueFromPrompt(prompt)].filter(Boolean);
  const bySample = context.datasetProfile.columns.find((column) =>
    values.length > 0 && values.every((value) => column.sampleValues.some((sample) => {
      const sampleText = normalize(String(sample ?? ""));
      const valueText = normalize(value);
      return sampleText === valueText || sampleText.includes(valueText);
    }))
  );
  return { column: bySample ?? explicitColumn ?? (values[0] ? columnBySampleValue(values[0], context) : undefined), values };
}

function requestedColumns(prompt: string, context: CopilotRequestContext) {
  const text = normalize(prompt);
  if ((text.includes("todas") || text.includes("todos")) && (text.includes("columna") || text.includes("campos"))) {
    return context.datasetProfile.columns.map((column) => column.normalizedName);
  }
  const direct = context.datasetProfile.columns.filter((column) => {
    const catalogColumn = buildDatasetCatalog(context.datasetProfile).columns.find((item) => item.normalizedName === column.normalizedName);
    const names = [column.normalizedName, column.originalName, column.displayName, ...(catalogColumn?.aliases ?? [])].map(normalize);
    return names.some((name) => name && text.includes(name));
  });
  if (direct.length) return [...new Set(direct.map((column) => column.normalizedName))];

  const intents = [
    ["geography", ["pais", "país", "region", "regiones", "zona", "ciudad"]],
    ["seller", ["vendedor", "ejecutivo", "asesor"]],
    ["client", ["cliente", "customer", "cuenta"]],
    ["product", ["producto", "sku", "item"]],
    ["category", ["categoria", "categoría"]],
    ["revenue", ["ventas", "revenue", "ingresos", "monto"]],
    ["margin", ["margen", "utilidad", "profit"]],
    ["date", ["fecha", "periodo", "mes", "año", "ano"]]
  ] as const;
  return intents
    .filter(([, words]) => words.some((word) => text.includes(word)))
    .map(([intent]) => resolveColumn(prompt, availableContext(context), intent).matchedColumn?.normalizedName)
    .filter((field): field is string => Boolean(field));
}

function isColumnSelectionPrompt(prompt: string, context: CopilotRequestContext) {
  const text = normalize(prompt);
  if (text.includes("columna") || text.includes("campos")) return true;
  if (!/\b(muestrame|mostrar|ver|quiero ver)\b/.test(text)) return false;
  if (text.includes("grafico") || text.includes("filtro") || text.includes("filtra")) return false;
  return requestedColumns(prompt, context).length >= 2;
}

function availableContext(context: CopilotRequestContext) {
  return {
    datasetProfile: context.datasetProfile,
    semanticModel: context.semanticModel
  };
}

function noColumnAction(label: string, context: CopilotRequestContext) {
  return { reply: missingColumnMessage(label, context.datasetProfile), envelopes: [] };
}

function designFromPrompt(prompt: string): DashboardAction | null {
  const design: Extract<DashboardAction, { type: "update_dashboard_design" }>["design"] = {};

  if (prompt.includes("compact") || prompt.includes("denso") || prompt.includes("mas informacion") || prompt.includes("mas kpi")) design.density = "compact";
  if (prompt.includes("comodo") || prompt.includes("amplio") || prompt.includes("respir") || prompt.includes("espaci")) design.density = "comfortable";

  if (prompt.includes("verde") || prompt.includes("emerald") || prompt.includes("esmeralda")) design.accentColor = "emerald";
  if (prompt.includes("celeste") || prompt.includes("sky")) design.accentColor = "sky";
  if (prompt.includes("sobrio") || prompt.includes("neutral") || prompt.includes("slate") || prompt.includes("gris")) design.accentColor = "slate";
  if (prompt.includes("azul") || prompt.includes("indigo") || prompt.includes("morado")) design.accentColor = "indigo";

  if (prompt.includes("borde") || prompt.includes("marco")) design.cardStyle = "bordered";
  if (prompt.includes("suave") || prompt.includes("soft") || prompt.includes("limpio")) design.cardStyle = "soft";

  if (prompt.includes("contraste")) design.chartPalette = "contrast";
  if (prompt.includes("business") || prompt.includes("profesional") || prompt.includes("ejecutivo")) design.chartPalette = "business";
  if (prompt.includes("default") || prompt.includes("normal")) design.chartPalette = "default";

  return Object.keys(design).length ? { type: "update_dashboard_design", design } : null;
}

function planLocalActions(context: CopilotRequestContext): { reply: string; envelopes: CopilotActionEnvelope[]; warnings?: string[] } {
  const prompt = normalize(context.prompt);
  const actionPlan = buildActionPlan({ prompt: context.prompt, dashboardSpec: context.dashboardSpec, viewState: context.viewState });
  const target = actionPlan.target ?? preferredWidget(context.dashboardSpec, context.prompt, context.viewState);

  if (actionPlan.createNewWidget) {
    const dimensionIntent = prompt.includes("producto") ? "product" : prompt.includes("categoria") || prompt.includes("categorÃ­a") ? "category" : prompt.includes("region") || prompt.includes("pais") || prompt.includes("zona") ? "geography" : "dimension";
    const dimension = resolveColumn(context.prompt, availableContext(context), dimensionIntent);
    if (!dimension.matchedColumn) return noColumnAction(dimensionIntent, context);
    const metric = resolveColumn(context.prompt, availableContext(context), prompt.includes("margen") ? "margin" : "revenue");
    const metricField = metric.matchedColumn?.normalizedName ?? context.semanticModel.primaryMetric?.field;
    const title = `${fieldLabel(context.datasetProfile, metricField)} por ${dimension.matchedColumn.displayName}`;
    const widget = createAnalysisWidget(context, { metric: metricField, dimension: dimension.matchedColumn.normalizedName, title, type: actionPlan.chartType && actionPlan.chartType !== "kpi_card" ? actionPlan.chartType : "bar_chart", limit: 10 });
    if (!widget) return { reply: "Encontre la dimension solicitada, pero falta una metrica compatible para crear el grafico.", envelopes: [] };
    return { reply: `Agregue un nuevo grafico usando "${dimension.matchedColumn.originalName}" y la metrica principal.`, envelopes: [actionEnvelope({ type: "add_widget", widget }, "El usuario pidio crear un grafico nuevo, no reemplazar la seleccion.", Math.min(dimension.confidence, metric.confidence || 0.78))] };
  }

  if (actionPlan.replaceSelectedWidget) {
    if (!target) return { reply: "Selecciona primero el grafico que quieres reemplazar.", envelopes: [] };
    const dimension = resolveColumn(context.prompt, availableContext(context), prompt.includes("region") || prompt.includes("pais") || prompt.includes("zona") ? "geography" : "dimension");
    if (!dimension.matchedColumn) return noColumnAction("dimension", context);
    const metric = resolveColumn(context.prompt, availableContext(context), prompt.includes("margen") ? "margin" : "revenue");
    const metricField = metric.matchedColumn?.normalizedName ?? context.semanticModel.primaryMetric?.field;
    const widget = createAnalysisWidget(context, { metric: metricField, dimension: dimension.matchedColumn.normalizedName, title: `${fieldLabel(context.datasetProfile, metricField)} por ${dimension.matchedColumn.displayName}`, type: actionPlan.chartType ?? "bar_chart", limit: 10 });
    if (!widget) return { reply: "No pude construir el reemplazo porque falta metrica o dimension compatible.", envelopes: [] };
    return { reply: `Reemplace el grafico seleccionado por ${widget.title}.`, envelopes: [actionEnvelope({ type: "replace_widget", widgetId: target.id, widget }, "El usuario pidio reemplazar el grafico seleccionado.", Math.min(dimension.confidence, metric.confidence || 0.78))] };
  }

  if (prompt.includes("estilo") || prompt.includes("diseno") || prompt.includes("diseño") || prompt.includes("color") || prompt.includes("tema") || prompt.includes("compact") || prompt.includes("paleta")) {
    const action = designFromPrompt(prompt);
    if (action) {
      return {
        reply: "Ajuste el estilo visual del dashboard desde su DashboardSpec para acercarlo al uso que pediste.",
        envelopes: [actionEnvelope(action, "Preferencias visuales solicitadas por el usuario.", 0.84)]
      };
    }
  }

  if (prompt.includes("elimina") || prompt.includes("quita") || prompt.includes("borra")) {
    if (!target) return { reply: "No encontre un widget enfocado para eliminar. Indica el nombre del grafico o enfocarlo primero.", envelopes: [] };
    if (!prompt.includes("confirma") && !prompt.includes("confirmo")) {
      return {
        reply: `Eliminar "${target.title}" es destructivo. Confirma con "confirma eliminar ${target.title}" para aplicarlo.`,
        envelopes: [],
        warnings: ["remove_widget requiere confirmacion explicita"]
      };
    }
    const action: DashboardAction = { type: "remove_widget", widgetId: target.id };
    return { reply: `Elimine el widget "${target.title}" despues de recibir confirmacion.`, envelopes: [actionEnvelope(action, "El usuario confirmo una accion destructiva.", 0.86)] };
  }

  if (prompt.includes("nombre") || prompt.includes("titulo") || prompt.includes("título")) {
    const title = extractQuotedTitle(context.prompt);
    if (title && (prompt.includes("dashboard") || prompt.includes("tablero"))) {
      const action: DashboardAction = { type: "update_dashboard_title", title };
      return { reply: `Cambie el titulo del dashboard a "${title}".`, envelopes: [actionEnvelope(action, "Cambio de titulo del dashboard solicitado por el usuario.", 0.9)] };
    }
    if (title && target) {
      const action: DashboardAction = { type: "update_widget_title", widgetId: target.id, title };
      return { reply: `Cambie el nombre de "${target.title}" a "${title}".`, envelopes: [actionEnvelope(action, "Cambio de titulo de widget solicitado por el usuario.", 0.84)] };
    }
  }

  if (prompt.includes("tabla completa") || prompt.includes("ver datos") || prompt.includes("explorar datos") || prompt.includes("muestrame la tabla") || prompt.includes("muéstrame la tabla")) {
    const action: DashboardAction = { type: "show_data_explorer" };
    return { reply: "Mostre la vista Datos con la tabla completa paginada y buscable.", envelopes: [actionEnvelope(action, "El usuario pidio explorar la tabla completa.", 0.92)] };
  }

  if (prompt.includes("explicame que columnas") || prompt.includes("explícame qué columnas") || prompt.includes("que columnas tiene") || prompt.includes("qué columnas tiene") || prompt.includes("que puedo analizar") || prompt.includes("qué puedo analizar")) {
    const action: DashboardAction = { type: "explain_dataset" };
    const metrics = context.datasetProfile.detectedMetricColumns.slice(0, 4).join(", ") || "sin metricas confiables";
    const dimensions = context.datasetProfile.detectedDimensionColumns.slice(0, 4).join(", ") || "sin dimensiones confiables";
    return {
      reply: `Este Excel tiene ${context.datasetProfile.rowCount} filas y ${context.datasetProfile.columnCount} columnas. Metricas: ${metrics}. Dimensiones: ${dimensions}.`,
      envelopes: [actionEnvelope(action, "Explicacion del dataset solicitada.", 0.9)]
    };
  }

  if (prompt.includes("busca") || prompt.includes("buscar")) {
    const query = context.prompt.replace(/busca(r)?/i, "").trim();
    if (query) {
      const action: DashboardAction = { type: "search_table", query };
      return { reply: `Busque "${query}" en toda la tabla cargada.`, envelopes: [actionEnvelope(action, "Busqueda global solicitada.", 0.88)] };
    }
  }

  if ((prompt.includes("muestra") || prompt.includes("mostrar") || prompt.includes("solo") || prompt.includes("ver") || prompt.includes("muestrame")) && isColumnSelectionPrompt(context.prompt, context)) {
    const columns = requestedColumns(context.prompt, context);
    if (!columns.length) return { reply: "No encontre las columnas solicitadas. Puedo mostrar columnas por nombre, por ejemplo: muestra columnas Pais, Canal y Ventas.", envelopes: [] };
    const action: DashboardAction = { type: "select_visible_columns", columns };
    return { reply: `Mostre solo estas columnas: ${columns.map((field) => fieldLabel(context.datasetProfile, field)).join(", ")}.`, envelopes: [actionEnvelope(action, "Seleccion de columnas visibles solicitada.", 0.86)] };
  }

  if (prompt.includes("oculta") && prompt.includes("columna")) {
    const columns = requestedColumns(context.prompt, context);
    const current = context.viewState.dataExplorer?.visibleColumns?.length ? context.viewState.dataExplorer.visibleColumns : context.datasetProfile.columns.map((column) => column.normalizedName);
    if (!columns.length) return { reply: "No encontre que columna ocultar. Indica el nombre exacto o uno parecido.", envelopes: [] };
    const action: DashboardAction = { type: "select_visible_columns", columns: current.filter((column) => !columns.includes(column)) };
    return { reply: `Oculte ${columns.map((field) => fieldLabel(context.datasetProfile, field)).join(", ")} de la vista Datos.`, envelopes: [actionEnvelope(action, "Ocultar columnas solicitado.", 0.82)] };
  }

  if (prompt.includes("ordena") || prompt.includes("ordenar")) {
    const field = resolveColumn(context.prompt, availableContext(context), prompt.includes("venta") || prompt.includes("monto") ? "revenue" : "dimension").matchedColumn;
    if (!field) return { reply: "No encontre una columna compatible para ordenar la tabla.", envelopes: [] };
    const direction = prompt.includes("menor") || prompt.includes("asc") ? "asc" : "desc";
    const action: DashboardAction = { type: "sort_table", field: field.normalizedName, direction };
    return { reply: `Ordene la tabla por ${field.displayName} de forma ${direction === "asc" ? "ascendente" : "descendente"}.`, envelopes: [actionEnvelope(action, "Ordenamiento de tabla solicitado.", 0.84)] };
  }

  if (prompt.includes("agrupa") || prompt.includes("agrupar")) {
    const columns = requestedColumns(context.prompt, context);
    if (!columns.length) return { reply: "No encontre columnas claras para agrupar. Prueba: agrupa por canal o agrupa por pais.", envelopes: [] };
    const action: DashboardAction = { type: "group_by", fields: columns };
    return { reply: `Agrupe la exploracion por ${columns.map((field) => fieldLabel(context.datasetProfile, field)).join(", ")}.`, envelopes: [actionEnvelope(action, "Agrupacion solicitada.", 0.78)] };
  }

  if ((prompt.includes(" por ") || prompt.startsWith("por ") || prompt.includes("analiza") || prompt.includes("mostrar") || prompt.includes("muestra") || prompt.includes("grafico") || prompt.includes("grÃ¡fico")) && !prompt.includes("columna") && !prompt.includes("solo ") && !prompt.includes("filtra") && !prompt.includes("filtro") && !prompt.includes("vendedor") && !prompt.includes("asesor") && !prompt.includes("ejecutivo") && !prompt.includes("margen") && !prompt.includes("utilidad") && !prompt.includes("profit")) {
    const dimension = resolveColumn(context.prompt, availableContext(context), "dimension");
    const metricIntent = prompt.includes("promedio") || prompt.includes("media") ? "metric" : prompt.includes("margen") ? "margin" : "revenue";
    const metric = resolveColumn(context.prompt, availableContext(context), metricIntent);
    if (dimension.matchedColumn && dimension.matchedColumn.normalizedName !== metric.matchedColumn?.normalizedName) {
      const envelopes = breakdownWidgetActions(context, {
        dimension: dimension.matchedColumn.normalizedName,
        metric: metric.matchedColumn?.normalizedName,
        aggregation: prompt.includes("promedio") || prompt.includes("media") ? "avg" : "sum",
        reason: dimension.reason,
        confidence: Math.min(dimension.confidence, metric.confidence || 0.74)
      });
      if (envelopes.length) {
        const alternatives = dimension.alternatives.length ? ` Alternativas: ${dimension.alternatives.map((item) => item.column.normalizedName).join(", ")}.` : "";
        return {
          reply: `Use la columna real "${dimension.matchedColumn.normalizedName}" y actualice el widget a ${fieldLabel(context.datasetProfile, metric.matchedColumn?.normalizedName)} por ${dimension.matchedColumn.displayName}.${alternatives}`,
          envelopes
        };
      }
    }
  }

  if (prompt.includes("ticket promedio") || (prompt.includes("kpi") && prompt.includes("promedio"))) {
    const metric = resolveColumn("ventas", availableContext(context), "revenue").matchedColumn ?? context.datasetProfile.columns.find((column) => ["number", "currency"].includes(column.inferredType));
    if (!metric) return { reply: "No encontre una metrica numerica para crear el KPI de promedio.", envelopes: [] };
    const widget: DashboardWidget = {
      id: nextWidgetId(context.dashboardSpec, "ai_kpi"),
      type: "kpi_card",
      title: `Promedio ${metric.displayName}`,
      query: { metric: { field: metric.normalizedName, aggregation: "avg" } },
      config: { icon: "chart", format: metric.inferredType === "currency" ? "currency" : "number", tone: "sky", generatedBy: "copilot" },
      position: { x: 0, y: Math.max(0, ...context.dashboardSpec.widgets.map((widget) => widget.position.y + widget.position.h)), w: 3, h: 1 }
    };
    return { reply: `Agregue un KPI de promedio usando la columna "${metric.originalName}".`, envelopes: [actionEnvelope({ type: "add_widget", widget }, "KPI promedio solicitado.", 0.83)] };
  }

  if (prompt.includes("tabla") && (prompt.includes("importan") || prompt.includes("importantes"))) {
    const columns = [
      context.semanticModel.primaryDate?.field,
      context.semanticModel.primaryGeography?.field,
      context.semanticModel.primarySeller?.field,
      context.semanticModel.primaryClient?.field,
      context.semanticModel.primaryProduct?.field,
      context.semanticModel.primaryCategory?.field,
      context.semanticModel.primaryMetric?.field,
      context.semanticModel.marginMetrics[0]?.field
    ].filter((field): field is string => Boolean(field));
    const widget: DashboardWidget = {
      id: nextWidgetId(context.dashboardSpec, "ai_table"),
      type: "table",
      title: "Tabla de columnas clave",
      config: { columns: [...new Set(columns)].slice(0, 8), limit: 10, generatedBy: "copilot" },
      position: nextWidgetPosition(context.dashboardSpec, 12)
    };
    return { reply: "Agregue una tabla con las columnas mas relevantes detectadas en el Excel.", envelopes: [actionEnvelope({ type: "add_widget", widget }, "Tabla de columnas clave solicitada.", 0.8)] };
  }

  if (prompt.includes("top") && (prompt.includes("producto") || prompt.includes("productos"))) {
    const product = resolveColumn(context.prompt, availableContext(context), "product");
    if (!product.matchedColumn) return noColumnAction("producto", context);
    const limit = Number(prompt.match(/\b(\d{1,2})\b/)?.[1] ?? 10);
    const widget = createAnalysisWidget(context, { dimension: product.matchedColumn.normalizedName, title: `Top ${limit} ${product.matchedColumn.displayName}`, limit });
    if (!widget) return { reply: "Encontre producto, pero falta una metrica para crear el top.", envelopes: [] };
    return { reply: `Agregue top ${limit} por ${product.matchedColumn.displayName}.`, envelopes: [actionEnvelope({ type: "add_widget", widget }, "Top productos solicitado.", product.confidence)] };
  }

  if (prompt.includes("explica") && prompt.includes("columna")) {
    const column = requestedColumns(context.prompt, context)[0];
    if (!column) return { reply: "No encontre una columna clara para explicar.", envelopes: [] };
    const action: DashboardAction = { type: "explain_column", field: column };
    const profile = context.datasetProfile.columns.find((item) => item.normalizedName === column);
    return {
      reply: `${profile?.displayName ?? column} tiene tipo ${profile?.inferredType ?? "desconocido"}, semantic type ${profile?.semanticType ?? "unknown"}, ${profile?.uniqueCount ?? 0} valores unicos y ${profile?.nullCount ?? 0} nulos.`,
      envelopes: [actionEnvelope(action, "Explicacion de columna solicitada.", 0.86)]
    };
  }

  if (prompt.includes("notas") && (prompt.includes("presentador") || prompt.includes("speaker") || prompt.includes("slide"))) {
    const action: DashboardAction = { type: "generate_speaker_notes" };
    return { reply: "Genere notas del presentador para la presentacion activa.", envelopes: [actionEnvelope(action, "Notas del presentador solicitadas.", 0.84)] };
  }

  if (prompt.includes("slide") && (prompt.includes("riesgo") || prompt.includes("riesgos"))) {
    const riskWidgets = context.dashboardSpec.widgets
      .filter((widget) => normalize(`${widget.title} ${widget.query?.metric?.field ?? ""}`).includes("margen") || normalize(`${widget.title} ${widget.query?.metric?.field ?? ""}`).includes("costo"))
      .map((widget) => widget.id)
      .slice(0, 2);
    const action: DashboardAction = {
      type: "add_slide",
      slide: {
        id: `risks_${Date.now()}`,
        title: "Riesgos y mitigaciones",
        subtitle: "Puntos a monitorear antes de ejecutar el plan",
        narrative: "Priorizar riesgos de concentracion, calidad de datos y variaciones de costo antes de tomar decisiones.",
        speakerNotes: "Cerrar con acciones concretas y responsables por cada riesgo.",
        layout: "insights",
        widgetIds: riskWidgets
      }
    };
    return { reply: "Agregue una slide de riesgos a la presentacion activa.", envelopes: [actionEnvelope(action, "Slide de riesgos solicitada.", 0.82)] };
  }

  if (prompt.includes("ejecutivo")) {
    const kpis = context.dashboardSpec.widgets.filter((widget) => widget.type === "kpi_card").map((widget) => widget.id);
    const summary = firstWidgetByType(context.dashboardSpec, "insight_text") ?? context.dashboardSpec.widgets.find((widget) => widget.title.toLowerCase().includes("resumen"));
    const actions: DashboardAction[] = [
      { type: "update_dashboard_title", title: context.dashboardSpec.title.replace(/^Dashboard de /, "Vista Ejecutiva de ") },
      { type: "update_dashboard_design", design: { density: "compact", accentColor: "slate", cardStyle: "bordered", chartPalette: "business" } },
      ...(summary ? [{ type: "focus_widget" as const, widgetId: summary.id }] : kpis[0] ? [{ type: "focus_widget" as const, widgetId: kpis[0] }] : []),
      { type: "reorder_widgets", widgetIds: [...kpis, ...context.dashboardSpec.widgets.filter((widget) => !kpis.includes(widget.id)).map((widget) => widget.id)] }
    ];
    return {
      reply: "Simplifique la vista ejecutiva, priorice KPIs y destaque el resumen para una lectura directiva.",
      envelopes: actions.map((action) => actionEnvelope(action, "Modo ejecutivo solicitado.", 0.82))
    };
  }

  if ((prompt.includes("filtra") || prompt.includes("filtro") || prompt.includes("solo ")) && context.datasetProfile.columns.length) {
    const resolved = resolveColumn(context.prompt, availableContext(context));
    const { column: matchedColumn, values } = filterValuesFromPrompt(context.prompt, context);
    if (!matchedColumn || !values.length) {
      return { reply: "Puedo aplicar filtros, pero necesito una columna y un valor claros. Por ejemplo: filtra Pais Chile.", envelopes: [] };
    }
    const action: DashboardAction = { type: "add_or_update_filter", filter: { field: matchedColumn.normalizedName, operator: "in", value: values } };
    const reason = resolved.matchedColumn ? resolved.reason : `Detecte valores reales en muestras de "${matchedColumn.displayName}".`;
    return { reply: `Aplique filtro sobre "${matchedColumn.originalName}" con valores ${values.join(", ")}.`, envelopes: [actionEnvelope(action, reason, resolved.confidence || 0.68)] };
  }

  if (prompt.includes("region") || prompt.includes("regiones") || prompt.includes("zona") || prompt.includes("pais") || prompt.includes("ciudad") || prompt.includes("comuna")) {
    const resolved = resolveColumn(context.prompt, availableContext(context), "geography");
    if (!resolved.matchedColumn) return noColumnAction("region", context);
    const field = resolved.matchedColumn.normalizedName;
    const existing = widgetGroupedBy(context.dashboardSpec, field);
    const actions: DashboardAction[] = [];
    if (existing) {
      actions.push({ type: "focus_widget", widgetId: existing.id });
    } else {
      const envelopes = breakdownWidgetActions(context, { dimension: field, reason: resolved.reason, confidence: resolved.confidence });
      return {
        reply: `Use la columna real "${resolved.matchedColumn.normalizedName}" del archivo y actualice el dashboard por ${fieldLabel(context.datasetProfile, field)}.`,
        envelopes
      };
    }
    const isFallback = resolved.matchType === "fallback";
    const reply = isFallback
      ? `No encontre una columna exacta para ${resolved.requestedConcept}; use "${resolved.matchedColumn.originalName}" como fallback.`
      : `Use la columna real "${resolved.matchedColumn.originalName}" del archivo y actualice el dashboard con ventas por ${fieldLabel(context.datasetProfile, field)}.`;
    return {
      reply,
      envelopes: actions.map((action) => actionEnvelope(action, resolved.reason, resolved.confidence))
    };
  }

  if (prompt.includes("vendedor") || prompt.includes("ejecutivo comercial") || prompt.includes("asesor") || prompt.includes("salesperson")) {
    const seller = resolveColumn(context.prompt, availableContext(context), "seller");
    if (!seller.matchedColumn) return noColumnAction("vendedor", context);
    const metric = resolveColumn("ventas", availableContext(context), "revenue");
    const widget = createAnalysisWidget(context, {
      metric: metric.matchedColumn?.normalizedName,
      dimension: seller.matchedColumn.normalizedName,
      title: `Top ${fieldLabel(context.datasetProfile, seller.matchedColumn.normalizedName)}`,
      limit: 5
    });
    if (!widget) return { reply: "Encontre vendedor, pero no encontre una metrica compatible para construir el ranking.", envelopes: [] };
    return {
      reply: `Agregue ranking por vendedor usando "${seller.matchedColumn.originalName}" y la metrica "${metric.matchedColumn?.originalName ?? fieldLabel(context.datasetProfile, widget.query?.metric?.field)}".`,
      envelopes: [actionEnvelope({ type: "add_widget", widget }, "Ranking comercial solicitado.", Math.min(seller.confidence, metric.confidence || 0.7))]
    };
  }

  if (prompt.includes("margen") || prompt.includes("utilidad") || prompt.includes("profit")) {
    const margin = resolveColumn(context.prompt, availableContext(context), "margin");
    if (!margin.matchedColumn) {
      const revenue = resolveColumn("ventas", availableContext(context), "revenue");
      const cost = context.datasetProfile.columns.find((column) => normalize(`${column.originalName} ${column.displayName}`).includes("costo") || normalize(`${column.originalName} ${column.displayName}`).includes("cost"));
      if (revenue.matchedColumn && cost) {
        const action: DashboardAction = {
          type: "create_calculated_metric",
          id: "margin_rate",
          title: "Margen calculado",
          formula: `(${revenue.matchedColumn.normalizedName} - ${cost.normalizedName}) / ${revenue.matchedColumn.normalizedName}`,
          operands: [revenue.matchedColumn.normalizedName, cost.normalizedName]
        };
        return { reply: `No encontre margen directo, pero propuse calcularlo con "${revenue.matchedColumn.originalName}" y "${cost.originalName}".`, envelopes: [actionEnvelope(action, "Margen derivable desde ventas y costo.", 0.65, true)] };
      }
      return { reply: "No encontre una columna compatible de margen ni una combinacion clara de ventas y costo para calcularlo.", envelopes: [] };
    }
    const dimension = resolveColumn("categoria", availableContext(context), "category").matchedColumn?.normalizedName ?? context.semanticModel.primaryDimension?.field;
    const widget = createAnalysisWidget(context, { metric: margin.matchedColumn.normalizedName, dimension, title: "Margen por Segmento", aggregation: "avg", format: "percentage" });
    if (!widget) return { reply: "Encontre margen, pero falta una dimension compatible para segmentarlo.", envelopes: [] };
    return { reply: `Agregue analisis de margen usando la columna "${margin.matchedColumn.originalName}".`, envelopes: [actionEnvelope({ type: "add_widget", widget }, margin.reason, margin.confidence)] };
  }

  if (prompt.includes("comparar") || prompt.includes("periodo anterior") || prompt.includes("trimestre anterior")) {
    const date = resolveColumn(context.prompt, availableContext(context), "date");
    if (!date.matchedColumn) return { reply: "No encontre una columna de fecha suficiente para activar comparacion con periodos anteriores.", envelopes: [] };
    const widget = comparisonTarget(context);
    if (!widget) return { reply: "Encontre fecha, pero no hay un widget compatible para activar comparacion.", envelopes: [] };
    const action: DashboardAction = { type: "update_widget", widgetId: widget.id, changes: { config: { comparison: true, comparisonMode: "previous_period", comparisonField: date.matchedColumn.normalizedName } } };
    return { reply: `Active comparacion contra periodo anterior usando "${date.matchedColumn.originalName}".`, envelopes: [actionEnvelope(action, date.reason, date.confidence)] };
  }

  if ((prompt.includes("barra") || prompt.includes("barras")) && target) {
    const action: DashboardAction = { type: "change_chart_type", widgetId: target.id, chartType: "bar_chart" };
    return { reply: `Cambie "${target.title}" a grafico de barras.`, envelopes: [actionEnvelope(action, "Cambio de tipo de grafico solicitado.", 0.86)] };
  }

  if ((prompt.includes("linea") || prompt.includes("línea") || prompt.includes("tendencia")) && target) {
    const action: DashboardAction = { type: "change_chart_type", widgetId: target.id, chartType: "line_chart" };
    return { reply: `Cambie "${target.title}" a grafico de linea.`, envelopes: [actionEnvelope(action, "Cambio de tipo de grafico solicitado.", 0.84)] };
  }

  if (prompt.includes("limpia") && prompt.includes("filtro")) {
    return { reply: "Limpie los filtros activos para volver a la vista general.", envelopes: [actionEnvelope({ type: "clear_filters" }, "Limpiar filtros solicitado.", 0.92)] };
  }

  if (prompt.includes("agrega") || prompt.includes("anade") || prompt.includes("añade") || prompt.includes("nuevo grafico") || prompt.includes("nuevo gráfico")) {
    const dimensionIntent = prompt.includes("producto") ? "product" : prompt.includes("categoria") || prompt.includes("categoría") ? "category" : "dimension";
    const dimension = resolveColumn(context.prompt, availableContext(context), dimensionIntent);
    if (!dimension.matchedColumn) return noColumnAction(dimensionIntent, context);
    const widget = createAnalysisWidget(context, { dimension: dimension.matchedColumn.normalizedName, title: `Top ${fieldLabel(context.datasetProfile, dimension.matchedColumn.normalizedName)}` });
    if (!widget) return { reply: "Encontre la dimension solicitada, pero falta una metrica compatible para crear el grafico.", envelopes: [] };
    return { reply: `Agregue un grafico usando "${dimension.matchedColumn.originalName}" y la metrica principal.`, envelopes: [actionEnvelope({ type: "add_widget", widget }, dimension.reason, dimension.confidence)] };
  }

  if (prompt.includes("explica") || prompt.includes("insight")) {
    const action: DashboardAction = {
      type: "generate_insight",
      widgetId: target?.id,
      content: target ? `El widget "${target.title}" concentra la lectura principal con los filtros actuales.` : "El dashboard resume las metricas y dimensiones detectadas en el dataset."
    };
    return { reply: "Genere un insight accionable basado en el dashboard actual.", envelopes: [actionEnvelope(action, "Insight solicitado.", 0.72)] };
  }

  if (prompt.includes("presentacion") || prompt.includes("presentación")) {
    return {
      reply: "Prepare la presentacion desde el dashboard vivo con foco ejecutivo.",
      envelopes: [actionEnvelope({ type: "create_presentation", options: { theme: "executive", durationMinutes: 5, detailLevel: "summary" } }, "Presentacion solicitada.", 0.78)]
    };
  }

  return {
    reply: "Puedo modificar el dashboard con acciones validadas: agregar graficos por columnas reales, aplicar filtros, cambiar titulos, comparar periodos, generar insights o preparar presentacion. Prueba: 'pon las regiones', 'ventas por vendedor' o 'filtra Pais Chile'.",
    envelopes: []
  };
}

function applyValidatedActions(input: CopilotRequestContext, envelopes: CopilotActionEnvelope[], source: "mock" | "provider", baseReply: string, warnings: string[] = []): CopilotResult {
  const execution = executeCopilotActions({
    userMessage: input.prompt,
    datasetProfile: input.datasetProfile,
    semanticModel: input.semanticModel,
    dashboardSpec: input.dashboardSpec,
    viewState: input.viewState,
    dataExplorerState: input.viewState.dataExplorer,
    presentationSpec: input.presentationSpec,
    focusedWidgetId: input.viewState.highlightedWidgetId,
    rows: input.rows,
    envelopes,
    assistantMessage: baseReply,
    source
  });

  return {
    reply: execution.assistantMessage,
    action: execution.actions[0],
    actions: execution.actions,
    actionEnvelopes: execution.actionEnvelopes,
    pendingConfirmation: execution.pendingConfirmation,
    warnings: [...warnings, ...execution.warnings, ...execution.errors],
    rejectedActionReason: [...warnings, ...execution.warnings, ...execution.errors][0],
    updatedDashboardSpec: execution.updatedDashboardSpec,
    updatedViewState: execution.updatedViewState,
    updatedPresentationSpec: execution.updatedPresentationSpec,
    source
  };
}

function widgetFromUpdate(target: DashboardWidget, action: Extract<DashboardAction, { type: "update_widget" }>): DashboardWidget {
  return {
    ...target,
    ...action.changes,
    id: target.id,
    config: { ...target.config, ...(action.changes.config ?? {}) },
    position: action.changes.position ?? target.position
  };
}

function previousInstructionReplacement(input: CopilotRequestContext, previousInstruction: string, target: DashboardWidget) {
  const selectedViewState: DashboardViewState = {
    ...input.viewState,
    highlightedWidgetId: target.id,
    selectedTargetType: target.type === "kpi_card" ? "kpi" : target.type === "table" ? "table" : "widget",
    selectedTargetId: target.id,
    selectedTargetTitle: target.title,
    selectedTargetSpec: target,
    selectedTargetCapabilities: input.viewState.selectedTargetCapabilities ?? []
  };
  const analyticalPlan = planAnalyticalChart({ ...input, prompt: previousInstruction, viewState: selectedViewState });
  if (!analyticalPlan.handled || !analyticalPlan.actions.length) return undefined;

  const actions = analyticalPlan.actions.flatMap<DashboardAction>((action) => {
    if (action.type === "update_widget" && action.widgetId === target.id) return [{ type: "replace_widget", widgetId: target.id, widget: widgetFromUpdate(target, action) }];
    if (action.type === "add_widget") return [{ type: "replace_widget", widgetId: target.id, widget: action.widget }];
    if (action.type === "focus_widget") return [{ type: "focus_widget", widgetId: target.id }];
    return [action];
  });

  return {
    reply: `Listo. Use tu ultima instruccion accionable y reemplace el grafico seleccionado. Instruccion usada: ${previousInstruction}`,
    envelopes: actions.map((action) => actionEnvelope(action, "Reemplazo solicitado usando la ultima instruccion accionable.", analyticalPlan.confidence)),
    warnings: analyticalPlan.warnings ?? []
  };
}

export function handleCopilotMessage(input: HandleCopilotMessageInput): CopilotResult {
  const source = input.source ?? "mock";
  const agentLoop = buildCopilotAgentLoop(input);
  const actionPlan = agentLoop.actionPlan;
  if (actionPlan.needsClarification) {
    return applyValidatedActions(input, [actionEnvelope({ type: "ask_clarification", question: actionPlan.clarification ?? "Necesito una aclaracion antes de aplicar cambios." }, actionPlan.reason, actionPlan.confidence)], source, actionPlan.clarification ?? "Necesito una aclaracion antes de aplicar cambios.");
  }
  if (actionPlan.usesPreviousInstruction && actionPlan.replaceSelectedWidget && agentLoop.previousInstruction && actionPlan.target) {
    const replacement = previousInstructionReplacement(input, agentLoop.previousInstruction, actionPlan.target);
    if (replacement) {
      return applyValidatedActions({ ...input, prompt: agentLoop.previousInstruction }, replacement.envelopes, source, replacement.reply, replacement.warnings);
    }
    return applyValidatedActions(input, [actionEnvelope({ type: "ask_clarification", question: "No pude convertir la instruccion anterior en un reemplazo seguro para el grafico seleccionado." }, actionPlan.reason, 0.78)], source, "No aplique cambios porque la instruccion anterior no genero un plan ejecutable seguro.");
  }
  if (actionPlan.action) {
    const reply = actionPlan.action.type === "undo_last_action"
      ? "Voy a deshacer el ultimo cambio del Copiloto."
      : actionPlan.action.type === "explain_widget"
        ? widgetExplanation(actionPlan.target, input.datasetProfile)
        : "Aplique el plan contextual validado.";
    return applyValidatedActions(input, [actionEnvelope(actionPlan.action, actionPlan.reason, actionPlan.confidence)], source, reply);
  }
  if (actionPlan.messageKind === "correction") {
    return applyValidatedActions(input, [actionEnvelope({ type: "ask_clarification", question: "Entendido: no aplicare filtros ni cambiare columnas. Indica si quieres deshacer, cambiar solo lo visual o reemplazar el grafico seleccionado." }, actionPlan.reason, 0.86)], source, "No aplique cambios porque tu mensaje es una correccion, no una nueva orden de datos.");
  }
  const analyticalPlan = actionPlan.createNewWidget ? { handled: false as const, reply: "", actions: [], confidence: 0 } : planAnalyticalChart(input);
  if (analyticalPlan.handled) {
    return applyValidatedActions(
      input,
      analyticalPlan.actions.map((action) => actionEnvelope(action, "Plan analitico compuesto detectado.", analyticalPlan.confidence)),
      source,
      analyticalPlan.reply,
      analyticalPlan.warnings ?? []
    );
  }
  if (input.proposedActions) {
    return applyValidatedActions(input, input.proposedActions.map((action) => actionEnvelope(action, "Accion propuesta por proveedor.", 0.74)), source, input.providerReply ?? "Aplique acciones estructuradas validadas.");
  }
  const plan = planLocalActions(input);
  return applyValidatedActions(input, plan.envelopes, source, plan.reply, plan.warnings ?? []);
}

export function createMockCopilotResponse(context: CopilotRequestContext): CopilotResult {
  return handleCopilotMessage({ ...context, source: "mock" });
}

export function parseCopilotProviderOutput(raw: unknown, context: CopilotRequestContext): CopilotResult {
  const parsed = copilotOutputSchema.safeParse(raw);
  if (!parsed.success) {
    return { reply: "La respuesta del proveedor no paso la validacion estructurada.", rejectedActionReason: "output_schema", warnings: ["output_schema"], source: "provider" };
  }
  if (!parsed.data.action) return { reply: parsed.data.reply, actions: [], updatedDashboardSpec: context.dashboardSpec, updatedViewState: context.viewState, updatedPresentationSpec: context.presentationSpec, source: "provider" };
  return handleCopilotMessage({ ...context, source: "provider", providerReply: parsed.data.reply, proposedActions: [parsed.data.action as DashboardAction] });
}

export function buildCopilotPrompt(context: CopilotRequestContext) {
  const providerContext = context.copilotContext
    ? toProviderContext(context.copilotContext)
    : toProviderContext(buildCopilotContext({
        rows: [],
        datasetProfile: context.datasetProfile,
        dashboardSpec: context.dashboardSpec,
        viewState: context.viewState,
        presentationSpec: context.presentationSpec,
        messages: context.messages
      }));
  return [
    "Eres el Copiloto IA de DashPilot. Devuelve solo acciones estructuradas validas en JSON.",
    "Nunca inventes columnas ni widgets. Solo usa IDs y campos entregados.",
    "No puedes modificar React ni UI directamente. Solo DashboardSpec, DashboardViewState o PresentationSpec via acciones.",
    "Para cambios visuales de widget usa update_widget_visual_config y no cambies query, metrica, groupBy, filtros ni columnas.",
    "Si el usuario dice este grafico y selectedTarget.type es none, pide aclaracion con ask_clarification.",
    "Si el usuario corrige o niega una accion anterior, no lo interpretes como filtro ni columna.",
    "Para cambios visuales de dashboard usa update_dashboard_design con density, accentColor, cardStyle o chartPalette.",
    "No ejecutes codigo. No crees formulas peligrosas. Las acciones destructivas deben requerir confirmacion.",
    JSON.stringify({
      userPrompt: context.prompt,
      context: providerContext
    })
  ].join("\n");
}

export function assistantMessage(content: string, structuredAction?: DashboardAction): ChatMessage {
  return { id: crypto.randomUUID(), role: "assistant", content, structuredAction, createdAt: new Date().toISOString() };
}
