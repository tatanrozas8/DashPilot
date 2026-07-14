import { slugify } from "@/lib/utils";

export type TimeIntent = "day" | "week" | "month" | "quarter" | "year";
export type ChartIntent = "breakdown_by_dimension" | "time_series" | "time_series_by_dimension" | "comparison" | "unknown";

export interface AnalyticalIntent {
  metricIntent: string | null;
  dimensionIntent: string | null;
  timeIntent: TimeIntent | null;
  chartIntent: ChartIntent;
  filterIntent: string | null;
  comparisonIntent: string | null;
  sortIntent: "asc" | "desc" | null;
  limitIntent: number | null;
}

function normalizedPrompt(prompt: string) {
  return slugify(prompt).replace(/_/g, " ");
}

function containsAny(text: string, words: string[]) {
  return words.some((word) => text.includes(word));
}

function metricIntent(text: string) {
  if (containsAny(text, ["margen", "utilidad", "profit", "ganancia"])) return "margen";
  if (containsAny(text, ["ventas", "venta", "revenue", "ingresos", "ingreso", "facturacion", "monto"])) return "ventas";
  if (containsAny(text, ["cantidad", "unidades", "volumen"])) return "cantidad";
  if (containsAny(text, ["tickets", "pedidos", "ordenes"])) return "tickets";
  return null;
}

function dimensionIntent(text: string) {
  const dimensions = [
    "region",
    "pais",
    "zona",
    "ciudad",
    "comuna",
    "canal",
    "vendedor",
    "cliente",
    "producto",
    "sku",
    "categoria",
    "segmento"
  ];
  const explicit = text.match(/\bpor\s+([a-z0-9]+)(?:\s+por\s+(?:dia|semana|mes|trimestre|ano|year|month|quarter)|\s+a\s+traves|\s+en\s+el\s+tiempo|$)/);
  const candidate = explicit?.[1];
  if (candidate && dimensions.includes(candidate)) return candidate;
  return dimensions.find((dimension) => text.includes(dimension)) ?? null;
}

function timeIntent(text: string): TimeIntent | null {
  if (containsAny(text, ["trimestre", "trimestral", "quarter", "qoq"])) return "quarter";
  if (containsAny(text, ["ano", "anos", "anual", "year", "yoy", "ano a ano"])) return "year";
  if (containsAny(text, ["mes", "mensual", "month"])) return "month";
  if (containsAny(text, ["semana", "semanal", "week"])) return "week";
  if (containsAny(text, ["dia", "diario", "day"])) return "day";
  if (containsAny(text, ["a traves del tiempo", "a traves de tiempo", "en el tiempo", "historico", "historia", "evolucion", "tendencia"])) return "month";
  return null;
}

function chartIntent(text: string, metric: string | null, dimension: string | null, time: TimeIntent | null): ChartIntent {
  const lineRequested = containsAny(text, ["linea", "lineas", "tendencia", "evolucion"]);
  const comparisonRequested = containsAny(text, ["comparar", "comparacion", "versus", "vs", "ano a ano", "yoy"]);
  if (comparisonRequested && dimension && (time || text.includes("ano"))) return "time_series_by_dimension";
  if ((time || lineRequested) && metric && dimension) return "time_series_by_dimension";
  if (time && metric) return "time_series";
  if (metric && dimension) return "breakdown_by_dimension";
  if (comparisonRequested) return "comparison";
  return "unknown";
}

function comparisonIntent(text: string) {
  if (containsAny(text, ["ano a ano", "yoy", "anual"])) return "year_over_year";
  if (containsAny(text, ["mes a mes", "mom", "mensual"])) return "month_over_month";
  if (containsAny(text, ["comparar", "comparacion", "versus", "vs"])) return "comparison";
  return null;
}

function filterIntent(text: string) {
  const match = text.match(/\b(?:filtra|filtro|solo|para)\s+(.+)$/);
  return match?.[1]?.trim() || null;
}

function sortIntent(text: string): "asc" | "desc" | null {
  if (containsAny(text, ["mayor", "mejor", "top", "descendente"])) return "desc";
  if (containsAny(text, ["menor", "peor", "ascendente"])) return "asc";
  return null;
}

function limitIntent(text: string) {
  const match = text.match(/\btop\s+(\d{1,2})\b/) ?? text.match(/\b(\d{1,2})\s+(?:principales|mayores|mejores)\b/);
  return match ? Number(match[1]) : null;
}

export function parseAnalyticalIntent(prompt: string): AnalyticalIntent {
  const text = normalizedPrompt(prompt);
  const metric = metricIntent(text);
  const dimension = dimensionIntent(text);
  const time = timeIntent(text) ?? (containsAny(text, ["linea", "lineas"]) && metric && dimension ? "month" : null);
  return {
    metricIntent: metric,
    dimensionIntent: dimension,
    timeIntent: time,
    chartIntent: chartIntent(text, metric, dimension, time),
    filterIntent: filterIntent(text),
    comparisonIntent: comparisonIntent(text),
    sortIntent: sortIntent(text),
    limitIntent: limitIntent(text)
  };
}
