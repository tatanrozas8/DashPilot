"use client";

import type { DataRow, DatasetProfile } from "@/types/dataset";
import type { AnalyticalDatasetArtifact, AnalyticalQueryContext, GovernedAnalyticalQuery, AnalyticalTableQuery } from "@/types/analytical-query";
import type { DashboardViewState, DashboardWidget } from "@/types/dashboard";
import { buildWidgetAnalyticalRequest } from "@/lib/query-service/widgets";
import { GovernedAnalyticalQueryService, InMemoryAnalyticalArtifactRepository } from "@/lib/query-service/service";
import type { ExecutedQuerySummary, QueryServiceAggregateResult, QueryServiceContext, QueryServiceRequest, QueryServiceSource, QueryServiceTableResult } from "@/lib/query-service/contract";
import { queryServiceAggregateResultSchema, queryServiceRequestSchema, queryServiceResponseSchema, queryServiceTableResultSchema } from "@/lib/query-service/contract";

const localRepository = new InMemoryAnalyticalArtifactRepository();
const localRows = new Map<string, DataRow[]>();
const localProfiles = new Map<string, DatasetProfile>();
const service = new GovernedAnalyticalQueryService(localRepository);

function versionIdFor(profile: DatasetProfile, datasetId: string) {
  return profile.datasetVersionId || datasetId;
}

function columnsFromRows(rows: DataRow[], profile: DatasetProfile) {
  const fields = profile.columns.length
    ? profile.columns.map((column) => column.normalizedName)
    : Object.keys(rows[0] ?? {});
  return fields.map((name) => ({
    name,
    values: rows.map((row) => row[name] ?? null)
  }));
}

function contextFor(source: QueryServiceSource): AnalyticalQueryContext {
  return {
    tenantId: source === "supabase" ? "supabase" : "local",
    userId: source === "supabase" ? "authenticated-user" : "local-user"
  };
}

function querySummary(request: QueryServiceRequest): ExecutedQuerySummary {
  return {
    datasetId: request.datasetId,
    datasetVersionId: request.query.datasetVersionId,
    dashboardId: request.dashboardId,
    kind: request.kind,
    filters: request.query.filters.length,
    limit: request.query.limit,
    offset: request.query.offset
  };
}

export interface RegisterQueryableDatasetInput {
  datasetId: string;
  profile: DatasetProfile;
  rows: DataRow[];
  source?: QueryServiceSource;
}

export function registerQueryableDataset(input: RegisterQueryableDatasetInput) {
  const datasetVersionId = versionIdFor(input.profile, input.datasetId);
  const source = input.source ?? "local";
  const artifact: AnalyticalDatasetArtifact = {
    datasetVersionId,
    tenantId: source === "supabase" ? "supabase" : "local",
    profile: { ...input.profile, datasetVersionId },
    format: "columnar-json",
    path: `${source}://datasets/${input.datasetId}/versions/${datasetVersionId}`,
    columns: columnsFromRows(input.rows, input.profile),
    rowCount: input.profile.rowCount,
    columnCount: input.profile.columnCount
  };
  localRepository.save(artifact);
  localRows.set(datasetVersionId, input.rows.map((row) => ({ ...row })));
  localProfiles.set(datasetVersionId, artifact.profile);
}

export function clearQueryableDatasets() {
  localRows.clear();
  localProfiles.clear();
}

export function hasQueryableDataset(datasetVersionId: string) {
  return localRows.has(datasetVersionId);
}

export function getQueryableRowsSample(datasetVersionId: string, limit = 25) {
  return (localRows.get(datasetVersionId) ?? []).slice(0, limit).map((row) => ({ ...row }));
}

export function getQueryableRowsForExport(datasetVersionId: string) {
  return (localRows.get(datasetVersionId) ?? []).map((row) => ({ ...row }));
}

export function getQueryableProfile(datasetVersionId: string) {
  const profile = localProfiles.get(datasetVersionId);
  return profile ? { ...profile, columns: profile.columns.map((column) => ({ ...column })) } : null;
}

async function executeRemote(request: QueryServiceRequest) {
  const parsed = queryServiceRequestSchema.parse(request);
  const response = await fetch("/api/query", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(parsed)
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message = typeof payload === "object" && payload && "error" in payload && typeof payload.error === "string"
      ? payload.error
      : "No se pudo ejecutar la consulta.";
    throw new Error(message);
  }
  return queryServiceResponseSchema.parse(payload);
}

function shouldUseRemote(input: { context: QueryServiceContext; datasetVersionId: string }) {
  return input.context === "authenticated" && !hasQueryableDataset(input.datasetVersionId);
}

export async function executeAggregateQuery(input: {
  datasetId: string;
  dashboardId?: string;
  context: QueryServiceContext;
  query: GovernedAnalyticalQuery;
}): Promise<QueryServiceAggregateResult> {
  const request: QueryServiceRequest = {
    kind: "aggregate",
    datasetId: input.datasetId,
    dashboardId: input.dashboardId,
    context: input.context,
    query: input.query
  };
  if (shouldUseRemote({ context: input.context, datasetVersionId: input.query.datasetVersionId })) {
    const response = await executeRemote(request);
    if (response.kind !== "aggregate") throw new Error("El servicio de consultas devolvio una respuesta agregada invalida.");
    return queryServiceAggregateResultSchema.parse(response.result);
  }
  const result = await service.execute(request.query, contextFor("local"));
  return {
    ...result,
    columns: Object.keys(result.rows[0] ?? {}),
    errors: [],
    executedQuerySummary: querySummary(request),
    source: result.metadata.cache === "hit" || result.metadata.cache === "preaggregation" ? "cache" : "local"
  };
}

export async function executeTableQuery(input: {
  datasetId: string;
  dashboardId?: string;
  context: QueryServiceContext;
  query: AnalyticalTableQuery;
}): Promise<QueryServiceTableResult> {
  const request: QueryServiceRequest = {
    kind: "table",
    datasetId: input.datasetId,
    dashboardId: input.dashboardId,
    context: input.context,
    query: input.query
  };
  if (shouldUseRemote({ context: input.context, datasetVersionId: input.query.datasetVersionId })) {
    const response = await executeRemote(request);
    if (response.kind !== "table") throw new Error("El servicio de consultas devolvio una respuesta tabular invalida.");
    return queryServiceTableResultSchema.parse(response.result);
  }
  const result = await service.executeTable(request.query, contextFor("local"));
  return {
    ...result,
    columns: input.query.columns,
    errors: [],
    executedQuerySummary: querySummary(request),
    source: "local"
  };
}

export async function executeWidgetQuery(input: {
  datasetId: string;
  dashboardId?: string;
  datasetVersionId: string;
  context: QueryServiceContext;
  widget: DashboardWidget;
  profile: DatasetProfile;
  viewState: DashboardViewState;
}) {
  const request = buildWidgetAnalyticalRequest({
    datasetVersionId: input.datasetVersionId,
    widget: input.widget,
    profile: input.profile,
    viewState: input.viewState
  });
  if (!request) return null;
  return request.kind === "aggregate"
    ? executeAggregateQuery({ datasetId: input.datasetId, dashboardId: input.dashboardId, context: input.context, query: request.query })
    : executeTableQuery({ datasetId: input.datasetId, dashboardId: input.dashboardId, context: input.context, query: request.query });
}
