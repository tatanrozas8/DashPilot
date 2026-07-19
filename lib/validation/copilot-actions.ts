import { z } from "zod";
import type { DatasetProfile } from "@/types/dataset";
import type { DashboardAction, DashboardSpec, DashboardViewState } from "@/types/dashboard";
import type { SemanticLayer } from "@/lib/semantic-layer";
import { compatibleWidgetTypes } from "@/lib/dashboard-spec/edit-dashboard-spec";
import { dashboardFilterSchema, dashboardPageSchema, dashboardQuerySchema, dashboardWidgetVisualConfigSchema } from "@/lib/validation/schemas";

const widgetTypeSchema = z.enum(["kpi_card", "line_chart", "bar_chart", "area_chart", "donut_chart", "scatter_plot", "map", "table", "insight_text"]);
const aggregationSchema = z.enum(["sum", "avg", "count", "count_distinct", "min", "max"]);
const dashboardDesignSchema = z.object({
  density: z.enum(["compact", "comfortable"]).optional(),
  accentColor: z.enum(["indigo", "emerald", "sky", "slate"]).optional(),
  cardStyle: z.enum(["soft", "bordered"]).optional(),
  chartPalette: z.enum(["default", "business", "contrast"]).optional()
});

const dashboardWidgetSchema = z.object({
  id: z.string().min(1),
  type: widgetTypeSchema,
  title: z.string().min(1),
  description: z.string().optional(),
  query: dashboardQuerySchema.optional(),
  config: z.record(z.string(), z.unknown()).default({}),
  position: z.object({
    x: z.number(),
    y: z.number(),
    w: z.number(),
    h: z.number()
  })
});

const widgetPositionSchema = z.object({
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number()
});

const presentationSlideSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  subtitle: z.string().optional(),
  narrative: z.string().optional(),
  speakerNotes: z.string().optional(),
  layout: z.enum(["cover", "executive_summary", "kpi_grid", "chart_focus", "comparison", "ranking", "table_detail", "insights"]),
  widgetIds: z.array(z.string()),
  viewState: z.record(z.string(), z.unknown()).optional()
});

const widgetChangesSchema = z.object({
  type: widgetTypeSchema.optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  query: dashboardQuerySchema.optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  position: z.object({
    x: z.number(),
    y: z.number(),
    w: z.number(),
    h: z.number()
  }).optional()
});
const targetTypeSchema = z.enum(["dashboard", "widget", "kpi", "table", "filter", "presentation", "slide", "none"]);

export const copilotActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("add_widget"), widget: dashboardWidgetSchema }),
  z.object({ type: z.literal("replace_widget"), widgetId: z.string(), widget: dashboardWidgetSchema }),
  z.object({ type: z.literal("select_target"), targetType: targetTypeSchema, targetId: z.string().optional() }),
  z.object({ type: z.literal("clear_selected_target") }),
  z.object({ type: z.literal("undo_last_action") }),
  z.object({ type: z.literal("update_dashboard_title"), title: z.string().min(1).max(120) }),
  z.object({ type: z.literal("update_dashboard_subtitle"), subtitle: z.string().max(240) }),
  z.object({ type: z.literal("update_dashboard_design"), design: dashboardDesignSchema }),
  z.object({ type: z.literal("set_dashboard_pages"), pages: z.array(dashboardPageSchema).optional() }),
  z.object({ type: z.literal("update_widget_title"), widgetId: z.string(), title: z.string().min(1).max(120) }),
  z.object({ type: z.literal("update_widget"), widgetId: z.string(), changes: widgetChangesSchema }),
  z.object({ type: z.literal("update_widget_visual_config"), widgetId: z.string(), visualConfig: dashboardWidgetVisualConfigSchema }),
  z.object({ type: z.literal("remove_widget"), widgetId: z.string() }),
  z.object({ type: z.literal("duplicate_widget"), widgetId: z.string() }),
  z.object({ type: z.literal("change_chart_type"), widgetId: z.string(), chartType: widgetTypeSchema }),
  z.object({ type: z.literal("resize_widget"), widgetId: z.string(), position: widgetPositionSchema }),
  z.object({ type: z.literal("move_widget"), sourceWidgetId: z.string(), targetWidgetId: z.string() }),
  z.object({ type: z.literal("show_widget_data"), widgetId: z.string() }),
  z.object({ type: z.literal("add_filter"), filter: dashboardFilterSchema }),
  z.object({ type: z.literal("add_or_update_filter"), filter: dashboardFilterSchema }),
  z.object({ type: z.literal("update_filter"), filter: dashboardFilterSchema }),
  z.object({ type: z.literal("remove_filter"), field: z.string() }),
  z.object({ type: z.literal("clear_filters") }),
  z.object({ type: z.literal("show_data_explorer") }),
  z.object({ type: z.literal("search_table"), query: z.string() }),
  z.object({ type: z.literal("select_visible_columns"), columns: z.array(z.string()).min(1) }),
  z.object({ type: z.literal("sort_table"), field: z.string(), direction: z.enum(["asc", "desc"]) }),
  z.object({ type: z.literal("group_by"), fields: z.array(z.string()).min(1) }),
  z.object({ type: z.literal("explain_dataset") }),
  z.object({ type: z.literal("explain_column"), field: z.string() }),
  z.object({ type: z.literal("explain_widget"), widgetId: z.string() }),
  z.object({ type: z.literal("focus_widget"), widgetId: z.string() }),
  z.object({ type: z.literal("reorder_widgets"), widgetIds: z.array(z.string()).min(1) }),
  z.object({ type: z.literal("create_calculated_metric"), id: z.string().min(1), title: z.string().min(1), formula: z.string().min(1), operands: z.array(z.string()).min(1) }),
  z.object({ type: z.literal("generate_insight"), widgetId: z.string().optional(), content: z.string().min(1) }),
  z.object({ type: z.literal("update_view_state"), viewState: z.record(z.string(), z.unknown()) }),
  z.object({ type: z.literal("create_presentation"), options: z.object({
    theme: z.enum(["executive", "commercial", "financial", "operations"]).optional(),
    durationMinutes: z.union([z.literal(3), z.literal(5), z.literal(10)]).optional(),
    detailLevel: z.enum(["summary", "intermediate", "deep"]).optional()
  }).optional() }),
  z.object({ type: z.literal("add_slide"), slide: presentationSlideSchema }),
  z.object({ type: z.literal("generate_speaker_notes") }),
  z.object({ type: z.literal("ask_clarification"), question: z.string().min(1) }),
  z.object({ type: z.literal("explain_limitation"), message: z.string().min(1) }),
  z.object({
    type: z.literal("generate_presentation"),
    options: z.object({
      theme: z.enum(["executive", "commercial", "financial", "operations"]).optional(),
      durationMinutes: z.union([z.literal(3), z.literal(5), z.literal(10)]).optional(),
      detailLevel: z.enum(["summary", "intermediate", "deep"]).optional()
    })
  })
]);

export const copilotOutputSchema = z.object({
  reply: z.string().min(1),
  action: copilotActionSchema.nullable().optional()
});

export interface CopilotValidationContext {
  datasetProfile: DatasetProfile;
  semanticModel: SemanticLayer;
  dashboardSpec: DashboardSpec;
  viewState: DashboardViewState;
}

function queryFields(query: unknown) {
  const parsed = dashboardQuerySchema.safeParse(query);
  if (!parsed.success) return [];
  return [
    parsed.data.metric?.field,
    parsed.data.x?.field,
    parsed.data.seriesBy,
    ...(parsed.data.groupBy ?? []),
    ...(parsed.data.filters ?? []).map((filter) => filter.field)
  ].filter(Boolean) as string[];
}

function configFields(config: Record<string, unknown> | undefined) {
  const columns = config?.columns;
  return Array.isArray(columns) ? columns.filter((column): column is string => typeof column === "string") : [];
}

function fieldsForAction(action: DashboardAction) {
  if (action.type === "add_filter" || action.type === "add_or_update_filter" || action.type === "update_filter") return [action.filter.field];
  if (action.type === "remove_filter") return [action.field];
  if (action.type === "select_visible_columns") return action.columns;
  if (action.type === "sort_table") return [action.field];
  if (action.type === "group_by") return action.fields;
  if (action.type === "explain_column") return [action.field];
  if (action.type === "add_widget") return [...queryFields(action.widget.query), ...configFields(action.widget.config)];
  if (action.type === "replace_widget") return [...queryFields(action.widget.query), ...configFields(action.widget.config)];
  if (action.type === "update_widget") return [...queryFields(action.changes.query), ...configFields(action.changes.config)];
  if (action.type === "create_calculated_metric") return action.operands;
  if (action.type === "update_view_state") {
    const filters = action.viewState.filters;
    return Array.isArray(filters) ? filters.map((filter) => typeof filter === "object" && filter && "field" in filter ? String(filter.field) : "") : [];
  }
  return [];
}

export function validateCopilotAction(rawAction: unknown, context: CopilotValidationContext): { success: true; action: DashboardAction } | { success: false; error: string } {
  const parsed = copilotActionSchema.safeParse(rawAction);
  if (!parsed.success) return { success: false, error: "La accion no coincide con el schema permitido." };

  const action = parsed.data as DashboardAction;
  const columns = new Set(context.datasetProfile.columns.map((column) => column.normalizedName));
  const widgets = new Map(context.dashboardSpec.widgets.map((widget) => [widget.id, widget]));

  const missingField = fieldsForAction(action).find((field) => field && !columns.has(field));
  if (missingField) return { success: false, error: `La accion referencia una columna inexistente: ${missingField}.` };

  if (["update_widget", "update_widget_visual_config", "update_widget_title", "replace_widget", "remove_widget", "duplicate_widget", "change_chart_type", "explain_widget", "focus_widget", "resize_widget", "show_widget_data"].includes(action.type)) {
    const widgetId = "widgetId" in action ? action.widgetId : undefined;
    if (!widgetId || !widgets.has(widgetId)) return { success: false, error: "La accion referencia un widget inexistente." };
  }

  if (action.type === "reorder_widgets") {
    const missingWidget = action.widgetIds.find((widgetId) => !widgets.has(widgetId));
    if (missingWidget) return { success: false, error: `La accion intenta reordenar un widget inexistente: ${missingWidget}.` };
  }

  if (action.type === "move_widget") {
    if (!widgets.has(action.sourceWidgetId) || !widgets.has(action.targetWidgetId)) return { success: false, error: "La accion intenta mover un widget inexistente." };
  }

  if (action.type === "add_slide") {
    const missingWidget = action.slide.widgetIds.find((widgetId) => !widgets.has(widgetId));
    if (missingWidget) return { success: false, error: `La slide referencia un widget inexistente: ${missingWidget}.` };
  }

  if (action.type === "create_calculated_metric" && !/^[a-zA-Z0-9_\s+\-*/().]+$/.test(action.formula)) {
    return { success: false, error: "La formula calculada contiene caracteres no permitidos." };
  }

  if (action.type === "add_widget" && widgets.has(action.widget.id)) {
    return { success: false, error: "La accion intenta crear un widget con id duplicado." };
  }

  if (action.type === "replace_widget" && widgets.has(action.widget.id) && action.widget.id !== action.widgetId) {
    return { success: false, error: "La accion intenta reemplazar con un id duplicado." };
  }

  if (action.type === "set_dashboard_pages" && action.pages?.length) {
    const pageIds = new Set<string>();
    for (const page of action.pages) {
      if (pageIds.has(page.id)) return { success: false, error: `La accion intenta crear una pagina duplicada: ${page.id}.` };
      pageIds.add(page.id);
      const missingWidget = page.widgetIds.find((widgetId) => !widgets.has(widgetId));
      if (missingWidget) return { success: false, error: `La pagina ${page.title} referencia un widget inexistente: ${missingWidget}.` };
    }
  }

  if (action.type === "select_target" && action.targetId && !widgets.has(action.targetId) && action.targetType !== "dashboard") {
    return { success: false, error: "La accion intenta seleccionar un objetivo inexistente." };
  }

  if (action.type === "update_widget_visual_config") {
    const widget = widgets.get(action.widgetId);
    if (action.visualConfig.orientation && widget?.type !== "bar_chart") {
      return { success: false, error: "Este tipo de grafico no admite orientacion. Puedo convertirlo a barras verticales si quieres." };
    }
  }

  if (action.type === "change_chart_type") {
    const widget = widgets.get(action.widgetId);
    if (widget && !compatibleWidgetTypes(widget).includes(action.chartType)) {
      return { success: false, error: "El tipo de grafico no es compatible con el widget." };
    }
  }

  if (action.type === "update_widget" && action.changes.type) {
    const widget = widgets.get(action.widgetId);
    if (widget && !compatibleWidgetTypes(widget).includes(action.changes.type)) {
      return { success: false, error: "El tipo de grafico no es compatible con el widget." };
    }
  }

  if (action.type === "update_widget" && action.changes.query?.metric?.aggregation && !aggregationSchema.safeParse(action.changes.query.metric.aggregation).success) {
    return { success: false, error: "La agregacion solicitada no es valida." };
  }

  return { success: true, action };
}
