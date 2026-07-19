import { z } from "zod";
import type { DashboardAction, DashboardSpec, DashboardWidget } from "@/types/dashboard";
import { dashboardFilterSchema, dashboardQuerySchema, dashboardWidgetVisualConfigSchema } from "@/lib/validation/schemas";
import type { CommandEnvelope, CommandToolDefinition, CopilotToolName, ToolArgumentMap } from "@/lib/copilot-command-bus/types";

const emptySchema = z.object({}).strict();
const widgetIdSchema = z.object({ widgetId: z.string().min(1) }).strict();
const dashboardWidgetSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["kpi_card", "line_chart", "bar_chart", "area_chart", "donut_chart", "scatter_plot", "map", "table", "insight_text"]),
  title: z.string().min(1),
  description: z.string().optional(),
  query: dashboardQuerySchema.optional(),
  lineage: z.custom<DashboardWidget["lineage"]>().optional(),
  config: z.record(z.string(), z.unknown()).default({}),
  position: z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() })
}).strict();
const widgetChangesSchema = z.object({
  type: z.enum(["kpi_card", "line_chart", "bar_chart", "area_chart", "donut_chart", "scatter_plot", "map", "table", "insight_text"]).optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  query: dashboardQuerySchema.optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  position: z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() }).optional()
}).strict();

function widgetBefore(spec: DashboardSpec, widgetId: string): DashboardAction | null {
  const widget = spec.widgets.find((item) => item.id === widgetId);
  return widget ? { type: "replace_widget", widgetId, widget } : null;
}

export const commandToolRegistry = {
  "dashboard.createWidget": {
    tool: "dashboard.createWidget",
    riskLevel: "medium",
    requiresConfirmation: false,
    schema: z.object({ widget: dashboardWidgetSchema }).strict(),
    toAction: (arguments_) => ({ type: "add_widget", widget: arguments_.widget }),
    inverse: (_before, _viewState, arguments_) => ({ type: "remove_widget", widgetId: arguments_.widget.id })
  },
  "dashboard.updateWidget": {
    tool: "dashboard.updateWidget",
    riskLevel: "medium",
    requiresConfirmation: false,
    schema: z.object({ widgetId: z.string().min(1), changes: widgetChangesSchema }).strict(),
    toAction: (arguments_) => ({ type: "update_widget", widgetId: arguments_.widgetId, changes: arguments_.changes }),
    inverse: (before, _viewState, arguments_) => widgetBefore(before, arguments_.widgetId)
  },
  "dashboard.replaceWidget": {
    tool: "dashboard.replaceWidget",
    riskLevel: "medium",
    requiresConfirmation: false,
    schema: z.object({ widgetId: z.string().min(1), widget: dashboardWidgetSchema }).strict(),
    toAction: (arguments_) => ({ type: "replace_widget", widgetId: arguments_.widgetId, widget: arguments_.widget }),
    inverse: (before, _viewState, arguments_) => widgetBefore(before, arguments_.widgetId)
  },
  "dashboard.removeWidget": {
    tool: "dashboard.removeWidget",
    riskLevel: "high",
    requiresConfirmation: true,
    schema: widgetIdSchema,
    toAction: (arguments_) => ({ type: "remove_widget", widgetId: arguments_.widgetId }),
    inverse: (before, _viewState, arguments_) => {
      const widget = before.widgets.find((item) => item.id === arguments_.widgetId);
      return widget ? { type: "add_widget", widget } : null;
    }
  },
  "dashboard.updateWidgetVisualConfig": {
    tool: "dashboard.updateWidgetVisualConfig",
    riskLevel: "low",
    requiresConfirmation: false,
    schema: z.object({ widgetId: z.string().min(1), visualConfig: dashboardWidgetVisualConfigSchema }).strict(),
    toAction: (arguments_) => ({ type: "update_widget_visual_config", widgetId: arguments_.widgetId, visualConfig: arguments_.visualConfig }),
    inverse: (before, _viewState, arguments_) => {
      const widget = before.widgets.find((item) => item.id === arguments_.widgetId);
      return widget ? { type: "update_widget_visual_config", widgetId: arguments_.widgetId, visualConfig: widget.config.visualConfig ?? {} } : null;
    }
  },
  "dashboard.updateWidgetQuery": {
    tool: "dashboard.updateWidgetQuery",
    riskLevel: "medium",
    requiresConfirmation: false,
    schema: z.object({ widgetId: z.string().min(1), query: dashboardQuerySchema }).strict(),
    toAction: (arguments_) => ({ type: "update_widget", widgetId: arguments_.widgetId, changes: { query: arguments_.query } }),
    inverse: (before, _viewState, arguments_) => widgetBefore(before, arguments_.widgetId)
  },
  "dashboard.addFilter": {
    tool: "dashboard.addFilter",
    riskLevel: "medium",
    requiresConfirmation: false,
    schema: z.object({ filter: dashboardFilterSchema }).strict(),
    toAction: (arguments_) => ({ type: "add_or_update_filter", filter: arguments_.filter }),
    inverse: (_before, viewState, arguments_) => viewState.filters.some((filter) => filter.field === arguments_.filter.field)
      ? { type: "add_or_update_filter", filter: viewState.filters.find((filter) => filter.field === arguments_.filter.field)! }
      : { type: "remove_filter", field: arguments_.filter.field }
  },
  "dashboard.removeFilter": {
    tool: "dashboard.removeFilter",
    riskLevel: "high",
    requiresConfirmation: true,
    schema: z.object({ field: z.string().min(1) }).strict(),
    toAction: (arguments_) => ({ type: "remove_filter", field: arguments_.field }),
    inverse: (_before, viewState, arguments_) => {
      const filter = viewState.filters.find((item) => item.field === arguments_.field);
      return filter ? { type: "add_or_update_filter", filter } : null;
    }
  },
  "dashboard.clearFilters": {
    tool: "dashboard.clearFilters",
    riskLevel: "high",
    requiresConfirmation: true,
    schema: emptySchema,
    toAction: () => ({ type: "clear_filters" }),
    inverse: (_before, viewState) => viewState.filters[0] ? { type: "update_view_state", viewState: { filters: viewState.filters, selectedDateRange: viewState.selectedDateRange } } : null
  },
  "dashboard.selectColumns": {
    tool: "dashboard.selectColumns",
    riskLevel: "low",
    requiresConfirmation: false,
    schema: z.object({ columns: z.array(z.string().min(1)).min(1) }).strict(),
    toAction: (arguments_) => ({ type: "select_visible_columns", columns: arguments_.columns })
  },
  "dashboard.reorderWidget": {
    tool: "dashboard.reorderWidget",
    riskLevel: "low",
    requiresConfirmation: false,
    schema: z.object({ widgetIds: z.array(z.string().min(1)).min(1) }).strict(),
    toAction: (arguments_) => ({ type: "reorder_widgets", widgetIds: arguments_.widgetIds }),
    inverse: (before) => ({ type: "reorder_widgets", widgetIds: before.widgets.map((widget) => widget.id) })
  },
  "dashboard.renameWidget": {
    tool: "dashboard.renameWidget",
    riskLevel: "low",
    requiresConfirmation: false,
    schema: z.object({ widgetId: z.string().min(1), title: z.string().min(1).max(120) }).strict(),
    toAction: (arguments_) => ({ type: "update_widget_title", widgetId: arguments_.widgetId, title: arguments_.title }),
    inverse: (before, _viewState, arguments_) => {
      const widget = before.widgets.find((item) => item.id === arguments_.widgetId);
      return widget ? { type: "update_widget_title", widgetId: arguments_.widgetId, title: widget.title } : null;
    }
  },
  "dashboard.renameDashboard": {
    tool: "dashboard.renameDashboard",
    riskLevel: "low",
    requiresConfirmation: false,
    schema: z.object({ title: z.string().min(1).max(120) }).strict(),
    toAction: (arguments_) => ({ type: "update_dashboard_title", title: arguments_.title }),
    inverse: (before) => ({ type: "update_dashboard_title", title: before.title })
  },
  "dashboard.updateDashboardSubtitle": {
    tool: "dashboard.updateDashboardSubtitle",
    riskLevel: "low",
    requiresConfirmation: false,
    schema: z.object({ subtitle: z.string().min(1).max(220) }).strict(),
    toAction: (arguments_) => ({ type: "update_dashboard_subtitle", subtitle: arguments_.subtitle }),
    inverse: (before) => ({ type: "update_dashboard_subtitle", subtitle: before.subtitle ?? "" })
  },
  "dashboard.updateDashboardDesign": {
    tool: "dashboard.updateDashboardDesign",
    riskLevel: "low",
    requiresConfirmation: false,
    schema: z.object({
      design: z.object({
        density: z.enum(["compact", "comfortable"]).optional(),
        accentColor: z.enum(["indigo", "emerald", "sky", "slate"]).optional(),
        cardStyle: z.enum(["soft", "bordered"]).optional(),
        chartPalette: z.enum(["default", "business", "contrast"]).optional()
      }).partial()
    }).strict(),
    toAction: (arguments_) => ({ type: "update_dashboard_design", design: arguments_.design }),
    inverse: (before) => ({ type: "update_dashboard_design", design: before.design ?? {} })
  },
  "presentation.createSlide": {
    tool: "presentation.createSlide",
    riskLevel: "medium",
    requiresConfirmation: false,
    schema: z.object({ slide: z.unknown() }).strict(),
    toAction: () => null
  },
  "presentation.updateSlide": {
    tool: "presentation.updateSlide",
    riskLevel: "medium",
    requiresConfirmation: false,
    schema: z.object({ slideId: z.string().min(1), changes: z.record(z.string(), z.unknown()) }).strict(),
    toAction: () => null
  },
  "presentation.removeSlide": {
    tool: "presentation.removeSlide",
    riskLevel: "high",
    requiresConfirmation: true,
    schema: z.object({ slideId: z.string().min(1) }).strict(),
    toAction: () => null
  },
  "control.undo": {
    tool: "control.undo",
    riskLevel: "low",
    requiresConfirmation: false,
    schema: emptySchema,
    toAction: () => ({ type: "undo_last_action" })
  },
  "control.redo": {
    tool: "control.redo",
    riskLevel: "low",
    requiresConfirmation: false,
    schema: emptySchema,
    toAction: () => null
  },
  "control.requestClarification": {
    tool: "control.requestClarification",
    riskLevel: "low",
    requiresConfirmation: false,
    schema: z.object({ question: z.string().min(1), options: z.array(z.string()).optional() }).strict(),
    toAction: (arguments_) => ({ type: "ask_clarification", question: arguments_.question })
  }
} satisfies { [K in CopilotToolName]: CommandToolDefinition<ToolArgumentMap[K]> };

export function knownCopilotTool(tool: string): tool is CopilotToolName {
  return Object.hasOwn(commandToolRegistry, tool);
}

export function toolDefinition<TTool extends CopilotToolName>(tool: TTool) {
  return commandToolRegistry[tool];
}

export function parseCommandArguments<TTool extends CopilotToolName>(envelope: CommandEnvelope<TTool>) {
  const definition = toolDefinition(envelope.tool);
  return definition.schema.safeParse(envelope.arguments);
}
