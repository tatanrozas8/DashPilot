import { describe, expect, it } from "vitest";
import { executeDashboardQuery } from "@/lib/query-engine/execute-dashboard-query";
import {
  GovernedAnalyticalQueryService,
  InMemoryAnalyticalArtifactRepository,
  type AnalyticalArtifactRepository
} from "@/lib/query-service/service";
import { parseGovernedAnalyticalQuery } from "@/lib/query-service/schemas";
import { buildDashboardAnalyticalRequests } from "@/lib/query-service/widgets";
import type { DataRow, DatasetColumnProfile, DatasetProfile, InferredColumnType, SemanticColumnType } from "@/types/dataset";
import type { AnalyticalDatasetArtifact, AnalyticalQueryContext } from "@/types/analytical-query";
import type { DashboardWidget } from "@/types/dashboard";

const rows: DataRow[] = [
  { fecha: "2024-01-01", region: "Norte", ventas: 100, producto: "Laptop", cliente: "A" },
  { fecha: "2024-01-15", region: "Norte", ventas: 150, producto: "Monitor", cliente: "B" },
  { fecha: "2024-02-01", region: "Sur", ventas: 200, producto: "Laptop", cliente: "A" },
  { fecha: "2024-02-15", region: "Sur", ventas: 50, producto: "Mouse", cliente: "C" },
  { fecha: "2024-03-01", region: "Centro", ventas: 300, producto: "Laptop", cliente: "D" }
];

function uniqueValues(field: string) {
  return new Set(rows.map((row) => row[field]).filter((value) => value !== null && value !== undefined)).size;
}

function columnProfile(name: string, inferredType: InferredColumnType, semanticType: SemanticColumnType): DatasetColumnProfile {
  return {
    originalName: name,
    normalizedName: name,
    displayName: name,
    inferredType,
    semanticType,
    nullCount: 0,
    nullPercentage: 0,
    uniqueCount: uniqueValues(name),
    sampleValues: rows.map((row) => row[name]).slice(0, 3)
  };
}

function profile(overrides: Partial<DatasetProfile> = {}): DatasetProfile {
  return {
    id: "dataset-1",
    datasetVersionId: "version-1",
    fileName: "ventas.csv",
    rowCount: rows.length,
    columnCount: 5,
    columns: [
      columnProfile("fecha", "date", "time"),
      columnProfile("region", "string", "dimension"),
      columnProfile("ventas", "number", "metric"),
      columnProfile("producto", "string", "dimension"),
      columnProfile("cliente", "string", "identifier")
    ],
    detectedDateColumns: ["fecha"],
    detectedMetricColumns: ["ventas"],
    detectedDimensionColumns: ["region", "producto", "cliente"],
    detectedGeoColumns: [],
    qualityWarnings: [],
    qualityScore: 1,
    createdAt: "2026-07-16T00:00:00.000Z",
    ...overrides
  };
}

function columnsFromRows(dataRows: DataRow[], fields: string[]) {
  return fields.map((name) => ({
    name,
    values: dataRows.map((row) => row[name] ?? null)
  }));
}

function artifact(overrides: Partial<AnalyticalDatasetArtifact> = {}): AnalyticalDatasetArtifact {
  return {
    datasetVersionId: "version-1",
    tenantId: "tenant-1",
    profile: profile(),
    format: "parquet",
    path: "object://datasets/tenant-1/version-1/part-000.parquet",
    columns: columnsFromRows(rows, ["fecha", "region", "ventas", "producto", "cliente"]),
    rowCount: rows.length,
    columnCount: 5,
    ...overrides
  };
}

function serviceWith(analyticalArtifact: AnalyticalDatasetArtifact = artifact()) {
  const repository = new InMemoryAnalyticalArtifactRepository();
  repository.save(analyticalArtifact);
  return new GovernedAnalyticalQueryService(repository);
}

const context: AnalyticalQueryContext = {
  tenantId: "tenant-1",
  userId: "user-1",
  now: new Date("2026-07-16T12:00:00.000Z")
};

describe("governed analytical query service", () => {
  it("matches the existing in-memory engine for small fixture aggregates", async () => {
    const service = serviceWith();
    const query = {
      datasetVersionId: "version-1",
      metrics: [{ field: "ventas", aggregation: "sum" }],
      dimensions: ["region"],
      filters: [],
      orderBy: { field: "value", direction: "desc" },
      limit: 10,
      offset: 0
    };

    const result = await service.execute(query, context);
    const reference = executeDashboardQuery(rows, {
      metric: { field: "ventas", aggregation: "sum" },
      groupBy: ["region"],
      orderBy: { field: "value", direction: "desc" },
      limit: 10
    });

    expect(result.rows).toEqual(reference);
    expect(result.metadata.cache).toBe("miss");
    expect(result.metadata.lineage.sourceFormat).toBe("parquet");
  });

  it("applies combined dimension, text and time filters through the governed contract", async () => {
    const service = serviceWith();
    const result = await service.execute({
      datasetVersionId: "version-1",
      metrics: [{ field: "ventas", aggregation: "sum" }],
      dimensions: ["region"],
      filters: [
        { field: "region", operator: "in", value: ["Norte", "Sur"] },
        { field: "producto", operator: "contains", value: "Laptop" },
        { field: "fecha", operator: "between", value: ["2024-01-01", "2024-02-28"] }
      ],
      orderBy: { field: "label", direction: "asc" },
      limit: 10,
      offset: 0
    }, context);

    expect(result.rows).toEqual([
      expect.objectContaining({ label: "Norte", value: 100 }),
      expect.objectContaining({ label: "Sur", value: 200 })
    ]);
    expect(result.metadata.lineage.filterFields).toEqual(["region", "producto", "fecha"]);
  });

  it("aggregates by real time granularity", async () => {
    const service = serviceWith();
    const result = await service.execute({
      datasetVersionId: "version-1",
      metrics: [{ field: "ventas", aggregation: "sum" }],
      dimensions: [],
      timeDimension: { field: "fecha", granularity: "month" },
      filters: [],
      orderBy: { field: "label", direction: "asc" },
      limit: 10,
      offset: 0
    }, context);

    expect(result.rows.map((row) => [row.label, row.value])).toEqual([
      ["ene 24", 250],
      ["feb 24", 250],
      ["mar 24", 300]
    ]);
  });

  it("rejects explosive high-cardinality queries before execution", async () => {
    const highCardinalityProfile = profile({
      columns: profile().columns.map((column) => column.normalizedName === "cliente" ? { ...column, uniqueCount: 100_000 } : column)
    });
    const service = serviceWith(artifact({ profile: highCardinalityProfile }));

    await expect(service.execute({
      datasetVersionId: "version-1",
      metrics: [{ field: "ventas", aggregation: "sum" }],
      dimensions: ["cliente"],
      filters: [],
      limit: 10,
      offset: 0
    }, context)).rejects.toThrow("estimated_cardinality");
  });

  it("enforces cancellation and timeout boundaries", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(serviceWith().execute({
      datasetVersionId: "version-1",
      metrics: [{ field: "ventas", aggregation: "sum" }],
      dimensions: [],
      filters: [],
      limit: 10,
      offset: 0
    }, { ...context, signal: controller.signal })).rejects.toThrow("cancelada");

    const slowRepository: AnalyticalArtifactRepository = {
      async getArtifact() {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return artifact();
      }
    };

    await expect(new GovernedAnalyticalQueryService(slowRepository).execute({
      datasetVersionId: "version-1",
      metrics: [{ field: "ventas", aggregation: "sum" }],
      dimensions: [],
      filters: [],
      limit: 10,
      offset: 0
    }, { ...context, limits: { timeoutMs: 1 } })).rejects.toThrow("timeout");
  });

  it("caches identical queries by dataset version and stable query hash, then promotes recurring widgets", async () => {
    const service = serviceWith();
    const query = {
      datasetVersionId: "version-1",
      metrics: [{ field: "ventas", aggregation: "sum" }],
      dimensions: ["region"],
      filters: [],
      limit: 10,
      offset: 0
    };

    const first = await service.execute(query, context);
    const second = await service.execute(query, context);
    const third = await service.execute(query, context);
    service.invalidateVersion("version-1");
    const afterInvalidation = await service.execute(query, context);

    expect(first.metadata.cache).toBe("miss");
    expect(second.metadata.cache).toBe("hit");
    expect(third.metadata.cache).toBe("preaggregation");
    expect(afterInvalidation.metadata.cache).toBe("miss");
    expect(first.metadata.lineage.queryHash).toBe(second.metadata.lineage.queryHash);
  });

  it("rejects unauthorized dataset versions", async () => {
    await expect(serviceWith().execute({
      datasetVersionId: "version-1",
      metrics: [{ field: "ventas", aggregation: "sum" }],
      dimensions: [],
      filters: [],
      limit: 10,
      offset: 0
    }, { ...context, tenantId: "tenant-2" })).rejects.toThrow("No autorizado");
  });

  it("keeps table exploration paginated and projected server-side", async () => {
    const result = await serviceWith().executeTable({
      datasetVersionId: "version-1",
      columns: ["region", "ventas"],
      filters: [{ field: "region", operator: "eq", value: "Norte" }],
      orderBy: { field: "ventas", direction: "desc" },
      limit: 1,
      offset: 0
    }, context);

    expect(result.rows).toEqual([{ region: "Norte", ventas: 150 }]);
    expect(result.totalRows).toBe(rows.length);
    expect(result.filteredRows).toBe(2);
    expect(result.metadata.rowCount).toBe(1);
  });

  it("maps existing widgets to governed aggregate and table contracts", async () => {
    const widgets: DashboardWidget[] = [
      {
        id: "kpi-ventas",
        type: "kpi_card",
        title: "Ventas",
        query: {
          metric: { field: "ventas", aggregation: "sum" },
          filters: [{ field: "region", operator: "eq", value: "Norte" }]
        },
        config: {},
        position: { x: 0, y: 0, w: 3, h: 2 }
      },
      {
        id: "tabla",
        type: "table",
        title: "Detalle",
        config: { columns: ["region", "ventas"] },
        position: { x: 0, y: 2, w: 6, h: 4 }
      }
    ];

    const requests = buildDashboardAnalyticalRequests({
      datasetVersionId: "version-1",
      widgets,
      profile: profile(),
      viewState: { filters: [{ field: "producto", operator: "contains", value: "Laptop" }], dataExplorer: { pageSize: 1 } }
    });

    expect(requests).toHaveLength(2);
    expect(requests[0]).toEqual(expect.objectContaining({ widgetId: "kpi-ventas", kind: "aggregate" }));
    expect(requests[1]).toEqual(expect.objectContaining({ widgetId: "tabla", kind: "table" }));
    expect(requests[0]?.query.filters.map((filter) => filter.field)).toEqual(["region", "producto"]);
    expect(requests[1]?.query.limit).toBe(1);
  });

  it("rejects non-allowlisted fields and SQL-like identifiers", () => {
    expect(() => parseGovernedAnalyticalQuery({
      datasetVersionId: "version-1",
      metrics: [{ field: "ventas;drop_table", aggregation: "sum" }],
      dimensions: [],
      filters: [],
      limit: 10,
      offset: 0
    }, profile())).toThrow();

    expect(() => parseGovernedAnalyticalQuery({
      datasetVersionId: "version-1",
      metrics: [{ field: "margen", aggregation: "sum" }],
      dimensions: [],
      filters: [],
      limit: 10,
      offset: 0
    }, profile())).toThrow("no permitida");
  });
});
