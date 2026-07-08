"use client";

import type { DataRow, DatasetProfile } from "@/types/dataset";
import type { DashboardSpec, DashboardViewState } from "@/types/dashboard";
import type { PresentationSpec } from "@/types/presentation";
import type { ShareLink } from "@/types/export";
import type {
  DashboardPersistResult,
  DatasetPersistResult,
  ParsedDatasetPayload,
  PersistedDashboardPayload,
  PresentationPersistResult,
  PublicSharedDashboard,
  SharePersistResult
} from "@/lib/data-access/types";
import {
  buildDatasetProfile,
  createDataset,
  createProjectIfNeeded,
  saveDatasetColumns,
  saveDatasetProfile,
  saveDatasetRows,
  saveDatasetSheets,
  saveLocalDataset,
  uploadOriginalFile,
  getDatasetProfile,
  getDatasetRows
} from "@/lib/supabase/datasets";
import { createDashboardSpec, getDashboardById, saveLocalDashboard, updateDashboardSpec } from "@/lib/supabase/dashboards";
import { createPresentation } from "@/lib/supabase/presentations";
import { createShareLink, createShareLinkToken, getPublicSharedDashboard } from "@/lib/supabase/share-links";
import { getCurrentAuthState } from "@/lib/supabase/auth";
import { isSupabaseConfigured } from "@/lib/supabase/client";

export function localModeWarning() {
  return "Supabase no esta configurado. DashPilot esta funcionando en modo local.";
}

export async function persistParsedDataset({ file, parsed }: ParsedDatasetPayload): Promise<DatasetPersistResult> {
  const { sheet, rows, profile } = buildDatasetProfile(parsed);
  const configured = isSupabaseConfigured();
  const auth = await getCurrentAuthState();

  if (!configured || !auth.user) {
    saveLocalDataset(profile.id, { parsed, profile, rows });
    return {
      mode: "local",
      datasetId: profile.id,
      projectId: "local-project",
      profile,
      rows,
      warning: configured ? "Inicia sesion para guardar este dataset en Supabase." : localModeWarning()
    };
  }

  try {
    const project = await createProjectIfNeeded();
    const dataset = await createDataset(project.projectId, { ...parsed, selectedSheetName: sheet.name }, profile);
    const storagePath = await uploadOriginalFile(file, project.projectId, dataset.datasetId);
    await saveDatasetSheets(dataset.datasetId, { ...parsed, selectedSheetName: sheet.name });
    await saveDatasetColumns(dataset.datasetId, profile);
    await saveDatasetRows(dataset.datasetId, rows);
    await saveDatasetProfile(dataset.datasetId, profile);
    return { mode: "supabase", datasetId: dataset.datasetId, projectId: project.projectId, storagePath, profile, rows };
  } catch (error) {
    saveLocalDataset(profile.id, { parsed, profile, rows });
    return {
      mode: "local",
      datasetId: profile.id,
      projectId: "local-project",
      profile,
      rows,
      warning: error instanceof Error ? `Error guardando en Supabase. Se uso modo local: ${error.message}` : "Error guardando en Supabase. Se uso modo local."
    };
  }
}

export async function persistDashboard(payload: PersistedDashboardPayload, projectId?: string): Promise<DashboardPersistResult> {
  const auth = await getCurrentAuthState();
  if (!isSupabaseConfigured() || !auth.user || !projectId) {
    saveLocalDashboard(payload.spec, payload.viewState, payload.rows, payload.profile);
    return { mode: "local", dashboardId: payload.spec.id, warning: !isSupabaseConfigured() ? localModeWarning() : "Inicia sesion para guardar el dashboard en Supabase." };
  }

  try {
    return await createDashboardSpec(payload.spec, payload.viewState, projectId);
  } catch (error) {
    saveLocalDashboard(payload.spec, payload.viewState, payload.rows, payload.profile);
    return {
      mode: "local",
      dashboardId: payload.spec.id,
      warning: error instanceof Error ? `Error guardando dashboard en Supabase. Se uso modo local: ${error.message}` : "Error guardando dashboard en Supabase. Se uso modo local."
    };
  }
}

export async function updatePersistedDashboard(dashboardId: string, spec: DashboardSpec, viewState: DashboardViewState, rows?: DataRow[], profile?: DatasetProfile) {
  try {
    return await updateDashboardSpec(dashboardId, spec, viewState);
  } catch (error) {
    saveLocalDashboard(spec, viewState, rows, profile);
    return {
      mode: "local" as const,
      dashboardId: spec.id,
      warning: error instanceof Error ? `Error actualizando en Supabase. Se guardo localmente: ${error.message}` : "Error actualizando en Supabase. Se guardo localmente."
    };
  }
}

export async function loadPersistedDashboard(dashboardId: string) {
  return getDashboardById(dashboardId);
}

export async function loadPersistedDataset(datasetId: string) {
  const [profile, rows] = await Promise.all([getDatasetProfile(datasetId), getDatasetRows(datasetId)]);
  if (!profile) return null;
  return { profile, rows };
}

export async function persistPresentation(spec: PresentationSpec): Promise<PresentationPersistResult> {
  try {
    return await createPresentation(spec);
  } catch (error) {
    window.localStorage.setItem(`dashpilot:presentation:${spec.id}`, JSON.stringify(spec));
    return {
      mode: "local",
      presentationId: spec.id,
      warning: error instanceof Error ? `Error guardando presentacion en Supabase. Se uso modo local: ${error.message}` : "Error guardando presentacion en Supabase. Se uso modo local."
    };
  }
}

export async function persistShareLink(input: {
  dashboardId: string;
  access: ShareLink["access"];
  expiresAt?: string;
  allowFilters: boolean;
  allowDownload: boolean;
  origin: string;
}): Promise<SharePersistResult> {
  const token = createShareLinkToken();
  const link: ShareLink = {
    id: token,
    dashboardId: input.dashboardId,
    token,
    access: input.access,
    expiresAt: input.expiresAt,
    allowFilters: input.allowFilters,
    allowDownload: input.allowDownload,
    createdAt: new Date().toISOString()
  };
  const result = await createShareLink(link);
  const url = `${input.origin}/share/${token}`;
  return { ...result, url, link };
}

export async function loadPublicShare(token: string): Promise<PublicSharedDashboard | null> {
  return getPublicSharedDashboard(token);
}
