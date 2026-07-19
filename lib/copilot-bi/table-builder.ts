import type { DashboardWidget } from "@/types/dashboard";
import type { DatasetFieldCandidate, DatasetIntelligence } from "@/lib/copilot-bi/types";
import { visualFormat } from "@/lib/copilot-bi/visualization-recommender";

export function buildSummaryTableWidget(input: {
  id: string;
  intelligence: DatasetIntelligence;
  metric?: DatasetFieldCandidate;
  dimension?: DatasetFieldCandidate;
  limit?: number;
  position: DashboardWidget["position"];
}): DashboardWidget | undefined {
  const { metric, dimension } = input;
  if (!metric || !dimension) return undefined;
  return {
    id: input.id,
    type: "table",
    title: `Top ${input.limit ?? 10} ${dimension.label} por ${metric.label}`,
    description: "Tabla resumen ordenada de mayor a menor con columnas reales.",
    query: {
      metric: { field: metric.field, aggregation: metric.role === "margin" ? "avg" : "sum" },
      groupBy: [dimension.field],
      orderBy: { field: "value", direction: "desc" },
      limit: input.limit ?? 10
    },
    config: {
      columns: [dimension.field, metric.field],
      format: visualFormat(metric),
      generatedBy: "copilot-bi"
    },
    position: input.position
  };
}
