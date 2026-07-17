import { describe, expect, it } from "vitest";
import {
  approveSemanticDefinition,
  buildSemanticModel,
  createCalculatedMetric,
  explainWidgetLineage,
  migrateDashboardSpecToSemanticModel,
  resolveSemanticReference,
  validateSemanticModel
} from "@/lib/semantic-model";
import type { DashboardSpec } from "@/types/dashboard";
import type { DatasetColumnProfile, DatasetProfile, GeoRole, InferredColumnType, SemanticColumnType } from "@/types/dataset";
import type { MetricDefinition, Relationship, SemanticModel } from "@/types/semantic-model";

function column(input: {
  name: string;
  type: InferredColumnType;
  semanticType: SemanticColumnType;
  uniqueCount?: number;
  geoRole?: GeoRole;
  synonyms?: string[];
}): DatasetColumnProfile {
  return {
    originalName: input.name,
    normalizedName: input.name,
    displayName: input.name,
    inferredType: input.type,
    semanticType: input.semanticType,
    geoRole: input.geoRole,
    nullCount: 0,
    nullPercentage: 0,
    uniqueCount: input.uniqueCount ?? 3,
    sampleValues: [],
    synonyms: input.synonyms
  };
}

function profile(columns: DatasetColumnProfile[], overrides: Partial<DatasetProfile> = {}): DatasetProfile {
  return {
    id: "dataset-1",
    datasetVersionId: "version-1",
    fileName: "ventas.csv",
    rowCount: 100,
    columnCount: columns.length,
    columns,
    detectedDateColumns: columns.filter((item) => item.semanticType === "time").map((item) => item.normalizedName),
    detectedMetricColumns: columns.filter((item) => item.semanticType === "metric").map((item) => item.normalizedName),
    detectedDimensionColumns: columns.filter((item) => ["dimension", "geo", "identifier", "category"].includes(item.semanticType)).map((item) => item.normalizedName),
    detectedGeoColumns: columns.filter((item) => item.semanticType === "geo").map((item) => item.normalizedName),
    qualityWarnings: [],
    qualityScore: 1,
    createdAt: "2026-07-17T00:00:00.000Z",
    ...overrides
  };
}

function salesProfile(metricName = "sales_amount") {
  return profile([
    column({ name: "fecha", type: "date", semanticType: "time" }),
    column({ name: metricName, type: "currency", semanticType: "metric", synonyms: ["ventas", "revenue"] }),
    column({ name: "cost", type: "currency", semanticType: "metric", synonyms: ["costo"] }),
    column({ name: "region", type: "geography", semanticType: "geo", geoRole: "region" }),
    column({ name: "pais", type: "geography", semanticType: "geo", geoRole: "country" }),
    column({ name: "cliente", type: "string", semanticType: "dimension" })
  ]);
}

function baseDashboard(): DashboardSpec {
  return {
    id: "dashboard-1",
    title: "Ventas",
    datasetId: "dataset-1",
    datasetVersionId: "version-1",
    globalFilters: [],
    widgets: [
      {
        id: "kpi_sales",
        type: "kpi_card",
        title: "Ventas",
        query: { metric: { field: "sales_amount", aggregation: "sum" } },
        config: {},
        position: { x: 0, y: 0, w: 3, h: 1 }
      },
      {
        id: "sales_by_region",
        type: "bar_chart",
        title: "Ventas por region",
        query: { metric: { field: "sales_amount", aggregation: "sum" }, groupBy: ["region"], filters: [{ field: "pais", operator: "eq", value: "CL" }] },
        config: {},
        position: { x: 0, y: 1, w: 6, h: 3 }
      }
    ],
    createdAt: "2026-07-17T00:00:00.000Z",
    updatedAt: "2026-07-17T00:00:00.000Z"
  };
}

function withDuplicateAlias(model: SemanticModel): SemanticModel {
  const first = model.metrics[0]!;
  const duplicate: MetricDefinition = {
    ...first,
    id: `${first.id}:duplicate`,
    name: "Ventas alternativas",
    sourceColumnId: "cost",
    sourceColumnDisplayName: "cost",
    aliases: [...first.aliases, "ventas"]
  };
  return { ...model, metrics: [first, duplicate, ...model.metrics.slice(1)] };
}

describe("governed semantic model", () => {
  it("resolves aliases to canonical metric IDs with candidates, scores and reasons", () => {
    const model = buildSemanticModel(salesProfile(), { status: "draft", now: new Date("2026-07-17T00:00:00.000Z") });
    const resolved = resolveSemanticReference({ model, requestedText: "ventas", entityType: "metric" });

    expect(resolved.needsClarification).toBe(false);
    expect(resolved.selected?.id).toBe("metric.revenue");
    expect(resolved.candidates[0]?.score).toBeGreaterThanOrEqual(0.72);
    expect(resolved.candidates[0]?.reasons.length).toBeGreaterThan(0);
  });

  it("asks for clarification on alias collisions instead of executing", () => {
    const model = withDuplicateAlias(buildSemanticModel(salesProfile(), { status: "approved" }));
    const resolved = resolveSemanticReference({ model, requestedText: "ventas", entityType: "metric" });

    expect(resolved.needsClarification).toBe(true);
    expect(resolved.selected).toBeUndefined();
    expect(resolved.candidates.map((candidate) => candidate.id)).toContain("metric.revenue:duplicate");
  });

  it("migrates existing widgets to canonical IDs and survives a source column rename", () => {
    const oldModel = buildSemanticModel(salesProfile(), { status: "approved", now: new Date("2026-07-17T00:00:00.000Z") });
    const migrated = migrateDashboardSpecToSemanticModel({ dashboardSpec: baseDashboard(), semanticModel: oldModel, now: new Date("2026-07-17T00:00:00.000Z") }).dashboardSpec;
    const renamedProfile = salesProfile("ingresos");
    const nextModel = buildSemanticModel(renamedProfile, { status: "approved", now: new Date("2026-07-17T00:00:01.000Z") });
    const remigrated = migrateDashboardSpecToSemanticModel({ dashboardSpec: migrated, semanticModel: nextModel, now: new Date("2026-07-17T00:00:02.000Z") }).dashboardSpec;

    expect(migrated.widgets[0]?.query?.metricId).toBe("metric.revenue");
    expect(remigrated.widgets[0]?.query?.metric?.field).toBe("ingresos");
    expect(remigrated.widgets[0]?.lineage?.metricIds).toEqual(["metric.revenue"]);
  });

  it("explains KPI origin, formula, filters and dataset version", () => {
    const model = buildSemanticModel(salesProfile(), { status: "approved" });
    const dashboard = migrateDashboardSpecToSemanticModel({ dashboardSpec: baseDashboard(), semanticModel: model }).dashboardSpec;
    const explanation = explainWidgetLineage(dashboard.widgets[1]!, model);

    expect(explanation.datasetVersionId).toBe("version-1");
    expect(explanation.formulas[0]).toMatchObject({ id: "metric.revenue", formula: "sales_amount", aggregation: "sum" });
    expect(explanation.filters).toEqual([{ field: "pais", operator: "eq", value: "CL" }]);
    expect(explanation.sourceColumnIds).toEqual(["sales_amount", "region"]);
  });

  it("keeps inferred definitions draft until approval", () => {
    const model = buildSemanticModel(salesProfile());
    const approved = approveSemanticDefinition(model.metrics[0]!, "2026-07-17T00:00:00.000Z");

    expect(model.metrics[0]?.status).toBe("draft");
    expect(approved.status).toBe("approved");
    expect(approved.approvedAt).toBe("2026-07-17T00:00:00.000Z");
  });

  it("validates calculated metrics and rejects dependency cycles", () => {
    const model = buildSemanticModel(salesProfile(), { status: "approved" });
    const margin = createCalculatedMetric({
      id: "margin_rate",
      name: "Margen %",
      description: "Margen sobre ventas",
      formula: "(metric.revenue - metric.cost) / metric.revenue",
      operandMetricIds: ["metric.revenue", "metric.cost"],
      unit: "percentage",
      format: "percentage"
    });
    const healthy = { ...model, calculatedMetrics: [margin] };
    const cyclic = {
      ...model,
      calculatedMetrics: [
        { ...margin, id: "metric.margin_a", operandMetricIds: ["metric.margin_b"] },
        { ...margin, id: "metric.margin_b", operandMetricIds: ["metric.margin_a"] }
      ]
    };

    expect(validateSemanticModel(healthy, salesProfile()).valid).toBe(true);
    expect(validateSemanticModel(cyclic, salesProfile()).issues.map((issue) => issue.code)).toContain("cycle");
  });

  it("rejects invalid or unvalidated relationships", () => {
    const model = buildSemanticModel(salesProfile(), { status: "approved" });
    const invalidRelationship: Relationship = {
      id: "relationship.region_to_missing",
      entityType: "relationship",
      name: "Region a missing",
      description: "Relacion no validada",
      leftDimensionId: "dimension.geo.region",
      rightDimensionId: "dimension.missing",
      cardinality: "many_to_many",
      status: "draft",
      owner: { type: "system", id: "test" }
    };
    const validation = validateSemanticModel({ ...model, relationships: [invalidRelationship] }, salesProfile());

    expect(validation.valid).toBe(false);
    expect(validation.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining(["invalid_relationship", "unapproved_relationship"]));
  });

  it("does not collapse ambiguous geography requests between region and country", () => {
    const model = buildSemanticModel(salesProfile(), { status: "approved" });
    const region = resolveSemanticReference({ model, requestedText: "region", entityType: "dimension" });
    const geography = resolveSemanticReference({ model, requestedText: "geografia", entityType: "dimension", threshold: 0.55 });

    expect(region.needsClarification).toBe(false);
    expect(region.selected?.id).toBe("dimension.geo.region");
    expect(geography.needsClarification).toBe(true);
    expect(geography.candidates.map((candidate) => candidate.id)).toEqual(expect.arrayContaining(["dimension.geo.region", "dimension.geo.country"]));
  });

  it("marks schema changes unsafe when canonical definitions cannot be mapped", () => {
    const model = buildSemanticModel(salesProfile(), { status: "approved" });
    const changedProfile = profile([
      column({ name: "fecha", type: "date", semanticType: "time" }),
      column({ name: "pais", type: "geography", semanticType: "geo", geoRole: "country" })
    ]);
    const validation = validateSemanticModel(model, changedProfile);
    const invented = resolveSemanticReference({ model, requestedText: "forecast_ventas", entityType: "metric" });

    expect(validation.valid).toBe(false);
    expect(validation.issues.map((issue) => issue.code)).toContain("unknown_column");
    expect(invented.needsClarification).toBe(true);
    expect(invented.selected).toBeUndefined();
  });
});
