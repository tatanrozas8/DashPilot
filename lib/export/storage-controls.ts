import type { ExportJob, ExportRequest, ExportResult } from "@/lib/export/contracts";

export interface ExportStorageRecord {
  jobId: string;
  request: ExportRequest;
  status: ExportJob["status"];
  storageMode: "direct-download" | "durable-storage";
  storagePath?: string;
  signedUrl?: string;
  expiresAt?: string;
  result?: ExportResult;
  error?: ExportJob["error"];
}

export function createDirectDownloadStorageRecord(job: ExportJob): ExportStorageRecord {
  return {
    jobId: job.id,
    request: job.request,
    status: job.status,
    storageMode: "direct-download",
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    result: job.result,
    error: job.error
  };
}

export function durableExportStorageViability() {
  return {
    viable: false,
    reason: "Exports are generated client-side today; DB export_jobs and storage adapter contracts are ready, but server-side rendering/storage is intentionally deferred.",
    debtLevel: "P2" as const
  };
}
