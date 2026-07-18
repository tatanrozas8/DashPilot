import { z } from "zod";
import { dashboardFilterSchema } from "@/lib/validation/schemas";
import type { DashboardFilter } from "@/types/dashboard";

export const exportFormatSchema = z.enum(["pdf", "png", "pptx"]);
export const exportTargetTypeSchema = z.enum(["dashboard", "widget", "slide", "presentation"]);
export const exportScopeSchema = z.enum(["private_workspace", "public_share"]);
export const exportStatusSchema = z.enum(["idle", "queued", "rendering", "generating", "ready", "failed", "expired"]);
export const exportErrorCodeSchema = z.enum([
  "invalid_request",
  "format_not_allowed",
  "target_not_found",
  "revision_not_found",
  "download_not_allowed",
  "render_failed",
  "expired"
]);

export const exportTargetSchema = z.object({
  type: exportTargetTypeSchema,
  id: z.string().min(1).optional()
});

export const exportRequestSchema = z.object({
  id: z.string().min(1),
  target: exportTargetSchema,
  format: exportFormatSchema,
  scope: exportScopeSchema,
  dashboardId: z.string().min(1),
  dashboardRevisionId: z.string().min(1),
  presentationId: z.string().min(1).optional(),
  presentationRevisionId: z.string().min(1).optional(),
  filters: z.array(dashboardFilterSchema),
  actor: z.object({
    id: z.string().min(1),
    role: z.enum(["viewer", "editor", "admin", "public"])
  }),
  allowDownload: z.boolean(),
  requestedAt: z.string().min(1)
}).superRefine((request, context) => {
  if (request.scope === "public_share" && !request.allowDownload) {
    context.addIssue({
      code: "custom",
      path: ["allowDownload"],
      message: "Este enlace compartido no permite descargas."
    });
  }
  if (request.target.type === "presentation" && request.format !== "pptx" && request.format !== "pdf") {
    context.addIssue({
      code: "custom",
      path: ["format"],
      message: "Las presentaciones solo se exportan como PPTX o PDF."
    });
  }
  if (request.target.type === "slide" && request.format !== "png") {
    context.addIssue({
      code: "custom",
      path: ["format"],
      message: "Los slides individuales se exportan como PNG."
    });
  }
});

export const exportErrorSchema = z.object({
  code: exportErrorCodeSchema,
  message: z.string().min(1),
  recoverable: z.boolean(),
  detail: z.string().optional()
});

export const exportResultSchema = z.object({
  id: z.string().min(1),
  requestId: z.string().min(1),
  status: z.literal("ready"),
  format: exportFormatSchema,
  fileName: z.string().min(1),
  mimeType: z.string().min(1),
  byteLength: z.number().int().positive(),
  generatedAt: z.string().min(1),
  expiresAt: z.string().min(1).optional(),
  metadata: z.object({
    dashboardId: z.string().min(1),
    dashboardRevisionId: z.string().min(1),
    presentationId: z.string().optional(),
    presentationRevisionId: z.string().optional(),
    filters: z.array(dashboardFilterSchema),
    source: z.string().min(1),
    rasterized: z.array(z.string())
  })
});

export const exportJobSchema = z.object({
  id: z.string().min(1),
  request: exportRequestSchema,
  status: exportStatusSchema,
  progressLabel: z.string().min(1),
  queuedAt: z.string().min(1),
  updatedAt: z.string().min(1),
  result: exportResultSchema.optional(),
  error: exportErrorSchema.optional()
});

export type ExportFormat = z.infer<typeof exportFormatSchema>;
export type ExportTargetType = z.infer<typeof exportTargetTypeSchema>;
export type ExportScope = z.infer<typeof exportScopeSchema>;
export type ExportStatus = z.infer<typeof exportStatusSchema>;
export type ExportErrorCode = z.infer<typeof exportErrorCodeSchema>;
export type ExportTarget = z.infer<typeof exportTargetSchema>;
export type ExportRequest = z.infer<typeof exportRequestSchema>;
export type ExportResult = z.infer<typeof exportResultSchema>;
export type ExportError = z.infer<typeof exportErrorSchema>;
export type ExportJob = z.infer<typeof exportJobSchema>;

export function dashboardExportRevisionId(input: { id: string; datasetId: string; datasetVersionId?: string; updatedAt: string }) {
  return `${input.id}:${input.datasetVersionId ?? input.datasetId}:${input.updatedAt}`;
}

export function presentationExportRevisionId(input: { id: string; updatedAt: string }) {
  return `${input.id}:${input.updatedAt}`;
}

export function createExportRequest(input: Omit<ExportRequest, "id" | "requestedAt" | "filters"> & { filters?: DashboardFilter[]; id?: string; requestedAt?: string }) {
  return exportRequestSchema.parse({
    ...input,
    id: input.id ?? `export_request_${Date.now()}`,
    filters: input.filters ?? [],
    requestedAt: input.requestedAt ?? new Date().toISOString()
  });
}

export function createQueuedExportJob(request: ExportRequest): ExportJob {
  const now = new Date().toISOString();
  return exportJobSchema.parse({
    id: `export_job_${request.id}`,
    request,
    status: "queued",
    progressLabel: "Exportacion en cola",
    queuedAt: now,
    updatedAt: now
  });
}

export function transitionExportJob(job: ExportJob, status: ExportStatus, progressLabel: string): ExportJob {
  return exportJobSchema.parse({
    ...job,
    status,
    progressLabel,
    updatedAt: new Date().toISOString(),
    error: status === "failed" ? job.error : undefined
  });
}

export function completeExportJob(job: ExportJob, result: ExportResult): ExportJob {
  return exportJobSchema.parse({
    ...job,
    status: "ready",
    progressLabel: "Archivo listo para descargar",
    updatedAt: result.generatedAt,
    result,
    error: undefined
  });
}

export function failExportJob(job: ExportJob, error: ExportError): ExportJob {
  return exportJobSchema.parse({
    ...job,
    status: "failed",
    progressLabel: "La exportacion fallo",
    updatedAt: new Date().toISOString(),
    error
  });
}
