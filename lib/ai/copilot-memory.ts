import type { ChatMessage } from "@/types/ai";
import type { DashboardAction, DashboardSpec } from "@/types/dashboard";
import { classifyIntent } from "@/lib/ai/intent-classifier";
import type { ActionPlan } from "@/lib/ai/action-plan";

export interface CopilotInstructionMemory {
  lastUserMessage?: string;
  lastActionableInstruction?: string;
  lastActionPlan?: ActionPlan;
  lastExecutedActions: DashboardAction[];
  lastTargetWidgetId?: string;
  lastSuccessfulDashboardSpec?: DashboardSpec;
  lastFailedAction?: DashboardAction;
  undoStack: DashboardSpec[];
}

function isUserMessage(message: ChatMessage): message is ChatMessage & { role: "user" } {
  return message.role === "user" && typeof message.content === "string";
}

function isActionableUserMessage(content: string) {
  const classification = classifyIntent(content);
  if (classification.intent === "undo") return false;
  if (classification.usesPreviousActionableInstruction) return false;
  if (classification.intent === "correction_without_action") return false;
  return classification.hasExecutableAction || /\b(grafico|ventas|region|canal|eje x|eje y|colores|barras|linea|tabla|kpi)\b/i.test(content);
}

export function buildCopilotMemory(input: {
  messages?: ChatMessage[];
  dashboardSpec: DashboardSpec;
  lastActionPlan?: ActionPlan;
  lastExecutedActions?: DashboardAction[];
  undoStack?: DashboardSpec[];
}): CopilotInstructionMemory {
  const userMessages = (input.messages ?? []).filter(isUserMessage);
  const lastUserMessage = userMessages.at(-1)?.content;
  const lastActionableInstruction = [...userMessages].reverse().find((message) => isActionableUserMessage(message.content))?.content;
  const lastExecutedActions = input.lastExecutedActions ?? [];
  const lastTargetWidgetId = lastExecutedActions
    .map((action) => ("widgetId" in action ? action.widgetId : action.type === "add_widget" ? action.widget.id : undefined))
    .find((widgetId): widgetId is string => Boolean(widgetId));

  return {
    lastUserMessage,
    lastActionableInstruction,
    lastActionPlan: input.lastActionPlan,
    lastExecutedActions,
    lastTargetWidgetId,
    lastSuccessfulDashboardSpec: input.dashboardSpec,
    lastFailedAction: undefined,
    undoStack: input.undoStack ?? []
  };
}

export function retrieveRelevantPreviousInstruction(input: {
  currentMessage: string;
  memory: CopilotInstructionMemory;
}) {
  const classification = classifyIntent(input.currentMessage);
  if (!classification.usesPreviousActionableInstruction) return undefined;
  return input.memory.lastActionableInstruction;
}
