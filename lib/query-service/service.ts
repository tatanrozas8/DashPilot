import type { DataRow, DatasetProfile } from "@/types/dataset";
import type { DashboardQuerySpec, DashboardViewState, QueryMetricResult, QueryResultRow, QueryWarning } from "@/types/dashboard";
import type {
  AnalyticalCostEstimate,
  AnalyticalDatasetArtifact,
  AnalyticalQueryContext,
  AnalyticalQueryLimits,
  AnalyticalQueryResult,
  AnalyticalTableResult,
  GovernedAnalyticalQuery
} from "@/types/analytical-query";
import { executeDashboardQuery } from "@/lib/query-engine/execute-dashboard-query";
import { queryTableRows } from "@/lib/query-engine/search";
import { parseAnalyticalTableQuery, parseDatasetVersionPointer, parseGovernedAnalyticalQuery } from "@/lib/query-service/schemas";

export const DEFAULT_ANALYTICAL_QUERY_LIMITS: AnalyticalQueryLimits = {
  maxScanRows: 1_000_000,
  maxResultRows: 500,
  maxEstimatedCells: 8_000_000,
  maxEstimatedCardinality: 20_000,
  timeoutMs: 2_000
};

export interface AnalyticalArtifactRepository {
  getArtifact(datasetVersionId: string, context: AnalyticalQueryContext): Promise<AnalyticalDatasetArtifact>;
}

function nowIso(context: AnalyticalQueryContext) {
  return (context.now ?? new Date()).toISOString();
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

async function sha256Hex(payload: string) {
  const bytes = new TextEncoder().encode(payload);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function assertNotCancelled(context: AnalyticalQueryContext) {
  if (context.signal?.aborted) throw new Error("Consulta cancelada.");
}

function rowsFromArtifact(artifact: AnalyticalDatasetArtifact): DataRow[] {
  if (artifact.rows) return artifact.rows;
  if (!artifact.columns) return [];
  return Array.from({ length: artifact.rowCount }, (_, rowIndex) => {
    const row: DataRow = {};
    for (const column of artifact.columns ?? []) {
      row[column.name] = column.values[rowIndex] ?? null;
    }
    return row;
  });
}

function collectProjectedColumns(query: GovernedAnalyticalQuery) {
  return new Set([
    ...query.metrics.map((metric) => metric.field),
    ...query.dimensions,
    ...(query.timeDimension ? [query.timeDimension.field] : []),
    ...query.filters.map((filter) => filter.field)
  ]);
}

function estimateCardinality(query: GovernedAnalyticalQuery, profile: DatasetProfile) {
  const fields = [...query.dimensions, ...(query.timeDimension ? [query.timeDimension.field] : [])];
  if (!fields.length) return 1;
  return fields.reduce((total, field) => {
    const column = profile.columns.find((item) => item.normalizedName === field);
    const uniqueCount = Math.max(1, column?.uniqueCount ?? 1);
    return Math.min(Number.MAX_SAFE_INTEGER, total * uniqueCount);
  }, 1);
}

function estimateQueryCost(query: GovernedAnalyticalQuery, artifact: AnalyticalDatasetArtifact, limits: AnalyticalQueryLimits): AnalyticalCostEstimate {
  const projectedColumns = collectProjectedColumns(query).size || 1;
  const estimatedCells = artifact.rowCount * projectedColumns;
  const estimatedCardinality = estimateCardinality(query, artifact.profile);
  const reasons: string[] = [];
  if (artifact.rowCount > limits.maxScanRows) reasons.push(`scan_rows:${artifact.rowCount}`);
  if (query.limit > limits.maxResultRows) reasons.push(`limit:${query.limit}`);
  if (estimatedCells > limits.maxEstimatedCells) reasons.push(`estimated_cells:${estimatedCells}`);
  if (estimatedCardinality > limits.maxEstimatedCardinality) reasons.push(`estimated_cardinality:${estimatedCardinality}`);
  return {
    scannedRows: artifact.rowCount,
    projectedColumns,
    estimatedCells,
    estimatedCardinality,
    accepted: reasons.length === 0,
    reasons
  };
}

function mergeCoverage(rows: QueryResultRow[]) {
  const metricRows = rows.map((row) => row.result).filter((result): result is QueryMetricResult => Boolean(result));
  const totalCount = metricRows.reduce((total, result) => total + result.totalCount, 0);
  const validCount = metricRows.reduce((total, result) => total + result.validCount, 0);
  const excludedCount = metricRows.reduce((total, result) => total + result.excludedCount, 0);
  const warnings = metricRows.flatMap((result) => result.warnings);
  return {
    totalCount,
    validCount,
    excludedCount,
    coverage: totalCount === 0 ? 1 : Number((validCount / totalCount).toFixed(4)),
    warnings
  };
}

function queryToDashboardSpec(query: GovernedAnalyticalQuery): DashboardQuerySpec {
  const metric = query.metrics[0];
  return {
    metric: metric ? { field: metric.field, aggregation: metric.aggregation } : undefined,
    x: query.timeDimension ? { field: query.timeDimension.field, granularity: query.timeDimension.granularity } : undefined,
    groupBy: query.dimensions,
    filters: query.filters,
    orderBy: query.orderBy,
    limit: query.limit
  };
}

export function normalizeDashboardQueryForService(input: {
  datasetVersionId: string;
  query: DashboardQuerySpec;
  viewState?: DashboardViewState;
  fallbackCountField?: string;
}): GovernedAnalyticalQuery {
  const metric = input.query.metric ?? (input.fallbackCountField ? { field: input.fallbackCountField, aggregation: "count" as const } : undefined);
  if (!metric) throw new Error("La consulta de widget necesita una metrica allowlisted o un campo real para count.");
  return {
    datasetVersionId: input.datasetVersionId,
    metrics: [metric],
    dimensions: input.query.groupBy ?? [],
    timeDimension: input.query.x?.field ? { field: input.query.x.field, granularity: input.query.x.granularity ?? "month" } : undefined,
    filters: [...(input.query.filters ?? []), ...(input.viewState?.filters ?? [])],
    orderBy: input.query.orderBy,
    limit: input.query.limit ?? 100,
    offset: 0
  };
}

export class AnalyticalQueryCache {
  private readonly entries = new Map<string, AnalyticalQueryResult>();
  private readonly preaggregations = new Map<string, AnalyticalQueryResult>();
  private readonly hitCounts = new Map<string, number>();

  get(key: string) {
    const preaggregation = this.preaggregations.get(key);
    if (preaggregation) return { result: preaggregation, cache: "preaggregation" as const };
    const result = this.entries.get(key);
    if (!result) return null;
    const count = (this.hitCounts.get(key) ?? 0) + 1;
    this.hitCounts.set(key, count);
    if (count >= 2 && result.metadata.cost.estimatedCardinality <= 1_000) {
      const promoted = { ...result, metadata: { ...result.metadata, cache: "preaggregation" as const } };
      this.preaggregations.set(key, promoted);
    }
    return { result, cache: "hit" as const };
  }

  set(key: string, result: AnalyticalQueryResult, estimatedCardinality: number) {
    const count = (this.hitCounts.get(key) ?? 0) + 1;
    this.hitCounts.set(key, count);
    this.entries.set(key, result);
    if (count >= 2 && estimatedCardinality <= 1_000) {
      this.preaggregations.set(key, { ...result, metadata: { ...result.metadata, cache: "preaggregation" } });
    }
  }

  invalidateVersion(datasetVersionId: string) {
    for (const key of [...this.entries.keys(), ...this.preaggregations.keys()]) {
      if (key.startsWith(`${datasetVersionId}:`)) {
        this.entries.delete(key);
        this.preaggregations.delete(key);
        this.hitCounts.delete(key);
      }
    }
  }
}

export class InMemoryAnalyticalArtifactRepository implements AnalyticalArtifactRepository {
  private readonly artifacts = new Map<string, AnalyticalDatasetArtifact>();

  save(artifact: AnalyticalDatasetArtifact) {
    this.artifacts.set(artifact.datasetVersionId, structuredClone(artifact));
  }

  invalidate(datasetVersionId: string, at = new Date().toISOString()) {
    const artifact = this.artifacts.get(datasetVersionId);
    if (artifact) this.artifacts.set(datasetVersionId, { ...artifact, invalidatedAt: at });
  }

  async getArtifact(datasetVersionId: string, context: AnalyticalQueryContext) {
    const artifact = this.artifacts.get(datasetVersionId);
    if (!artifact) throw new Error("No existe el artefacto analitico para esta version.");
    if (artifact.tenantId !== context.tenantId) throw new Error("No autorizado para consultar esta version.");
    if (artifact.invalidatedAt) throw new Error("El artefacto analitico fue invalidado.");
    return structuredClone(artifact);
  }
}

export class GovernedAnalyticalQueryService {
  constructor(
    private readonly repository: AnalyticalArtifactRepository,
    private readonly cache = new AnalyticalQueryCache()
  ) {}

  invalidateVersion(datasetVersionId: string) {
    this.cache.invalidateVersion(datasetVersionId);
  }

  async execute(input: unknown, context: AnalyticalQueryContext): Promise<AnalyticalQueryResult> {
    const started = Date.now();
    const limits = { ...DEFAULT_ANALYTICAL_QUERY_LIMITS, ...context.limits };
    assertNotCancelled(context);
    const pointer = parseDatasetVersionPointer(input);
    const artifact = await this.repository.getArtifact(pointer.datasetVersionId, context);
    const query = parseGovernedAnalyticalQuery(input, artifact.profile);
    const queryHash = await sha256Hex(stableStringify(query));
    const cacheKey = `${query.datasetVersionId}:${queryHash}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return { ...cached.result, metadata: { ...cached.result.metadata, cache: cached.cache, executionMs: Date.now() - started } };

    const cost = estimateQueryCost(query, artifact, limits);
    if (!cost.accepted) throw new Error(`Consulta rechazada por costo: ${cost.reasons.join(", ")}.`);
    if (Date.now() - started > limits.timeoutMs) throw new Error("Consulta excedio el timeout antes de ejecutar.");
    assertNotCancelled(context);

    const rows = rowsFromArtifact(artifact);
    const dashboardQuery = queryToDashboardSpec(query);
    const resultRows = executeDashboardQuery(rows, dashboardQuery, { filters: [] }).slice(query.offset, query.offset + query.limit);
    if (Date.now() - started > limits.timeoutMs) throw new Error("Consulta excedio el timeout.");
    const coverage = mergeCoverage(resultRows);
    const result: AnalyticalQueryResult = {
      rows: resultRows,
      metadata: {
        cache: "miss",
        ...coverage,
        cost,
        lineage: {
          datasetVersionId: query.datasetVersionId,
          sourceArtifactPath: artifact.path,
          sourceFormat: artifact.format,
          queryHash,
          metricFields: query.metrics.map((metric) => metric.field),
          dimensionFields: [...query.dimensions, ...(query.timeDimension ? [query.timeDimension.field] : [])],
          filterFields: query.filters.map((filter) => filter.field),
          generatedAt: nowIso(context)
        },
        executionMs: Date.now() - started,
        rowCount: resultRows.length
      }
    };
    this.cache.set(cacheKey, result, cost.estimatedCardinality);
    return result;
  }

  async executeTable(input: unknown, context: AnalyticalQueryContext): Promise<AnalyticalTableResult> {
    const started = Date.now();
    const pointer = parseDatasetVersionPointer(input);
    const artifact = await this.repository.getArtifact(pointer.datasetVersionId, context);
    const query = parseAnalyticalTableQuery(input, artifact.profile);
    const limits = { ...DEFAULT_ANALYTICAL_QUERY_LIMITS, ...context.limits };
    if (query.limit > limits.maxResultRows) throw new Error(`Consulta rechazada por costo: limit:${query.limit}.`);
    if (artifact.rowCount > limits.maxScanRows) throw new Error(`Consulta rechazada por costo: scan_rows:${artifact.rowCount}.`);
    const fields = new Set([...query.columns, ...query.filters.map((filter) => filter.field), ...(query.columnSearch ? [query.columnSearch.field] : []), ...(query.orderBy ? [query.orderBy.field] : [])]);
    if (artifact.rowCount * Math.max(1, fields.size) > limits.maxEstimatedCells) throw new Error(`Consulta rechazada por costo: estimated_cells:${artifact.rowCount * Math.max(1, fields.size)}.`);
    if (Date.now() - started > limits.timeoutMs) throw new Error("Consulta excedio el timeout antes de ejecutar.");
    assertNotCancelled(context);
    const rows = rowsFromArtifact(artifact);
    const table = queryTableRows(rows, {
      search: query.search,
      columns: query.columns,
      projectColumns: true,
      filters: query.filters,
      sort: query.orderBy ? { field: query.orderBy.field, direction: query.orderBy.direction } : undefined,
      columnSearch: query.columnSearch
    });
    const page = table.rows.slice(query.offset, query.offset + query.limit);
    const queryHash = await sha256Hex(stableStringify(query));
    const warning: QueryWarning = {
      code: "invalid_filter_value",
      message: "Resultado paginado por el servicio analitico; el cliente no recibio el dataset completo.",
      count: table.filteredRows
    };
    return {
      rows: page,
      totalRows: table.totalRows,
      filteredRows: table.filteredRows,
      metadata: {
        cache: "miss",
        coverage: 1,
        totalCount: table.totalRows,
        validCount: table.filteredRows,
        excludedCount: table.totalRows - table.filteredRows,
        warnings: [warning],
        cost: {
          scannedRows: artifact.rowCount,
          projectedColumns: fields.size,
          estimatedCells: artifact.rowCount * Math.max(1, fields.size),
          estimatedCardinality: Math.min(table.filteredRows, query.limit),
          accepted: true,
          reasons: []
        },
        lineage: {
          datasetVersionId: query.datasetVersionId,
          sourceArtifactPath: artifact.path,
          sourceFormat: artifact.format,
          queryHash,
          metricFields: [],
          dimensionFields: query.columns,
          filterFields: query.filters.map((filter) => filter.field),
          generatedAt: nowIso(context)
        },
        executionMs: Date.now() - started,
        rowCount: page.length
      }
    };
  }
}
