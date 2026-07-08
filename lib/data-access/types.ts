import type { DataRow, DatasetProfile, FileParseResult } from "@/types/dataset";
import type { DashboardSpec, DashboardViewState } from "@/types/dashboard";
import type { PresentationSpec } from "@/types/presentation";
import type { ShareLink } from "@/types/export";

export type PersistenceMode = "supabase" | "local";

export interface PersistenceResult {
  mode: PersistenceMode;
  warning?: string;
}

export interface DatasetPersistResult extends PersistenceResult {
  datasetId: string;
  projectId?: string;
  storagePath?: string;
  profile: DatasetProfile;
  rows: DataRow[];
}

export interface DashboardPersistResult extends PersistenceResult {
  dashboardId: string;
}

export interface PresentationPersistResult extends PersistenceResult {
  presentationId: string;
}

export interface SharePersistResult extends PersistenceResult {
  token: string;
  url: string;
  link: ShareLink;
}

export interface ParsedDatasetPayload {
  file?: File;
  parsed: FileParseResult;
}

export interface PersistedDashboardPayload {
  spec: DashboardSpec;
  viewState: DashboardViewState;
  rows?: DataRow[];
  profile?: DatasetProfile;
}

export interface PublicSharedDashboard {
  link: ShareLink;
  dashboard: DashboardSpec;
  viewState: DashboardViewState;
  rows: DataRow[];
  profile?: DatasetProfile;
}
