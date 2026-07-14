import type { DatasetColumnProfile, DatasetProfile, GeoRole } from "@/types/dataset";
import type { SemanticLayer } from "@/lib/semantic-layer/infer-semantic-layer";
import { slugify } from "@/lib/utils";

export type ColumnIntent =
  | "geography"
  | "seller"
  | "client"
  | "product"
  | "category"
  | "revenue"
  | "margin"
  | "date"
  | "metric"
  | "dimension";

export interface ColumnResolverContext {
  datasetProfile: DatasetProfile;
  semanticModel?: SemanticLayer;
}

export interface ColumnMatch {
  column: DatasetColumnProfile;
  confidence: number;
  reason: string;
  matchType?: ColumnMatchType;
}

export type ColumnMatchType = "exact" | "contains" | "semantic" | "fallback" | "not_found";
export type RequestedColumnConcept = ColumnIntent | "region" | "country" | "city" | "zone" | "commune" | "territory" | string;

export interface ColumnResolveResult {
  intent: ColumnIntent;
  requestedConcept: RequestedColumnConcept;
  matchedColumn?: DatasetColumnProfile;
  originalName?: string;
  normalizedName?: string;
  matchType: ColumnMatchType;
  confidence: number;
  reason: string;
  alternatives: ColumnMatch[];
  uniqueCount?: number;
  sampleValues?: unknown[];
}

const hints: Record<ColumnIntent, string[]> = {
  geography: ["region", "regiones", "zona", "pais", "país", "comuna", "ciudad", "territorio", "provincia", "country", "city"],
  seller: ["vendedor", "vendedores", "ejecutivo", "asesor", "comercial", "salesperson", "seller", "representante", "agent"],
  client: ["cliente", "clientes", "customer", "cuenta", "empresa", "account", "client"],
  product: ["producto", "productos", "sku", "item", "articulo", "artículo", "servicio", "product"],
  category: ["categoria", "categoría", "categorias", "categorías", "familia", "linea", "línea", "segmento", "category"],
  revenue: ["ventas", "venta", "revenue", "ingresos", "ingreso", "monto", "total", "importe", "facturacion", "facturación"],
  margin: ["margen", "utilidad", "profit", "ganancia", "margen_bruto", "margin"],
  date: ["fecha", "periodo", "período", "mes", "año", "ano", "trimestre", "quarter", "date", "period"],
  metric: ["metrica", "métrica", "kpi", "indicador", "valor", "cantidad", "promedio", "suma"],
  dimension: ["dimension", "dimensión", "segmento", "grupo", "agrupa", "por"]
};

function normalize(value: string) {
  return slugify(value);
}

function columnText(column: DatasetColumnProfile) {
  return normalize(`${column.originalName} ${column.normalizedName} ${column.displayName}`);
}

function normalizedHints(intent: ColumnIntent) {
  return hints[intent].map(normalize);
}

function containsAny(text: string, words: string[]) {
  return words.some((word) => text.includes(word));
}

function hasToken(text: string, token: string) {
  return text.split("_").includes(token);
}

function geoConcept(prompt: string): RequestedColumnConcept {
  const text = normalize(prompt);
  if (hasToken(text, "region") || text.includes("regiones")) return "region";
  if (hasToken(text, "zona") || text.includes("territorio")) return "zone";
  if (hasToken(text, "ciudad")) return "city";
  if (hasToken(text, "comuna")) return "commune";
  if (hasToken(text, "pais") || hasToken(text, "country")) return "country";
  return "geography";
}

function geoPriorityForConcept(concept: RequestedColumnConcept, role?: GeoRole) {
  if (concept === "region") {
    if (role === "region") return 100;
    if (role === "zone" || role === "territory") return 76;
    if (role === "city" || role === "commune") return 58;
    if (role === "country") return 52;
    return 10;
  }
  if (concept === "country") {
    if (role === "country") return 100;
    if (role === "region") return 48;
    if (role === "zone" || role === "territory") return 40;
    if (role === "city" || role === "commune") return 30;
    return 10;
  }
  if (concept === "zone" || concept === "territory") {
    if (role === "zone" || role === "territory") return 100;
    if (role === "region") return 82;
    if (role === "city" || role === "commune") return 52;
    if (role === "country") return 34;
    return 10;
  }
  if (concept === "city" || concept === "commune") {
    if (role === concept) return 100;
    if (role === "city" || role === "commune") return 90;
    if (role === "region" || role === "zone" || role === "territory") return 56;
    if (role === "country") return 30;
    return 10;
  }
  if (role === "region") return 100;
  if (role === "zone" || role === "territory") return 88;
  if (role === "city" || role === "commune") return 76;
  if (role === "country") return 64;
  if (role === "unknown") return 22;
  return 0;
}

function geoMatchType(concept: RequestedColumnConcept, column: DatasetColumnProfile): ColumnMatchType {
  const normalizedName = normalize(column.normalizedName);
  if ((concept === "region" && normalizedName === "region") || (concept === "country" && ["pais", "country"].includes(normalizedName)) || normalizedName === concept) return "exact";
  if (normalizedName.includes(String(concept))) return "contains";
  if (geoPriorityForConcept(concept, column.geoRole) >= 90) return "semantic";
  return "fallback";
}

function geographyMatches(prompt: string, context: ColumnResolverContext): ColumnMatch[] {
  const concept = geoConcept(prompt);
  const promptText = normalize(prompt);
  return context.datasetProfile.columns
    .map((column) => {
      const normalizedName = normalize(column.normalizedName);
      const displayText = columnText(column);
      const exactName =
        (concept === "region" && normalizedName === "region") ||
        (concept === "country" && ["pais", "country"].includes(normalizedName)) ||
        normalizedName === concept;
      const containsConcept = normalizedName.includes(String(concept)) || displayText.includes(String(concept));
      const directName = promptText.includes(normalize(column.originalName)) || promptText.includes(normalize(column.displayName)) || promptText.includes(normalize(column.normalizedName));
      const rolePriority = geoPriorityForConcept(concept, column.geoRole);
      const typeBonus = column.semanticType === "geo" || column.inferredType === "geography" ? 12 : 0;
      const nameBonus = exactName ? 22 : containsConcept ? 16 : directName ? 10 : 0;
      const rawScore = rolePriority + typeBonus + nameBonus;
      const confidence = Math.min(0.99, Number((rawScore / 132).toFixed(2)));
      const matchType = geoMatchType(concept, column);
      return {
        column,
        confidence,
        matchType,
        reason:
          matchType === "exact"
            ? `Coincide exactamente con "${column.displayName}".`
            : matchType === "contains"
              ? `El nombre de "${column.displayName}" contiene ${concept}.`
              : matchType === "semantic"
                ? `Coincide por rol geografico ${column.geoRole}.`
                : `Fallback geografico para ${concept}; no se encontro una columna mas especifica.`
      };
    })
    .filter((match) => match.confidence >= 0.2)
    .sort((left, right) => right.confidence - left.confidence || geoPriorityForConcept(concept, right.column.geoRole) - geoPriorityForConcept(concept, left.column.geoRole));
}

function semanticFields(context: ColumnResolverContext, intent: ColumnIntent) {
  const model = context.semanticModel;
  if (!model) return [];
  if (intent === "geography") return model.geographies;
  if (intent === "seller") return model.sellers;
  if (intent === "client") return model.clients;
  if (intent === "product") return model.products;
  if (intent === "category") return model.categories;
  if (intent === "revenue") return model.revenueMetrics;
  if (intent === "margin") return model.marginMetrics;
  if (intent === "date") return model.dates;
  if (intent === "metric") return model.metrics;
  return model.dimensions;
}

function profileFallbackFields(context: ColumnResolverContext, intent: ColumnIntent) {
  if (intent === "geography") return context.datasetProfile.detectedGeoColumns;
  if (intent === "date") return context.datasetProfile.detectedDateColumns;
  if (["revenue", "margin", "metric"].includes(intent)) return context.datasetProfile.detectedMetricColumns;
  return context.datasetProfile.detectedDimensionColumns;
}

function typeScore(column: DatasetColumnProfile, intent: ColumnIntent) {
  if (intent === "date") return column.inferredType === "date" || column.semanticType === "time" ? 0.28 : 0;
  if (intent === "geography") return column.inferredType === "geography" || column.semanticType === "geo" ? 0.26 : 0;
  if (["revenue", "margin", "metric"].includes(intent)) return ["number", "currency", "percentage"].includes(column.inferredType) || ["metric", "measure"].includes(column.semanticType) ? 0.2 : 0;
  return ["dimension", "category", "identifier", "geo"].includes(column.semanticType) ? 0.16 : 0;
}

function requestedIntent(prompt: string): ColumnIntent | undefined {
  const text = normalize(prompt);
  const ordered: ColumnIntent[] = ["geography", "seller", "client", "product", "category", "margin", "revenue", "date", "metric", "dimension"];
  return ordered.find((intent) => containsAny(text, normalizedHints(intent)));
}

export function inferColumnIntent(prompt: string, fallback: ColumnIntent = "dimension") {
  return requestedIntent(prompt) ?? fallback;
}

export function resolveColumn(prompt: string, context: ColumnResolverContext, intent = inferColumnIntent(prompt)): ColumnResolveResult {
  if (intent === "geography") {
    const requestedConcept = geoConcept(prompt);
    const matches = geographyMatches(prompt, context);
    const best = matches[0];
    if (!best || best.confidence < 0.45) {
      return {
        intent,
        requestedConcept,
        matchType: "not_found",
        confidence: 0,
        reason: `No encontre una columna compatible con "${prompt}".`,
        alternatives: matches.slice(0, 4)
      };
    }
    return {
      intent,
      requestedConcept,
      matchedColumn: best.column,
      originalName: best.column.originalName,
      normalizedName: best.column.normalizedName,
      matchType: best.matchType ?? "semantic",
      confidence: best.confidence,
      reason: best.reason,
      alternatives: matches.slice(1, 5),
      uniqueCount: best.column.uniqueCount,
      sampleValues: best.column.sampleValues
    };
  }

  const promptText = normalize(prompt);
  const intentHints = normalizedHints(intent);
  const semantic = new Map(semanticFields(context, intent).map((field, index) => [field.field, { confidence: field.confidence, index }]));
  const fallbacks = new Set(profileFallbackFields(context, intent));

  const matches = context.datasetProfile.columns
    .map((column) => {
      const text = columnText(column);
      const directName = promptText.includes(normalize(column.originalName)) || promptText.includes(normalize(column.displayName)) || promptText.includes(normalize(column.normalizedName));
      const nameHint = containsAny(text, intentHints) ? 0.42 : 0;
      const semanticHit = semantic.get(column.normalizedName);
      const semanticScore = semanticHit ? 0.34 + Math.max(0, 0.12 - semanticHit.index * 0.03) : 0;
      const fallbackScore = fallbacks.has(column.normalizedName) ? 0.16 : 0;
      const confidence = Math.min(0.99, Number((nameHint + semanticScore + fallbackScore + typeScore(column, intent) + (directName ? 0.18 : 0)).toFixed(2)));
      return {
        column,
        confidence,
        reason: directName
          ? `Coincide directamente con "${column.displayName}".`
          : confidence >= 0.65
            ? `Coincide semanticamente con ${intent}.`
            : `Alternativa posible para ${intent}.`
      };
    })
    .filter((match) => match.confidence >= 0.2)
    .sort((left, right) => right.confidence - left.confidence);

  const best = matches[0];
  if (!best || best.confidence < 0.48) {
    return {
      intent,
      requestedConcept: intent,
      matchType: "not_found",
      confidence: 0,
      reason: `No encontre una columna compatible con "${prompt}".`,
      alternatives: matches.slice(0, 4)
    };
  }

  return {
    intent,
    requestedConcept: intent,
    matchedColumn: best.column,
    originalName: best.column.originalName,
    normalizedName: best.column.normalizedName,
    matchType: "semantic",
    confidence: best.confidence,
    reason: best.reason,
    alternatives: matches.slice(1, 5),
    uniqueCount: best.column.uniqueCount,
    sampleValues: best.column.sampleValues
  };
}

export function listAvailableDimensions(profile: DatasetProfile) {
  return profile.columns
    .filter((column) => ["dimension", "category", "identifier", "geo"].includes(column.semanticType) || ["string", "geography"].includes(column.inferredType))
    .map((column) => column.displayName || column.originalName || column.normalizedName);
}

export function missingColumnMessage(label: string, profile: DatasetProfile) {
  const dimensions = listAvailableDimensions(profile).slice(0, 8);
  return `No encontre una columna compatible con "${label}". Las dimensiones disponibles son: ${dimensions.length ? dimensions.join(", ") : "ninguna dimension confiable detectada"}.`;
}
