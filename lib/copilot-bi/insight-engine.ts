import type { DataRow } from "@/types/dataset";
import { parseLocaleNumber } from "@/lib/data/parse-values";
import type { AnalyticalQueryPlan, ComputedInsight, DatasetFieldCandidate, DatasetIntelligence } from "@/lib/copilot-bi/types";

function datasetVersionId(intelligence: DatasetIntelligence) {
  return intelligence.profile.datasetVersionId ?? intelligence.profile.id;
}

function topContributor(rows: DataRow[], metric: DatasetFieldCandidate, dimension: DatasetFieldCandidate) {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const key = String(row[dimension.field] ?? "Sin dato");
    const value = parseLocaleNumber(row[metric.field]);
    if (value === null) continue;
    totals.set(key, (totals.get(key) ?? 0) + value);
  }
  return [...totals.entries()].sort((left, right) => right[1] - left[1])[0];
}

export function generateComputedInsights(input: {
  rows?: DataRow[];
  intelligence: DatasetIntelligence;
  metric?: DatasetFieldCandidate;
  dimension?: DatasetFieldCandidate;
  queryPlans: AnalyticalQueryPlan[];
}): ComputedInsight[] {
  const { rows = [], intelligence, metric, dimension, queryPlans } = input;
  const primaryQuery = queryPlans[0];
  const insights: ComputedInsight[] = [];
  if (metric && dimension && rows.length) {
    const top = topContributor(rows, metric, dimension);
    if (top) {
      insights.push({
        id: "insight_top_contributor",
        title: `Mayor contribuyente por ${dimension.label}`,
        text: `El dato muestra que ${top[0]} lidera ${metric.label}. No afirmo causalidad; es una concentracion descriptiva del dataset.`,
        evidenceId: primaryQuery?.evidenceId ?? `evidence_${datasetVersionId(intelligence)}_top`,
        queryId: primaryQuery?.id ?? "bi_query_top",
        datasetVersionId: datasetVersionId(intelligence),
        metric: metric.field,
        filters: 0,
        coverage: metric.coverage,
        confidence: Math.min(metric.confidence, dimension.confidence),
        warning: metric.coverage < 0.8 ? "Cobertura baja en la metrica principal." : undefined
      });
    }
  }

  if (!insights.length && metric) {
    insights.push({
      id: "insight_quality_metric",
      title: `Lectura inicial de ${metric.label}`,
      text: `La metrica ${metric.label} esta disponible con ${Math.round(metric.coverage * 100)}% de cobertura. Requiere consulta gobernada para afirmar variaciones o drivers.`,
      evidenceId: primaryQuery?.evidenceId ?? `evidence_${datasetVersionId(intelligence)}_quality`,
      queryId: primaryQuery?.id ?? "bi_query_quality",
      datasetVersionId: datasetVersionId(intelligence),
      metric: metric.field,
      filters: 0,
      coverage: metric.coverage,
      confidence: metric.confidence,
      warning: intelligence.qualityWarnings[0]
    });
  }

  return insights;
}
