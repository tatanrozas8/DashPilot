import { z } from "zod";

export const importFileTypeSchema = z.enum(["csv", "xlsx", "xls"]);

export const importJobStatusSchema = z.enum([
  "created",
  "uploading",
  "queued",
  "scanning",
  "processing",
  "converting",
  "validating",
  "ready",
  "retrying",
  "cancelled",
  "failed",
  "dead_letter"
]);

export const importJobStageSchema = z.enum([
  "upload_signed",
  "upload_received",
  "security_validation",
  "antivirus_scan",
  "parse_source",
  "profile_dataset",
  "convert_columnar",
  "persist_artifacts",
  "activate_version"
]);

export const importValidationIssueSchema = z.object({
  code: z.enum([
    "unsupported_extension",
    "mime_mismatch",
    "magic_bytes_mismatch",
    "file_too_large",
    "empty_file",
    "too_many_sheets",
    "compression_ratio_exceeded",
    "malicious_archive_entry",
    "encrypted_or_macro_enabled",
    "virus_detected",
    "parser_failed",
    "storage_failed",
    "worker_stale",
    "cancelled"
  ]),
  severity: z.enum(["warning", "error"]),
  message: z.string().min(1)
});

export const resumableUploadSessionSchema = z.object({
  uploadId: z.string().min(1),
  storageBucket: z.string().min(1),
  storagePath: z.string().min(1),
  signedUrl: z.string().min(1),
  protocol: z.enum(["tus", "supabase-signed-upload", "local-memory"]),
  chunkSizeBytes: z.number().int().positive(),
  expiresAt: z.string().min(1),
  headers: z.array(z.object({ name: z.string().min(1), value: z.string() }))
});

export const safeImportPreviewSchema = z.object({
  fileName: z.string().min(1),
  fileType: importFileTypeSchema,
  sizeBytes: z.number().int().nonnegative(),
  detectedMimeType: z.string().min(1),
  sampleTextLines: z.array(z.string()),
  warnings: z.array(z.string())
});

export const importJobProgressEventSchema = z.object({
  status: importJobStatusSchema,
  stage: importJobStageSchema,
  progress: z.number().int().min(0).max(100),
  message: z.string().min(1),
  createdAt: z.string().min(1)
});
