import { describe, expect, it } from "vitest";
import type { ChatMessage } from "@/types/ai";
import type { DashboardSpec } from "@/types/dashboard";
import type { DatasetProfile } from "@/types/dataset";
import type { PresentationSpec } from "@/types/presentation";
import { createDashboardEffectRepository } from "@/lib/services/dashboard-side-effects";
import {
  cancelDashboardEditing,
  commitDashboardEditing,
  dashboardCommands,
  dashboardQueries,
  generatePresentationOnly,
  redoDashboardChange,
  selectDashboardTarget,
  selectSelectedWidget,
  setDashboardFilters,
  startDashboardEditing,
  undoDashboardChange,
  updateCommittedDashboard,
  updateDashboardDraft,
  type DashboardDomainState
} from "@/lib/store/dashboard-domain";

function profile(): DatasetProfile {
  return {
    id: "dataset-1",
    datasetVersionId: "version-1",
    fileName: "ventas.csv",
    rowCount: 100,
    columnCount: 2,
    columns: [],
    detectedDateColumns: [],
    detectedMetricColumns: ["ventas"],
    detectedDimensionColumns: ["region"],
    detectedGeoColumns: [],
    qualityWarnings: [],
    qualityScore: 1,
    createdAt: "2026-07-17T00:00:00.000Z"
  };
}

function dashboard(): DashboardSpec {
  return {
    id: "dashboard-1",
    title: "Ventas",
    datasetId: "dataset-1",
    datasetVersionId: "version-1",
    globalFilters: [{ id: "fecha", field: "fecha", label: "Fecha", type: "date_range" }],
    widgets: [
      {
        id: "sales_by_region",
        type: "bar_chart",
        title: "Ventas por region",
        query: { metric: { field: "ventas", aggregation: "sum" }, groupBy: ["region"] },
        config: { visualConfig: { orientation: "horizontal" }, horizontal: true },
        position: { x: 0, y: 0, w: 6, h: 3 }
      }
    ],
    createdAt: "2026-07-17T00:00:00.000Z",
    updatedAt: "2026-07-17T00:00:00.000Z"
  };
}

function presentation(): PresentationSpec {
  return {
    id: "presentation_dashboard-1",
    dashboardId: "dashboard-1",
    title: "Presentacion de Ventas",
    theme: "executive",
    slides: [],
    createdAt: "2026-07-17T00:00:00.000Z",
    updatedAt: "2026-07-17T00:00:00.000Z"
  };
}

function message(id: string, role: ChatMessage["role"], content: string): ChatMessage {
  return { id, role, content, createdAt: "2026-07-17T00:00:00.000Z" };
}

function domainState(): DashboardDomainState {
  const baseDashboard = dashboard();
  const basePresentation = presentation();
  return {
    session: {
      activeProjectId: "project-1",
      activeDatasetId: "dataset-1",
      activeDatasetVersionId: "version-1",
      activeDashboardId: baseDashboard.id,
      activePresentationId: basePresentation.id,
      persistenceMode: "local",
      persistenceStatus: "Listo",
      executionMode: "deterministic",
      syncStatus: "idle",
      outboxCount: 0
    },
    import: {
      selectedSheetName: "Hoja 1",
      importWarnings: []
    },
    dataset: {
      profile: profile(),
      uploadedFileName: "ventas.csv",
      rowAccess: { mode: "query_service", rowCount: 100, datasetVersionId: "version-1" }
    },
    editor: {
      dashboard: baseDashboard,
      viewState: { filters: [] },
      isEditing: false,
      draft: null,
      selection: { targetType: "none", targetCapabilities: [] },
      undoStack: [],
      redoStack: []
    },
    copilot: {
      messages: [],
      isOpen: false,
      isThinking: false
    },
    presentation: {
      presentation: basePresentation,
      options: { theme: "executive", durationMinutes: 5, detailLevel: "summary", language: "es-LatAm", generated: false },
      shareSettings: { allowFilters: true, allowDownload: false, requirePassword: false, access: "public", expiresAt: "2026-08-17T00:00:00.000Z" },
      savedThemes: []
    }
  };
}

describe("isolated dashboard domain state", () => {
  it("edits a dashboard without initializing product store or dataset rows", () => {
    const initial = domainState();
    const editing = startDashboardEditing(initial);
    const updatedDraft = updateDashboardDraft(editing, (draft) => ({ ...draft, title: "Ventas Ejecutivas" }));
    const committed = commitDashboardEditing(updatedDraft);

    expect(committed.editor.dashboard.title).toBe("Ventas Ejecutivas");
    expect(committed.editor.isEditing).toBe(false);
    expect(committed.editor.draft).toBeNull();
    expect(committed.editor.undoStack).toHaveLength(1);
    expect("rows" in committed).toBe(false);
    expect(committed.dataset.rowAccess.mode).toBe("query_service");
  });

  it("keeps filters and selected targets as IDs instead of persisted target snapshots", () => {
    const filtered = setDashboardFilters(domainState(), [{ field: "region", operator: "eq", value: "Norte" }]);
    const selected = selectDashboardTarget(filtered, "widget", "sales_by_region");

    expect(selected.editor.viewState.filters).toEqual([{ field: "region", operator: "eq", value: "Norte" }]);
    expect(selected.editor.selection).toMatchObject({ targetType: "widget", targetId: "sales_by_region" });
    expect(selected.editor.viewState.selectedTargetSpec).toBeUndefined();
    expect(selectSelectedWidget(selected)?.id).toBe("sales_by_region");
  });

  it("handles undo and redo inside the dashboard/editor slice", () => {
    const changed = updateCommittedDashboard(domainState(), (spec) => ({ ...spec, title: "Nuevo titulo" }), "rename");
    const undone = undoDashboardChange(changed);
    const redone = redoDashboardChange(undone);

    expect(changed.editor.dashboard.title).toBe("Nuevo titulo");
    expect(undone.editor.dashboard.title).toBe("Ventas");
    expect(redone.editor.dashboard.title).toBe("Nuevo titulo");
  });

  it("generates presentation state without mutating dataset or dashboard slices", () => {
    const initial = domainState();
    const next = generatePresentationOnly(initial, "commercial");

    expect(next.dataset).toBe(initial.dataset);
    expect(next.editor.dashboard).toBe(initial.editor.dashboard);
    expect(next.presentation.presentation.theme).toBe("commercial");
    expect(next.presentation.options.generated).toBe(true);
  });

  it("exposes commands and queries separately", () => {
    const state = domainState();
    const context = dashboardQueries.selectDashboardQueryContext(state);

    expect(dashboardCommands.startDashboardEditing(state).editor.isEditing).toBe(true);
    expect(context).toEqual({
      datasetVersionId: "version-1",
      dashboardId: "dashboard-1",
      rowAccessMode: "query_service",
      filters: []
    });
  });

  it("builds persistence side-effect tasks outside reducers", () => {
    const repository = createDashboardEffectRepository();
    const tasks = repository.createCopilotSyncTasks({
      projectId: "project-1",
      dashboardId: "dashboard-1",
      userMessage: message("u1", "user", "hola"),
      assistantMessage: message("a1", "assistant", "listo"),
      dashboardVersion: dashboard(),
      dashboardVersionReason: "test"
    });

    expect(tasks.map((task) => task.label)).toEqual(["chat:user", "chat:assistant", "dashboard-version"]);
    expect(tasks.every((task) => typeof task.run === "function" && typeof task.outbox === "function")).toBe(true);
  });

  it("can cancel editing without touching committed dashboard", () => {
    const state = updateDashboardDraft(startDashboardEditing(domainState()), (draft) => ({ ...draft, title: "Borrador" }));
    const cancelled = cancelDashboardEditing(state);

    expect(cancelled.editor.dashboard.title).toBe("Ventas");
    expect(cancelled.editor.draft).toBeNull();
  });
});
