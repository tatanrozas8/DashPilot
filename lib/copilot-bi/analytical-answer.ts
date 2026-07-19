import { parseDateValue } from "@/lib/data/parse-values";
import type { AnalyticalQueryResult, GovernedAnalyticalQuery } from "@/types/analytical-query";
import type { DataRow } from "@/types/dataset";
import type { QueryResultRow } from "@/types/dashboard";
import { buildDatasetIntelligence } from "@/lib/copilot-bi/dataset-intelligence";
import { resolveBusinessIntent } from "@/lib/copilot-bi/business-intent";
import { resolveClarification } from "@/lib/copilot-bi/clarification-engine";
import type { ClarificationDecision, DatasetFieldCandidate } from "@/lib/copilot-bi/types";
import type { DatasetProfile } from "@/types/dataset";
import type { SemanticLayer } from "@/lib/semantic-layer";

type AnswerKind = "total" | "top" | "bottom" | "ranking" | "growth";

export interface AnalyticalAnswerPlan {
  handled: true;
  needsClarification: false;
  kind: AnswerKind;
  evidenceId: string;
  metric: DatasetFieldCandidate;
  dimension?: DatasetFieldCandidate;
  query: GovernedAnalyticalQuery;
  previousQuery?: GovernedAnalyticalQuery;
  period: string;
  periodInferred: boolean;
  filters: string[];
}

export type AnalyticalAnswerPlanningResult =
  | AnalyticalAnswerPlan
  | { handled: true; needsClarification: true; clarification: ClarificationDecision }
  | { handled: false; needsClarification: false };

export interface AnalyticalAnswer {
  answer: string;
  valueLabel: string;
  metric: string;
  period: string;
  periodInferred: boolean;
  filters: string[];
  evidenceId: string;
  context: string;
}

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function includesAny(text: string, words: string[]) {
  return words.some((word) => text.includes(word));
}

function stableEvidenceId(datasetVersionId: string, prompt: string) {
  const slug = normalize(prompt).replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 48) || "consulta";
  return `evidence_${datasetVersionId}_qa_${slug}`;
}

function isAnalyticalQuestion(text: string) {
  return text.endsWith("?")
    || includesAny(text, ["cual fue", "cual es", "cuanto", "cuanta", "top ", "ranking", "mayor", "menor", "mas ventas", "menos ventas", "crecieron", "crecimiento", "respecto del periodo anterior"]);
}

function candidateText(candidate: DatasetFieldCandidate) {
  return normalize(`${candidate.field} ${candidate.label} ${candidate.role} ${candidate.column.originalName} ${candidate.column.displayName}`);
}

function metricForRole(metrics: DatasetFieldCandidate[], requestedMetric?: string) {
  if (!requestedMetric) return metrics[0];
  const roleWords: Record<string, string[]> = {
    revenue: ["revenue", "venta", "ventas", "ingreso", "monto", "importe"],
    cost: ["cost", "costo", "costos", "gasto"],
    quantity: ["quantity", "cantidad", "unidades", "volumen"],
    margin: ["margin", "margen", "utilidad", "profit", "rentabilidad"]
  };
  const words = roleWords[requestedMetric] ?? [requestedMetric];
  return metrics.find((metric) => words.some((word) => candidateText(metric).includes(word))) ?? metrics[0];
}

function dimensionForText(dimensions: DatasetFieldCandidate[], text: string, requestedDimensions: string[]) {
  const dimensionHints = [
    { role: "geography", words: ["region", "zona", "pais", "ciudad", "geo"] },
    { role: "channel", words: ["canal", "channel"] },
    { role: "client", words: ["cliente", "clientes", "customer"] },
    { role: "product", words: ["producto", "sku", "product"] },
    { role: "category", words: ["categoria", "segmento", "category"] },
    { role: "seller", words: ["vendedor", "ejecutivo", "representante", "seller"] }
  ];
  const requested = dimensionHints.find((hint) => requestedDimensions.includes(hint.role) || includesAny(text, hint.words));
  if (!requested) return undefined;
  return dimensions.find((dimension) => requested.words.some((word) => candidateText(dimension).includes(word)));
}

function limitFor(text: string) {
  const match = text.match(/\btop\s+(\d+)|\branking\s+(\d+)|\b(\d+)\s+(?:principales|mejores|peores)\b/);
  const value = Number(match?.[1] ?? match?.[2] ?? match?.[3]);
  return Number.isFinite(value) && value > 0 ? Math.min(value, 50) : 1;
}

function inferLatestYear(rows: DataRow[], date: DatasetFieldCandidate) {
  const years = rows
    .map((row) => parseDateValue(row[date.field])?.getUTCFullYear())
    .filter((year): year is number => Number.isFinite(year));
  const latest = years.length ? Math.max(...years) : undefined;
  if (!latest) return undefined;
  return {
    label: String(latest),
    value: [`${latest}-01-01`, `${latest}-12-31`]
  };
}

function formatValue(value: number | null | undefined, metric: DatasetFieldCandidate) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "No disponible";
  const isMoney = metric.column.inferredType === "currency" || ["revenue", "cost", "margin"].includes(metric.role);
  if (isMoney) {
    if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
    if (Math.abs(value) >= 1_000) return `$${Math.round(value / 1_000)}K`;
    return `$${Math.round(value).toLocaleString("en-US")}`;
  }
  if (metric.column.inferredType === "percentage") return `${(value * 100).toFixed(1)}%`;
  return Math.round(value).toLocaleString("en-US");
}

function numericValue(row?: QueryResultRow) {
  return typeof row?.value === "number" && Number.isFinite(row.value) ? row.value : null;
}

export function planAnalyticalAnswer(input: {
  prompt: string;
  datasetProfile: DatasetProfile;
  semanticModel: SemanticLayer;
  rows: DataRow[];
  datasetVersionId: string;
}): AnalyticalAnswerPlanningResult {
  const text = normalize(input.prompt);
  const intent = resolveBusinessIntent(input.prompt);
  const questionLike = isAnalyticalQuestion(text);
  if (intent.intent !== "answer_analytical_question" && !questionLike) return { handled: false, needsClarification: false };
  const effectiveIntent = intent.intent === "ask_clarification" && questionLike
    ? { ...intent, intent: "answer_analytical_question" as const, confidence: Math.max(intent.confidence, 0.78) }
    : intent;

  const intelligence = buildDatasetIntelligence(input.datasetProfile, input.semanticModel);
  const clarification = resolveClarification(effectiveIntent, intelligence);
  if (clarification.needsClarification) return { handled: true, needsClarification: true, clarification };

  const metric = metricForRole(intelligence.metrics, effectiveIntent.requestedMetric);
  if (!metric) {
    return {
      handled: true,
      needsClarification: true,
      clarification: {
        needsClarification: true,
        question: "No encontre una metrica numerica confiable para responder con evidencia. Que metrica uso?",
        options: intelligence.metrics.slice(0, 3).map((item) => item.label),
        reason: "La respuesta analitica directa requiere una metrica real del dataset.",
        confidence: 0.9
      }
    };
  }

  const isGrowth = includesAny(text, ["crecieron", "crecimiento", "variacion", "respecto del periodo anterior"]);
  const isBottom = includesAny(text, ["menor", "menos", "peores"]);
  const isRanking = includesAny(text, ["top ", "ranking", "principales", "mejores", "peores"]);
  const dimension = dimensionForText([...intelligence.geographies, ...intelligence.dimensions], text, effectiveIntent.requestedDimensions);
  const kind: AnswerKind = isGrowth ? "growth" : isRanking ? "ranking" : isBottom ? "bottom" : dimension ? "top" : "total";
  const date = intelligence.primaryDate;
  const explicitLastYear = Boolean(date) && includesAny(text, ["ultimo ano", "ultimo año", "ano pasado", "año pasado", "ultimo periodo"]);
  const latestYear = explicitLastYear && date ? inferLatestYear(input.rows, date) : undefined;
  const filters = latestYear && date ? [{ field: date.field, operator: "between" as const, value: latestYear.value }] : [];
  const previousYear = latestYear && date ? {
    label: String(Number(latestYear.label) - 1),
    value: [`${Number(latestYear.label) - 1}-01-01`, `${Number(latestYear.label) - 1}-12-31`]
  } : undefined;
  const orderBy = dimension || kind === "ranking" ? { field: "value", direction: isBottom ? "asc" as const : "desc" as const } : undefined;
  const query: GovernedAnalyticalQuery = {
    datasetVersionId: input.datasetVersionId,
    metrics: [{ field: metric.field, aggregation: metric.role === "margin" ? "avg" : "sum" }],
    dimensions: dimension ? [dimension.field] : [],
    filters,
    orderBy,
    limit: kind === "ranking" ? limitFor(text) : dimension ? 1 : 1,
    offset: 0
  };

  return {
    handled: true,
    needsClarification: false,
    kind,
    evidenceId: stableEvidenceId(input.datasetVersionId, input.prompt),
    metric,
    dimension,
    query,
    previousQuery: isGrowth && previousYear && date ? { ...query, filters: [{ field: date.field, operator: "between", value: previousYear.value }] } : undefined,
    period: latestYear?.label ?? "Todo el dataset disponible",
    periodInferred: !latestYear,
    filters: filters.map((filter) => `${filter.field} ${filter.operator} ${Array.isArray(filter.value) ? filter.value.join(" a ") : String(filter.value)}`)
  };
}

export function formatAnalyticalAnswer(plan: AnalyticalAnswerPlan, current: AnalyticalQueryResult, previous?: AnalyticalQueryResult): AnalyticalAnswer {
  const rows = current.rows;
  const first = rows[0];
  const metricLabel = plan.metric.label;
  if (plan.kind === "growth") {
    const currentValue = numericValue(first);
    const previousValue = numericValue(previous?.rows[0]);
    const change = currentValue === null || previousValue === null ? null : currentValue - previousValue;
    const changePercent = change === null || previousValue === 0 || previousValue === null ? null : change / previousValue;
    const valueLabel = changePercent === null ? formatValue(change, plan.metric) : `${(changePercent * 100).toFixed(1)}%`;
    return {
      answer: `El crecimiento de ${metricLabel} fue ${valueLabel}.`,
      valueLabel,
      metric: metricLabel,
      period: plan.period,
      periodInferred: plan.periodInferred,
      filters: plan.filters,
      evidenceId: plan.evidenceId,
      context: `Actual: ${formatValue(currentValue, plan.metric)}. Periodo anterior: ${formatValue(previousValue, plan.metric)}. Cobertura: ${Math.round(current.metadata.coverage * 100)}%.`
    };
  }

  if (plan.kind === "ranking") {
    const ranking = rows.map((row, index) => `${index + 1}. ${row.label}: ${formatValue(numericValue(row), plan.metric)}`).join(" | ");
    return {
      answer: `Ranking de ${metricLabel}: ${ranking}.`,
      valueLabel: ranking || "No disponible",
      metric: metricLabel,
      period: plan.period,
      periodInferred: plan.periodInferred,
      filters: plan.filters,
      evidenceId: plan.evidenceId,
      context: `Consulta gobernada con ${rows.length} fila(s) y cobertura ${Math.round(current.metadata.coverage * 100)}%.`
    };
  }

  const value = numericValue(first);
  const valueLabel = formatValue(value, plan.metric);
  const target = plan.dimension && first?.label ? `${first.label}` : metricLabel;
  const direction = plan.kind === "bottom" ? "menor" : plan.kind === "top" ? "mayor" : "total";
  return {
    answer: plan.kind === "total"
      ? `El total de ${metricLabel} es ${valueLabel}.`
      : `El ${direction} ${plan.dimension?.label ?? "segmento"} por ${metricLabel} es ${target} con ${valueLabel}.`,
    valueLabel,
    metric: metricLabel,
    period: plan.period,
    periodInferred: plan.periodInferred,
    filters: plan.filters,
    evidenceId: plan.evidenceId,
    context: `Consulta gobernada por QueryService. Cobertura: ${Math.round(current.metadata.coverage * 100)}%. Filas resultado: ${current.metadata.rowCount}.`
  };
}
