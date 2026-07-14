import type { DashboardAction } from "@/types/dashboard";

export interface CopilotActionEnvelope {
  type: DashboardAction["type"];
  action: DashboardAction;
  payload?: unknown;
  reason: string;
  confidence: number;
  requiresConfirmation?: boolean;
  target?: string;
}

export function actionEnvelope(action: DashboardAction, reason: string, confidence = 0.78, requiresConfirmation = false): CopilotActionEnvelope {
  return {
    type: action.type,
    action,
    payload: "widget" in action ? action.widget : "filter" in action ? action.filter : "changes" in action ? action.changes : undefined,
    reason,
    confidence,
    requiresConfirmation,
    target: "widgetId" in action ? action.widgetId : "field" in action ? action.field : undefined
  };
}
