import type { DataRow, DatasetProfile, FileParseResult } from "@/types/dataset";
import type { DashboardSpec, DashboardViewState } from "@/types/dashboard";
import type { ShareLink } from "@/types/export";
import type { ObservableOperation } from "@/lib/observability/modes";

export type PersistenceMode = "supabase" | "local" | "degraded";

export interface PersistenceResult extends ObservableOperation {
  mode: PersistenceMode;
  warning?: string;
  recoverable?: boolean;
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
