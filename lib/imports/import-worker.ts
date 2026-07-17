import type { DataRow, DatasetProfile, FileParseResult, ParsedSheet } from "@/types/dataset";
import type {
  ColumnarDatasetArtifact,
  ImportJobRecord,
  ImportJobStage,
  ImportJobStatus,
  ImportValidationIssue,
  ResumableUploadSession,
  SafeImportPreview
} from "@/types/imports";
import { profileDataset } from "@/lib/profiling/profile-dataset";
import { convertRowsToColumnarArtifact } from "@/lib/imports/columnar";
import type { MalwareScanner } from "@/lib/imports/scanner";

export const IMPORT_WORKER_HEARTBEAT_TIMEOUT_MS = 2 * 60 * 1000;
export const IMPORT_WORKER_RETRY_DELAY_MS = 60 * 1000;
export const IMPORT_WORKER_ROW_LIMIT = 50_000;

export interface ImportSourceReader {
  readParsedFile(job: ImportJobRecord): Promise<FileParseResult>;
}

export interface ImportArtifactWriter {
  writeColumnarArtifact(job: ImportJobRecord, artifact: ColumnarDatasetArtifact): Promise<string>;
  persistParsedArtifacts(job: ImportJobRecord, parsed: FileParseResult, profile: DatasetProfile, rows: DataRow[]): Promise<void>;
  activateDatasetVersion(job: ImportJobRecord): Promise<string>;
}

export interface ImportJobRepository {
  save(job: ImportJobRecord): Promise<ImportJobRecord>;
  getById(jobId: string): Promise<ImportJobRecord | null>;
  findByIdempotencyKey(idempotencyKey: string): Promise<ImportJobRecord | null>;
  findByDatasetId(datasetId: string): Promise<ImportJobRecord | null>;
  update(jobId: string, patch: ImportJobPatch): Promise<ImportJobRecord>;
  listRunnable(now: Date): Promise<ImportJobRecord[]>;
  listStale(now: Date, staleAfterMs: number): Promise<ImportJobRecord[]>;
}

export type ImportJobPatch = Partial<Pick<
  ImportJobRecord,
  | "status"
  | "stage"
  | "progress"
  | "attempts"
  | "leaseOwner"
  | "heartbeatAt"
  | "nextRunAt"
  | "cancelledAt"
  | "finishedAt"
  | "error"
  | "validationIssues"
  | "scanStatus"
  | "completedStages"
  | "parsed"
  | "profile"
  | "rows"
  | "columnarArtifact"
  | "columnarStoragePath"
  | "activeArtifactPath"
  | "events"
  | "updatedAt"
>>;

const terminalStatuses: ImportJobStatus[] = ["ready", "cancelled", "failed", "dead_letter"];

export class NonRetryableImportError extends Error {
  readonly issue: ImportValidationIssue;

  constructor(issue: ImportValidationIssue) {
    super(issue.message);
    this.issue = issue;
  }
}

function nowIso() {
  return new Date().toISOString();
}

function selectedSheet(parsed: FileParseResult): ParsedSheet {
  const sheet = parsed.sheets.find((item) => item.name === parsed.selectedSheetName) ?? parsed.sheets[0];
  if (!sheet) throw new NonRetryableImportError({ code: "parser_failed", severity: "error", message: "No se detecto una hoja valida para importar." });
  return sheet;
}

function progressForStage(stage: ImportJobStage) {
  switch (stage) {
    case "upload_signed": return 5;
    case "upload_received": return 15;
    case "security_validation": return 25;
    case "antivirus_scan": return 35;
    case "parse_source": return 50;
    case "profile_dataset": return 65;
    case "convert_columnar": return 78;
    case "persist_artifacts": return 90;
    case "activate_version": return 100;
  }
}

function statusForStage(stage: ImportJobStage): ImportJobStatus {
  switch (stage) {
    case "upload_signed": return "created";
    case "upload_received": return "queued";
    case "security_validation": return "processing";
    case "antivirus_scan": return "scanning";
    case "parse_source":
    case "profile_dataset": return "processing";
    case "convert_columnar": return "converting";
    case "persist_artifacts":
    case "activate_version": return "validating";
  }
}

export function createImportJobRecord(input: {
  id: string;
  projectId: string;
  datasetId: string;
  datasetVersionId: string;
  idempotencyKey: string;
  fileName: string;
  fileType: ImportJobRecord["fileType"];
  fileSize: number;
  declaredMimeType: string;
  detectedMimeType: string;
  uploadSession: ResumableUploadSession;
  retentionPolicy?: ImportJobRecord["retentionPolicy"];
  retainedUntil?: string;
  validationIssues: ImportValidationIssue[];
  scannerProvider: string;
  safePreview: SafeImportPreview;
  now?: string;
}): ImportJobRecord {
  const createdAt = input.now ?? nowIso();
  return {
    id: input.id,
    projectId: input.projectId,
    datasetId: input.datasetId,
    datasetVersionId: input.datasetVersionId,
    idempotencyKey: input.idempotencyKey,
    fileName: input.fileName,
    fileType: input.fileType,
    fileSize: input.fileSize,
    declaredMimeType: input.declaredMimeType,
    detectedMimeType: input.detectedMimeType,
    storageBucket: input.uploadSession.storageBucket,
    storagePath: input.uploadSession.storagePath,
    uploadSession: input.uploadSession,
    retentionPolicy: input.retentionPolicy ?? "retain_original_private",
    retainedUntil: input.retainedUntil,
    status: "created",
    stage: "upload_signed",
    progress: 5,
    attempts: 0,
    maxAttempts: 3,
    validationIssues: input.validationIssues,
    scannerProvider: input.scannerProvider,
    scanStatus: "pending",
    safePreview: input.safePreview,
    completedStages: [],
    events: [
      {
        status: "created",
        stage: "upload_signed",
        progress: 5,
        message: "Upload firmado creado.",
        createdAt
      }
    ],
    createdAt,
    updatedAt: createdAt
  };
}

export class InMemoryImportJobRepository implements ImportJobRepository {
  private readonly jobs = new Map<string, ImportJobRecord>();

  async save(job: ImportJobRecord) {
    const existing = await this.findByIdempotencyKey(job.idempotencyKey);
    if (existing) return existing;
    this.jobs.set(job.id, structuredClone(job));
    return structuredClone(job);
  }

  async getById(jobId: string) {
    const job = this.jobs.get(jobId);
    return job ? structuredClone(job) : null;
  }

  async findByIdempotencyKey(idempotencyKey: string) {
    const job = Array.from(this.jobs.values()).find((item) => item.idempotencyKey === idempotencyKey);
    return job ? structuredClone(job) : null;
  }

  async findByDatasetId(datasetId: string) {
    const job = Array.from(this.jobs.values()).find((item) => item.datasetId === datasetId);
    return job ? structuredClone(job) : null;
  }

  async update(jobId: string, patch: ImportJobPatch) {
    const current = this.jobs.get(jobId);
    if (!current) throw new Error("No existe el import job.");
    const updated: ImportJobRecord = {
      ...current,
      ...patch,
      updatedAt: patch.updatedAt ?? nowIso()
    };
    this.jobs.set(jobId, structuredClone(updated));
    return structuredClone(updated);
  }

  async listRunnable(now: Date) {
    return Array.from(this.jobs.values())
      .filter((job) => ["queued", "retrying"].includes(job.status) && (!job.nextRunAt || new Date(job.nextRunAt).getTime() <= now.getTime()))
      .map((job) => structuredClone(job));
  }

  async listStale(now: Date, staleAfterMs: number) {
    return Array.from(this.jobs.values())
      .filter((job) => !terminalStatuses.includes(job.status) && Boolean(job.heartbeatAt) && now.getTime() - new Date(job.heartbeatAt ?? job.updatedAt).getTime() > staleAfterMs)
      .map((job) => structuredClone(job));
  }
}

function eventFor(job: ImportJobRecord, message: string) {
  return {
    status: job.status,
    stage: job.stage,
    progress: job.progress,
    message,
    createdAt: nowIso()
  };
}

export class ImportWorker {
  constructor(
    private readonly repository: ImportJobRepository,
    private readonly sourceReader: ImportSourceReader,
    private readonly artifactWriter: ImportArtifactWriter,
    private readonly scanner: MalwareScanner,
    private readonly workerId = "import-worker"
  ) {}

  async cancel(jobId: string) {
    const job = await this.repository.getById(jobId);
    if (!job || terminalStatuses.includes(job.status)) return job;
    return this.repository.update(jobId, {
      status: "cancelled",
      cancelledAt: nowIso(),
      error: { code: "cancelled", severity: "error", message: "Importacion cancelada por el usuario." },
      progress: job.progress,
      events: [...job.events, eventFor({ ...job, status: "cancelled" }, "Importacion cancelada.")]
    });
  }

  async reclaimStaleJobs(now = new Date()) {
    const staleJobs = await this.repository.listStale(now, IMPORT_WORKER_HEARTBEAT_TIMEOUT_MS);
    const reclaimed: ImportJobRecord[] = [];
    for (const job of staleJobs) {
      const next = await this.repository.update(job.id, {
        status: job.attempts + 1 >= job.maxAttempts ? "dead_letter" : "retrying",
        attempts: job.attempts + 1,
        leaseOwner: undefined,
        heartbeatAt: undefined,
        nextRunAt: new Date(now.getTime() + IMPORT_WORKER_RETRY_DELAY_MS).toISOString(),
        error: { code: "worker_stale", severity: "error", message: "El worker dejo de enviar heartbeats." },
        events: [...job.events, eventFor({ ...job, status: "retrying" }, "Worker muerto detectado; job reprogramado.")]
      });
      reclaimed.push(next);
    }
    return reclaimed;
  }

  async processJob(jobId: string) {
    const job = await this.repository.getById(jobId);
    if (!job) throw new Error("No existe el import job.");
    if (terminalStatuses.includes(job.status)) return job;
    const leased = await this.repository.update(job.id, {
      status: job.status === "created" || job.status === "uploading" ? "queued" : job.status,
      leaseOwner: this.workerId,
      heartbeatAt: nowIso(),
      attempts: job.attempts + 1
    });
    try {
      return await this.runStages(leased);
    } catch (error) {
      const latest = await this.repository.getById(job.id);
      return this.failJob(latest ?? leased, error);
    }
  }

  private async heartbeat(job: ImportJobRecord, stage: ImportJobStage, message: string, patch: ImportJobPatch = {}) {
    const status = statusForStage(stage);
    const progress = progressForStage(stage);
    const next = await this.repository.update(job.id, {
      ...patch,
      status,
      stage,
      progress,
      heartbeatAt: nowIso(),
      events: [...job.events, { status, stage, progress, message, createdAt: nowIso() }]
    });
    return next;
  }

  private async completeStage(job: ImportJobRecord, stage: ImportJobStage, patch: ImportJobPatch = {}) {
    const completedStages = job.completedStages.includes(stage) ? job.completedStages : [...job.completedStages, stage];
    return this.repository.update(job.id, { ...patch, completedStages });
  }

  private async runStages(initialJob: ImportJobRecord) {
    let job = initialJob;

    if (!job.completedStages.includes("security_validation")) {
      job = await this.heartbeat(job, "security_validation", "Validando seguridad del archivo.");
      const blockingIssue = job.validationIssues.find((issue) => issue.severity === "error");
      if (blockingIssue) throw new NonRetryableImportError(blockingIssue);
      job = await this.completeStage(job, "security_validation");
    }

    if (!job.completedStages.includes("antivirus_scan")) {
      job = await this.heartbeat(job, "antivirus_scan", "Ejecutando scanner antivirus.");
      const result = await this.scanner.scan({
        storageBucket: job.storageBucket,
        storagePath: job.storagePath,
        fileName: job.fileName,
        sizeBytes: job.fileSize
      });
      if (result.status !== "clean") {
        throw new NonRetryableImportError(result.issue ?? { code: "virus_detected", severity: "error", message: "El scanner no aprobo el archivo." });
      }
      job = await this.completeStage(job, "antivirus_scan", { scanStatus: "clean" });
    }

    if (!job.completedStages.includes("parse_source")) {
      job = await this.heartbeat(job, "parse_source", "Parseando archivo fuera del navegador.");
      const parsed = await this.sourceReader.readParsedFile(job);
      job = await this.completeStage(job, "parse_source", { parsed });
    }

    if (!job.completedStages.includes("profile_dataset")) {
      job = await this.heartbeat(job, "profile_dataset", "Perfilando dataset.");
      if (!job.parsed) throw new Error("El parser no entrego resultado.");
      const sheet = selectedSheet(job.parsed);
      const rows = sheet.rows.slice(0, IMPORT_WORKER_ROW_LIMIT);
      const profile = profileDataset(rows, job.parsed.fileName, sheet.columns);
      job = await this.completeStage(job, "profile_dataset", { profile: { ...profile, datasetVersionId: job.datasetVersionId }, rows });
    }

    if (!job.completedStages.includes("convert_columnar")) {
      job = await this.heartbeat(job, "convert_columnar", "Convirtiendo a formato columnar analitico.");
      const artifact = convertRowsToColumnarArtifact(job.rows ?? []);
      job = await this.completeStage(job, "convert_columnar", { columnarArtifact: artifact });
    }

    if (!job.completedStages.includes("persist_artifacts")) {
      job = await this.heartbeat(job, "persist_artifacts", "Persistiendo artefactos versionados.");
      if (!job.parsed || !job.profile || !job.rows || !job.columnarArtifact) throw new Error("Faltan artefactos para persistir.");
      await this.artifactWriter.persistParsedArtifacts(job, job.parsed, job.profile, job.rows);
      const columnarStoragePath = await this.artifactWriter.writeColumnarArtifact(job, job.columnarArtifact);
      job = await this.completeStage(job, "persist_artifacts", { columnarStoragePath });
    }

    job = await this.heartbeat(job, "activate_version", "Activando version validada.");
    const activeArtifactPath = await this.artifactWriter.activateDatasetVersion(job);
    return this.repository.update(job.id, {
      status: "ready",
      stage: "activate_version",
      progress: 100,
      activeArtifactPath,
      finishedAt: nowIso(),
      leaseOwner: undefined,
      heartbeatAt: undefined,
      events: [...job.events, { status: "ready", stage: "activate_version", progress: 100, message: "Importacion completada.", createdAt: nowIso() }]
    });
  }

  private async failJob(job: ImportJobRecord, error: unknown) {
    const issue: ImportValidationIssue = error instanceof NonRetryableImportError
      ? error.issue
      : { code: "parser_failed", severity: "error", message: error instanceof Error ? error.message : "Importacion fallida." };
    const terminal = error instanceof NonRetryableImportError || job.attempts >= job.maxAttempts;
    const status: ImportJobStatus = terminal ? "dead_letter" : "retrying";
    return this.repository.update(job.id, {
      status,
      error: issue,
      leaseOwner: undefined,
      heartbeatAt: undefined,
      nextRunAt: terminal ? undefined : new Date(Date.now() + IMPORT_WORKER_RETRY_DELAY_MS).toISOString(),
      finishedAt: terminal ? nowIso() : undefined,
      events: [...job.events, eventFor({ ...job, status }, terminal ? "Importacion enviada a dead letter." : "Importacion reprogramada para retry.")]
    });
  }
}
