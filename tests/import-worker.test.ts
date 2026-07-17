import { describe, expect, it } from "vitest";
import {
  createImportJobRecord,
  ImportWorker,
  InMemoryImportJobRepository,
  type ImportArtifactWriter,
  type ImportSourceReader
} from "@/lib/imports/import-worker";
import { createCleanScanner, createInfectedScanner } from "@/lib/imports/scanner";
import type { DataRow, DatasetProfile, FileParseResult } from "@/types/dataset";
import type { ColumnarDatasetArtifact, ImportJobRecord, ResumableUploadSession } from "@/types/imports";

const rows: DataRow[] = [
  { region: "Norte", ventas: 100 },
  { region: "Sur", ventas: 200 }
];

const parsed: FileParseResult = {
  fileName: "ventas.csv",
  fileType: "csv",
  fileSize: 24,
  selectedSheetName: "CSV",
  warnings: [],
  sheets: [
    {
      name: "CSV",
      rowCount: 2,
      columnCount: 2,
      isSelected: true,
      columns: [
        { id: "region", rawHeader: "Region", originalName: "Region", canonicalName: "region", normalizedName: "region", displayName: "Region", position: 0 },
        { id: "ventas", rawHeader: "Ventas", originalName: "Ventas", canonicalName: "ventas", normalizedName: "ventas", displayName: "Ventas", position: 1 }
      ],
      rows,
      previewRows: rows
    }
  ]
};

const uploadSession: ResumableUploadSession = {
  uploadId: "upload-1",
  storageBucket: "dashboard-files",
  storagePath: "user/project/dataset/version/ventas.csv",
  signedUrl: "dashpilot-local://upload-1",
  protocol: "local-memory",
  chunkSizeBytes: 1024,
  expiresAt: "2099-01-01T00:00:00.000Z",
  headers: []
};

function job(idempotencyKey = "idem-1"): ImportJobRecord {
  return createImportJobRecord({
    id: `job-${idempotencyKey}`,
    projectId: "project-1",
    datasetId: "dataset-1",
    datasetVersionId: "version-1",
    idempotencyKey,
    fileName: "ventas.csv",
    fileType: "csv",
    fileSize: 24,
    declaredMimeType: "text/csv",
    detectedMimeType: "text/plain",
    uploadSession,
    validationIssues: [],
    scannerProvider: "test-clean-scanner",
    safePreview: {
      fileName: "ventas.csv",
      fileType: "csv",
      sizeBytes: 24,
      detectedMimeType: "text/plain",
      sampleTextLines: ["region,ventas", "Norte,100"],
      warnings: []
    },
    now: "2026-07-16T00:00:00.000Z"
  });
}

class StaticReader implements ImportSourceReader {
  readCount = 0;

  async readParsedFile() {
    this.readCount += 1;
    return parsed;
  }
}

class MemoryWriter implements ImportArtifactWriter {
  persistCount = 0;
  columnar?: ColumnarDatasetArtifact;
  failPersistOnce = false;

  async writeColumnarArtifact(currentJob: ImportJobRecord, artifact: ColumnarDatasetArtifact) {
    this.columnar = artifact;
    return `${currentJob.storagePath}.columnar.json`;
  }

  async persistParsedArtifacts(_job: ImportJobRecord, _parsed: FileParseResult, _profile: DatasetProfile, _rows: DataRow[]) {
    this.persistCount += 1;
    if (this.failPersistOnce) {
      this.failPersistOnce = false;
      throw new Error("temporary storage outage");
    }
  }

  async activateDatasetVersion(currentJob: ImportJobRecord) {
    return currentJob.columnarStoragePath ?? `${currentJob.storagePath}.columnar.json`;
  }
}

describe("import worker", () => {
  it("keeps idempotent upload starts on the same import job", async () => {
    const repository = new InMemoryImportJobRepository();
    const first = await repository.save(job("idem-repeat"));
    const second = await repository.save(job("idem-repeat"));

    expect(second.id).toBe(first.id);
  });

  it("cancels queued work without activating artifacts", async () => {
    const repository = new InMemoryImportJobRepository();
    const queued = await repository.save({ ...job("cancel"), status: "queued", stage: "upload_received", progress: 15 });
    const worker = new ImportWorker(repository, new StaticReader(), new MemoryWriter(), createCleanScanner());
    const cancelled = await worker.cancel(queued.id);

    expect(cancelled?.status).toBe("cancelled");
    expect(cancelled?.activeArtifactPath).toBeUndefined();
  });

  it("dead-letters infected files before parsing", async () => {
    const repository = new InMemoryImportJobRepository();
    const queued = await repository.save({ ...job("infected"), status: "queued", stage: "upload_received", progress: 15 });
    const reader = new StaticReader();
    const worker = new ImportWorker(repository, reader, new MemoryWriter(), createInfectedScanner("EICAR-Test-File"));
    const result = await worker.processJob(queued.id);

    expect(result.status).toBe("dead_letter");
    expect(result.error?.code).toBe("virus_detected");
    expect(reader.readCount).toBe(0);
  });

  it("reclaims a dead worker heartbeat for retry", async () => {
    const repository = new InMemoryImportJobRepository();
    const stale = await repository.save({
      ...job("stale"),
      status: "processing",
      stage: "parse_source",
      heartbeatAt: "2026-07-16T00:00:00.000Z"
    });
    const worker = new ImportWorker(repository, new StaticReader(), new MemoryWriter(), createCleanScanner());
    const reclaimed = await worker.reclaimStaleJobs(new Date("2026-07-16T00:05:00.000Z"));

    expect(reclaimed).toHaveLength(1);
    expect(reclaimed[0]?.id).toBe(stale.id);
    expect(reclaimed[0]?.status).toBe("retrying");
    expect(reclaimed[0]?.error?.code).toBe("worker_stale");
  });

  it("retries transient persistence failures and resumes from completed stages", async () => {
    const repository = new InMemoryImportJobRepository();
    const queued = await repository.save({ ...job("retry"), status: "queued", stage: "upload_received", progress: 15 });
    const reader = new StaticReader();
    const writer = new MemoryWriter();
    writer.failPersistOnce = true;
    const worker = new ImportWorker(repository, reader, writer, createCleanScanner());

    const first = await worker.processJob(queued.id);
    expect(first.status).toBe("retrying");
    expect(first.completedStages).toContain("convert_columnar");

    const second = await worker.processJob(queued.id);
    expect(second.status).toBe("ready");
    expect(second.activeArtifactPath).toContain(".columnar.json");
    expect(reader.readCount).toBe(1);
    expect(writer.columnar?.columns.find((column) => column.name === "ventas")?.values).toEqual([100, 200]);
  });

  it("does not activate artifacts when validation fails", async () => {
    const repository = new InMemoryImportJobRepository();
    const invalid = await repository.save({
      ...job("invalid"),
      status: "queued",
      stage: "upload_received",
      progress: 15,
      validationIssues: [{ code: "compression_ratio_exceeded", severity: "error", message: "zip bomb" }]
    });
    const worker = new ImportWorker(repository, new StaticReader(), new MemoryWriter(), createCleanScanner());
    const result = await worker.processJob(invalid.id);

    expect(result.status).toBe("dead_letter");
    expect(result.activeArtifactPath).toBeUndefined();
  });
});
