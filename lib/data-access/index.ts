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
  activateReadyDatasetVersion,
  buildDatasetProfile,
  createDataset,
  createDatasetVersion,
  createProjectIfNeeded,
  findDatasetVersionByImportIdentity,
  saveDatasetColumns,
  saveDatasetProfile,
  saveDatasetRows,
  saveDatasetSheets,
  saveLocalDataset,
  updateDatasetVersionStatus,
  uploadOriginalFile,
  getDatasetProfile,
  getDatasetRows
} from "@/lib/supabase/datasets";
import { buildDatasetImportIdentity, createDatasetVersionDraft, transitionDatasetVersion } from "@/lib/datasets/versioning";
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

export async function persistParsedDataset({ file, parsed, idempotencyKey }: ParsedDatasetPayload): Promise<DatasetPersistResult> {
  const { sheet, rows, profile } = buildDatasetProfile(parsed);
  const identity = await buildDatasetImportIdentity({ parsed, selectedSheet: sheet, rows, profile, idempotencyKey });
  const configured = isSupabaseConfigured();
  const auth = await getCurrentAuthState();

  if (!configured || !auth.user) {
    const localVersion = transitionDatasetVersion(
      transitionDatasetVersion(
        transitionDatasetVersion(
          createDatasetVersionDraft({
            datasetId: profile.id,
            parsed,
            selectedSheet: sheet,
            rows,
            profile,
            checksum: identity.checksum,
            schemaHash: identity.schemaHash,
            versionNumber: 1,
            idempotencyKey: identity.idempotencyKey
          }),
          "processing"
        ),
        "validating"
      ),
      "ready"
    );
    const versionedProfile = { ...profile, datasetVersionId: localVersion.id };
    saveLocalDataset(profile.id, { parsed, profile: versionedProfile, rows, version: localVersion });
    return {
      ...localResult(),
      datasetId: profile.id,
      datasetVersionId: localVersion.id,
      projectId: "local-project",
      profile: versionedProfile,
      rows,
      warning: configured ? "Inicia sesion para guardar este dataset en Supabase." : localModeWarning()
    };
  }

  let pendingVersionId: string | undefined;
  let pendingVersionStatus: "created" | "uploading" | "processing" | "validating" | undefined;
  try {
    const project = await createProjectIfNeeded(nameFromFile(parsed.fileName));
    const existingVersion = await findDatasetVersionByImportIdentity(project.projectId, identity);
    if (existingVersion?.status === "ready" || existingVersion?.status === "superseded") {
      const versionedProfile = { ...profile, datasetVersionId: existingVersion.id };
      saveLocalDataset(existingVersion.datasetId, { parsed, profile: versionedProfile, rows, version: existingVersion });
      return { ...providerResult(), datasetId: existingVersion.datasetId, datasetVersionId: existingVersion.id, projectId: project.projectId, storagePath: existingVersion.storagePath, profile: versionedProfile, rows };
    }

    const dataset = await createDataset(project.projectId, { ...parsed, selectedSheetName: sheet.name }, profile);
    const version = await createDatasetVersion({
      projectId: project.projectId,
      datasetId: dataset.datasetId,
      parsed: { ...parsed, selectedSheetName: sheet.name },
      selectedSheet: sheet,
      profile,
      checksum: identity.checksum,
      schemaHash: identity.schemaHash,
      idempotencyKey: identity.idempotencyKey
    });
    if (version.mode === "local") throw new Error("No se pudo crear version Supabase del dataset.");
    pendingVersionId = version.datasetVersion.id;
    pendingVersionStatus = "created";
    await updateDatasetVersionStatus(pendingVersionId, "created", "uploading");
    pendingVersionStatus = "uploading";
    const storagePath = await uploadOriginalFile(file, project.projectId, dataset.datasetId, pendingVersionId);
    await updateDatasetVersionStatus(pendingVersionId, "uploading", "processing", { storagePath });
    pendingVersionStatus = "processing";
    const versionedProfile = { ...profile, datasetVersionId: pendingVersionId };
    await saveDatasetSheets(dataset.datasetId, { ...parsed, selectedSheetName: sheet.name }, pendingVersionId);
    await saveDatasetColumns(dataset.datasetId, versionedProfile, pendingVersionId);
    await saveDatasetRows(dataset.datasetId, rows, undefined, undefined, pendingVersionId);
    await updateDatasetVersionStatus(pendingVersionId, "processing", "validating");
    pendingVersionStatus = "validating";
    await saveDatasetProfile(dataset.datasetId, versionedProfile, pendingVersionId);
    await updateDatasetVersionStatus(pendingVersionId, "validating", "ready");
    await activateReadyDatasetVersion(dataset.datasetId, pendingVersionId, null);
    saveLocalDataset(dataset.datasetId, { parsed, profile: versionedProfile, rows, version: { ...version.datasetVersion, status: "ready", profile: versionedProfile, storagePath } });
    return { ...providerResult(), datasetId: dataset.datasetId, datasetVersionId: pendingVersionId, projectId: project.projectId, storagePath, profile: versionedProfile, rows };
  } catch (error) {
    if (pendingVersionId && pendingVersionStatus) {
      try {
        await updateDatasetVersionStatus(pendingVersionId, pendingVersionStatus, "failed", { errorMessage: error instanceof Error ? error.message : "Importacion fallida." });
      } catch (statusError) {
        logDomainError(toDomainError(statusError, { code: "persistence_failed", fallbackMessage: "No se pudo marcar la version fallida.", correlationId: createCorrelationId("sync") }), "data-access.persist.dataset-version");
      }
    }
    const degraded = degradedResult(error, "No se pudo guardar en Supabase.");
    const fallbackProfile = pendingVersionId ? { ...profile, datasetVersionId: pendingVersionId } : profile;
    saveLocalDataset(profile.id, { parsed, profile: fallbackProfile, rows });
    enqueueOutbox({ kind: "dataset", parsed, profile: fallbackProfile, rows }, degraded.correlationId);
    return {
      ...degraded,
      datasetId: profile.id,
      datasetVersionId: pendingVersionId,
      projectId: "local-project",
      profile: fallbackProfile,
      rows
    };
  }
}

export async function persistDashboard(payload: PersistedDashboardPayload, projectId?: string): Promise<DashboardPersistResult> {
  const auth = await getCurrentAuthState();
  const spec = {
    ...payload.spec,
    datasetId: payload.datasetId ?? payload.spec.datasetId,
    datasetVersionId: payload.datasetVersionId ?? payload.spec.datasetVersionId ?? payload.profile?.datasetVersionId
  };
  if (!isSupabaseConfigured() || !auth.user || !projectId) {
    saveLocalDashboard(spec, payload.viewState, payload.rows, payload.profile);
    return { ...localResult(), dashboardId: spec.id, warning: !isSupabaseConfigured() ? localModeWarning() : "Inicia sesion para guardar el dashboard en Supabase." };
  }

  try {
    const result = await createDashboardSpec(spec, payload.viewState, projectId);
    return { ...providerResult(), dashboardId: result.dashboardId };
  } catch (error) {
    const degraded = degradedResult(error, "No se pudo guardar el dashboard en Supabase.");
    saveLocalDashboard(spec, payload.viewState, payload.rows, payload.profile);
    enqueueOutbox({ kind: "dashboard", projectId, spec, viewState: payload.viewState, rows: payload.rows, profile: payload.profile }, degraded.correlationId);
    return { ...degraded, dashboardId: spec.id };
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
