import type { DashboardAction } from "./dashboard";

export interface AnalyticalAnswerMessage {
  answer: string;
  valueLabel: string;
  metric: string;
  period: string;
  periodInferred: boolean;
  filters: string[];
  evidenceId: string;
  context: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  structuredAction?: DashboardAction;
  analyticalAnswer?: AnalyticalAnswerMessage;
}
