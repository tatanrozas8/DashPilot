import type { DataRow, DatasetProfile, FileParseResult } from "@/types/dataset";

export type ImportFileType = "csv" | "xlsx" | "xls";

export type ImportJobStatus =
  | "created"
  | "uploading"
  | "queued"
  | "scanning"
  | "processing"
  | "converting"
  | "validating"
  | "ready"
  | "retrying"
  | "cancelled"
  | "failed"
  | "dead_letter";

export type ImportJobStage =
  | "upload_signed"
  | "upload_received"
  | "security_validation"
  | "antivirus_scan"
  | "parse_source"
  | "profile_dataset"
  | "convert_columnar"
  | "persist_artifacts"
  | "activate_version";

export type ImportFailureCode =
  | "unsupported_extension"
  | "mime_mismatch"
  | "magic_bytes_mismatch"
  | "file_too_large"
  | "empty_file"
  | "too_many_sheets"
  | "compression_ratio_exceeded"
  | "malicious_archive_entry"
  | "encrypted_or_macro_enabled"
  | "virus_detected"
  | "parser_failed"
  | "storage_failed"
  | "worker_stale"
  | "cancelled";

export interface ImportValidationIssue {
  code: ImportFailureCode;
  severity: "warning" | "error";
  message: string;
}

export interface WorkbookSecurityMetadata {
  sheetCount?: number;
  compressedSizeBytes?: number;
  uncompressedSizeBytes?: number;
  archiveEntryCount?: number;
  hasMacros?: boolean;
  hasEncryptedContent?: boolean;
  entryNames?: string[];
}

export interface ImportFileInspection {
  fileName: string;
  declaredMimeType: string;
  sizeBytes: number;
  headerBytes: Uint8Array;
  workbook?: WorkbookSecurityMetadata;
}

export interface ImportSecurityPolicy {
  maxSizeBytes: number;
  maxSheets: number;
  maxCompressionRatio: number;
  maxArchiveEntries: number;
}

export interface SafeImportPreview {
  fileName: string;
  fileType: ImportFileType;
  sizeBytes: number;
  detectedMimeType: string;
  sampleTextLines: string[];
  warnings: string[];
}

export interface ResumableUploadSession {
  uploadId: string;
  storageBucket: string;
  storagePath: string;
  signedUrl: string;
  protocol: "tus" | "supabase-signed-upload" | "local-memory";
  chunkSizeBytes: number;
  expiresAt: string;
  headers: Array<{ name: string; value: string }>;
}

export interface ImportJobProgressEvent {
  status: ImportJobStatus;
  stage: ImportJobStage;
  progress: number;
  message: string;
  createdAt: string;
}

export interface ColumnarDatasetArtifact {
  format: "columnar-json";
  mimeType: "application/vnd.dashpilot.columnar+json";
  rowCount: number;
  columnCount: number;
  columns: Array<{
    name: string;
    values: Array<string | number | boolean | null>;
  }>;
}

export interface ImportJobRecord {
  id: string;
  projectId: string;
  datasetId: string;
  datasetVersionId: string;
  idempotencyKey: string;
  fileName: string;
  fileType: ImportFileType;
  fileSize: number;
  declaredMimeType: string;
  detectedMimeType: string;
  storageBucket: string;
  storagePath: string;
  uploadSession: ResumableUploadSession;
  retentionPolicy: "retain_original_private" | "delete_original_after_import";
  retainedUntil?: string;
  status: ImportJobStatus;
  stage: ImportJobStage;
  progress: number;
  attempts: number;
  maxAttempts: number;
  leaseOwner?: string;
  heartbeatAt?: string;
  nextRunAt?: string;
  cancelledAt?: string;
  finishedAt?: string;
  error?: ImportValidationIssue;
  validationIssues: ImportValidationIssue[];
  scannerProvider: string;
  scanStatus: "pending" | "clean" | "infected" | "failed";
  safePreview: SafeImportPreview;
  completedStages: ImportJobStage[];
  events: ImportJobProgressEvent[];
  parsed?: FileParseResult;
  profile?: DatasetProfile;
  rows?: DataRow[];
  columnarArtifact?: ColumnarDatasetArtifact;
  columnarStoragePath?: string;
  activeArtifactPath?: string;
  createdAt: string;
  updatedAt: string;
}
