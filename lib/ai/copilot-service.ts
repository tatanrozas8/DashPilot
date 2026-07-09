import type { ChatMessage } from "@/types/ai";
import type { DatasetProfile } from "@/types/dataset";
import type { DashboardAction, DashboardSpec, DashboardViewState, DashboardWidget } from "@/types/dashboard";
import type { SemanticLayer } from "@/lib/semantic-layer";
import { compatibleWidgetTypes } from "@/lib/dashboard-spec/edit-dashboard-spec";
import { copilotOutputSchema, validateCopilotAction } from "@/lib/validation/copilot-actions";

export interface CopilotRequestContext {
  prompt: string;
  datasetProfile: DatasetProfile;
  semanticModel: SemanticLayer;
  dashboardSpec: DashboardSpec;
  viewState: DashboardViewState;
}

export interface CopilotResult {
  reply: string;
  action?: DashboardAction;
  rejectedActionReason?: string;
  source: "mock" | "provider";
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
              enum: ["add_widget", "update_widget", "remove_widget", "change_chart_type", "add_filter", "clear_filters", "explain_widget"]
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

function chartWidgets(spec: DashboardSpec) {
  return spec.widgets.filter((widget) => compatibleWidgetTypes(widget).length > 1);
}

function widgetByText(spec: DashboardSpec, text: string) {
  const normalized = normalize(text);
  return spec.widgets.find((widget) => normalized.includes(normalize(widget.title)) || normalized.includes(normalize(widget.id)));
}

function preferredWidget(spec: DashboardSpec, prompt: string) {
  return widgetByText(spec, prompt) ?? chartWidgets(spec)[0] ?? spec.widgets[0];
}

function nextWidgetId(spec: DashboardSpec) {
  const ids = new Set(spec.widgets.map((widget) => widget.id));
  let index = spec.widgets.length + 1;
  let id = `ai_widget_${index}`;
  while (ids.has(id)) {
    index += 1;
    id = `ai_widget_${index}`;
  }
  return id;
}

function createWidget(context: CopilotRequestContext, dimension?: string): DashboardWidget | undefined {
  const metric = firstExisting([
    context.semanticModel.primaryMetric?.field,
    context.datasetProfile.detectedMetricColumns[0]
  ], context.datasetProfile);
  const groupBy = firstExisting([
    dimension,
    context.semanticModel.primaryDimension?.field,
    context.datasetProfile.detectedDimensionColumns[0]
  ], context.datasetProfile);
  if (!metric || !groupBy) return undefined;

  return {
    id: nextWidgetId(context.dashboardSpec),
    type: "bar_chart",
    title: `Top ${groupBy}`,
    query: { metric: { field: metric, aggregation: "sum" }, groupBy: [groupBy], orderBy: { field: "value", direction: "desc" }, limit: 5 },
    config: { format: "number", compact: true },
    position: { x: 0, y: Math.max(0, ...context.dashboardSpec.widgets.map((widget) => widget.position.y + widget.position.h)), w: 6, h: 3 }
  };
}

function filterValue(prompt: string) {
  const match = prompt.match(/(?:region|zona|territorio|cliente|vendedor|producto|categoria|estado)\s+([a-z0-9\s]+)/i);
  return match?.[1]?.trim().split(/\s+/).slice(0, 3).join(" ");
}

function mockAction(context: CopilotRequestContext): { reply: string; action?: DashboardAction } {
  const prompt = normalize(context.prompt);
  const target = preferredWidget(context.dashboardSpec, context.prompt);

  if ((prompt.includes("limpia") || prompt.includes("borra") || prompt.includes("clear")) && prompt.includes("filtro")) {
    return { reply: "Limpie los filtros activos para volver a la vista general.", action: { type: "clear_filters" } };
  }

  if (prompt.includes("explica") || prompt.includes("explicame")) {
    const widget = target ?? context.dashboardSpec.widgets[0];
    if (!widget) return { reply: "No encontre un widget para explicar." };
    return { reply: `Este widget muestra ${widget.title}. Lo resalte para revisar su metrica, dimension y lectura principal.`, action: { type: "explain_widget", widgetId: widget.id } };
  }

  if ((prompt.includes("barra") || prompt.includes("barras")) && target) {
    return { reply: `Cambie ${target.title} a grafico de barras.`, action: { type: "change_chart_type", widgetId: target.id, chartType: "bar_chart" } };
  }

  if ((prompt.includes("linea") || prompt.includes("tendencia")) && target) {
    return { reply: `Cambie ${target.title} a grafico de linea.`, action: { type: "change_chart_type", widgetId: target.id, chartType: "line_chart" } };
  }

  if ((prompt.includes("elimina") || prompt.includes("quita")) && target) {
    return { reply: `Quite el widget ${target.title} del dashboard.`, action: { type: "remove_widget", widgetId: target.id } };
  }

  if (prompt.includes("filtro") || prompt.includes("solo ")) {
    const field = firstExisting([
      context.semanticModel.primaryGeography?.field,
      context.semanticModel.primaryClient?.field,
      context.semanticModel.primarySeller?.field,
      context.semanticModel.primaryCategory?.field,
      context.datasetProfile.detectedDimensionColumns[0]
    ], context.datasetProfile);
    const value = filterValue(prompt) ?? (prompt.includes("norte") ? "Norte" : undefined);
    if (field && value) return { reply: `Aplique un filtro sobre ${field}: ${value}.`, action: { type: "add_filter", filter: { field, operator: "in", value: [value] } } };
  }

  if (prompt.includes("promedio") || prompt.includes("media")) {
    const widget = target;
    if (widget?.query?.metric) {
      return {
        reply: `Cambie la agregacion de ${widget.title} a promedio.`,
        action: { type: "update_widget", widgetId: widget.id, changes: { query: { ...widget.query, metric: { ...widget.query.metric, aggregation: "avg" } } } }
      };
    }
  }

  if (prompt.includes("top")) {
    const limit = Number(prompt.match(/\b(\d{1,2})\b/)?.[1] ?? 5);
    if (target?.query) {
      return { reply: `Limite ${target.title} al top ${limit}.`, action: { type: "update_widget", widgetId: target.id, changes: { query: { ...target.query, limit } } } };
    }
  }

  if (prompt.includes("agrega") || prompt.includes("anade") || prompt.includes("nuevo grafico")) {
    const dimension = context.semanticModel.primaryProduct?.field ?? context.semanticModel.primaryCategory?.field ?? context.semanticModel.primaryDimension?.field;
    const widget = createWidget(context, dimension);
    if (widget) return { reply: `Agregue un widget basado en ${widget.query?.groupBy?.[0]} y la metrica principal.`, action: { type: "add_widget", widget } };
  }

  return { reply: "Puedo cambiar tipos de grafico, agregar widgets, ajustar metricas, aplicar o limpiar filtros y explicar widgets usando acciones validadas." };
}

export function createMockCopilotResponse(context: CopilotRequestContext): CopilotResult {
  const result = mockAction(context);
  if (!result.action) return { reply: result.reply, source: "mock" };
  const validation = validateCopilotAction(result.action, context);
  if (!validation.success) return { reply: validation.error, rejectedActionReason: validation.error, source: "mock" };
  return { reply: result.reply, action: validation.action, source: "mock" };
}

export function parseCopilotProviderOutput(raw: unknown, context: CopilotRequestContext): CopilotResult {
  const parsed = copilotOutputSchema.safeParse(raw);
  if (!parsed.success) {
    return { reply: "La respuesta del proveedor no paso la validacion estructurada.", rejectedActionReason: "output_schema", source: "provider" };
  }
  if (!parsed.data.action) return { reply: parsed.data.reply, source: "provider" };
  const validation = validateCopilotAction(parsed.data.action, context);
  if (!validation.success) return { reply: validation.error, rejectedActionReason: validation.error, source: "provider" };
  return { reply: parsed.data.reply, action: validation.action, source: "provider" };
}

export function buildCopilotPrompt(context: CopilotRequestContext) {
  return [
    "Eres el Copiloto IA de DashPilot. Devuelve solo acciones estructuradas validas.",
    "Nunca inventes columnas ni widgets. Solo usa los IDs y campos entregados.",
    "No puedes modificar React ni UI directamente. Solo DashboardSpec o DashboardViewState.",
    JSON.stringify({
      userPrompt: context.prompt,
      datasetProfile: {
        fileName: context.datasetProfile.fileName,
        columns: context.datasetProfile.columns.map((column) => ({ field: column.normalizedName, type: column.inferredType, semanticType: column.semanticType })),
        detectedMetricColumns: context.datasetProfile.detectedMetricColumns,
        detectedDimensionColumns: context.datasetProfile.detectedDimensionColumns,
        detectedDateColumns: context.datasetProfile.detectedDateColumns,
        detectedGeoColumns: context.datasetProfile.detectedGeoColumns
      },
      semanticModel: context.semanticModel,
      dashboard: {
        id: context.dashboardSpec.id,
        title: context.dashboardSpec.title,
        widgets: context.dashboardSpec.widgets.map((widget) => ({ id: widget.id, title: widget.title, type: widget.type, query: widget.query }))
      },
      viewState: context.viewState
    })
  ].join("\n");
}

export function assistantMessage(content: string, structuredAction?: DashboardAction): ChatMessage {
  return { id: crypto.randomUUID(), role: "assistant", content, structuredAction, createdAt: new Date().toISOString() };
}
