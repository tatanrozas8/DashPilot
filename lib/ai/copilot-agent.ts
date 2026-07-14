import type { ChatMessage } from "@/types/ai";
import type { DataRow, DatasetProfile } from "@/types/dataset";
import type { DashboardSpec, DashboardViewState } from "@/types/dashboard";
import type { PresentationSpec } from "@/types/presentation";
import type { SemanticLayer } from "@/lib/semantic-layer";
import { buildActionPlan, type ActionPlan } from "@/lib/ai/action-plan";
import { buildCopilotContext, type CopilotContext } from "@/lib/ai/context-builder";
import { buildCopilotMemory, retrieveRelevantPreviousInstruction, type CopilotInstructionMemory } from "@/lib/ai/copilot-memory";
import { classifyIntent, type IntentClassification } from "@/lib/ai/intent-classifier";

export interface CopilotAgentInput {
  prompt: string;
  rows?: DataRow[];
  datasetProfile: DatasetProfile;
  semanticModel: SemanticLayer;
  dashboardSpec: DashboardSpec;
  viewState: DashboardViewState;
  presentationSpec?: PresentationSpec;
  messages?: ChatMessage[];
  copilotContext?: CopilotContext;
}

export interface CopilotAgentLoopState {
  userMessage: string;
  context: CopilotContext;
  memory: CopilotInstructionMemory;
  classification: IntentClassification;
  previousInstruction?: string;
  actionPlan: ActionPlan;
  validation: { success: boolean; errors: string[] };
}

export function receiveUserMessage(prompt: string) {
  return prompt.trim();
}

export function buildContext(input: CopilotAgentInput) {
  return input.copilotContext ?? buildCopilotContext({
    rows: input.rows ?? [],
    datasetProfile: input.datasetProfile,
    dashboardSpec: input.dashboardSpec,
    viewState: input.viewState,
    presentationSpec: input.presentationSpec,
    messages: input.messages
  });
}

export function validateActionPlan(plan: ActionPlan) {
  if (plan.needsClarification) return { success: false, errors: plan.missingInfo.length ? plan.missingInfo : [plan.clarification ?? "missing_info"] };
  if (plan.intent === "ask_clarification") return { success: false, errors: ["ask_clarification"] };
  return { success: true, errors: [] };
}

export function buildCopilotAgentLoop(input: CopilotAgentInput): CopilotAgentLoopState {
  const userMessage = receiveUserMessage(input.prompt);
  const context = buildContext(input);
  const memory = buildCopilotMemory({ messages: input.messages, dashboardSpec: input.dashboardSpec });
  const classification = classifyIntent(userMessage);
  const previousInstruction = retrieveRelevantPreviousInstruction({ currentMessage: userMessage, memory });
  const actionPlan = buildActionPlan({
    prompt: userMessage,
    dashboardSpec: input.dashboardSpec,
    viewState: input.viewState,
    previousInstruction
  });
  const validation = validateActionPlan(actionPlan);

  return {
    userMessage,
    context,
    memory,
    classification,
    previousInstruction,
    actionPlan,
    validation
  };
}

export function respondWithExecutionSummary(input: { changed: boolean; summary: string; errors?: string[] }) {
  if (!input.changed) return input.errors?.length ? `No aplique cambios: ${input.errors.join(" ")}` : "No aplique cambios.";
  return input.summary;
}
