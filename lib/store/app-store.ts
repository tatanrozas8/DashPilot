"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ChatMessage } from "@/types/ai";
import type { DataRow, DatasetColumnProfile, DatasetProfile, FileParseResult } from "@/types/dataset";
import type { DashboardDesignSettings, DashboardSpec, DashboardTargetType, DashboardViewState, DashboardWidget, SavedDashboardTheme } from "@/types/dashboard";
import type { PresentationSpec, PresentationTheme } from "@/types/presentation";
import type { CopilotActionEnvelope } from "@/lib/ai/actions";
import { buildCopilotContext } from "@/lib/ai/context-builder";
import { assistantMessage } from "@/lib/ai/copilot-service";
import { applyDashboardAction } from "@/lib/dashboard-spec/apply-dashboard-action";
import {
  duplicateDashboardWidget as duplicateDashboardWidgetSpec,
  DEFAULT_DASHBOARD_DESIGN,
  moveDashboardWidget,
  removeDashboardWidget as removeDashboardWidgetSpec,
  setDashboardWidgetHidden as setDashboardWidgetHiddenSpec,
  updateDashboardDesign,
  updateDashboardSubtitle,
  updateDashboardTitle,
  updateDashboardWidget as updateDashboardWidgetSpec
} from "@/lib/dashboard-spec/edit-dashboard-spec";
import { generateDashboardSpec } from "@/lib/dashboard-spec/generate-dashboard-spec";
import { createDemoDataset } from "@/lib/data/demo-dataset";
import { generatePresentationSpec } from "@/lib/presentation-spec/generate-presentation-spec";
import { profileDataset } from "@/lib/profiling/profile-dataset";
import { nameFromFile } from "@/lib/utils/name-from-file";
import { flushOutboxDueItems, outboxCount } from "@/lib/data-access/outbox";
import { createDashboardEffectRepository } from "@/lib/services/dashboard-side-effects";
import { DomainError, logDomainError, toDomainError } from "@/lib/observability/domain-error";
import type { ExecutionMode, SyncStatus } from "@/lib/observability/modes";
import { DASH_PILOT_PERSIST_TTL_MS, DASH_PILOT_PERSIST_VERSION, purgeSensitiveBrowserStorage } from "@/lib/security/browser-storage";
import { clearQueryableDatasets, executeAggregateQuery, getQueryableRowsSample, getQueryableRowsForExport, registerQueryableDataset } from "@/lib/query-service/client";
import { createCopilotPlan, createExecutionState, executeTransaction, redoTransaction, resolveCopilotContext, undoTransaction, type CopilotPlan, type SemanticDiffEntry, type TransactionalExecutionState } from "@/lib/copilot-command-bus";
import { formatAnalyticalAnswer, planAnalyticalAnswer } from "@/lib/copilot-bi";

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

interface DashboardSnapshot {
  dashboard: DashboardSpec;
  viewState: DashboardViewState;
  presentation: PresentationSpec;
  reason: string;
  createdAt: string;
}

interface PendingCopilotConfirmation {
  id: string;
  envelope: CopilotActionEnvelope;
  prompt: string;
  createdAt: string;
}

interface PendingCopilotPlan {
  id: string;
  prompt: string;
  plan: CopilotPlan;
  contextRevisionId: string;
  createdAt: string;
}

type ColumnDictionaryChanges = Partial<Pick<DatasetColumnProfile, "businessName" | "description" | "displayName" | "synonyms" | "isHidden" | "userSemanticType" | "semanticType">>;
type BrowserSafePersistedState = Pick<
  DashPilotState,
  | "activeProjectId"
  | "activeDatasetId"
  | "activeDatasetVersionId"
  | "activeDashboardId"
  | "activePresentationId"
  | "persistenceMode"
  | "persistenceStatus"
  | "executionMode"
  | "syncStatus"
  | "lastSyncCorrelationId"
  | "lastSyncError"
  | "outboxCount"
  | "isDemoMode"
  | "presentationOptions"
  | "shareSettings"
  | "savedThemes"
  | "isCopilotPanelOpen"
> & { browserStorageExpiresAt: string };

export interface ProjectSummary {
  id: string;
  name: string;
  owner: string;
  updatedAt: string;
}

interface DashPilotState {
  currentProject: ProjectSummary;
  profile: DatasetProfile;
  datasetProfile: DatasetProfile;
  dashboard: DashboardSpec;
  dashboardSpec: DashboardSpec;
  isDashboardEditing: boolean;
  dashboardEditDraft: DashboardSpec | null;
  viewState: DashboardViewState;
  presentation: PresentationSpec;
  presentationSpec: PresentationSpec;
  filters: DashboardViewState;
  parsedDataset: FileParseResult | null;
  selectedSheetName: string;
  importWarnings: string[];
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
  browserStorageExpiresAt?: string;
  messages: ChatMessage[];
  chatMessages: ChatMessage[];
  versions: DashboardSpec[];
  copilotUndoStack: DashboardSnapshot[];
  copilotRedoStack: DashboardSnapshot[];
  pendingCopilotConfirmation?: PendingCopilotConfirmation;
  pendingCopilotPlan?: PendingCopilotPlan;
  copilotStatus: "idle" | "interpreting" | "clarification" | "planned" | "validating" | "awaiting_confirmation" | "executing" | "verified" | "failed" | "reverted";
  copilotPlan?: CopilotPlan;
  copilotDiff: SemanticDiffEntry[];
  copilotEvidence: string[];
  copilotTransactionState?: TransactionalExecutionState;
  isDemoMode: boolean;
  uploadedFileName: string;
  presentationOptions: PresentationOptions;
  shareSettings: ShareSettings;
  savedThemes: SavedDashboardTheme[];
  isCopilotPanelOpen: boolean;
  isCopilotThinking: boolean;
  setDataset: (rows: DataRow[], fileName: string) => void;
  setParsedDataset: (parsed: FileParseResult) => void;
  selectSheet: (sheetName: string) => void;
  loadDemo: () => void;
  generateDashboard: () => DashboardSpec;
  hydrateDataset: (payload: { rows: DataRow[]; profile: DatasetProfile; datasetId: string }) => void;
  hydrateDashboard: (payload: { rows: DataRow[]; dashboard: DashboardSpec; viewState?: DashboardViewState; profile?: DatasetProfile }) => void;
  startDashboardEditing: () => void;
  cancelDashboardEditing: () => void;
  updateDashboardDraftTitle: (title: string) => void;
  updateDashboardDraftSubtitle: (subtitle: string) => void;
  updateDashboardDraftDesign: (design: DashboardDesignSettings) => void;
  updateDashboardDesign: (design: DashboardDesignSettings) => void;
  updateDashboardDraftWidget: (widgetId: string, changes: Partial<DashboardWidget>) => void;
  updateDashboardWidget: (widgetId: string, changes: Partial<DashboardWidget>) => void;
  moveDashboardDraftWidget: (sourceWidgetId: string, targetWidgetId: string) => void;
  addDashboardWidget: (widget: DashboardWidget) => void;
  duplicateDashboardWidget: (widgetId: string) => void;
  removeDashboardWidget: (widgetId: string) => void;
  setDashboardWidgetHidden: (widgetId: string, hidden: boolean) => void;
  openWidgetDataExplorer: (widgetId: string) => void;
  duplicateDashboardDraftWidget: (widgetId: string) => void;
  removeDashboardDraftWidget: (widgetId: string) => void;
  setDashboardDraftWidgetHidden: (widgetId: string, hidden: boolean) => void;
  commitDashboardEditing: () => DashboardSpec | null;
  setPersistenceState: (state: Partial<Pick<DashPilotState, "activeProjectId" | "activeDatasetId" | "activeDatasetVersionId" | "activeDashboardId" | "activePresentationId" | "persistenceMode" | "persistenceStatus" | "executionMode" | "syncStatus" | "lastSyncCorrelationId" | "lastSyncError" | "outboxCount">>) => void;
  retryPendingSync: () => Promise<void>;
  setViewState: (viewState: Partial<DashboardViewState>) => void;
  selectDashboardTarget: (targetType: DashboardTargetType, targetId?: string) => void;
  clearSelectedTarget: () => void;
  setCopilotIntent: (intent: NonNullable<DashboardViewState["copilotIntent"]>) => void;
  updateColumnDictionary: (field: string, changes: ColumnDictionaryChanges) => void;
  sendPrompt: (prompt: string) => Promise<void>;
  applyPendingCopilotPlan: () => void;
  cancelPendingCopilotPlan: () => void;
  undoCopilotChange: () => void;
  redoCopilotChange: () => void;
  confirmPendingCopilotAction: () => void;
  cancelPendingCopilotAction: () => void;
  resetFilters: () => void;
  generatePresentation: () => void;
  setPresentationOptions: (options: Partial<PresentationOptions>) => void;
  setShareSettings: (settings: Partial<ShareSettings>) => void;
  saveDashboardTheme: (name: string, scope?: SavedDashboardTheme["scope"]) => SavedDashboardTheme | null;
  applySavedDashboardTheme: (themeId: string) => void;
  deleteSavedDashboardTheme: (themeId: string) => void;
  toggleCopilotPanel: () => void;
  clearSensitiveWorkspace: () => void;
}

function createProjectSummary(fileName: string, id = "local-project"): ProjectSummary {
  return {
    id,
    name: nameFromFile(fileName),
    owner: "Usuario",
    updatedAt: "Actualizado ahora"
  };
}

function createEmptyProfile(): DatasetProfile {
  return {
    id: "dataset_empty",
    fileName: "",
    rowCount: 0,
    columnCount: 0,
    columns: [],
    detectedDateColumns: [],
    detectedMetricColumns: [],
    detectedDimensionColumns: [],
    detectedGeoColumns: [],
    qualityWarnings: [],
    qualityScore: 0,
    createdAt: new Date().toISOString()
  };
}

function createEmptyDashboard(): DashboardSpec {
  const now = new Date().toISOString();
  return {
    id: "dashboard_empty",
    title: "Aún no hay dashboards",
    subtitle: "Sube un dataset para comenzar.",
    datasetId: "dataset_empty",
    design: DEFAULT_DASHBOARD_DESIGN,
    globalFilters: [],
    widgets: [],
    createdAt: now,
    updatedAt: now
  };
}

function createEmptyPresentation(): PresentationSpec {
  const now = new Date().toISOString();
  return {
    id: "presentation_empty",
    dashboardId: "dashboard_empty",
    sourceDashboardRevisionId: "dashboard_revision_empty",
    sourceDashboardTitle: "Aun no hay dashboards",
    sourceDashboardUpdatedAt: now,
    snapshotMode: "snapshot",
    title: "Aún no hay presentaciones",
    subtitle: "Genera un dashboard desde un dataset para crear una presentacion.",
    theme: "executive",
    slides: [],
    createdAt: now,
    updatedAt: now
  };
}

function baseMessages() {
  return [
    assistantMessage(
      "He analizado tu dashboard y puedo ayudarte a hacerlo mas ejecutivo, aplicar filtros, cambiar graficos o preparar una presentacion."
    )
  ];
}

function snapshotFromState(state: Pick<DashPilotState, "dashboard" | "viewState" | "presentation">, reason: string): DashboardSnapshot {
  return {
    dashboard: structuredClone(state.dashboard),
    viewState: structuredClone(state.viewState),
    presentation: structuredClone(state.presentation),
    reason,
    createdAt: new Date().toISOString()
  };
}

function withLimitedHistory(items: DashboardSnapshot[]) {
  return items.slice(-20);
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

function targetViewState(dashboard: DashboardSpec, viewState: DashboardViewState, targetType: DashboardTargetType, targetId?: string): DashboardViewState {
  if (targetType === "dashboard") {
    return {
      ...viewState,
      highlightedWidgetId: undefined,
      selectedTargetType: "dashboard",
      selectedTargetId: dashboard.id,
      selectedTargetTitle: dashboard.title,
      selectedTargetSpec: dashboard,
      selectedTargetCapabilities: ["update_design", "reorder_widgets", "create_widget", "presentation"]
    };
  }
  const widget = targetId ? dashboard.widgets.find((item) => item.id === targetId) : undefined;
  if (!widget || targetType === "none") {
    return {
      ...viewState,
      highlightedWidgetId: undefined,
      selectedTargetType: "none",
      selectedTargetId: undefined,
      selectedTargetTitle: undefined,
      selectedTargetSpec: undefined,
      selectedTargetCapabilities: []
    };
  }
  return {
    ...viewState,
    highlightedWidgetId: widget.id,
    selectedTargetType: targetTypeForWidget(widget.type),
    selectedTargetId: widget.id,
    selectedTargetTitle: widget.title,
    selectedTargetSpec: widget,
    selectedTargetCapabilities: capabilitiesForWidget(widget.type),
    copilotIntent: viewState.copilotIntent ?? "modify_selection"
  };
}

function withColumnDictionary(profile: DatasetProfile, field: string, changes: ColumnDictionaryChanges): DatasetProfile {
  const columns = profile.columns.map((column) => {
    if (column.normalizedName !== field) return column;
    const semanticType = changes.userSemanticType ?? changes.semanticType ?? column.userSemanticType ?? column.semanticType;
    return {
      ...column,
      ...changes,
      displayName: changes.displayName?.trim() || changes.businessName?.trim() || column.displayName,
      businessName: changes.businessName?.trim() || column.businessName,
      description: changes.description?.trim() || undefined,
      synonyms: changes.synonyms?.map((item) => item.trim()).filter(Boolean) ?? column.synonyms,
      semanticType,
      userSemanticType: semanticType
    };
  });
  return {
    ...profile,
    columns,
    detectedDateColumns: columns.filter((column) => column.semanticType === "time").map((column) => column.normalizedName),
    detectedMetricColumns: columns.filter((column) => column.semanticType === "metric" || column.semanticType === "measure").map((column) => column.normalizedName),
    detectedDimensionColumns: columns.filter((column) => ["dimension", "category", "identifier"].includes(column.semanticType)).map((column) => column.normalizedName),
    detectedGeoColumns: columns.filter((column) => column.semanticType === "geo").map((column) => column.normalizedName)
  };
}

function createInitialState() {
  const viewState: DashboardViewState = { filters: [] };
  const profile = createEmptyProfile();
  const dashboard = createEmptyDashboard();
  const presentation = createEmptyPresentation();
  return {
    currentProject: { id: "", name: "Sin proyecto activo", owner: "Usuario", updatedAt: "Sube un dataset para comenzar" },
    profile,
    datasetProfile: profile,
    dashboard,
    dashboardSpec: dashboard,
    isDashboardEditing: false,
    dashboardEditDraft: null,
    viewState,
    filters: viewState,
    presentation,
    presentationSpec: presentation,
    parsedDataset: null,
    selectedSheetName: "",
    importWarnings: [],
    activeProjectId: "",
    activeDatasetId: "",
    activeDatasetVersionId: "",
    activeDashboardId: "",
    activePresentationId: "",
    persistenceMode: "local" as const,
    persistenceStatus: "Sube un dataset para comenzar",
    executionMode: "offline/local" as const,
    syncStatus: "idle" as const,
    lastSyncCorrelationId: undefined,
    lastSyncError: undefined,
    outboxCount: 0,
    browserStorageExpiresAt: undefined,
    messages: baseMessages(),
    chatMessages: baseMessages(),
    versions: [],
    copilotUndoStack: [],
    copilotRedoStack: [],
    pendingCopilotConfirmation: undefined,
    pendingCopilotPlan: undefined,
    copilotStatus: "idle" as const,
    copilotPlan: undefined,
    copilotDiff: [],
    copilotEvidence: [],
    copilotTransactionState: undefined,
    isDemoMode: false,
    uploadedFileName: "",
    presentationOptions: {
      theme: "executive" as const,
      durationMinutes: 5 as const,
      detailLevel: "summary" as const,
      language: "es-LatAm" as const,
      generated: false
    },
    shareSettings: {
      allowFilters: true,
      allowDownload: true,
      requirePassword: false,
      access: "public" as const,
      expiresAt: "2026-12-31"
    },
    savedThemes: [],
    isCopilotPanelOpen: true,
    isCopilotThinking: false
  };
}

function browserStorageExpiresAt() {
  return new Date(Date.now() + DASH_PILOT_PERSIST_TTL_MS).toISOString();
}

function safePersistedState(state: Omit<BrowserSafePersistedState, "browserStorageExpiresAt"> & { browserStorageExpiresAt?: string }): BrowserSafePersistedState {
  return {
    activeProjectId: state.activeProjectId,
    activeDatasetId: state.activeDatasetId,
    activeDatasetVersionId: state.activeDatasetVersionId,
    activeDashboardId: state.activeDashboardId,
    activePresentationId: state.activePresentationId,
    persistenceMode: state.persistenceMode,
    persistenceStatus: state.persistenceStatus,
    executionMode: state.executionMode,
    syncStatus: state.syncStatus,
    lastSyncCorrelationId: state.lastSyncCorrelationId,
    lastSyncError: state.lastSyncError,
    outboxCount: state.outboxCount,
    isDemoMode: state.isDemoMode,
    presentationOptions: state.presentationOptions,
    shareSettings: state.shareSettings,
    savedThemes: state.savedThemes,
    isCopilotPanelOpen: state.isCopilotPanelOpen,
    browserStorageExpiresAt: browserStorageExpiresAt()
  };
}

export function migratePersistedState(persistedState: unknown) {
  purgeSensitiveBrowserStorage();
  const state = persistedState as Partial<DashPilotState>;
  if (state.browserStorageExpiresAt && new Date(state.browserStorageExpiresAt).getTime() <= Date.now()) {
    return safePersistedState({ ...createInitialState(), browserStorageExpiresAt: browserStorageExpiresAt() });
  }
  const legacyProjectName = ["Analisis Comercial", "Q2", "2024"].join(" ");
  const legacyProjectId = ["demo", "project"].join("-");
  const legacyFileName = `${["Ventas", "Q2", "2024"].join("_")}.xlsx`;
  const legacyProject = state.currentProject?.name === legacyProjectName || state.activeProjectId === legacyProjectId;
  const legacyFile = state.uploadedFileName === legacyFileName || state.profile?.fileName === legacyFileName;
  if (legacyProject || legacyFile) return safePersistedState({ ...createInitialState(), browserStorageExpiresAt: browserStorageExpiresAt() });

  const safe = safePersistedState({ ...createInitialState(), ...state, browserStorageExpiresAt: browserStorageExpiresAt() });
  return {
    ...safe,
    persistenceStatus: safe.persistenceStatus || "Sesion restaurada sin datos sensibles en navegador."
  };
}

export const useDashPilotStore = create<DashPilotState>()(
  persist<DashPilotState, [], [], BrowserSafePersistedState>(
    (set, get) => ({
      ...createInitialState(),
      setDataset: (rows, fileName) => {
        const profile = profileDataset(rows, fileName);
        const dashboard = generateDashboardSpec(profile, rows);
        const presentation = generatePresentationSpec(dashboard);
        const messages = [assistantMessage("Archivo analizado. Detecte metricas, dimensiones y filtros recomendados.")];
        const project = createProjectSummary(fileName);
        registerQueryableDataset({ datasetId: profile.id, profile, rows, source: "local" });
        set({
          currentProject: project,
          profile,
          datasetProfile: profile,
          dashboard,
          dashboardSpec: dashboard,
          isDashboardEditing: false,
          dashboardEditDraft: null,
          viewState: { filters: [], selectedDateRange: undefined },
          filters: { filters: [], selectedDateRange: undefined },
          presentation,
          presentationSpec: presentation,
          activeProjectId: project.id,
          activeDatasetId: profile.id,
          activeDatasetVersionId: profile.datasetVersionId ?? "",
          activeDashboardId: dashboard.id,
          activePresentationId: presentation.id,
          messages,
          chatMessages: messages,
          versions: [dashboard],
          copilotUndoStack: [],
          copilotRedoStack: [],
          pendingCopilotConfirmation: undefined,
          isDemoMode: false,
          uploadedFileName: fileName
        });
      },
      setParsedDataset: (parsed) => {
        const selected = parsed.sheets.find((sheet) => sheet.name === parsed.selectedSheetName) ?? parsed.sheets[0];
        const rows = selected?.rows ?? [];
        const profile = profileDataset(rows, parsed.fileName, selected?.columns ?? []);
        const dashboard = generateDashboardSpec(profile, rows);
        const presentation = generatePresentationSpec(dashboard);
        const viewState: DashboardViewState = { filters: [], selectedDateRange: undefined };
        const messages = [assistantMessage("Archivo real analizado. Detecte columnas, tipos, metricas y filtros recomendados.")];
        const project = createProjectSummary(parsed.fileName);
        registerQueryableDataset({ datasetId: profile.id, profile, rows, source: "local" });
        set({
          currentProject: project,
          profile,
          datasetProfile: profile,
          dashboard,
          dashboardSpec: dashboard,
          isDashboardEditing: false,
          dashboardEditDraft: null,
          viewState,
          filters: viewState,
          presentation,
          presentationSpec: presentation,
          parsedDataset: parsed,
          selectedSheetName: selected?.name ?? parsed.selectedSheetName,
          importWarnings: parsed.warnings,
          activeProjectId: project.id,
          activeDatasetId: profile.id,
          activeDatasetVersionId: profile.datasetVersionId ?? "",
          activeDashboardId: dashboard.id,
          activePresentationId: presentation.id,
          persistenceMode: "local",
          persistenceStatus: "Dataset listo en modo local",
          executionMode: "offline/local",
          syncStatus: "saved",
          lastSyncError: undefined,
          outboxCount: outboxCount(),
          messages,
          chatMessages: messages,
          versions: [dashboard],
          copilotUndoStack: [],
          copilotRedoStack: [],
          pendingCopilotConfirmation: undefined,
          isDemoMode: false,
          uploadedFileName: parsed.fileName
        });
      },
      selectSheet: (sheetName) => {
        const parsed = get().parsedDataset;
        const selected = parsed?.sheets.find((sheet) => sheet.name === sheetName);
        if (!parsed || !selected) return;
        const nextParsed = {
          ...parsed,
          selectedSheetName: sheetName,
          sheets: parsed.sheets.map((sheet) => ({ ...sheet, isSelected: sheet.name === sheetName }))
        };
        const profile = profileDataset(selected.rows, parsed.fileName, selected.columns);
        const dashboard = generateDashboardSpec(profile, selected.rows);
        const presentation = generatePresentationSpec(dashboard);
        const viewState: DashboardViewState = { filters: [], selectedDateRange: undefined };
        const project = createProjectSummary(parsed.fileName, get().activeProjectId || "local-project");
        registerQueryableDataset({ datasetId: profile.id, profile, rows: selected.rows, source: "local" });
        set({
          currentProject: project,
          profile,
          datasetProfile: profile,
          dashboard,
          dashboardSpec: dashboard,
          isDashboardEditing: false,
          dashboardEditDraft: null,
          presentation,
          presentationSpec: presentation,
          viewState,
          filters: viewState,
          parsedDataset: nextParsed,
          selectedSheetName: sheetName,
          activeDatasetId: profile.id,
          activeDatasetVersionId: profile.datasetVersionId ?? "",
          activeDashboardId: dashboard.id,
          activePresentationId: presentation.id,
          versions: [dashboard],
          copilotUndoStack: [],
          copilotRedoStack: [],
          pendingCopilotConfirmation: undefined
        });
      },
      loadDemo: () => {
        const rows = createDemoDataset();
        const exampleFileName = "ejemplo_comercial.xlsx";
        const profile = profileDataset(rows, exampleFileName);
        const dashboard = generateDashboardSpec(profile, rows);
        const presentation = generatePresentationSpec(dashboard);
        const viewState: DashboardViewState = { filters: [], selectedDateRange: undefined };
        const messages = [assistantMessage("Datos de ejemplo cargados. Ya puedes revisar el dataset o generar el dashboard.")];
        const project = { id: "sample-project", name: "Ejemplo comercial", owner: "Usuario", updatedAt: "Datos de ejemplo" };
        registerQueryableDataset({ datasetId: profile.id, profile, rows, source: "local" });
        set({
          currentProject: project,
          profile,
          datasetProfile: profile,
          dashboard,
          dashboardSpec: dashboard,
          isDashboardEditing: false,
          dashboardEditDraft: null,
          viewState,
          filters: viewState,
          presentation,
          presentationSpec: presentation,
          parsedDataset: null,
          selectedSheetName: "Datos de ejemplo",
          importWarnings: [],
          activeProjectId: project.id,
          activeDatasetId: profile.id,
          activeDatasetVersionId: profile.datasetVersionId ?? "",
          activeDashboardId: dashboard.id,
          activePresentationId: presentation.id,
          persistenceMode: "local",
          persistenceStatus: "Datos de ejemplo cargados",
          executionMode: "deterministic",
          syncStatus: "saved",
          lastSyncError: undefined,
          outboxCount: outboxCount(),
          messages,
          chatMessages: messages,
          versions: [dashboard],
          copilotUndoStack: [],
          copilotRedoStack: [],
          pendingCopilotConfirmation: undefined,
          isDemoMode: true,
          uploadedFileName: exampleFileName
        });
      },
      generateDashboard: () => {
        const { activeDatasetVersionId, activeDatasetId, profile } = get();
        const rows = getQueryableRowsForExport(activeDatasetVersionId || profile.datasetVersionId || activeDatasetId);
        const dashboard = generateDashboardSpec({ ...profile, datasetVersionId: activeDatasetVersionId || profile.datasetVersionId }, rows, { datasetVersionId: activeDatasetVersionId || profile.datasetVersionId });
        const presentation = generatePresentationSpec(dashboard);
        set({
          dashboard,
          dashboardSpec: dashboard,
          isDashboardEditing: false,
          dashboardEditDraft: null,
          presentation,
          presentationSpec: presentation,
          activeDashboardId: dashboard.id,
          activePresentationId: presentation.id,
          versions: [...get().versions, dashboard]
        });
        return dashboard;
      },
      hydrateDashboard: ({ rows, dashboard, viewState, profile }) => {
        const nextProfile = profile ?? get().profile;
        const presentation = generatePresentationSpec(dashboard, get().presentationOptions.theme);
        const project = createProjectSummary(nextProfile.fileName, get().activeProjectId || "local-project");
        if (rows.length) registerQueryableDataset({ datasetId: dashboard.datasetId, profile: nextProfile, rows, source: get().persistenceMode === "supabase" ? "supabase" : "local" });
        set({
          currentProject: project,
          profile: nextProfile,
          datasetProfile: nextProfile,
          dashboard,
          dashboardSpec: dashboard,
          isDashboardEditing: false,
          dashboardEditDraft: null,
          viewState: viewState ?? { filters: [] },
          filters: viewState ?? { filters: [] },
          presentation,
          presentationSpec: presentation,
          activeDatasetId: dashboard.datasetId,
          activeDatasetVersionId: dashboard.datasetVersionId ?? nextProfile.datasetVersionId ?? "",
          activeDashboardId: dashboard.id,
          activePresentationId: presentation.id,
          isDemoMode: false,
          uploadedFileName: nextProfile.fileName,
          versions: [dashboard],
          copilotUndoStack: [],
          copilotRedoStack: [],
          pendingCopilotConfirmation: undefined
        });
      },
      hydrateDataset: ({ rows, profile, datasetId }) => {
        const dashboard = generateDashboardSpec(profile, rows);
        const presentation = generatePresentationSpec(dashboard, get().presentationOptions.theme);
        const project = createProjectSummary(profile.fileName, get().activeProjectId || "local-project");
        if (rows.length) registerQueryableDataset({ datasetId, profile, rows, source: get().persistenceMode === "supabase" ? "supabase" : "local" });
        set({
          currentProject: project,
          profile,
          datasetProfile: profile,
          dashboard,
          dashboardSpec: dashboard,
          isDashboardEditing: false,
          dashboardEditDraft: null,
          presentation,
          presentationSpec: presentation,
          activeDatasetId: datasetId,
          activeDatasetVersionId: profile.datasetVersionId ?? "",
          activeDashboardId: dashboard.id,
          activePresentationId: presentation.id,
          uploadedFileName: profile.fileName,
          isDemoMode: false,
          versions: [dashboard],
          copilotUndoStack: [],
          copilotRedoStack: [],
          pendingCopilotConfirmation: undefined
        });
      },
      startDashboardEditing: () => set({ isDashboardEditing: true, dashboardEditDraft: structuredClone(get().dashboard) }),
      cancelDashboardEditing: () => set({ isDashboardEditing: false, dashboardEditDraft: null }),
      updateDashboardDraftTitle: (title) => {
        const draft = get().dashboardEditDraft ?? get().dashboard;
        set({ isDashboardEditing: true, dashboardEditDraft: updateDashboardTitle(draft, title) });
      },
      updateDashboardDraftSubtitle: (subtitle) => {
        const draft = get().dashboardEditDraft ?? get().dashboard;
        set({ isDashboardEditing: true, dashboardEditDraft: updateDashboardSubtitle(draft, subtitle) });
      },
      updateDashboardDraftDesign: (design) => {
        const draft = get().dashboardEditDraft ?? get().dashboard;
        set({ isDashboardEditing: true, dashboardEditDraft: updateDashboardDesign(draft, design) });
      },
      updateDashboardDesign: (design) => {
        const dashboard = updateDashboardDesign(get().dashboard, design);
        const presentation = generatePresentationSpec(dashboard, get().presentationOptions.theme);
        set({
          dashboard,
          dashboardSpec: dashboard,
          presentation,
          presentationSpec: presentation,
          activePresentationId: presentation.id,
          versions: [...get().versions, dashboard]
        });
      },
      updateDashboardDraftWidget: (widgetId, changes) => {
        const draft = get().dashboardEditDraft ?? get().dashboard;
        set({ isDashboardEditing: true, dashboardEditDraft: updateDashboardWidgetSpec(draft, widgetId, changes) });
      },
      updateDashboardWidget: (widgetId, changes) => {
        const dashboard = updateDashboardWidgetSpec(get().dashboard, widgetId, changes);
        const presentation = generatePresentationSpec(dashboard, get().presentationOptions.theme);
        set({
          dashboard,
          dashboardSpec: dashboard,
          presentation,
          presentationSpec: presentation,
          activePresentationId: presentation.id,
          versions: dashboard === get().dashboard ? get().versions : [...get().versions, dashboard]
        });
      },
      moveDashboardDraftWidget: (sourceWidgetId, targetWidgetId) => {
        const draft = get().dashboardEditDraft ?? get().dashboard;
        const nextDraft = moveDashboardWidget(draft, sourceWidgetId, targetWidgetId);
        set({
          isDashboardEditing: true,
          dashboardEditDraft: nextDraft
        });
      },
      addDashboardWidget: (widget) => {
        const dashboard = { ...get().dashboard, widgets: [...get().dashboard.widgets, widget], updatedAt: new Date().toISOString() };
        const presentation = generatePresentationSpec(dashboard, get().presentationOptions.theme);
        set({
          dashboard,
          dashboardSpec: dashboard,
          presentation,
          presentationSpec: presentation,
          activePresentationId: presentation.id,
          versions: [...get().versions, dashboard]
        });
      },
      duplicateDashboardWidget: (widgetId) => {
        const dashboard = duplicateDashboardWidgetSpec(get().dashboard, widgetId);
        const presentation = generatePresentationSpec(dashboard, get().presentationOptions.theme);
        set({
          dashboard,
          dashboardSpec: dashboard,
          presentation,
          presentationSpec: presentation,
          activePresentationId: presentation.id,
          versions: dashboard === get().dashboard ? get().versions : [...get().versions, dashboard]
        });
      },
      removeDashboardWidget: (widgetId) => {
        const dashboard = removeDashboardWidgetSpec(get().dashboard, widgetId);
        const presentation = generatePresentationSpec(dashboard, get().presentationOptions.theme);
        set({
          dashboard,
          dashboardSpec: dashboard,
          presentation,
          presentationSpec: presentation,
          activePresentationId: presentation.id,
          versions: dashboard === get().dashboard ? get().versions : [...get().versions, dashboard],
          viewState: { ...get().viewState, highlightedWidgetId: get().viewState.highlightedWidgetId === widgetId ? undefined : get().viewState.highlightedWidgetId }
        });
      },
      setDashboardWidgetHidden: (widgetId, hidden) => {
        const dashboard = setDashboardWidgetHiddenSpec(get().dashboard, widgetId, hidden);
        const presentation = generatePresentationSpec(dashboard, get().presentationOptions.theme);
        set({
          dashboard,
          dashboardSpec: dashboard,
          presentation,
          presentationSpec: presentation,
          activePresentationId: presentation.id,
          versions: dashboard === get().dashboard ? get().versions : [...get().versions, dashboard]
        });
      },
      openWidgetDataExplorer: (widgetId) => {
        const widget = get().dashboard.widgets.find((item) => item.id === widgetId);
        if (!widget) return;
        const columns = [
          widget.query?.x?.field,
          ...(widget.query?.groupBy ?? []),
          widget.query?.metric?.field,
          ...((widget.config.columns as string[] | undefined) ?? [])
        ].filter((field): field is string => Boolean(field));
        const visibleColumns = Array.from(new Set(columns)).filter((field) => get().profile.columns.some((column) => column.normalizedName === field));
        const viewState = {
          ...get().viewState,
          highlightedWidgetId: widgetId,
          dataExplorer: {
            ...get().viewState.dataExplorer,
            isOpen: true,
            visibleColumns: visibleColumns.length ? visibleColumns : get().profile.columns.map((column) => column.normalizedName).slice(0, 8)
          }
        };
        set({ viewState, filters: viewState });
      },
      duplicateDashboardDraftWidget: (widgetId) => {
        const draft = get().dashboardEditDraft ?? get().dashboard;
        set({ isDashboardEditing: true, dashboardEditDraft: duplicateDashboardWidgetSpec(draft, widgetId) });
      },
      removeDashboardDraftWidget: (widgetId) => {
        const draft = get().dashboardEditDraft ?? get().dashboard;
        set({ isDashboardEditing: true, dashboardEditDraft: removeDashboardWidgetSpec(draft, widgetId) });
      },
      setDashboardDraftWidgetHidden: (widgetId, hidden) => {
        const draft = get().dashboardEditDraft ?? get().dashboard;
        set({ isDashboardEditing: true, dashboardEditDraft: setDashboardWidgetHiddenSpec(draft, widgetId, hidden) });
      },
      commitDashboardEditing: () => {
        const draft = get().dashboardEditDraft;
        if (!draft) return null;
        const presentation = generatePresentationSpec(draft, get().presentationOptions.theme);
        set({
          dashboard: draft,
          dashboardSpec: draft,
          presentation,
          presentationSpec: presentation,
          activeDashboardId: draft.id,
          activePresentationId: presentation.id,
          versions: [...get().versions, draft],
          isDashboardEditing: false,
          dashboardEditDraft: null
        });
        return draft;
      },
      setPersistenceState: (state) =>
        set((current) => ({
          ...state,
          currentProject: state.activeProjectId
            ? { ...current.currentProject, id: state.activeProjectId }
            : current.currentProject,
          outboxCount: state.outboxCount ?? outboxCount()
        })),
      retryPendingSync: async () => {
        set({ syncStatus: "pending", persistenceStatus: "Reintentando sincronizacion pendiente...", outboxCount: outboxCount() });
        const results = await flushOutboxDueItems();
        const failed = results.find((result) => !result.success);
        set({
          syncStatus: failed ? "retrying" : "saved",
          persistenceStatus: failed ? `Sincronizacion pendiente. ID: ${failed.correlationId}` : "Cambios pendientes sincronizados.",
          lastSyncCorrelationId: failed?.correlationId,
          lastSyncError: failed && "error" in failed ? failed.error.userMessage : undefined,
          outboxCount: outboxCount()
        });
      },
      setViewState: (viewState) =>
        set((current) => {
          const nextViewState = {
            ...current.viewState,
            ...viewState,
            filters: viewState.filters ?? current.viewState.filters ?? [],
            dataExplorer: viewState.dataExplorer
              ? { ...current.viewState.dataExplorer, ...viewState.dataExplorer }
              : current.viewState.dataExplorer
          };
          return { viewState: nextViewState, filters: nextViewState };
        }),
      selectDashboardTarget: (targetType, targetId) => {
        const viewState = targetViewState(get().dashboard, get().viewState, targetType, targetId);
        set({ viewState, filters: viewState });
      },
      clearSelectedTarget: () => {
        const viewState = targetViewState(get().dashboard, get().viewState, "none");
        set({ viewState, filters: viewState });
      },
      setCopilotIntent: (intent) => {
        const viewState = { ...get().viewState, copilotIntent: intent };
        set({ viewState, filters: viewState });
      },
      updateColumnDictionary: (field, changes) => {
        const profile = withColumnDictionary(get().profile, field, changes);
        set({
          profile,
          datasetProfile: profile
        });
      },
      resetFilters: () => {
        const viewState = { filters: [], selectedDateRange: undefined };
        set({ viewState, filters: viewState });
      },
      sendPrompt: async (prompt) => {
        const userMessage: ChatMessage = { id: crypto.randomUUID(), role: "user", content: prompt, createdAt: new Date().toISOString() };
        const before = get();
        set({
          messages: [...before.messages, userMessage],
          chatMessages: [...before.messages, userMessage],
          isCopilotThinking: true,
          pendingCopilotConfirmation: undefined,
          pendingCopilotPlan: undefined,
          copilotStatus: "interpreting",
          copilotPlan: undefined,
          copilotDiff: [],
          copilotEvidence: []
        });
        try {
          const sampleRows = getQueryableRowsSample(before.activeDatasetVersionId || before.profile.datasetVersionId || before.activeDatasetId, 25);
          const copilotContext = buildCopilotContext({
            rows: sampleRows,
            datasetProfile: before.profile,
            dashboardSpec: before.dashboard,
            viewState: before.viewState,
            presentationSpec: before.presentation,
            messages: before.messages
          });
          const revisionId = before.copilotTransactionState?.currentRevisionId ?? before.dashboard.updatedAt ?? before.dashboard.id;
          const resolved = resolveCopilotContext({
            projectId: before.activeProjectId || before.currentProject.id || "local-project",
            dashboardId: before.activeDashboardId || before.dashboard.id,
            revisionId,
            targetId: before.viewState.selectedTargetId,
            scope: before.viewState.selectedTargetId ? "widget" : "dashboard",
            userMessage: prompt,
            selectedTargetSpec: before.viewState.selectedTargetSpec
          }, {
            actor: { id: "local-user", role: "editor", displayName: "Usuario" },
            projectId: before.activeProjectId || before.currentProject.id || "local-project",
            dashboardId: before.activeDashboardId || before.dashboard.id,
            currentRevisionId: revisionId,
            dashboardSpec: before.dashboard,
            viewState: before.viewState,
            datasetProfile: before.profile,
            semanticModel: copilotContext.semanticModel,
            presentationSpec: before.presentation,
            messages: before.messages
          });
          if (!resolved.success) {
            const botMessage = assistantMessage(`No aplique cambios: ${resolved.error}`);
            set({
              messages: [...get().messages, botMessage],
              chatMessages: [...get().messages, botMessage],
              isCopilotThinking: false,
              copilotStatus: "failed",
              copilotEvidence: [resolved.error]
            });
            return;
          }
          const datasetId = before.activeDatasetId || before.profile.id;
          const datasetVersionId = before.activeDatasetVersionId || before.profile.datasetVersionId || datasetId;
          const analyticalPlan = before.viewState.selectedTargetId
            ? { handled: false as const, needsClarification: false as const }
            : planAnalyticalAnswer({
                prompt,
                datasetProfile: before.profile,
                semanticModel: copilotContext.semanticModel,
                rows: getQueryableRowsForExport(datasetVersionId),
                datasetVersionId
              });
          if (analyticalPlan.handled && analyticalPlan.needsClarification) {
            const botMessage = assistantMessage(`Necesito una aclaracion: ${analyticalPlan.clarification.question ?? "Necesito una metrica o dimension concreta para responder con evidencia."} Opciones: ${analyticalPlan.clarification.options.join(", ")}.`);
            set({
              messages: [...get().messages, botMessage],
              chatMessages: [...get().messages, botMessage],
              isCopilotThinking: false,
              copilotStatus: "clarification",
              copilotPlan: undefined,
              copilotDiff: [],
              copilotEvidence: ["No se ejecuto consulta porque la pregunta analitica era ambigua."]
            });
            return;
          }
          if (analyticalPlan.handled) {
            const current = await executeAggregateQuery({
              datasetId,
              dashboardId: before.activeDashboardId || before.dashboard.id,
              context: before.persistenceMode === "supabase" ? "authenticated" : "local",
              query: analyticalPlan.query
            });
            const previous = analyticalPlan.previousQuery
              ? await executeAggregateQuery({
                  datasetId,
                  dashboardId: before.activeDashboardId || before.dashboard.id,
                  context: before.persistenceMode === "supabase" ? "authenticated" : "local",
                  query: analyticalPlan.previousQuery
                })
              : undefined;
            const answer = formatAnalyticalAnswer(analyticalPlan, current, previous);
            const botMessage: ChatMessage = {
              id: crypto.randomUUID(),
              role: "assistant",
              content: answer.answer,
              analyticalAnswer: answer,
              createdAt: new Date().toISOString()
            };
            set({
              messages: [...get().messages, botMessage],
              chatMessages: [...get().messages, botMessage],
              isCopilotThinking: false,
              copilotStatus: "verified",
              copilotPlan: undefined,
              copilotDiff: [],
              copilotEvidence: [
                `Respuesta analitica: ${answer.evidenceId}`,
                `Metrica: ${answer.metric}`,
                `Periodo: ${answer.period}${answer.periodInferred ? " (inferido)" : ""}`
              ]
            });
            return;
          }
          const plan = createCopilotPlan(resolved.context, prompt);
          const diff = plan.expectedDiff;
          const warningText = plan.warnings.length ? ` Advertencias: ${plan.warnings.join(" ")}` : "";
          if (plan.needsClarification) {
            const botMessage = assistantMessage(`Necesito una aclaracion: ${plan.clarification?.question ?? "Necesito una aclaracion antes de aplicar cambios."} Opciones: ${plan.clarification?.options.join(", ") ?? "cambiar visualizacion, cambiar metrica, agregar filtro, crear nuevo grafico, mejorar layout"}.${warningText}`);
            set({
              messages: [...get().messages, botMessage],
              chatMessages: [...get().messages, botMessage],
              isCopilotThinking: false,
              copilotStatus: "clarification",
              copilotPlan: plan,
              copilotDiff: [],
              copilotEvidence: ["No se ejecuto ningun comando porque la instruccion era ambigua."]
            });
            return;
          }
          const blueprintText = plan.blueprint ? ` Blueprint: ${plan.blueprint.title} con ${plan.blueprint.pages.flatMap((page) => page.widgets).length} widgets planificados.` : "";
          const botMessage = assistantMessage(`Plan listo. Actuando sobre: ${plan.target.title ?? plan.target.id ?? "dashboard"}. Revisa el diff y aplica cuando estes conforme.${blueprintText}${warningText}`);
          set({
            messages: [...get().messages, botMessage],
            chatMessages: [...get().messages, botMessage],
            isCopilotThinking: false,
            pendingCopilotPlan: { id: crypto.randomUUID(), prompt, plan, contextRevisionId: resolved.context.revisionId, createdAt: new Date().toISOString() },
            copilotStatus: plan.requiresConfirmation ? "awaiting_confirmation" : "planned",
            copilotPlan: plan,
            copilotDiff: diff,
            copilotEvidence: [
              `Intencion: ${plan.intent}`,
              `Herramientas: ${plan.actions.map((action) => action.envelope.tool).join(", ")}`,
              `Diff esperado: ${diff.length} cambio(s)`,
              ...(plan.evidence ?? [])
            ]
          });
        } catch (error) {
          const domainError = error instanceof DomainError
            ? error
            : toDomainError(error, {
                code: "ai_provider_unavailable",
                fallbackMessage: "No pude completar la accion. No se aplicaron cambios.",
                executionMode: "provider",
                syncStatus: "failed"
              });
          logDomainError(domainError, "store.copilot");
          const botMessage = assistantMessage(`No pude completar la accion: ${domainError.userMessage} ID: ${domainError.correlationId}`);
          set({
            messages: [...get().messages, botMessage],
            chatMessages: [...get().messages, botMessage],
            isCopilotThinking: false,
            executionMode: domainError.executionMode ?? get().executionMode,
            syncStatus: domainError.syncStatus ?? "failed",
            lastSyncCorrelationId: domainError.correlationId,
            lastSyncError: domainError.userMessage,
            persistenceStatus: `${domainError.userMessage} ID: ${domainError.correlationId}`,
            copilotStatus: "failed",
            copilotEvidence: [domainError.userMessage]
          });
        }
      },
      applyPendingCopilotPlan: () => {
        const pending = get().pendingCopilotPlan;
        if (!pending) return;
        set({ copilotStatus: "executing", isCopilotThinking: true });
        const before = get();
        const revisionId = pending.contextRevisionId;
        const resolved = resolveCopilotContext({
          projectId: before.activeProjectId || before.currentProject.id || "local-project",
          dashboardId: before.activeDashboardId || before.dashboard.id,
          revisionId,
          targetId: before.viewState.selectedTargetId,
          scope: before.viewState.selectedTargetId ? "widget" : "dashboard",
          userMessage: pending.prompt
        }, {
          actor: { id: "local-user", role: "editor", displayName: "Usuario" },
          projectId: before.activeProjectId || before.currentProject.id || "local-project",
          dashboardId: before.activeDashboardId || before.dashboard.id,
          currentRevisionId: revisionId,
          dashboardSpec: before.dashboard,
          viewState: before.viewState,
          datasetProfile: before.profile,
          semanticModel: buildCopilotContext({ rows: [], datasetProfile: before.profile, dashboardSpec: before.dashboard, viewState: before.viewState, presentationSpec: before.presentation, messages: before.messages }).semanticModel,
          presentationSpec: before.presentation,
          messages: before.messages
        });
        if (!resolved.success) {
          const botMessage = assistantMessage(`No aplique cambios: ${resolved.error}`);
          set({ messages: [...get().messages, botMessage], chatMessages: [...get().messages, botMessage], copilotStatus: "failed", isCopilotThinking: false });
          return;
        }
        const executionState = before.copilotTransactionState ?? createExecutionState(resolved.context);
        const executed = executeTransaction({
          envelopes: pending.plan.actions.map((action) => action.envelope),
          context: resolved.context,
          state: executionState,
          confirmed: pending.plan.requiresConfirmation
        });
        if (!executed.success) {
          const botMessage = assistantMessage(`No aplique cambios: ${[...executed.errors, ...executed.warnings].join(" ")}`);
          set({
            messages: [...get().messages, botMessage],
            chatMessages: [...get().messages, botMessage],
            copilotStatus: executed.warnings.length ? "awaiting_confirmation" : "failed",
            copilotEvidence: [...executed.errors, ...executed.warnings],
            isCopilotThinking: false
          });
          return;
        }
        const botMessage = assistantMessage(`Accion aplicada. Revision ${executed.revision.id}. Evidencia: ${executed.auditEvents.map((event) => `${event.tool} (${event.diff.length} cambios)`).join(", ")}.`, executed.auditEvents[0] ? executed.context.dashboardSpec.widgets.length > before.dashboard.widgets.length ? { type: "add_widget", widget: executed.context.dashboardSpec.widgets.at(-1)! } : undefined : undefined);
        const beforeSnapshot = snapshotFromState(before, `Copiloto: ${pending.prompt}`);
        set({
          dashboard: executed.context.dashboardSpec,
          dashboardSpec: executed.context.dashboardSpec,
          viewState: executed.context.viewState,
          filters: executed.context.viewState,
          versions: [...get().versions, executed.context.dashboardSpec],
          copilotUndoStack: withLimitedHistory([...get().copilotUndoStack, beforeSnapshot]),
          copilotRedoStack: [],
          copilotTransactionState: executed.state,
          pendingCopilotPlan: undefined,
          pendingCopilotConfirmation: undefined,
          copilotStatus: "verified",
          copilotDiff: executed.auditEvents.flatMap((event) => event.diff),
          copilotEvidence: executed.auditEvents.map((event) => `${event.tool} aplicado en ${event.resultingRevisionId}`),
          messages: [...get().messages, botMessage],
          chatMessages: [...get().messages, botMessage],
          isCopilotThinking: false
        });
        const effectRepository = createDashboardEffectRepository();
        const assistant = botMessage;
        const userMessage = [...get().messages].reverse().find((message: ChatMessage) => message.role === "user" && message.content === pending.prompt);
        const syncTasks = effectRepository.createCopilotSyncTasks({
          projectId: before.activeProjectId,
          dashboardId: before.activeDashboardId,
          userMessage: userMessage ?? { id: crypto.randomUUID(), role: "user", content: pending.prompt, createdAt: new Date().toISOString() },
          assistantMessage: assistant,
          dashboardVersion: executed.context.dashboardSpec,
          dashboardVersionReason: "accion de copilot command bus"
        });
        if (syncTasks.length) set({ syncStatus: "pending", persistenceStatus: "Sincronizando revision auditada del Copiloto..." });
        for (const task of syncTasks) {
          void task.run()
            .then(() => set({ syncStatus: "saved", persistenceStatus: "Revision del Copiloto sincronizada.", outboxCount: outboxCount(), lastSyncError: undefined }))
            .catch((error) => {
              const domainError = toDomainError(error, {
                code: "supabase_unavailable",
                fallbackMessage: `No se pudo sincronizar ${task.label}.`,
                executionMode: "degraded",
                syncStatus: "retrying"
              });
              logDomainError(domainError, `store.${task.label}`);
              task.outbox();
              set({
                executionMode: "degraded",
                syncStatus: "retrying",
                persistenceMode: "degraded",
                persistenceStatus: `${domainError.userMessage} Reintentaremos automaticamente. ID: ${domainError.correlationId}`,
                lastSyncCorrelationId: domainError.correlationId,
                lastSyncError: domainError.userMessage,
                outboxCount: outboxCount()
              });
            });
        }
      },
      cancelPendingCopilotPlan: () => {
        if (!get().pendingCopilotPlan) return;
        const botMessage = assistantMessage("Accion cancelada. No aplique el plan pendiente.");
        set({
          pendingCopilotPlan: undefined,
          copilotStatus: "idle",
          copilotEvidence: ["El dry-run fue cancelado sin mutar el dashboard."],
          messages: [...get().messages, botMessage],
          chatMessages: [...get().messages, botMessage]
        });
      },
      undoCopilotChange: () => {
        const transaction = get().copilotTransactionState;
        if (transaction?.revisions.length && transaction.revisions.length > 1) {
          const undone = undoTransaction(transaction);
          if (undone.success) {
            const botMessage = assistantMessage(`Deshice usando revision restaurable: ${undone.revision.reason}.`);
            set({
              dashboard: undone.revision.dashboardSpec,
              dashboardSpec: undone.revision.dashboardSpec,
              viewState: undone.revision.viewState,
              filters: undone.revision.viewState,
              copilotTransactionState: undone.state,
              copilotStatus: "reverted",
              copilotEvidence: [`Revision restaurada: ${undone.revision.id}`],
              messages: [...get().messages, botMessage],
              chatMessages: [...get().messages, botMessage]
            });
            return;
          }
        }
        const undoStack = get().copilotUndoStack;
        const previous = undoStack.at(-1);
        if (!previous) return;
        const current = snapshotFromState(get(), "Rehacer cambio del Copiloto");
        const botMessage = assistantMessage(`Deshice: ${previous.reason}.`);
        set({
          dashboard: previous.dashboard,
          dashboardSpec: previous.dashboard,
          viewState: previous.viewState,
          filters: previous.viewState,
          presentation: previous.presentation,
          presentationSpec: previous.presentation,
          activeDashboardId: previous.dashboard.id,
          activePresentationId: previous.presentation.id,
          copilotUndoStack: undoStack.slice(0, -1),
          copilotRedoStack: withLimitedHistory([...get().copilotRedoStack, current]),
          messages: [...get().messages, botMessage],
          chatMessages: [...get().messages, botMessage]
        });
      },
      redoCopilotChange: () => {
        const transaction = get().copilotTransactionState;
        if (transaction?.redoRevisions.length) {
          const redone = redoTransaction(transaction);
          if (redone.success) {
            const botMessage = assistantMessage(`Rehice usando revision restaurable: ${redone.revision.reason}.`);
            set({
              dashboard: redone.revision.dashboardSpec,
              dashboardSpec: redone.revision.dashboardSpec,
              viewState: redone.revision.viewState,
              filters: redone.revision.viewState,
              copilotTransactionState: redone.state,
              copilotStatus: "verified",
              copilotEvidence: [`Revision rehecha: ${redone.revision.id}`],
              messages: [...get().messages, botMessage],
              chatMessages: [...get().messages, botMessage]
            });
            return;
          }
        }
        const redoStack = get().copilotRedoStack;
        const next = redoStack.at(-1);
        if (!next) return;
        const current = snapshotFromState(get(), "Deshacer cambio rehecho");
        const botMessage = assistantMessage(`Rehice: ${next.reason}.`);
        set({
          dashboard: next.dashboard,
          dashboardSpec: next.dashboard,
          viewState: next.viewState,
          filters: next.viewState,
          presentation: next.presentation,
          presentationSpec: next.presentation,
          activeDashboardId: next.dashboard.id,
          activePresentationId: next.presentation.id,
          copilotUndoStack: withLimitedHistory([...get().copilotUndoStack, current]),
          copilotRedoStack: redoStack.slice(0, -1),
          messages: [...get().messages, botMessage],
          chatMessages: [...get().messages, botMessage]
        });
      },
      confirmPendingCopilotAction: () => {
        const pending = get().pendingCopilotConfirmation;
        if (!pending) return;
        const beforeSnapshot = snapshotFromState(get(), `Confirmacion: ${pending.envelope.reason}`);
        const applied = applyDashboardAction(get().dashboard, get().viewState, pending.envelope.action);
        const presentation = generatePresentationSpec(applied.spec, get().presentationOptions.theme);
        const botMessage = assistantMessage(`Confirmado. ${applied.message}`, pending.envelope.action);
        set({
          dashboard: applied.spec,
          dashboardSpec: applied.spec,
          viewState: applied.viewState,
          filters: applied.viewState,
          presentation,
          presentationSpec: presentation,
          activePresentationId: presentation.id,
          versions: [...get().versions, applied.spec],
          copilotUndoStack: withLimitedHistory([...get().copilotUndoStack, beforeSnapshot]),
          copilotRedoStack: [],
          pendingCopilotConfirmation: undefined,
          messages: [...get().messages, botMessage],
          chatMessages: [...get().messages, botMessage]
        });
      },
      cancelPendingCopilotAction: () => {
        if (!get().pendingCopilotConfirmation) return;
        const botMessage = assistantMessage("Accion cancelada. No aplique el cambio pendiente.");
        set({
          pendingCopilotConfirmation: undefined,
          messages: [...get().messages, botMessage],
          chatMessages: [...get().messages, botMessage]
        });
      },
      generatePresentation: () => {
        const presentation = generatePresentationSpec(get().dashboard, get().presentationOptions.theme);
        set({
          presentation,
          presentationSpec: presentation,
          activePresentationId: presentation.id,
          presentationOptions: { ...get().presentationOptions, generated: true }
        });
      },
      setPresentationOptions: (options) => set({ presentationOptions: { ...get().presentationOptions, ...options } }),
      setShareSettings: (settings) => set({ shareSettings: { ...get().shareSettings, ...settings } }),
      saveDashboardTheme: (name, scope = "user") => {
        const trimmed = name.trim();
        if (!trimmed) return null;
        const now = new Date().toISOString();
        const theme: SavedDashboardTheme = {
          id: `theme_${crypto.randomUUID()}`,
          name: trimmed,
          scope,
          design: { ...DEFAULT_DASHBOARD_DESIGN, ...((get().dashboardEditDraft ?? get().dashboard).design ?? {}) },
          createdAt: now,
          updatedAt: now
        };
        set({ savedThemes: [theme, ...get().savedThemes.filter((item) => item.name.toLowerCase() !== trimmed.toLowerCase())].slice(0, 12) });
        return theme;
      },
      applySavedDashboardTheme: (themeId) => {
        const theme = get().savedThemes.find((item) => item.id === themeId);
        if (!theme) return;
        if (get().isDashboardEditing) {
          const draft = get().dashboardEditDraft ?? get().dashboard;
          set({ isDashboardEditing: true, dashboardEditDraft: updateDashboardDesign(draft, theme.design) });
          return;
        }
        const dashboard = updateDashboardDesign(get().dashboard, theme.design);
        const presentation = generatePresentationSpec(dashboard, get().presentationOptions.theme);
        set({
          dashboard,
          dashboardSpec: dashboard,
          presentation,
          presentationSpec: presentation,
          activePresentationId: presentation.id,
          versions: [...get().versions, dashboard]
        });
      },
      deleteSavedDashboardTheme: (themeId) => set({ savedThemes: get().savedThemes.filter((theme) => theme.id !== themeId) }),
      toggleCopilotPanel: () => set({ isCopilotPanelOpen: !get().isCopilotPanelOpen }),
      clearSensitiveWorkspace: () => {
        const current = get();
        clearQueryableDatasets();
        set({
          ...createInitialState(),
          presentationOptions: current.presentationOptions,
          shareSettings: current.shareSettings,
          savedThemes: current.savedThemes,
          isCopilotPanelOpen: current.isCopilotPanelOpen,
          persistenceStatus: "Sesion cerrada. El workspace sensible fue purgado del navegador.",
          browserStorageExpiresAt: browserStorageExpiresAt()
        });
      }
    }),
    {
      name: "dashpilot-mvp",
      version: DASH_PILOT_PERSIST_VERSION,
      migrate: migratePersistedState,
      partialize: safePersistedState
    }
  )
);
