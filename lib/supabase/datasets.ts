"use client";

import type { DataRow, DatasetColumnProfile, DatasetImportStatus, DatasetProfile, DatasetVersion, FileParseResult, ParsedSheet } from "@/types/dataset";
import { assertDatasetVersionTransition } from "@/lib/datasets/versioning";
import { profileDataset } from "@/lib/profiling/profile-dataset";
import { getCurrentAuthState } from "@/lib/supabase/auth";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { datasetProfileSchema } from "@/lib/validation/schemas";

export const DATASET_ROW_BATCH_SIZE = 500;
export const DATASET_ROW_LIMIT = 50_000;

export function selectedSheetFromParsed(parsed: FileParseResult): ParsedSheet {
  const selected = parsed.sheets.find((sheet) => sheet.name === parsed.selectedSheetName) ?? parsed.sheets[0];
  if (!selected) throw new Error("No hay una hoja valida para persistir.");
  return selected;
}

export function buildDatasetProfile(parsed: FileParseResult) {
  const sheet = selectedSheetFromParsed(parsed);
  return {
    sheet,
    rows: sheet.rows.slice(0, DATASET_ROW_LIMIT),
    profile: profileDataset(sheet.rows.slice(0, DATASET_ROW_LIMIT), parsed.fileName, sheet.columns)
  };
}

export function chunkRows(rows: DataRow[], batchSize = DATASET_ROW_BATCH_SIZE) {
  const batches: DataRow[][] = [];
  for (let index = 0; index < rows.length; index += batchSize) {
    batches.push(rows.slice(index, index + batchSize));
  }
  return batches;
}

const localDatasets = new Map<string, { profile: DatasetProfile; rows: DataRow[]; parsed: FileParseResult; version?: DatasetVersion }>();

function readLocalDataset(datasetId: string) {
  return localDatasets.get(datasetId) ?? null;
}

export async function createProjectIfNeeded(name = "DashPilot Workspace") {
  const supabase = getSupabaseBrowserClient();
  const auth = await getCurrentAuthState();
  if (!supabase || !auth.user) return { mode: "local" as const, projectId: "local-project" };

  const { data: existing, error: existingError } = await supabase
    .from("projects")
    .select("id")
    .eq("user_id", auth.user.id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (existingError) throw new Error(`No se pudo revisar el proyecto: ${existingError.message}`);
  if (existing?.id) return { mode: "supabase" as const, projectId: existing.id as string };

  const { data, error } = await supabase
    .from("projects")
    .insert({ user_id: auth.user.id, name, description: "Workspace principal de DashPilot", status: "active" })
    .select("id")
    .single();
  if (error) throw new Error(`No se pudo crear el proyecto: ${error.message}`);
  return { mode: "supabase" as const, projectId: data.id as string };
}

export async function createDataset(projectId: string, parsed: FileParseResult, profile: DatasetProfile) {
  const supabase = getSupabaseBrowserClient();
  const auth = await getCurrentAuthState();
  if (!supabase || !auth.user) return { mode: "local" as const, datasetId: profile.id };

  const { data, error } = await supabase
    .from("datasets")
    .insert({
      project_id: projectId,
      user_id: auth.user.id,
      file_name: parsed.fileName,
      file_type: parsed.fileType,
      file_size: parsed.fileSize,
      selected_sheet_name: parsed.selectedSheetName,
      row_count: profile.rowCount,
      column_count: profile.columnCount,
      profile_json: profile,
      quality_score: profile.qualityScore,
      status: "created"
    })
    .select("id")
    .single();
  if (error) throw new Error(`No se pudo crear el dataset: ${error.message}`);
  return { mode: "supabase" as const, datasetId: data.id as string };
}

interface DatasetVersionRow {
  id: unknown;
  dataset_id: unknown;
  version_number: unknown;
  status: unknown;
  checksum: unknown;
  schema_hash: unknown;
  row_count: unknown;
  column_count: unknown;
  file_name: unknown;
  file_type: unknown;
  file_size: unknown;
  selected_sheet_name: unknown;
  idempotency_key?: unknown;
  profile_json?: unknown;
  storage_path?: unknown;
  error_message?: unknown;
  created_at: unknown;
  updated_at: unknown;
  ready_at?: unknown;
  failed_at?: unknown;
  cancelled_at?: unknown;
  superseded_at?: unknown;
}

function isDatasetVersionRow(row: unknown): row is DatasetVersionRow {
  if (typeof row !== "object" || row === null) return false;
  return [
    "id",
    "dataset_id",
    "version_number",
    "status",
    "checksum",
    "schema_hash",
    "row_count",
    "column_count",
    "file_name",
    "file_type",
    "file_size",
    "selected_sheet_name",
    "created_at",
    "updated_at"
  ].every((key) => key in row);
}

function datasetVersionFromRow(row: DatasetVersionRow): DatasetVersion {
  const status = String(row.status) as DatasetImportStatus;
  const parsedProfile = datasetProfileSchema.safeParse(row.profile_json);
  return {
    id: String(row.id),
    datasetId: String(row.dataset_id),
    versionNumber: Number(row.version_number),
    status,
    checksum: String(row.checksum),
    schemaHash: String(row.schema_hash),
    rowCount: Number(row.row_count),
    columnCount: Number(row.column_count),
    fileName: String(row.file_name),
    fileType: String(row.file_type) as FileParseResult["fileType"],
    fileSize: Number(row.file_size),
    selectedSheetName: String(row.selected_sheet_name),
    idempotencyKey: typeof row.idempotency_key === "string" ? row.idempotency_key : undefined,
    profile: parsedProfile.success ? parsedProfile.data : undefined,
    storagePath: typeof row.storage_path === "string" ? row.storage_path : undefined,
    errorMessage: typeof row.error_message === "string" ? row.error_message : undefined,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    readyAt: typeof row.ready_at === "string" ? row.ready_at : undefined,
    failedAt: typeof row.failed_at === "string" ? row.failed_at : undefined,
    cancelledAt: typeof row.cancelled_at === "string" ? row.cancelled_at : undefined,
    supersededAt: typeof row.superseded_at === "string" ? row.superseded_at : undefined
  };
}

export async function findDatasetVersionByImportIdentity(projectId: string, identity: { checksum: string; idempotencyKey?: string }) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return null;

  const query = supabase
    .from("dataset_versions")
    .select("*")
    .eq("project_id", projectId)
    .eq(identity.idempotencyKey ? "idempotency_key" : "checksum", identity.idempotencyKey ?? identity.checksum)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data, error } = await query;
  if (error) throw new Error(`No se pudo revisar idempotencia de importacion: ${error.message}`);
  if (!data) return null;
  if (!isDatasetVersionRow(data)) throw new Error("La version del dataset recibida desde Supabase no tiene el contrato esperado.");
  return datasetVersionFromRow(data);
}

export async function createDatasetVersion(input: {
  projectId: string;
  datasetId: string;
  parsed: FileParseResult;
  selectedSheet: ParsedSheet;
  profile: DatasetProfile;
  checksum: string;
  schemaHash: string;
  idempotencyKey?: string;
}) {
  const supabase = getSupabaseBrowserClient();
  const auth = await getCurrentAuthState();
  if (!supabase || !auth.user) return { mode: "local" as const, datasetVersionId: input.profile.datasetVersionId ?? input.datasetId };

  const { data: latest, error: latestError } = await supabase
    .from("dataset_versions")
    .select("version_number")
    .eq("dataset_id", input.datasetId)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestError) throw new Error(`No se pudo calcular numero de version: ${latestError.message}`);

  const versionNumber = Number(latest?.version_number ?? 0) + 1;
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("dataset_versions")
    .insert({
      project_id: input.projectId,
      dataset_id: input.datasetId,
      user_id: auth.user.id,
      version_number: versionNumber,
      status: "created",
      checksum: input.checksum,
      schema_hash: input.schemaHash,
      row_count: input.profile.rowCount,
      column_count: input.profile.columnCount,
      file_name: input.parsed.fileName,
      file_type: input.parsed.fileType,
      file_size: input.parsed.fileSize,
      selected_sheet_name: input.selectedSheet.name,
      idempotency_key: input.idempotencyKey,
      profile_json: { ...input.profile },
      quality_score: input.profile.qualityScore,
      created_at: now,
      updated_at: now
    })
    .select("*")
    .single();
  if (error) throw new Error(`No se pudo crear version del dataset: ${error.message}`);
  if (!isDatasetVersionRow(data)) throw new Error("Supabase creo una version con contrato inesperado.");
  return { mode: "supabase" as const, datasetVersion: datasetVersionFromRow(data) };
}

export async function updateDatasetVersionStatus(datasetVersionId: string, from: DatasetImportStatus, to: DatasetImportStatus, input: { errorMessage?: string; storagePath?: string } = {}) {
  assertDatasetVersionTransition(from, to);
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return;
  const now = new Date().toISOString();
  const updates = {
    status: to,
    updated_at: now,
    storage_path: input.storagePath,
    error_message: to === "failed" ? input.errorMessage ?? "Importacion fallida." : undefined,
    ready_at: to === "ready" ? now : undefined,
    failed_at: to === "failed" ? now : undefined,
    cancelled_at: to === "cancelled" ? now : undefined,
    superseded_at: to === "superseded" ? now : undefined
  };
  const { data, error } = await supabase
    .from("dataset_versions")
    .update(updates)
    .eq("id", datasetVersionId)
    .eq("status", from)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(`No se pudo actualizar estado de version: ${error.message}`);
  if (!data) throw new Error(`La version del dataset no estaba en estado ${from}.`);
}

export async function activateReadyDatasetVersion(datasetId: string, datasetVersionId: string, expectedActiveVersionId: string | null) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { mode: "local" as const, datasetId, datasetVersionId };

  const { data, error } = await supabase.rpc("activate_dataset_version", {
    target_dataset_id: datasetId,
    target_version_id: datasetVersionId,
    expected_active_version_id: expectedActiveVersionId
  });
  if (error) throw new Error(`No se pudo activar la version del dataset: ${error.message}`);
  const result = data && typeof data === "object" ? data as { datasetId?: string; activeVersionId?: string } : {};
  return { mode: "supabase" as const, datasetId: result.datasetId ?? datasetId, datasetVersionId: result.activeVersionId ?? datasetVersionId };
}

export async function uploadOriginalFile(file: File | undefined, projectId: string, datasetId: string, datasetVersionId?: string) {
  if (!file) return undefined;
  const supabase = getSupabaseBrowserClient();
  const auth = await getCurrentAuthState();
  if (!supabase || !auth.user) return undefined;

  const safeName = file.name.replace(/[^\w.\-]+/g, "_");
  const path = `${auth.user.id}/${projectId}/${datasetId}/${datasetVersionId ?? "legacy"}/${safeName}`;
  const { error } = await supabase.storage.from("dashboard-files").upload(path, file, { upsert: true });
  if (error) {
    const missingBucket = error.message.toLowerCase().includes("bucket");
    throw new Error(missingBucket ? "El bucket dashboard-files no existe. Crealo en Supabase Storage." : `No se pudo subir el archivo original: ${error.message}`);
  }

  const { error: updateError } = await supabase.from("datasets").update({ storage_path: path }).eq("id", datasetId);
  if (updateError) throw new Error(`No se pudo guardar la ruta del archivo: ${updateError.message}`);
  if (datasetVersionId) {
    const { error: versionError } = await supabase.from("dataset_versions").update({ storage_path: path }).eq("id", datasetVersionId);
    if (versionError) throw new Error(`No se pudo guardar la ruta de la version: ${versionError.message}`);
  }
  return path;
}

export async function saveDatasetSheets(datasetId: string, parsed: FileParseResult, datasetVersionId?: string) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return;
  const { error } = await supabase.from("dataset_sheets").insert(
    parsed.sheets.map((sheet) => ({
      dataset_id: datasetId,
      dataset_version_id: datasetVersionId,
      sheet_name: sheet.name,
      row_count: sheet.rowCount,
      column_count: sheet.columnCount,
      is_selected: sheet.name === parsed.selectedSheetName
    }))
  );
  if (error) throw new Error(`No se pudieron guardar las hojas: ${error.message}`);
}

export async function saveDatasetColumns(datasetId: string, profile: DatasetProfile, datasetVersionId?: string) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return;
  const { error } = await supabase.from("dataset_columns").insert(
    profile.columns.map((column: DatasetColumnProfile, index) => ({
      dataset_id: datasetId,
      dataset_version_id: datasetVersionId,
      original_name: column.originalName,
      normalized_name: column.normalizedName,
      display_name: column.displayName,
      inferred_type: column.inferredType,
      semantic_type: column.semanticType,
      position: index,
      null_count: column.nullCount,
      null_percentage: column.nullPercentage,
      unique_count: column.uniqueCount,
      sample_values: column.sampleValues,
      min_value: column.min === undefined ? null : String(column.min),
      max_value: column.max === undefined ? null : String(column.max),
      statistics_json: column.statistics ?? {}
    }))
  );
  if (error) throw new Error(`No se pudieron guardar las columnas: ${error.message}`);
}

export async function saveDatasetRows(datasetId: string, rows: DataRow[], batchSize = DATASET_ROW_BATCH_SIZE, onProgress?: (progress: { inserted: number; total: number; batch: number; batches: number }) => void, datasetVersionId?: string) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { inserted: rows.length, batches: chunkRows(rows, batchSize).length };

  const cappedRows = rows.slice(0, DATASET_ROW_LIMIT);
  const batches = chunkRows(cappedRows, batchSize);
  const deleteResult = datasetVersionId
    ? await supabase.from("dataset_rows").delete().eq("dataset_version_id", datasetVersionId)
    : await supabase.from("dataset_rows").delete().eq("dataset_id", datasetId).is("dataset_version_id", null);
  if (deleteResult.error) throw new Error(`No se pudieron limpiar filas previas: ${deleteResult.error.message}`);
  for (const [batchIndex, batch] of batches.entries()) {
    const offset = batchIndex * batchSize;
    const { error } = await supabase.from("dataset_rows").insert(
      batch.map((row, index) => ({
        dataset_id: datasetId,
        dataset_version_id: datasetVersionId,
        row_index: offset + index,
        row_json: row
      }))
    );
    if (error) throw new Error(`No se pudieron guardar filas del dataset en el batch ${batchIndex + 1}: ${error.message}`);
    onProgress?.({ inserted: Math.min(offset + batch.length, cappedRows.length), total: cappedRows.length, batch: batchIndex + 1, batches: batches.length });
  }
  return { inserted: cappedRows.length, batches: batches.length };
}

export async function saveDatasetProfile(datasetId: string, profile: DatasetProfile, datasetVersionId?: string) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return;
  if (datasetVersionId) {
    const { error: versionError } = await supabase
      .from("dataset_versions")
      .update({ profile_json: profile, quality_score: profile.qualityScore, row_count: profile.rowCount, column_count: profile.columnCount })
      .eq("id", datasetVersionId);
    if (versionError) throw new Error(`No se pudo guardar el perfil de la version: ${versionError.message}`);
    return;
  }
  const { error } = await supabase
    .from("datasets")
    .update({ profile_json: profile, quality_score: profile.qualityScore, row_count: profile.rowCount, column_count: profile.columnCount, status: "ready" })
    .eq("id", datasetId);
  if (error) throw new Error(`No se pudo guardar el perfil del dataset: ${error.message}`);
}

export async function getDatasetById(datasetId: string) {
  const supabase = getSupabaseBrowserClient();
  const local = readLocalDataset(datasetId);
  if (local) return local;
  if (!supabase) {
    return null;
  }
  const { data, error } = await supabase.from("datasets").select("*").eq("id", datasetId).maybeSingle();
  if (error) {
    const fallback = readLocalDataset(datasetId);
    if (fallback) return fallback;
    throw new Error(`No se pudo cargar el dataset: ${error.message}`);
  }
  return data;
}

export async function getActiveDatasetVersion(datasetId: string) {
  const local = readLocalDataset(datasetId);
  if (local?.version) return local.version;
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("datasets")
    .select("active_version_id")
    .eq("id", datasetId)
    .maybeSingle();
  if (error) throw new Error(`No se pudo cargar version activa: ${error.message}`);
  const activeVersionId = typeof data?.active_version_id === "string" ? data.active_version_id : null;
  if (!activeVersionId) return null;
  const { data: version, error: versionError } = await supabase
    .from("dataset_versions")
    .select("*")
    .eq("id", activeVersionId)
    .maybeSingle();
  if (versionError) throw new Error(`No se pudo cargar detalle de version activa: ${versionError.message}`);
  if (!version) return null;
  if (!isDatasetVersionRow(version)) throw new Error("La version activa no tiene el contrato esperado.");
  return datasetVersionFromRow(version);
}

export async function getDatasetRows(datasetId: string, datasetVersionId?: string) {
  const supabase = getSupabaseBrowserClient();
  const local = readLocalDataset(datasetId);
  if (local && (!datasetVersionId || local.version?.id === datasetVersionId)) return local.rows;
  if (!supabase) {
    return [];
  }
  const activeVersion = datasetVersionId ? null : await getActiveDatasetVersion(datasetId);
  const versionId = datasetVersionId ?? activeVersion?.id;
  const query = supabase.from("dataset_rows").select("row_json").eq(versionId ? "dataset_version_id" : "dataset_id", versionId ?? datasetId).order("row_index", { ascending: true });
  const { data, error } = await query;
  if (error) {
    const fallback = readLocalDataset(datasetId);
    if (fallback) return fallback.rows;
    throw new Error(`No se pudieron cargar las filas: ${error.message}`);
  }
  return (data ?? []).map((row) => row.row_json as DataRow);
}

export async function getDatasetColumns(datasetId: string, datasetVersionId?: string) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return [];
  const activeVersion = datasetVersionId ? null : await getActiveDatasetVersion(datasetId);
  const versionId = datasetVersionId ?? activeVersion?.id;
  const { data, error } = await supabase.from("dataset_columns").select("*").eq(versionId ? "dataset_version_id" : "dataset_id", versionId ?? datasetId).order("position", { ascending: true });
  if (error) throw new Error(`No se pudieron cargar las columnas: ${error.message}`);
  return data ?? [];
}

export async function getDatasetProfile(datasetId: string, datasetVersionId?: string) {
  const supabase = getSupabaseBrowserClient();
  const local = readLocalDataset(datasetId);
  if (local && (!datasetVersionId || local.version?.id === datasetVersionId)) return local.profile;
  if (!supabase) {
    return null;
  }
  const activeVersion = datasetVersionId ? null : await getActiveDatasetVersion(datasetId);
  const versionId = datasetVersionId ?? activeVersion?.id;
  if (versionId) {
    const { data: version, error: versionError } = await supabase.from("dataset_versions").select("profile_json").eq("id", versionId).maybeSingle();
    if (versionError) throw new Error(`No se pudo cargar el perfil de la version: ${versionError.message}`);
    if (version?.profile_json) return version.profile_json as DatasetProfile;
  }
  const { data, error } = await supabase.from("datasets").select("profile_json").eq("id", datasetId).maybeSingle();
  if (error) {
    const fallback = readLocalDataset(datasetId);
    if (fallback) return fallback.profile;
    throw new Error(`No se pudo cargar el perfil: ${error.message}`);
  }
  return data?.profile_json as DatasetProfile | null;
}

export async function deleteDataset(datasetId: string) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    localDatasets.delete(datasetId);
    return;
  }
  const { error } = await supabase.from("datasets").delete().eq("id", datasetId);
  if (error) throw new Error(`No se pudo eliminar el dataset: ${error.message}`);
}

export function saveLocalDataset(datasetId: string, payload: { parsed: FileParseResult; profile: DatasetProfile; rows: DataRow[]; version?: DatasetVersion }) {
  localDatasets.set(datasetId, payload);
}
