import { DomainError } from "@/lib/observability/domain-error";

export interface RuntimeSecurityState {
  nodeEnv?: string;
  supabaseConfigured: boolean;
  authenticatedUserId?: string | null;
}

export function isProductionRuntime(nodeEnv: string | undefined = process.env.NODE_ENV) {
  return nodeEnv === "production";
}

export function assertLocalBypassAllowed(state: RuntimeSecurityState) {
  if (!isProductionRuntime(state.nodeEnv)) return;
  if (state.supabaseConfigured && state.authenticatedUserId) return;
  throw new DomainError({
    code: "permission_denied",
    message: "Local/demo persistence bypass is disabled in production.",
    userMessage: "DashPilot requiere una sesion autenticada para guardar datos en produccion.",
    recoverable: false,
    executionMode: "provider",
    syncStatus: "failed"
  });
}
