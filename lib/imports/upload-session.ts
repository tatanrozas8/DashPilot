import type { ImportJobRecord, ResumableUploadSession } from "@/types/imports";
import { createImportJobRecord, InMemoryImportJobRepository } from "@/lib/imports/import-worker";
import { createSafeImportPreview, inspectBrowserFile, validateImportFileInspection } from "@/lib/imports/file-security";

export const browserImportJobRepository = new InMemoryImportJobRepository();

export interface BrowserImportStartResult {
  job: ImportJobRecord;
  uploadSession: ResumableUploadSession;
  reusedExistingJob: boolean;
}

function randomId(prefix: string) {
  const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}_${id}`;
}

function safeStorageName(fileName: string) {
  return fileName.replace(/[^\w.-]+/g, "_");
}

function idempotencyKeyForFile(file: File, override?: string) {
  if (override) return override;
  const lastModified = "lastModified" in file ? file.lastModified : 0;
  return `browser-upload:${file.name}:${file.size}:${lastModified}`;
}

function createLocalResumableUploadSession(input: {
  projectId: string;
  datasetId: string;
  datasetVersionId: string;
  fileName: string;
}): ResumableUploadSession {
  const uploadId = randomId("upload");
  const storagePath = `local/${input.projectId}/${input.datasetId}/${input.datasetVersionId}/${safeStorageName(input.fileName)}`;
  return {
    uploadId,
    storageBucket: "dashboard-files",
    storagePath,
    signedUrl: `dashpilot-local://${uploadId}`,
    protocol: "local-memory",
    chunkSizeBytes: 5 * 1024 * 1024,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    headers: [{ name: "x-dashpilot-upload-id", value: uploadId }]
  };
}

export async function createBrowserImportJob(file: File, input: { idempotencyKey?: string; projectId?: string } = {}): Promise<BrowserImportStartResult> {
  const idempotencyKey = idempotencyKeyForFile(file, input.idempotencyKey);
  const existing = await browserImportJobRepository.findByIdempotencyKey(idempotencyKey);
  if (existing) {
    return { job: existing, uploadSession: existing.uploadSession, reusedExistingJob: true };
  }

  const inspection = await inspectBrowserFile(file);
  const validation = validateImportFileInspection(inspection);
  if (!validation.fileType) {
    throw new Error(validation.issues[0]?.message ?? "Formato no soportado.");
  }

  const projectId = input.projectId ?? "local-project";
  const datasetId = randomId("dataset");
  const datasetVersionId = randomId("dataset_version");
  const uploadSession = createLocalResumableUploadSession({ projectId, datasetId, datasetVersionId, fileName: file.name });
  const safePreview = createSafeImportPreview(inspection, validation.fileType, validation.detectedMimeType, validation.issues);
  const job = createImportJobRecord({
    id: randomId("import_job"),
    projectId,
    datasetId,
    datasetVersionId,
    idempotencyKey,
    fileName: file.name,
    fileType: validation.fileType,
    fileSize: file.size,
    declaredMimeType: file.type,
    detectedMimeType: validation.detectedMimeType,
    uploadSession,
    validationIssues: validation.issues,
    scannerProvider: "pending-worker-scanner",
    safePreview
  });

  const saved = await browserImportJobRepository.save(job);
  return { job: saved, uploadSession, reusedExistingJob: false };
}

export async function uploadFileToSession(
  file: File,
  session: ResumableUploadSession,
  onProgress?: (progress: { uploadedBytes: number; totalBytes: number }) => void
) {
  if (session.protocol !== "local-memory") {
    throw new Error(`El protocolo ${session.protocol} requiere un adaptador de object storage del servidor.`);
  }
  let uploadedBytes = 0;
  while (uploadedBytes < file.size) {
    uploadedBytes = Math.min(uploadedBytes + session.chunkSizeBytes, file.size);
    onProgress?.({ uploadedBytes, totalBytes: file.size });
    await Promise.resolve();
  }
  return {
    storageBucket: session.storageBucket,
    storagePath: session.storagePath
  };
}

export async function markBrowserUploadQueued(jobId: string) {
  const job = await browserImportJobRepository.getById(jobId);
  if (!job) throw new Error("No existe el import job.");
  return browserImportJobRepository.update(jobId, {
    status: "queued",
    stage: "upload_received",
    progress: 15,
    events: [
      ...job.events,
      {
        status: "queued",
        stage: "upload_received",
        progress: 15,
        message: "Archivo recibido en object storage; esperando worker.",
        createdAt: new Date().toISOString()
      }
    ]
  });
}

export async function getBrowserImportJob(jobId: string) {
  return browserImportJobRepository.getById(jobId);
}

export async function getBrowserImportJobByDatasetId(datasetId: string) {
  return browserImportJobRepository.findByDatasetId(datasetId);
}
