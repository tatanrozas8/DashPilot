import type { DashboardAction } from "@/types/dashboard";

export interface CopilotActionEnvelope {
  type: DashboardAction["type"];
  action: DashboardAction;
  payload?: unknown;
  reason: string;
  confidence: number;
  requiresConfirmation?: boolean;
  target?: string;
  targetType?: string;
  targetId?: string;
  changesDataLogic: boolean;
  changesVisualOnly: boolean;
}

function changesDataLogic(action: DashboardAction) {
  if (action.type === "update_widget") return Boolean(action.changes.query);
  if (action.type === "replace_widget") return Boolean(action.widget.query);
  return ["add_widget", "add_filter", "add_or_update_filter", "update_filter", "remove_filter", "clear_filters", "create_calculated_metric", "sort_table", "group_by"].includes(action.type);
}

function changesVisualOnly(action: DashboardAction) {
  if (action.type === "update_widget_visual_config") return true;
  if (action.type === "change_chart_type" || action.type === "resize_widget" || action.type === "move_widget" || action.type === "reorder_widgets" || action.type === "update_dashboard_design") return true;
  if (action.type === "update_widget") return Boolean(action.changes.config || action.changes.title || action.changes.type || action.changes.position) && !action.changes.query;
  return false;
}

function targetType(action: DashboardAction) {
  if (action.type === "select_target") return action.targetType;
  if ("widgetId" in action) return "widget";
  if (action.type.includes("filter")) return "filter";
  if (action.type.includes("presentation") || action.type.includes("slide")) return "presentation";
  return action.type.includes("dashboard") ? "dashboard" : undefined;
}

export function actionEnvelope(action: DashboardAction, reason: string, confidence = 0.78, requiresConfirmation = false): CopilotActionEnvelope {
  return {
    type: action.type,
    action,
    payload: "widget" in action ? action.widget : "filter" in action ? action.filter : "changes" in action ? action.changes : "visualConfig" in action ? action.visualConfig : undefined,
    reason,
    confidence,
    requiresConfirmation,
    target: "widgetId" in action ? action.widgetId : "field" in action ? action.field : undefined,
    targetType: targetType(action),
    targetId: "widgetId" in action ? action.widgetId : "targetId" in action ? action.targetId : undefined,
    changesDataLogic: changesDataLogic(action),
    changesVisualOnly: changesVisualOnly(action)
  };
}
