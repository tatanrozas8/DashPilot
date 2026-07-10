import type { ChatMessage } from "@/types/ai";
import type { DatasetProfile } from "@/types/dataset";
import type { DashboardAction, DashboardSpec, DashboardViewState, DashboardWidget, WidgetType } from "@/types/dashboard";
import type { PresentationSpec } from "@/types/presentation";
import type { SemanticLayer } from "@/lib/semantic-layer";
import { applyAction } from "@/lib/ai/apply-action";
import { buildCopilotContext, toProviderContext, type CopilotContext } from "@/lib/ai/context-builder";
import { actionEnvelope, type CopilotActionEnvelope } from "@/lib/ai/actions";
import { compatibleWidgetTypes } from "@/lib/dashboard-spec/edit-dashboard-spec";
import { missingColumnMessage, resolveColumn } from "@/lib/semantic-layer";
import { copilotOutputSchema, validateCopilotAction } from "@/lib/validation/copilot-actions";

export interface CopilotRequestContext {
  prompt: string;
  datasetProfile: DatasetProfile;
  semanticModel: SemanticLayer;
  dashboardSpec: DashboardSpec;
  viewState: DashboardViewState;
  presentationSpec?: PresentationSpec;
  messages?: ChatMessage[];
  copilotContext?: CopilotContext;
}

export interface CopilotResult {
  reply: string;
  action?: DashboardAction;
  actions?: DashboardAction[];
  actionEnvelopes?: CopilotActionEnvelope[];
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
  rows?: never;
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
                "update_widget_title",
                "add_widget",
                "update_widget",
                "remove_widget",
                "duplicate_widget",
                "change_chart_type",
                "add_filter",
                "add_or_update_filter",
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

function fieldLabel(profile: DatasetProfile, field?: string) {
  return profile.columns.find((column) => column.normalizedName === field)?.displayName ?? field ?? "campo";
}

function chartWidgets(spec: DashboardSpec) {
  return spec.widgets.filter((widget) => compatibleWidgetTypes(widget).length > 1);
}

function widgetByText(spec: DashboardSpec, text: string) {
  const normalized = normalize(text);
  return spec.widgets.find((widget) => normalized.includes(normalize(widget.title)) || normalized.includes(normalize(widget.id)));
}

function preferredWidget(spec: DashboardSpec, prompt: string, viewState?: DashboardViewState) {
  return (viewState?.highlightedWidgetId ? spec.widgets.find((widget) => widget.id === viewState.highlightedWidgetId) : undefined) ?? widgetByText(spec, prompt) ?? chartWidgets(spec)[0] ?? spec.widgets[0];
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
    config: { format: options.format ?? "number", compact: true, generatedBy: "copilot" },
    position: nextWidgetPosition(context.dashboardSpec)
  } satisfies DashboardWidget;
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
  return match?.[1]?.trim().split(/\s+/).slice(0, 4).join(" ");
}

function requestedColumns(prompt: string, context: CopilotRequestContext) {
  const text = normalize(prompt);
  const direct = context.datasetProfile.columns.filter((column) => {
    const names = [column.normalizedName, column.originalName, column.displayName].map(normalize);
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

function availableContext(context: CopilotRequestContext) {
  return {
    datasetProfile: context.datasetProfile,
    semanticModel: context.semanticModel
  };
}

function noColumnAction(label: string, context: CopilotRequestContext) {
  return { reply: missingColumnMessage(label, context.datasetProfile), envelopes: [] };
}

function planLocalActions(context: CopilotRequestContext): { reply: string; envelopes: CopilotActionEnvelope[]; warnings?: string[] } {
  const prompt = normalize(context.prompt);
  const target = preferredWidget(context.dashboardSpec, context.prompt, context.viewState);

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

  if ((prompt.includes("muestra") || prompt.includes("mostrar") || prompt.includes("solo")) && prompt.includes("columna")) {
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

  if (prompt.includes("ejecutivo")) {
    const kpis = context.dashboardSpec.widgets.filter((widget) => widget.type === "kpi_card").map((widget) => widget.id);
    const summary = firstWidgetByType(context.dashboardSpec, "insight_text") ?? context.dashboardSpec.widgets.find((widget) => widget.title.toLowerCase().includes("resumen"));
    const actions: DashboardAction[] = [
      { type: "update_dashboard_title", title: context.dashboardSpec.title.replace(/^Dashboard de /, "Vista Ejecutiva de ") },
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
    const value = filterValue(context.prompt);
    if (!resolved.matchedColumn || !value) {
      return { reply: "Puedo aplicar filtros, pero necesito una columna y un valor claros. Por ejemplo: filtra Pais Chile.", envelopes: [] };
    }
    const action: DashboardAction = { type: "add_or_update_filter", filter: { field: resolved.matchedColumn.normalizedName, operator: "in", value: [value] } };
    return { reply: `Aplique filtro sobre "${resolved.matchedColumn.originalName}" con valor "${value}".`, envelopes: [actionEnvelope(action, resolved.reason, resolved.confidence)] };
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
      const widget = createAnalysisWidget(context, { dimension: field, title: `Analisis por ${fieldLabel(context.datasetProfile, field)}` });
      if (widget) actions.push({ type: "add_widget", widget });
    }
    return {
      reply: `Analice por ${fieldLabel(context.datasetProfile, field)} usando la columna real "${resolved.matchedColumn.originalName}".`,
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
      envelopes: [actionEnvelope({ type: "generate_presentation", options: { theme: "executive", durationMinutes: 5, detailLevel: "summary" } }, "Presentacion solicitada.", 0.78)]
    };
  }

  return {
    reply: "Puedo modificar el dashboard con acciones validadas: agregar graficos por columnas reales, aplicar filtros, cambiar titulos, comparar periodos, generar insights o preparar presentacion. Prueba: 'pon las regiones', 'ventas por vendedor' o 'filtra Pais Chile'.",
    envelopes: []
  };
}

function applyValidatedActions(input: CopilotRequestContext, envelopes: CopilotActionEnvelope[], source: "mock" | "provider", baseReply: string, warnings: string[] = []): CopilotResult {
  let nextDashboard = input.dashboardSpec;
  let nextViewState = input.viewState;
  let nextPresentation = input.presentationSpec;
  const appliedActions: DashboardAction[] = [];
  const appliedEnvelopes: CopilotActionEnvelope[] = [];
  const messages: string[] = [];

  for (const envelope of envelopes) {
    if (envelope.requiresConfirmation) {
      warnings.push(`La accion ${envelope.type} requiere confirmacion.`);
      continue;
    }
    const validation = validateCopilotAction(envelope.action, { datasetProfile: input.datasetProfile, semanticModel: input.semanticModel, dashboardSpec: nextDashboard, viewState: nextViewState });
    if (!validation.success) {
      warnings.push(validation.error);
      continue;
    }
    if (validation.action.type === "generate_presentation") {
      nextPresentation = input.presentationSpec;
      appliedActions.push(validation.action);
      appliedEnvelopes.push(envelope);
      messages.push("La presentacion se puede regenerar desde el constructor interactivo.");
      continue;
    }
    const applied = applyAction(nextDashboard, nextViewState, validation.action);
    nextDashboard = applied.spec;
    nextViewState = applied.viewState;
    appliedActions.push(validation.action);
    appliedEnvelopes.push(envelope);
    messages.push(applied.message);
  }

  return {
    reply: [baseReply, ...messages].filter(Boolean).join(" "),
    action: appliedActions[0],
    actions: appliedActions,
    actionEnvelopes: appliedEnvelopes,
    warnings,
    rejectedActionReason: warnings[0],
    updatedDashboardSpec: nextDashboard,
    updatedViewState: nextViewState,
    updatedPresentationSpec: nextPresentation,
    source
  };
}

export function handleCopilotMessage(input: HandleCopilotMessageInput): CopilotResult {
  const source = input.source ?? "mock";
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
  return handleCopilotMessage({ ...context, source: "provider", providerReply: parsed.data.reply, proposedActions: [parsed.data.action] });
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
