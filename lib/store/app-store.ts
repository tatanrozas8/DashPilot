"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ChatMessage } from "@/types/ai";
import type { DataRow, DatasetProfile, FileParseResult } from "@/types/dataset";
import type { DashboardSpec, DashboardViewState, DashboardWidget } from "@/types/dashboard";
import type { PresentationSpec, PresentationTheme } from "@/types/presentation";
import { buildCopilotContext } from "@/lib/ai/context-builder";
import { requestCopilotResponse } from "@/lib/ai/copilot-client";
import { assistantMessage } from "@/lib/ai/copilot-service";
import { duplicateDashboardWidget, removeDashboardWidget, setDashboardWidgetHidden, updateDashboardTitle, updateDashboardWidget } from "@/lib/dashboard-spec/edit-dashboard-spec";
import { generateDashboardSpec } from "@/lib/dashboard-spec/generate-dashboard-spec";
import { createDemoDataset } from "@/lib/data/demo-dataset";
import { generatePresentationSpec } from "@/lib/presentation-spec/generate-presentation-spec";
import { profileDataset } from "@/lib/profiling/profile-dataset";
import { createDashboardVersion } from "@/lib/supabase/dashboards";
import { saveChatMessage } from "@/lib/supabase/chat";
import { nameFromFile } from "@/lib/utils/name-from-file";

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

export interface ProjectSummary {
  id: string;
  name: string;
  owner: string;
  updatedAt: string;
}

interface DashPilotState {
  currentProject: ProjectSummary;
  rows: DataRow[];
  currentDataset: DataRow[];
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
  activeDashboardId: string;
  activePresentationId: string;
  persistenceMode: "local" | "supabase";
  persistenceStatus: string;
  messages: ChatMessage[];
  chatMessages: ChatMessage[];
  versions: DashboardSpec[];
  isDemoMode: boolean;
  uploadedFileName: string;
  presentationOptions: PresentationOptions;
  shareSettings: ShareSettings;
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
  updateDashboardDraftWidget: (widgetId: string, changes: Partial<DashboardWidget>) => void;
  duplicateDashboardDraftWidget: (widgetId: string) => void;
  removeDashboardDraftWidget: (widgetId: string) => void;
  setDashboardDraftWidgetHidden: (widgetId: string, hidden: boolean) => void;
  commitDashboardEditing: () => DashboardSpec | null;
  setPersistenceState: (state: Partial<Pick<DashPilotState, "activeProjectId" | "activeDatasetId" | "activeDashboardId" | "activePresentationId" | "persistenceMode" | "persistenceStatus">>) => void;
  setViewState: (viewState: Partial<DashboardViewState>) => void;
  sendPrompt: (prompt: string) => Promise<void>;
  resetFilters: () => void;
  generatePresentation: () => void;
  setPresentationOptions: (options: Partial<PresentationOptions>) => void;
  setShareSettings: (settings: Partial<ShareSettings>) => void;
  toggleCopilotPanel: () => void;
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

function createInitialState() {
  const viewState: DashboardViewState = { filters: [] };
  const profile = createEmptyProfile();
  const dashboard = createEmptyDashboard();
  const presentation = createEmptyPresentation();
  return {
    currentProject: { id: "", name: "Sin proyecto activo", owner: "Usuario", updatedAt: "Sube un dataset para comenzar" },
    rows: [],
    currentDataset: [],
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
    activeDashboardId: "",
    activePresentationId: "",
    persistenceMode: "local" as const,
    persistenceStatus: "Sube un dataset para comenzar",
    messages: baseMessages(),
    chatMessages: baseMessages(),
    versions: [],
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
    isCopilotPanelOpen: true,
    isCopilotThinking: false
  };
}

export const useDashPilotStore = create<DashPilotState>()(
  persist(
    (set, get) => ({
      ...createInitialState(),
      setDataset: (rows, fileName) => {
        const profile = profileDataset(rows, fileName);
        const dashboard = generateDashboardSpec(profile, rows);
        const presentation = generatePresentationSpec(dashboard);
        const messages = [assistantMessage("Archivo analizado. Detecte metricas, dimensiones y filtros recomendados.")];
        const project = createProjectSummary(fileName);
        set({
          currentProject: project,
          rows,
          currentDataset: rows,
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
          activeDashboardId: dashboard.id,
          activePresentationId: presentation.id,
          messages,
          chatMessages: messages,
          versions: [dashboard],
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
        set({
          currentProject: project,
          rows,
          currentDataset: rows,
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
          activeDashboardId: dashboard.id,
          activePresentationId: presentation.id,
          persistenceMode: "local",
          persistenceStatus: "Dataset listo en modo local",
          messages,
          chatMessages: messages,
          versions: [dashboard],
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
        set({
          currentProject: project,
          rows: selected.rows,
          currentDataset: selected.rows,
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
          activeDashboardId: dashboard.id,
          activePresentationId: presentation.id,
          versions: [dashboard]
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
        set({
          currentProject: project,
          rows,
          currentDataset: rows,
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
          activeDashboardId: dashboard.id,
          activePresentationId: presentation.id,
          persistenceMode: "local",
          persistenceStatus: "Datos de ejemplo cargados",
          messages,
          chatMessages: messages,
          versions: [dashboard],
          isDemoMode: true,
          uploadedFileName: exampleFileName
        });
      },
      generateDashboard: () => {
        const { profile, rows } = get();
        const dashboard = generateDashboardSpec(profile, rows);
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
        set({
          currentProject: project,
          rows,
          currentDataset: rows,
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
          activeDashboardId: dashboard.id,
          activePresentationId: presentation.id,
          isDemoMode: false,
          uploadedFileName: nextProfile.fileName,
          versions: [dashboard]
        });
      },
      hydrateDataset: ({ rows, profile, datasetId }) => {
        const dashboard = generateDashboardSpec(profile, rows);
        const presentation = generatePresentationSpec(dashboard, get().presentationOptions.theme);
        const project = createProjectSummary(profile.fileName, get().activeProjectId || "local-project");
        set({
          currentProject: project,
          rows,
          currentDataset: rows,
          profile,
          datasetProfile: profile,
          dashboard,
          dashboardSpec: dashboard,
          isDashboardEditing: false,
          dashboardEditDraft: null,
          presentation,
          presentationSpec: presentation,
          activeDatasetId: datasetId,
          activeDashboardId: dashboard.id,
          activePresentationId: presentation.id,
          uploadedFileName: profile.fileName,
          isDemoMode: false,
          versions: [dashboard]
        });
      },
      startDashboardEditing: () => set({ isDashboardEditing: true, dashboardEditDraft: structuredClone(get().dashboard) }),
      cancelDashboardEditing: () => set({ isDashboardEditing: false, dashboardEditDraft: null }),
      updateDashboardDraftTitle: (title) => {
        const draft = get().dashboardEditDraft ?? get().dashboard;
        set({ isDashboardEditing: true, dashboardEditDraft: updateDashboardTitle(draft, title) });
      },
      updateDashboardDraftWidget: (widgetId, changes) => {
        const draft = get().dashboardEditDraft ?? get().dashboard;
        set({ isDashboardEditing: true, dashboardEditDraft: updateDashboardWidget(draft, widgetId, changes) });
      },
      duplicateDashboardDraftWidget: (widgetId) => {
        const draft = get().dashboardEditDraft ?? get().dashboard;
        set({ isDashboardEditing: true, dashboardEditDraft: duplicateDashboardWidget(draft, widgetId) });
      },
      removeDashboardDraftWidget: (widgetId) => {
        const draft = get().dashboardEditDraft ?? get().dashboard;
        set({ isDashboardEditing: true, dashboardEditDraft: removeDashboardWidget(draft, widgetId) });
      },
      setDashboardDraftWidgetHidden: (widgetId, hidden) => {
        const draft = get().dashboardEditDraft ?? get().dashboard;
        set({ isDashboardEditing: true, dashboardEditDraft: setDashboardWidgetHidden(draft, widgetId, hidden) });
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
            : current.currentProject
        })),
      setViewState: (viewState) =>
        set({
          viewState: { ...get().viewState, ...viewState },
          filters: { ...get().viewState, ...viewState }
        }),
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
          isCopilotThinking: true
        });
        try {
          const copilotContext = buildCopilotContext({
            rows: before.rows,
            datasetProfile: before.profile,
            dashboardSpec: before.dashboard,
            viewState: before.viewState,
            presentationSpec: before.presentation,
            messages: before.messages
          });
          const result = await requestCopilotResponse({
            prompt,
            datasetProfile: before.profile,
            semanticModel: copilotContext.semanticModel,
            dashboardSpec: before.dashboard,
            viewState: before.viewState,
            presentationSpec: before.presentation,
            messages: before.messages,
            copilotContext
          });
          let nextDashboard = result.updatedDashboardSpec ?? get().dashboard;
          let nextViewState = result.updatedViewState ?? get().viewState;
          let nextPresentation = result.updatedPresentationSpec ?? get().presentation;
          if (result.actions?.some((action) => action.type === "generate_presentation")) {
            nextPresentation = generatePresentationSpec(nextDashboard, get().presentationOptions.theme);
          }
          const warningText = result.warnings?.length ? ` Advertencias: ${result.warnings.join(" ")}` : "";
          const botMessage = assistantMessage(`${result.reply}${warningText}`, result.action);
          const dashboardChanged = nextDashboard !== get().dashboard;
          const presentationChanged = nextPresentation !== get().presentation;
          set({
            dashboard: nextDashboard,
            dashboardSpec: nextDashboard,
            viewState: nextViewState,
            filters: nextViewState,
            presentation: nextPresentation,
            presentationSpec: nextPresentation,
            activePresentationId: nextPresentation.id,
            messages: [...get().messages, botMessage],
            chatMessages: [...get().messages, botMessage],
            versions: dashboardChanged ? [...get().versions, nextDashboard] : get().versions,
            presentationOptions: presentationChanged ? { ...get().presentationOptions, generated: true } : get().presentationOptions,
            isCopilotThinking: false
          });
          void saveChatMessage(before.activeProjectId, before.activeDashboardId, userMessage);
          void saveChatMessage(before.activeProjectId, before.activeDashboardId, botMessage);
          if (dashboardChanged) void createDashboardVersion(before.activeDashboardId, nextDashboard, "accion de copilot");
        } catch {
          set({ isCopilotThinking: false });
        }
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
      toggleCopilotPanel: () => set({ isCopilotPanelOpen: !get().isCopilotPanelOpen })
    }),
    {
      name: "dashpilot-mvp",
      version: 2,
      migrate: (persistedState) => {
        const state = persistedState as Partial<DashPilotState>;
        const legacyProjectName = ["Analisis Comercial", "Q2", "2024"].join(" ");
        const legacyProjectId = ["demo", "project"].join("-");
        const legacyFileName = `${["Ventas", "Q2", "2024"].join("_")}.xlsx`;
        const legacyProject = state.currentProject?.name === legacyProjectName || state.activeProjectId === legacyProjectId;
        const legacyFile = state.uploadedFileName === legacyFileName || state.profile?.fileName === legacyFileName;
        if (legacyProject || legacyFile) return createInitialState();
        return { ...createInitialState(), ...state };
      },
      partialize: (state) => ({
        currentProject: state.currentProject,
        rows: state.rows,
        currentDataset: state.currentDataset,
        parsedDataset: state.parsedDataset,
        selectedSheetName: state.selectedSheetName,
        importWarnings: state.importWarnings,
        activeProjectId: state.activeProjectId,
        activeDatasetId: state.activeDatasetId,
        activeDashboardId: state.activeDashboardId,
        activePresentationId: state.activePresentationId,
        persistenceMode: state.persistenceMode,
        persistenceStatus: state.persistenceStatus,
        profile: state.profile,
        datasetProfile: state.datasetProfile,
        dashboard: state.dashboard,
        dashboardSpec: state.dashboardSpec,
        viewState: state.viewState,
        filters: state.filters,
        presentation: state.presentation,
        presentationSpec: state.presentationSpec,
        messages: state.messages,
        chatMessages: state.chatMessages,
        versions: state.versions,
        isDemoMode: state.isDemoMode,
        uploadedFileName: state.uploadedFileName,
        presentationOptions: state.presentationOptions,
        shareSettings: state.shareSettings,
        isCopilotPanelOpen: state.isCopilotPanelOpen
      })
    }
  )
);
