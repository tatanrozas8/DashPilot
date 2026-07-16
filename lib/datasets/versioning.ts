import type { DataRow, DatasetImportStatus, DatasetProfile, DatasetVersion, FileParseResult, ParsedSheet } from "@/types/dataset";

const allowedTransitions = new Map<DatasetImportStatus, DatasetImportStatus[]>([
  ["created", ["uploading", "processing", "failed", "cancelled"]],
  ["uploading", ["processing", "failed", "cancelled"]],
  ["processing", ["validating", "failed", "cancelled"]],
  ["validating", ["ready", "failed", "cancelled"]],
  ["ready", ["superseded"]],
  ["superseded", ["ready"]],
  ["failed", []],
  ["cancelled", []]
]);

export interface DatasetImportIdentity {
  checksum: string;
  schemaHash: string;
  idempotencyKey?: string;
}

export interface DatasetVersionActivationState {
  activeVersionId: string | null;
  activeVersionNumber: number;
  versions: DatasetVersion[];
}

export interface DatasetVersionDraftInput {
  datasetId: string;
  parsed: FileParseResult;
  selectedSheet: ParsedSheet;
  rows: DataRow[];
  profile: DatasetProfile;
  checksum: string;
  schemaHash: string;
  versionNumber: number;
  id?: string;
  idempotencyKey?: string;
  now?: string;
}

export function assertDatasetVersionTransition(from: DatasetImportStatus, to: DatasetImportStatus) {
  if (from === to) return;
  const allowed = allowedTransitions.get(from) ?? [];
  if (!allowed.includes(to)) {
    throw new Error(`Transicion de version de dataset invalida: ${from} -> ${to}.`);
  }
}

function sortedRow(row: DataRow) {
  return Object.keys(row)
    .sort()
    .map((key) => [key, row[key]] as const);
}

function schemaFingerprint(parsed: FileParseResult, selectedSheet: ParsedSheet, profile: DatasetProfile) {
  return {
    fileType: parsed.fileType,
    selectedSheetName: selectedSheet.name,
    columns: profile.columns.map((column, index) => ({
      position: index,
      originalName: column.originalName,
      normalizedName: column.normalizedName,
      inferredType: column.inferredType,
      semanticType: column.semanticType
    }))
  };
}

function importFingerprint(parsed: FileParseResult, selectedSheet: ParsedSheet, rows: DataRow[], profile: DatasetProfile) {
  return {
    fileName: parsed.fileName,
    fileType: parsed.fileType,
    fileSize: parsed.fileSize,
    selectedSheetName: selectedSheet.name,
    warnings: parsed.warnings,
    schema: schemaFingerprint(parsed, selectedSheet, profile),
    rows: rows.map(sortedRow)
  };
}

async function sha256Hex(payload: string) {
  if (!globalThis.crypto?.subtle) {
    throw new Error("No hay Web Crypto disponible para calcular checksum de importacion.");
  }
  const bytes = new TextEncoder().encode(payload);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function buildDatasetImportIdentity(input: {
  parsed: FileParseResult;
  selectedSheet: ParsedSheet;
  rows: DataRow[];
  profile: DatasetProfile;
  idempotencyKey?: string;
}): Promise<DatasetImportIdentity> {
  const schemaHash = await sha256Hex(JSON.stringify(schemaFingerprint(input.parsed, input.selectedSheet, input.profile)));
  const checksum = await sha256Hex(JSON.stringify(importFingerprint(input.parsed, input.selectedSheet, input.rows, input.profile)));
  return { checksum, schemaHash, idempotencyKey: input.idempotencyKey };
}

export function createDatasetVersionDraft(input: DatasetVersionDraftInput): DatasetVersion {
  const now = input.now ?? new Date().toISOString();
  return {
    id: input.id ?? `dataset_version_${input.checksum.slice(0, 16)}`,
    datasetId: input.datasetId,
    versionNumber: input.versionNumber,
    status: "created",
    checksum: input.checksum,
    schemaHash: input.schemaHash,
    rowCount: input.rows.length,
    columnCount: input.profile.columnCount,
    fileName: input.parsed.fileName,
    fileType: input.parsed.fileType,
    fileSize: input.parsed.fileSize,
    selectedSheetName: input.selectedSheet.name,
    idempotencyKey: input.idempotencyKey,
    profile: { ...input.profile, datasetVersionId: input.id ?? `dataset_version_${input.checksum.slice(0, 16)}` },
    createdAt: now,
    updatedAt: now
  };
}

export function transitionDatasetVersion(version: DatasetVersion, status: DatasetImportStatus, input: { now?: string; errorMessage?: string; storagePath?: string } = {}): DatasetVersion {
  assertDatasetVersionTransition(version.status, status);
  const now = input.now ?? new Date().toISOString();
  return {
    ...version,
    status,
    storagePath: input.storagePath ?? version.storagePath,
    errorMessage: status === "failed" ? input.errorMessage ?? "Importacion fallida." : version.errorMessage,
    updatedAt: now,
    readyAt: status === "ready" ? now : version.readyAt,
    failedAt: status === "failed" ? now : version.failedAt,
    cancelledAt: status === "cancelled" ? now : version.cancelledAt,
    supersededAt: status === "superseded" ? now : version.supersededAt
  };
}

export function findIdempotentDatasetVersion(versions: DatasetVersion[], identity: DatasetImportIdentity) {
  return versions.find((version) => {
    if (identity.idempotencyKey && version.idempotencyKey === identity.idempotencyKey) return true;
    return version.checksum === identity.checksum;
  }) ?? null;
}

export function activateDatasetVersion(
  state: DatasetVersionActivationState,
  targetVersionId: string,
  expectedActiveVersionId: string | null,
  now = new Date().toISOString()
): DatasetVersionActivationState {
  if (state.activeVersionId !== expectedActiveVersionId) {
    throw new Error("Conflicto de concurrencia al activar la version del dataset.");
  }
  const target = state.versions.find((version) => version.id === targetVersionId);
  if (!target) throw new Error("No existe la version de dataset a activar.");
  if (target.status !== "ready" && target.status !== "superseded") {
    throw new Error(`Solo una version ready o superseded puede activarse. Estado actual: ${target.status}.`);
  }

  const versions = state.versions.map((version) => {
    if (version.id === targetVersionId) {
      return version.status === "superseded" ? transitionDatasetVersion(version, "ready", { now }) : { ...version, updatedAt: now };
    }
    if (version.id === state.activeVersionId && version.status === "ready") {
      return transitionDatasetVersion(version, "superseded", { now });
    }
    return version;
  });

  return {
    activeVersionId: targetVersionId,
    activeVersionNumber: state.activeVersionNumber + 1,
    versions
  };
}

export function cancelDatasetVersion(version: DatasetVersion, now = new Date().toISOString()) {
  return transitionDatasetVersion(version, "cancelled", { now });
}
