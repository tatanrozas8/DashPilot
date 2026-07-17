import type { ChatMessage } from "@/types/ai";
import type { DashboardFilter, DashboardSpec, DashboardTargetType, DashboardViewState, DashboardWidget, SavedDashboardTheme } from "@/types/dashboard";
import type { DatasetProfile } from "@/types/dataset";
import type { PresentationSpec, PresentationTheme } from "@/types/presentation";
import type { SyncStatus } from "@/lib/observability/modes";
import type { ExecutionMode } from "@/lib/observability/modes";
import type { CopilotActionEnvelope } from "@/lib/ai/actions";
import { generatePresentationSpec } from "@/lib/presentation-spec/generate-presentation-spec";
import {
  duplicateDashboardWidget,
  moveDashboardWidget,
  removeDashboardWidget,
  setDashboardWidgetHidden,
  updateDashboardDesign,
  updateDashboardSubtitle,
  updateDashboardTitle,
  updateDashboardWidget
} from "@/lib/dashboard-spec/edit-dashboard-spec";

export interface SessionSlice {
  activeProjectId: string;
  activeDatasetId: string;
  activeDatasetVersionId: string;
  activeDashboardId: string;
  activePresentationId: string;
  persistenceMode: "local" | "supabase" | "degraded";
  persistenceStatus: string;
  executionMode: ExecutionMode;
  syncStatus: SyncStatus;
  lastSyncCorrelationId?: string;
  lastSyncError?: string;
  outboxCount: number;
}

export interface ImportSlice {
  selectedSheetName: string;
  importWarnings: string[];
  activeImportJobId?: string;
}

export interface DatasetMetadataSlice {
  profile: DatasetProfile;
  uploadedFileName: string;
  rowAccess: {
    mode: "query_service" | "legacy_store";
    rowCount: number;
    datasetVersionId?: string;
  };
}

export interface EditorSelection {
  targetType: DashboardTargetType;
  targetId?: string;
  targetTitle?: string;
  targetCapabilities: string[];
}

export interface DashboardHistoryEntry {
  dashboard: DashboardSpec;
  viewState: DashboardViewState;
  presentation: PresentationSpec;
  reason: string;
  createdAt: string;
}

export interface EditorSlice {
  dashboard: DashboardSpec;
  viewState: DashboardViewState;
  isEditing: boolean;
  draft: DashboardSpec | null;
  selection: EditorSelection;
  undoStack: DashboardHistoryEntry[];
  redoStack: DashboardHistoryEntry[];
}

export interface CopilotSlice {
  messages: ChatMessage[];
  pendingConfirmation?: {
    id: string;
    envelope: CopilotActionEnvelope;
    prompt: string;
    createdAt: string;
  };
  isOpen: boolean;
  isThinking: boolean;
}

export interface PresentationOptions {
  theme: PresentationTheme;
  durationMinutes: 3 | 5 | 10;
  detailLevel: "summary" | "intermediate" | "deep";
  language: "es-LatAm";
  generated: boolean;
}

export interface ShareSettings {
  allowFilters: boolean;
  allowDownload: boolean;
  requirePassword: boolean;
  access: "public" | "private" | "password";
  expiresAt: string;
}

export interface PresentationSlice {
  presentation: PresentationSpec;
  options: PresentationOptions;
  shareSettings: ShareSettings;
  savedThemes: SavedDashboardTheme[];
}

export interface DashboardDomainState {
  session: SessionSlice;
  import: ImportSlice;
  dataset: DatasetMetadataSlice;
  editor: EditorSlice;
  copilot: CopilotSlice;
  presentation: PresentationSlice;
}

function targetTypeForWidget(type: DashboardWidget["type"]): DashboardTargetType {
  if (type === "kpi_card") return "kpi";
  if (type === "table") return "table";
  return "widget";
}

function capabilitiesForWidget(type: DashboardWidget["type"]) {
  const base = ["select", "explain"];
  if (type === "bar_chart") return [...base, "change_chart_type", "update_query", "orientation", "resize", "duplicate", "remove"];
  if (["line_chart", "area_chart", "donut_chart", "scatter_plot"].includes(type)) return [...base, "change_chart_type", "update_query", "resize", "duplicate", "remove"];
  if (type === "kpi_card") return [...base, "update_query", "rename", "resize", "duplicate", "remove"];
  if (type === "table") return [...base, "select_columns", "open_data", "resize", "duplicate", "remove"];
  return base;
}

function snapshot(state: DashboardDomainState, reason: string): DashboardHistoryEntry {
  return {
    dashboard: structuredClone(state.editor.dashboard),
    viewState: structuredClone(state.editor.viewState),
    presentation: structuredClone(state.presentation.presentation),
    reason,
    createdAt: new Date().toISOString()
  };
}

function withHistory(state: DashboardDomainState, reason: string, patch: Pick<EditorSlice, "dashboard" | "viewState"> & Partial<Pick<PresentationSlice, "presentation">>): DashboardDomainState {
  return {
    ...state,
    editor: {
      ...state.editor,
      dashboard: patch.dashboard,
      viewState: patch.viewState,
      undoStack: [...state.editor.undoStack, snapshot(state, reason)].slice(-25),
      redoStack: []
    },
    presentation: patch.presentation ? { ...state.presentation, presentation: patch.presentation } : state.presentation,
    session: {
      ...state.session,
      activeDashboardId: patch.dashboard.id,
      activePresentationId: patch.presentation?.id ?? state.session.activePresentationId
    }
  };
}

export function selectEditableDashboard(state: DashboardDomainState) {
  return state.editor.isEditing && state.editor.draft ? state.editor.draft : state.editor.dashboard;
}

export function selectSelectedWidget(state: DashboardDomainState) {
  const dashboard = selectEditableDashboard(state);
  return state.editor.selection.targetId ? dashboard.widgets.find((widget) => widget.id === state.editor.selection.targetId) : undefined;
}

export function selectDashboardQueryContext(state: DashboardDomainState) {
  return {
    datasetVersionId: state.dataset.rowAccess.datasetVersionId ?? state.session.activeDatasetVersionId,
    dashboardId: state.session.activeDashboardId,
    rowAccessMode: state.dataset.rowAccess.mode,
    filters: state.editor.viewState.filters
  };
}

export function startDashboardEditing(state: DashboardDomainState): DashboardDomainState {
  return {
    ...state,
    editor: {
      ...state.editor,
      isEditing: true,
      draft: structuredClone(state.editor.dashboard)
    }
  };
}

export function cancelDashboardEditing(state: DashboardDomainState): DashboardDomainState {
  return { ...state, editor: { ...state.editor, isEditing: false, draft: null } };
}

export function updateDashboardDraft(state: DashboardDomainState, update: (dashboard: DashboardSpec) => DashboardSpec): DashboardDomainState {
  const draft = state.editor.draft ?? state.editor.dashboard;
  return { ...state, editor: { ...state.editor, isEditing: true, draft: update(draft) } };
}

export function commitDashboardEditing(state: DashboardDomainState): DashboardDomainState {
  if (!state.editor.draft) return state;
  const dashboard = state.editor.draft;
  const presentation = generatePresentationSpec(dashboard, state.presentation.options.theme);
  return {
    ...withHistory(state, "dashboard-edit", { dashboard, viewState: state.editor.viewState, presentation }),
    editor: {
      ...state.editor,
      dashboard,
      isEditing: false,
      draft: null,
      undoStack: [...state.editor.undoStack, snapshot(state, "dashboard-edit")].slice(-25),
      redoStack: []
    },
    presentation: { ...state.presentation, presentation },
    session: { ...state.session, activeDashboardId: dashboard.id, activePresentationId: presentation.id }
  };
}

export function updateCommittedDashboard(state: DashboardDomainState, update: (dashboard: DashboardSpec) => DashboardSpec, reason: string): DashboardDomainState {
  const dashboard = update(state.editor.dashboard);
  const presentation = generatePresentationSpec(dashboard, state.presentation.options.theme);
  return withHistory(state, reason, { dashboard, viewState: state.editor.viewState, presentation });
}

export function setDashboardFilters(state: DashboardDomainState, filters: DashboardFilter[]): DashboardDomainState {
  return {
    ...state,
    editor: {
      ...state.editor,
      viewState: { ...state.editor.viewState, filters }
    }
  };
}

export function selectDashboardTarget(state: DashboardDomainState, targetType: DashboardTargetType, targetId?: string): DashboardDomainState {
  const dashboard = selectEditableDashboard(state);
  const widget = targetId ? dashboard.widgets.find((item) => item.id === targetId) : undefined;
  const selection: EditorSelection = widget
    ? { targetType: targetTypeForWidget(widget.type), targetId: widget.id, targetTitle: widget.title, targetCapabilities: capabilitiesForWidget(widget.type) }
    : targetType === "dashboard"
      ? { targetType: "dashboard", targetId: dashboard.id, targetTitle: dashboard.title, targetCapabilities: ["update_design", "reorder_widgets", "create_widget", "presentation"] }
      : { targetType: "none", targetCapabilities: [] };
  return {
    ...state,
    editor: {
      ...state.editor,
      selection,
      viewState: {
        ...state.editor.viewState,
        highlightedWidgetId: widget?.id,
        selectedTargetType: selection.targetType,
        selectedTargetId: selection.targetId,
        selectedTargetTitle: selection.targetTitle,
        selectedTargetCapabilities: selection.targetCapabilities,
        selectedTargetSpec: undefined
      }
    }
  };
}

export function undoDashboardChange(state: DashboardDomainState): DashboardDomainState {
  const previous = state.editor.undoStack.at(-1);
  if (!previous) return state;
  const current = snapshot(state, "redo");
  return {
    ...state,
    editor: {
      ...state.editor,
      dashboard: previous.dashboard,
      viewState: previous.viewState,
      isEditing: false,
      draft: null,
      undoStack: state.editor.undoStack.slice(0, -1),
      redoStack: [...state.editor.redoStack, current].slice(-25)
    },
    presentation: { ...state.presentation, presentation: previous.presentation },
    session: { ...state.session, activeDashboardId: previous.dashboard.id, activePresentationId: previous.presentation.id }
  };
}

export function redoDashboardChange(state: DashboardDomainState): DashboardDomainState {
  const next = state.editor.redoStack.at(-1);
  if (!next) return state;
  const current = snapshot(state, "undo");
  return {
    ...state,
    editor: {
      ...state.editor,
      dashboard: next.dashboard,
      viewState: next.viewState,
      undoStack: [...state.editor.undoStack, current].slice(-25),
      redoStack: state.editor.redoStack.slice(0, -1)
    },
    presentation: { ...state.presentation, presentation: next.presentation },
    session: { ...state.session, activeDashboardId: next.dashboard.id, activePresentationId: next.presentation.id }
  };
}

export function generatePresentationOnly(state: DashboardDomainState, theme = state.presentation.options.theme): DashboardDomainState {
  const presentation = generatePresentationSpec(state.editor.dashboard, theme);
  return {
    ...state,
    presentation: {
      ...state.presentation,
      presentation,
      options: { ...state.presentation.options, theme, generated: true }
    },
    session: { ...state.session, activePresentationId: presentation.id }
  };
}

export const dashboardCommands = {
  startDashboardEditing,
  cancelDashboardEditing,
  updateDashboardDraft,
  commitDashboardEditing,
  updateCommittedDashboard,
  setDashboardFilters,
  selectDashboardTarget,
  undoDashboardChange,
  redoDashboardChange,
  generatePresentationOnly,
  updateDashboardTitle,
  updateDashboardSubtitle,
  updateDashboardDesign,
  updateDashboardWidget,
  duplicateDashboardWidget,
  removeDashboardWidget,
  setDashboardWidgetHidden,
  moveDashboardWidget
};

export const dashboardQueries = {
  selectEditableDashboard,
  selectSelectedWidget,
  selectDashboardQueryContext
};
