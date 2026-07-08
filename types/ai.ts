import type { DashboardAction } from "./dashboard";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  structuredAction?: DashboardAction;
}
