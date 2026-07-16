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
import { enqueueOutbox } from "@/lib/data-access/outbox";
import { createCorrelationId, logDomainError, toDomainError } from "@/lib/observability/domain-error";
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
import { nameFromFile } from "@/lib/utils/name-from-file";

export function localModeWarning() {
  return "Supabase no esta configurado. Sandbox local en memoria; los datos sensibles no se guardan en storage del navegador.";
}

function localResult(correlationId = createCorrelationId("local")) {
  return {
    mode: "local" as const,
    executionMode: "offline/local" as const,
    syncStatus: "saved" as const,
    correlationId
  };
}

function providerResult(correlationId = createCorrelationId("sync")) {
  return {
    mode: "supabase" as const,
    executionMode: "provider" as const,
    syncStatus: "saved" as const,
    correlationId
  };
}

function degradedResult(error: unknown, fallbackMessage: string, correlationId = createCorrelationId("sync")) {
  const domainError = toDomainError(error, {
    code: "supabase_unavailable",
    fallbackMessage,
    correlationId,
    executionMode: "degraded",
    syncStatus: "retrying"
  });
  logDomainError(domainError, "data-access.persist");
  return {
    mode: "degraded" as const,
    executionMode: "degraded" as const,
    syncStatus: "retrying" as const,
    correlationId: domainError.correlationId,
    recoverable: domainError.recoverable,
    warning: `${domainError.userMessage} Reintentaremos automaticamente. ID: ${domainError.correlationId}`
  };
}

export async function persistParsedDataset({ file, parsed }: ParsedDatasetPayload): Promise<DatasetPersistResult> {
  const { sheet, rows, profile } = buildDatasetProfile(parsed);
  const configured = isSupabaseConfigured();
  const auth = await getCurrentAuthState();

  if (!configured || !auth.user) {
    saveLocalDataset(profile.id, { parsed, profile, rows });
    return {
      ...localResult(),
      datasetId: profile.id,
      projectId: "local-project",
      profile,
      rows,
      warning: configured ? "Inicia sesion para guardar este dataset en Supabase." : localModeWarning()
    };
  }

  try {
    const project = await createProjectIfNeeded(nameFromFile(parsed.fileName));
    const dataset = await createDataset(project.projectId, { ...parsed, selectedSheetName: sheet.name }, profile);
    const storagePath = await uploadOriginalFile(file, project.projectId, dataset.datasetId);
    await saveDatasetSheets(dataset.datasetId, { ...parsed, selectedSheetName: sheet.name });
    await saveDatasetColumns(dataset.datasetId, profile);
    await saveDatasetRows(dataset.datasetId, rows);
    await saveDatasetProfile(dataset.datasetId, profile);
    return { ...providerResult(), datasetId: dataset.datasetId, projectId: project.projectId, storagePath, profile, rows };
  } catch (error) {
    const degraded = degradedResult(error, "No se pudo guardar en Supabase.");
    saveLocalDataset(profile.id, { parsed, profile, rows });
    enqueueOutbox({ kind: "dataset", parsed, profile, rows }, degraded.correlationId);
    return {
      ...degraded,
      datasetId: profile.id,
      projectId: "local-project",
      profile,
      rows
    };
  }
}

export async function persistDashboard(payload: PersistedDashboardPayload, projectId?: string): Promise<DashboardPersistResult> {
  const auth = await getCurrentAuthState();
  if (!isSupabaseConfigured() || !auth.user || !projectId) {
    saveLocalDashboard(payload.spec, payload.viewState, payload.rows, payload.profile);
    return { ...localResult(), dashboardId: payload.spec.id, warning: !isSupabaseConfigured() ? localModeWarning() : "Inicia sesion para guardar el dashboard en Supabase." };
  }

  try {
    const result = await createDashboardSpec(payload.spec, payload.viewState, projectId);
    return { ...providerResult(), dashboardId: result.dashboardId };
  } catch (error) {
    const degraded = degradedResult(error, "No se pudo guardar el dashboard en Supabase.");
    saveLocalDashboard(payload.spec, payload.viewState, payload.rows, payload.profile);
    enqueueOutbox({ kind: "dashboard", projectId, spec: payload.spec, viewState: payload.viewState, rows: payload.rows, profile: payload.profile }, degraded.correlationId);
    return { ...degraded, dashboardId: payload.spec.id };
  }
}

export async function updatePersistedDashboard(dashboardId: string, spec: DashboardSpec, viewState: DashboardViewState, rows?: DataRow[], profile?: DatasetProfile) {
  const auth = await getCurrentAuthState();
  if (!isSupabaseConfigured() || !auth.user) {
    saveLocalDashboard(spec, viewState, rows, profile);
    return {
      ...localResult(),
      dashboardId: spec.id,
      warning: !isSupabaseConfigured() ? localModeWarning() : "Inicia sesion para guardar el dashboard en Supabase."
    };
  }

  try {
    const result = await updateDashboardSpec(dashboardId, spec, viewState);
    return { ...providerResult(), dashboardId: result.dashboardId };
  } catch (error) {
    const degraded = degradedResult(error, "No se pudo actualizar el dashboard en Supabase.");
    saveLocalDashboard(spec, viewState, rows, profile);
    enqueueOutbox({ kind: "dashboard", spec, viewState, rows, profile, updateDashboardId: dashboardId }, degraded.correlationId);
    return { ...degraded, dashboardId: spec.id };
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
    const result = await createPresentation(spec);
    return result.mode === "supabase"
      ? { ...providerResult(), presentationId: result.presentationId }
      : { ...localResult(), presentationId: result.presentationId, warning: localModeWarning() };
  } catch (error) {
    const degraded = degradedResult(error, "No se pudo guardar la presentacion en Supabase.");
    enqueueOutbox({ kind: "presentation", spec }, degraded.correlationId);
    return { ...degraded, presentationId: spec.id };
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
  try {
    const result = await createShareLink(link);
    const observable = result.mode === "supabase" ? providerResult() : localResult();
    const url = `${input.origin}/share/${token}`;
    return { ...observable, token: result.token, url, link };
  } catch (error) {
    const degraded = degradedResult(error, "No se pudo crear el enlace en Supabase.");
    enqueueOutbox({ kind: "share", link }, degraded.correlationId);
    const url = `${input.origin}/share/${token}`;
    return { ...degraded, token, url, link };
  }
}

export async function loadPublicShare(token: string): Promise<PublicSharedDashboard | null> {
  return getPublicSharedDashboard(token);
}
