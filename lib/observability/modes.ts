export type ExecutionMode = "provider" | "deterministic" | "offline/local" | "degraded";

export type SyncStatus = "idle" | "pending" | "saved" | "retrying" | "failed" | "conflict";

export interface ObservableOperation {
  executionMode: ExecutionMode;
  syncStatus: SyncStatus;
  correlationId: string;
}

export function modeLabel(mode: ExecutionMode) {
  if (mode === "provider") return "Proveedor";
  if (mode === "deterministic") return "Deterministico";
  if (mode === "offline/local") return "Local/offline";
  return "Degradado";
}

export function syncStatusLabel(status: SyncStatus) {
  if (status === "idle") return "Sin cambios pendientes";
  if (status === "pending") return "Sincronizando";
  if (status === "saved") return "Guardado";
  if (status === "retrying") return "Reintentando";
  if (status === "failed") return "Fallo de sincronizacion";
  return "Conflicto de sincronizacion";
}
