"use client";

import type { DataRow, DatasetColumnProfile, DatasetProfile, FileParseResult, ParsedSheet } from "@/types/dataset";
import { profileDataset } from "@/lib/profiling/profile-dataset";
import { getCurrentAuthState } from "@/lib/supabase/auth";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

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

function localDatasetKey(datasetId: string) {
  return `dashpilot:dataset:${datasetId}`;
}

function readLocalDataset(datasetId: string) {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(localDatasetKey(datasetId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as { profile: DatasetProfile; rows: DataRow[]; parsed: FileParseResult };
  } catch {
    window.localStorage.removeItem(localDatasetKey(datasetId));
    return null;
  }
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
      status: "profiled"
    })
    .select("id")
    .single();
  if (error) throw new Error(`No se pudo crear el dataset: ${error.message}`);
  return { mode: "supabase" as const, datasetId: data.id as string };
}

export async function uploadOriginalFile(file: File | undefined, projectId: string, datasetId: string) {
  if (!file) return undefined;
  const supabase = getSupabaseBrowserClient();
  const auth = await getCurrentAuthState();
  if (!supabase || !auth.user) return undefined;

  const safeName = file.name.replace(/[^\w.\-]+/g, "_");
  const path = `${auth.user.id}/${projectId}/${datasetId}/${safeName}`;
  const { error } = await supabase.storage.from("dashboard-files").upload(path, file, { upsert: true });
  if (error) {
    const missingBucket = error.message.toLowerCase().includes("bucket");
    throw new Error(missingBucket ? "El bucket dashboard-files no existe. Crealo en Supabase Storage." : `No se pudo subir el archivo original: ${error.message}`);
  }

  const { error: updateError } = await supabase.from("datasets").update({ storage_path: path }).eq("id", datasetId);
  if (updateError) throw new Error(`No se pudo guardar la ruta del archivo: ${updateError.message}`);
  return path;
}

export async function saveDatasetSheets(datasetId: string, parsed: FileParseResult) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return;
  const { error } = await supabase.from("dataset_sheets").insert(
    parsed.sheets.map((sheet) => ({
      dataset_id: datasetId,
      sheet_name: sheet.name,
      row_count: sheet.rowCount,
      column_count: sheet.columnCount,
      is_selected: sheet.name === parsed.selectedSheetName
    }))
  );
  if (error) throw new Error(`No se pudieron guardar las hojas: ${error.message}`);
}

export async function saveDatasetColumns(datasetId: string, profile: DatasetProfile) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return;
  const { error } = await supabase.from("dataset_columns").insert(
    profile.columns.map((column: DatasetColumnProfile, index) => ({
      dataset_id: datasetId,
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

export async function saveDatasetRows(datasetId: string, rows: DataRow[], batchSize = DATASET_ROW_BATCH_SIZE, onProgress?: (progress: { inserted: number; total: number; batch: number; batches: number }) => void) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { inserted: rows.length, batches: chunkRows(rows, batchSize).length };

  const cappedRows = rows.slice(0, DATASET_ROW_LIMIT);
  const batches = chunkRows(cappedRows, batchSize);
  const deleteResult = await supabase.from("dataset_rows").delete().eq("dataset_id", datasetId);
  if (deleteResult.error) throw new Error(`No se pudieron limpiar filas previas: ${deleteResult.error.message}`);
  for (const [batchIndex, batch] of batches.entries()) {
    const offset = batchIndex * batchSize;
    const { error } = await supabase.from("dataset_rows").insert(
      batch.map((row, index) => ({
        dataset_id: datasetId,
        row_index: offset + index,
        row_json: row
      }))
    );
    if (error) throw new Error(`No se pudieron guardar filas del dataset en el batch ${batchIndex + 1}: ${error.message}`);
    onProgress?.({ inserted: Math.min(offset + batch.length, cappedRows.length), total: cappedRows.length, batch: batchIndex + 1, batches: batches.length });
  }
  return { inserted: cappedRows.length, batches: batches.length };
}

export async function saveDatasetProfile(datasetId: string, profile: DatasetProfile) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return;
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

export async function getDatasetRows(datasetId: string) {
  const supabase = getSupabaseBrowserClient();
  const local = readLocalDataset(datasetId);
  if (local) return local.rows;
  if (!supabase) {
    return [];
  }
  const { data, error } = await supabase.from("dataset_rows").select("row_json").eq("dataset_id", datasetId).order("row_index", { ascending: true });
  if (error) {
    const fallback = readLocalDataset(datasetId);
    if (fallback) return fallback.rows;
    throw new Error(`No se pudieron cargar las filas: ${error.message}`);
  }
  return (data ?? []).map((row) => row.row_json as DataRow);
}

export async function getDatasetColumns(datasetId: string) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return [];
  const { data, error } = await supabase.from("dataset_columns").select("*").eq("dataset_id", datasetId).order("position", { ascending: true });
  if (error) throw new Error(`No se pudieron cargar las columnas: ${error.message}`);
  return data ?? [];
}

export async function getDatasetProfile(datasetId: string) {
  const supabase = getSupabaseBrowserClient();
  const local = readLocalDataset(datasetId);
  if (local) return local.profile;
  if (!supabase) {
    return null;
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
    window.localStorage.removeItem(localDatasetKey(datasetId));
    return;
  }
  const { error } = await supabase.from("datasets").delete().eq("id", datasetId);
  if (error) throw new Error(`No se pudo eliminar el dataset: ${error.message}`);
}

export function saveLocalDataset(datasetId: string, payload: { parsed: FileParseResult; profile: DatasetProfile; rows: DataRow[] }) {
  window.localStorage.setItem(localDatasetKey(datasetId), JSON.stringify(payload));
}
