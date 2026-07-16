import { afterEach, describe, expect, it } from "vitest";
import { inspectBrowserStorageForSensitiveText, purgeDashPilotBrowserState, purgeSensitiveBrowserStorage } from "@/lib/security/browser-storage";
import { migratePersistedState, useDashPilotStore } from "@/lib/store/app-store";
import { persistDashboard } from "@/lib/data-access";
import { saveLocalDataset } from "@/lib/supabase/datasets";
import type { DashboardSpec } from "@/types/dashboard";
import type { DataRow, DatasetProfile, FileParseResult } from "@/types/dataset";

function sensitiveRows(): DataRow[] {
  return [
    {
      customer_name: "ACME Private Holdings",
      private_note: "<script>fetch('/steal?token=abc')</script>",
      revenue: 42
    }
  ];
}

function testProfile(): DatasetProfile {
  return {
    id: "dataset_sensitive",
    fileName: "board_private_pipeline.csv",
    rowCount: 1,
    columnCount: 3,
    columns: [],
    detectedDateColumns: [],
    detectedMetricColumns: ["revenue"],
    detectedDimensionColumns: ["customer_name"],
    detectedGeoColumns: [],
    qualityWarnings: [],
    qualityScore: 100,
    createdAt: "2026-07-16T00:00:00.000Z"
  };
}

function parsedDataset(rows: DataRow[]): FileParseResult {
  return {
    fileName: "board_private_pipeline.csv",
    fileType: "csv",
    fileSize: 128,
    selectedSheetName: "CSV",
    warnings: [],
    sheets: [
      {
        name: "CSV",
        rowCount: rows.length,
        columnCount: 3,
        isSelected: true,
        columns: [],
        rows,
        previewRows: rows
      }
    ]
  };
}

function dashboardSpec(): DashboardSpec {
  const now = "2026-07-16T00:00:00.000Z";
  return {
    id: "dashboard_sensitive",
    title: "Sensitive dashboard",
    datasetId: "dataset_sensitive",
    globalFilters: [],
    widgets: [],
    createdAt: now,
    updatedAt: now
  };
}

afterEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  useDashPilotStore.getState().clearSensitiveWorkspace();
});

describe("browser storage security policy", () => {
  it("persists only safe store preferences and ids", async () => {
    window.localStorage.clear();
    const rows = sensitiveRows();

    useDashPilotStore.getState().setDataset(rows, "board_private_pipeline.csv");
    useDashPilotStore.getState().setPresentationOptions({ durationMinutes: 10 });

    const serialized = window.localStorage.getItem("dashpilot-mvp") ?? "";
    expect(serialized).toContain("durationMinutes");
    expect(serialized).not.toContain("ACME Private Holdings");
    expect(serialized).not.toContain("private_note");
    expect(serialized).not.toContain("board_private_pipeline.csv");
    expect(serialized).not.toContain("<script>");
    await expect(inspectBrowserStorageForSensitiveText(["ACME Private Holdings", "<script>", "private_note"])).resolves.toEqual([]);
  });

  it("migrates legacy persisted state without rows, profiles, messages or specs", () => {
    const migrated = migratePersistedState({
      rows: sensitiveRows(),
      currentDataset: sensitiveRows(),
      parsedDataset: parsedDataset(sensitiveRows()),
      profile: testProfile(),
      dashboard: dashboardSpec(),
      messages: [{ id: "msg-1", role: "user", content: "ACME Private Holdings", createdAt: "2026-07-16T00:00:00.000Z" }],
      activeDatasetId: "dataset_sensitive",
      presentationOptions: useDashPilotStore.getState().presentationOptions,
      shareSettings: useDashPilotStore.getState().shareSettings,
      savedThemes: [],
      isCopilotPanelOpen: true,
      isDemoMode: false,
      persistenceMode: "local",
      persistenceStatus: "legacy",
      executionMode: "offline/local",
      syncStatus: "saved",
      outboxCount: 0
    });
    const serialized = JSON.stringify(migrated);

    expect(serialized).toContain("dataset_sensitive");
    expect(serialized).not.toContain("ACME Private Holdings");
    expect(serialized).not.toContain("board_private_pipeline.csv");
    expect("rows" in migrated).toBe(false);
    expect("dashboard" in migrated).toBe(false);
    expect("messages" in migrated).toBe(false);
  });

  it("keeps local sandbox data in memory instead of localStorage", async () => {
    const rows = sensitiveRows();
    const spec = dashboardSpec();

    saveLocalDataset("dataset_sensitive", { parsed: parsedDataset(rows), profile: testProfile(), rows });
    await persistDashboard({ spec, viewState: { filters: [] }, rows, profile: testProfile() });

    const serializedStorage = JSON.stringify({ ...window.localStorage });
    expect(serializedStorage).not.toContain("ACME Private Holdings");
    expect(serializedStorage).not.toContain("dashboard_sensitive");
    await expect(inspectBrowserStorageForSensitiveText(["ACME Private Holdings", "dashboard_sensitive"])).resolves.toEqual([]);
  });

  it("purges legacy unsafe keys on logout or user change", () => {
    window.localStorage.setItem("dashpilot:dataset:legacy", JSON.stringify({ rows: sensitiveRows() }));
    window.localStorage.setItem("dashpilot:dashboard:legacy", JSON.stringify({ spec: dashboardSpec() }));
    window.localStorage.setItem("dashpilot:sync-outbox", JSON.stringify({ payload: sensitiveRows() }));
    window.localStorage.setItem("dashpilot-mvp", JSON.stringify({ state: { rows: sensitiveRows() }, version: 2 }));

    const removed = purgeDashPilotBrowserState();

    expect(removed).toEqual(expect.arrayContaining(["dashpilot:dataset:legacy", "dashpilot:dashboard:legacy", "dashpilot:sync-outbox", "dashpilot-mvp"]));
    expect(window.localStorage.getItem("dashpilot:dataset:legacy")).toBeNull();
    expect(window.localStorage.getItem("dashpilot-mvp")).toBeNull();
  });

  it("removes known unsafe legacy keys without removing safe preferences", () => {
    window.localStorage.setItem("dashpilot.workspaceName", "Finance Ops");
    window.localStorage.setItem("dashpilot:share:token", "secret-token");

    purgeSensitiveBrowserStorage();

    expect(window.localStorage.getItem("dashpilot.workspaceName")).toBe("Finance Ops");
    expect(window.localStorage.getItem("dashpilot:share:token")).toBeNull();
  });
});
