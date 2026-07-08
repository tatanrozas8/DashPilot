"use client";

import type { DataRow, DatasetProfile, FileParseResult } from "@/types/dataset";
import type { DashboardSpec, DashboardViewState } from "@/types/dashboard";
import type { ShareLink } from "@/types/export";
import { persistDashboard, persistParsedDataset, persistShareLink } from "@/lib/data-access";
import { createShareLink, createShareLinkToken } from "@/lib/supabase/share-links";

export interface PersistedDatasetPayload {
  parsed: FileParseResult;
  profile: DatasetProfile;
  rows: DataRow[];
}

export async function saveDatasetPayload(payload: PersistedDatasetPayload) {
  const result = await persistParsedDataset({ parsed: payload.parsed });
  return { mode: result.mode, datasetId: result.datasetId };
}

export async function saveDashboardSpec(spec: DashboardSpec, viewState: DashboardViewState) {
  return persistDashboard({ spec, viewState });
}

export { createShareLinkToken };

export async function saveShareLink(link: ShareLink) {
  return createShareLink(link);
}

export async function createInteractiveShareLink(input: {
  dashboardId: string;
  access: ShareLink["access"];
  expiresAt?: string;
  allowFilters: boolean;
  allowDownload: boolean;
  origin: string;
}) {
  return persistShareLink(input);
}
