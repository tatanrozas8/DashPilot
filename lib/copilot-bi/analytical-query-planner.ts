import type { AnalyticalQueryPlan, DatasetFieldCandidate, DatasetIntelligence, VisualizationRecommendation } from "@/lib/copilot-bi/types";

function datasetVersionId(intelligence: DatasetIntelligence) {
  return intelligence.profile.datasetVersionId ?? intelligence.profile.id;
}

function queryId(prefix: string, index: number) {
  return `${prefix}_${index + 1}`;
}

export function planAnalyticalQueries(intelligence: DatasetIntelligence, recommendations: VisualizationRecommendation[]): AnalyticalQueryPlan[] {
  return recommendations
    .filter((recommendation) => recommendation.query?.metric)
    .map((recommendation, index) => {
      const metric = recommendation.query!.metric!;
      const dimensions = recommendation.query!.groupBy ?? [];
      const timeDimension = recommendation.query!.x ? { field: recommendation.query!.x.field, granularity: recommendation.query!.x.granularity ?? "month" as const } : undefined;
      return {
        id: queryId("bi_query", index),
        purpose: recommendation.title,
        evidenceId: `evidence_${datasetVersionId(intelligence)}_${index + 1}`,
        summary: `${metric.aggregation}(${metric.field})${dimensions.length ? ` por ${dimensions.join(", ")}` : ""}${timeDimension ? ` por ${timeDimension.granularity}` : ""}`,
        query: {
          datasetVersionId: datasetVersionId(intelligence),
          metrics: [{ field: metric.field, aggregation: metric.aggregation }],
          dimensions,
          timeDimension,
          filters: recommendation.query!.filters ?? [],
          orderBy: recommendation.query!.orderBy,
          limit: recommendation.query!.limit ?? 100,
          offset: 0
        }
      };
    });
}

export function tableQueryPlan(intelligence: DatasetIntelligence, metric?: DatasetFieldCandidate, dimension?: DatasetFieldCandidate, limit = 10): AnalyticalQueryPlan | undefined {
  if (!metric || !dimension) return undefined;
  return {
    id: "bi_query_table_1",
    purpose: `Tabla top ${limit} de ${dimension.label}`,
    evidenceId: `evidence_${datasetVersionId(intelligence)}_table_top`,
    summary: `Top ${limit} ${dimension.field} por ${metric.field}`,
    query: {
      datasetVersionId: datasetVersionId(intelligence),
      metrics: [{ field: metric.field, aggregation: metric.role === "margin" ? "avg" : "sum" }],
      dimensions: [dimension.field],
      filters: [],
      orderBy: { field: "value", direction: "desc" },
      limit,
      offset: 0
    }
  };
}
