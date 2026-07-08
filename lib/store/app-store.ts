"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ChatMessage } from "@/types/ai";
import type { DataRow, DatasetProfile, FileParseResult } from "@/types/dataset";
import type { DashboardSpec, DashboardViewState } from "@/types/dashboard";
import type { PresentationSpec, PresentationTheme } from "@/types/presentation";
import { createCopilotAction, assistantMessage } from "@/lib/ai/mock-copilot";
import { applyDashboardAction } from "@/lib/dashboard-spec/apply-dashboard-action";
import { generateDashboardSpec } from "@/lib/dashboard-spec/generate-dashboard-spec";
import { createDemoDataset } from "@/lib/data/demo-dataset";
import { demoDashboardSpec, demoDataset, demoDatasetProfile, demoPresentationSpec, demoProject } from "@/lib/demo/demo-data";
import { generatePresentationSpec } from "@/lib/presentation-spec/generate-presentation-spec";
import { profileDataset } from "@/lib/profiling/profile-dataset";
import { createDashboardVersion } from "@/lib/supabase/dashboards";
import { saveChatMessage } from "@/lib/supabase/chat";

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

interface DashPilotState {
  currentProject: typeof demoProject;
  rows: DataRow[];
  currentDataset: DataRow[];
  profile: DatasetProfile;
  datasetProfile: DatasetProfile;
  dashboard: DashboardSpec;
  dashboardSpec: DashboardSpec;
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
  setDataset: (rows: DataRow[], fileName: string) => void;
  setParsedDataset: (parsed: FileParseResult) => void;
  selectSheet: (sheetName: string) => void;
  loadDemo: () => void;
  generateDashboard: () => DashboardSpec;
  hydrateDataset: (payload: { rows: DataRow[]; profile: DatasetProfile; datasetId: string }) => void;
  hydrateDashboard: (payload: { rows: DataRow[]; dashboard: DashboardSpec; viewState?: DashboardViewState; profile?: DatasetProfile }) => void;
  setPersistenceState: (state: Partial<Pick<DashPilotState, "activeProjectId" | "activeDatasetId" | "activeDashboardId" | "activePresentationId" | "persistenceMode" | "persistenceStatus">>) => void;
  setViewState: (viewState: Partial<DashboardViewState>) => void;
  sendPrompt: (prompt: string) => void;
  resetFilters: () => void;
  generatePresentation: () => void;
  setPresentationOptions: (options: Partial<PresentationOptions>) => void;
  setShareSettings: (settings: Partial<ShareSettings>) => void;
}

function baseMessages() {
  return [
    assistantMessage(
      "He analizado tu dashboard y puedo ayudarte a hacerlo mas ejecutivo, aplicar filtros, cambiar graficos o preparar una presentacion."
    )
  ];
}

function createInitialState() {
  const viewState: DashboardViewState = { filters: [], selectedDateRange: { from: "2024-01-01", to: "2024-06-30" } };
  return {
    currentProject: demoProject,
    rows: demoDataset,
    currentDataset: demoDataset,
    profile: demoDatasetProfile,
    datasetProfile: demoDatasetProfile,
    dashboard: demoDashboardSpec,
    dashboardSpec: demoDashboardSpec,
    viewState,
    filters: viewState,
    presentation: demoPresentationSpec,
    presentationSpec: demoPresentationSpec,
    parsedDataset: null,
    selectedSheetName: "Demo",
    importWarnings: [],
    activeProjectId: "demo-project",
    activeDatasetId: demoDatasetProfile.id,
    activeDashboardId: demoDashboardSpec.id,
    activePresentationId: demoPresentationSpec.id,
    persistenceMode: "local" as const,
    persistenceStatus: "Modo local",
    messages: baseMessages(),
    chatMessages: baseMessages(),
    versions: [demoDashboardSpec],
    isDemoMode: true,
    uploadedFileName: "Ventas_Q2_2024.xlsx",
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
    }
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
        set({
          rows,
          currentDataset: rows,
          profile,
          datasetProfile: profile,
          dashboard,
          dashboardSpec: dashboard,
          viewState: { filters: [], selectedDateRange: undefined },
          filters: { filters: [], selectedDateRange: undefined },
          presentation,
          presentationSpec: presentation,
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
        set({
          rows,
          currentDataset: rows,
          profile,
          datasetProfile: profile,
          dashboard,
          dashboardSpec: dashboard,
          viewState,
          filters: viewState,
          presentation,
          presentationSpec: presentation,
          parsedDataset: parsed,
          selectedSheetName: selected?.name ?? parsed.selectedSheetName,
          importWarnings: parsed.warnings,
          activeProjectId: "local-project",
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
        set({
          rows: selected.rows,
          currentDataset: selected.rows,
          profile,
          datasetProfile: profile,
          dashboard,
          dashboardSpec: dashboard,
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
        const profile = profileDataset(rows, "Ventas_Q2_2024.xlsx");
        const dashboard = generateDashboardSpec(profile, rows);
        const presentation = generatePresentationSpec(dashboard);
        const viewState: DashboardViewState = { filters: [], selectedDateRange: { from: "2024-01-01", to: "2024-06-30" } };
        const messages = [assistantMessage("Demo cargada. Ya puedes revisar el dataset o generar el dashboard.")];
        set({
          rows,
          currentDataset: rows,
          profile,
          datasetProfile: profile,
          dashboard,
          dashboardSpec: dashboard,
          viewState,
          filters: viewState,
          presentation,
          presentationSpec: presentation,
          parsedDataset: null,
          selectedSheetName: "Demo",
          importWarnings: [],
          activeProjectId: "demo-project",
          activeDatasetId: profile.id,
          activeDashboardId: dashboard.id,
          activePresentationId: presentation.id,
          persistenceMode: "local",
          persistenceStatus: "Demo cargada",
          messages,
          chatMessages: messages,
          versions: [dashboard],
          isDemoMode: true,
          uploadedFileName: "Ventas_Q2_2024.xlsx"
        });
      },
      generateDashboard: () => {
        const { profile, rows } = get();
        const dashboard = generateDashboardSpec(profile, rows);
        const presentation = generatePresentationSpec(dashboard);
        set({
          dashboard,
          dashboardSpec: dashboard,
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
        set({
          rows,
          currentDataset: rows,
          profile: nextProfile,
          datasetProfile: nextProfile,
          dashboard,
          dashboardSpec: dashboard,
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
        set({
          rows,
          currentDataset: rows,
          profile,
          datasetProfile: profile,
          dashboard,
          dashboardSpec: dashboard,
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
      setPersistenceState: (state) => set(state),
      setViewState: (viewState) =>
        set({
          viewState: { ...get().viewState, ...viewState },
          filters: { ...get().viewState, ...viewState }
        }),
      resetFilters: () => {
        const viewState = { filters: [], selectedDateRange: { from: "2024-01-01", to: "2024-06-30" } };
        set({ viewState, filters: viewState });
      },
      sendPrompt: (prompt) => {
        const userMessage: ChatMessage = { id: crypto.randomUUID(), role: "user", content: prompt, createdAt: new Date().toISOString() };
        const before = get();
        const { reply, action } = createCopilotAction(prompt, before.dashboard);
        let nextDashboard = get().dashboard;
        let nextViewState = get().viewState;
        let finalReply = reply;
        if (action && action.type !== "generate_presentation") {
          const applied = applyDashboardAction(nextDashboard, nextViewState, action);
          nextDashboard = applied.spec;
          nextViewState = applied.viewState;
          finalReply = `${reply} ${applied.message}`;
        }
        const botMessage = assistantMessage(finalReply, action);
        const dashboardChanged = nextDashboard !== get().dashboard;
        set({
          dashboard: nextDashboard,
          dashboardSpec: nextDashboard,
          viewState: nextViewState,
          filters: nextViewState,
          messages: [...get().messages, userMessage, botMessage],
          chatMessages: [...get().messages, userMessage, botMessage],
          versions: dashboardChanged ? [...get().versions, nextDashboard] : get().versions
        });
        void saveChatMessage(before.activeProjectId, before.activeDashboardId, userMessage);
        void saveChatMessage(before.activeProjectId, before.activeDashboardId, botMessage);
        if (dashboardChanged) void createDashboardVersion(before.activeDashboardId, nextDashboard, "accion de copilot");
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
      setShareSettings: (settings) => set({ shareSettings: { ...get().shareSettings, ...settings } })
    }),
    {
      name: "dashpilot-mvp",
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
        shareSettings: state.shareSettings
      })
    }
  )
);
