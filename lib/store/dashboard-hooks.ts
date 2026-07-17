"use client";

import { useCallback } from "react";
import type { DashboardSpec, DashboardViewState } from "@/types/dashboard";
import type { DashboardEffectRepository } from "@/lib/services/dashboard-side-effects";
import { createDashboardEffectRepository } from "@/lib/services/dashboard-side-effects";
import { useDashPilotStore } from "@/lib/store/app-store";

export function useDashboardSelection() {
  return useDashPilotStore((state) => ({
    selectedTargetType: state.viewState.selectedTargetType ?? "none",
    selectedTargetId: state.viewState.selectedTargetId,
    selectedTargetTitle: state.viewState.selectedTargetTitle,
    highlightedWidgetId: state.viewState.highlightedWidgetId,
    selectDashboardTarget: state.selectDashboardTarget,
    clearSelectedTarget: state.clearSelectedTarget
  }));
}

export function useDashboardQueryState() {
  return useDashPilotStore((state) => ({
    datasetVersionId: state.activeDatasetVersionId,
    dashboardId: state.activeDashboardId,
    rowCount: state.profile.rowCount,
    filters: state.viewState.filters,
    dataExplorer: state.viewState.dataExplorer,
    setViewState: state.setViewState
  }));
}

export function useDashboardHistory() {
  return useDashPilotStore((state) => ({
    canUndo: state.copilotUndoStack.length > 0,
    canRedo: state.copilotRedoStack.length > 0,
    undo: state.undoCopilotChange,
    redo: state.redoCopilotChange
  }));
}

export function useDashboardAutosave(repository: DashboardEffectRepository = createDashboardEffectRepository()) {
  const activeProjectId = useDashPilotStore((state) => state.activeProjectId);
  const activeDashboardId = useDashPilotStore((state) => state.activeDashboardId);
  const setPersistenceState = useDashPilotStore((state) => state.setPersistenceState);
  return useCallback((input: { before: DashboardSpec; after: DashboardSpec; viewState: DashboardViewState }) => {
    if (input.before === input.after) return;
    setPersistenceState({ syncStatus: "pending", persistenceStatus: "Guardando dashboard..." });
    const tasks = repository.createCopilotSyncTasks({
      projectId: activeProjectId,
      dashboardId: activeDashboardId,
      userMessage: { id: "autosave:user", role: "user", content: "autosave", createdAt: new Date().toISOString() },
      assistantMessage: { id: "autosave:assistant", role: "assistant", content: "autosave", createdAt: new Date().toISOString() },
      dashboardVersion: input.after,
      dashboardVersionReason: "autosave"
    }).filter((task) => task.label === "dashboard-version");
    for (const task of tasks) {
      void task.run()
        .then(() => setPersistenceState({ syncStatus: "saved", persistenceStatus: "Dashboard guardado.", outboxCount: repository.outboxCount() }))
        .catch(() => {
          task.outbox();
          setPersistenceState({ syncStatus: "retrying", persistenceMode: "degraded", persistenceStatus: "No se pudo guardar; se reintentara.", outboxCount: repository.outboxCount() });
        });
    }
  }, [activeDashboardId, activeProjectId, repository, setPersistenceState]);
}

export function useDashboardSync(repository: DashboardEffectRepository = createDashboardEffectRepository()) {
  const retryPendingSync = useDashPilotStore((state) => state.retryPendingSync);
  const syncStatus = useDashPilotStore((state) => state.syncStatus);
  return {
    syncStatus,
    outboxCount: repository.outboxCount(),
    retryPendingSync
  };
}
