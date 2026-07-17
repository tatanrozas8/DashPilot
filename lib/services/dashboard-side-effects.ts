import type { ChatMessage } from "@/types/ai";
import type { DashboardSpec } from "@/types/dashboard";
import { enqueueOutbox, outboxCount } from "@/lib/data-access/outbox";
import { saveChatMessage } from "@/lib/supabase/chat";
import { createDashboardVersion } from "@/lib/supabase/dashboards";

export interface DashboardSideEffectTask {
  label: string;
  run: () => Promise<unknown>;
  outbox: () => void;
}

export interface CopilotSideEffectInput {
  projectId: string;
  dashboardId: string;
  userMessage: ChatMessage;
  assistantMessage: ChatMessage;
  dashboardVersion?: DashboardSpec;
  dashboardVersionReason: string;
}

export interface DashboardEffectRepository {
  createCopilotSyncTasks(input: CopilotSideEffectInput): DashboardSideEffectTask[];
  outboxCount(): number;
}

export function createDashboardEffectRepository(): DashboardEffectRepository {
  return {
    createCopilotSyncTasks(input) {
      return [
        {
          label: "chat:user",
          run: () => saveChatMessage(input.projectId, input.dashboardId, input.userMessage),
          outbox: () => enqueueOutbox({ kind: "chat", projectId: input.projectId, dashboardId: input.dashboardId, message: input.userMessage })
        },
        {
          label: "chat:assistant",
          run: () => saveChatMessage(input.projectId, input.dashboardId, input.assistantMessage),
          outbox: () => enqueueOutbox({ kind: "chat", projectId: input.projectId, dashboardId: input.dashboardId, message: input.assistantMessage })
        },
        ...(input.dashboardVersion
          ? [{
              label: "dashboard-version",
              run: () => createDashboardVersion(input.dashboardId, input.dashboardVersion!, input.dashboardVersionReason),
              outbox: () => enqueueOutbox({ kind: "dashboard-version", dashboardId: input.dashboardId, spec: input.dashboardVersion!, reason: input.dashboardVersionReason })
            }]
          : [])
      ];
    },
    outboxCount
  };
}
