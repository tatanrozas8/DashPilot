import type { DatasetCatalogColumn, DatasetColumnProfile, DatasetProfile, GeoRole } from "@/types/dataset";
import type { SemanticLayer } from "@/lib/semantic-layer/infer-semantic-layer";
import { buildDatasetCatalog } from "@/lib/semantic-layer/dataset-catalog";
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
  matchedAlias?: string;
}

export type ColumnMatchType = "exact" | "contains" | "semantic" | "fallback" | "not_found";
export type RequestedColumnConcept = ColumnIntent | "region" | "country" | "city" | "zone" | "commune" | "territory" | string;

export interface ColumnResolveResult {
  intent: ColumnIntent;
  requestedText: string;
  requestedConcept: RequestedColumnConcept;
  candidates: ColumnMatch[];
  matchedColumn?: DatasetColumnProfile;
  selectedColumn?: DatasetColumnProfile;
  originalName?: string;
  normalizedName?: string;
  matchType: ColumnMatchType;
  confidence: number;
  reason: string;
  alternatives: ColumnMatch[];
  ambiguity: boolean;
  needsClarification: boolean;
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
  return slugify(value
    .replace(/paÃ­s/gi, "pais")
    .replace(/regiÃ³n/gi, "region")
    .replace(/categorÃ­a/gi, "categoria")
    .replace(/artÃ­culo/gi, "articulo")
    .replace(/lÃ­nea/gi, "linea")
    .replace(/perÃ­odo/gi, "periodo")
    .replace(/aÃ±o/gi, "ano"));
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

function profileColumnByName(profile: DatasetProfile, normalizedName: string) {
  return profile.columns.find((column) => column.normalizedName === normalizedName);
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

function conceptForIntent(prompt: string, intent: ColumnIntent): RequestedColumnConcept {
  if (intent === "geography") return geoConcept(prompt);
  return intent;
}

function roleScore(catalogColumn: DatasetCatalogColumn, intent: ColumnIntent, concept: RequestedColumnConcept) {
  if (intent === "geography") return geoPriorityForConcept(concept, catalogColumn.geoRole) / 100;
  if (intent === "revenue") return catalogColumn.metricRole === "revenue" ? 0.9 : catalogColumn.usableAsMetric ? 0.45 : 0;
  if (intent === "margin") return catalogColumn.metricRole === "margin" ? 0.9 : catalogColumn.usableAsMetric ? 0.35 : 0;
  if (intent === "metric") return catalogColumn.usableAsMetric ? 0.76 : 0;
  if (intent === "date") return catalogColumn.usableAsDate ? 0.86 : 0;
  if (intent === "dimension") return catalogColumn.usableAsDimension || catalogColumn.usableAsBreakdown ? 0.64 : 0;
  if (intent === "client") return catalogColumn.dimensionRole === "client" ? 0.86 : 0;
  if (intent === "seller") return catalogColumn.dimensionRole === "seller" ? 0.86 : 0;
  if (intent === "product") return catalogColumn.dimensionRole === "product" ? 0.86 : 0;
  if (intent === "category") return catalogColumn.dimensionRole === "category" ? 0.82 : 0;
  return 0;
}

function directMatchScore(requestedText: string, catalogColumn: DatasetCatalogColumn) {
  const requested = normalize(requestedText);
  const names = [
    catalogColumn.normalizedName,
    catalogColumn.originalName,
    catalogColumn.displayName,
    ...catalogColumn.aliases,
    ...catalogColumn.synonyms
  ].map(normalize).filter(Boolean);

  if (names.some((name) => requested === name)) return { score: 1, matchType: "exact" as const, alias: names.find((name) => requested === name) };
  const tokenMatches = names.filter((name) => hasToken(requested, name) || hasToken(name, requested));
  if (tokenMatches.length) return { score: 0.88, matchType: "contains" as const, alias: tokenMatches[0] };
  const containsMatches = names.filter((name) => requested.includes(name) || name.includes(requested));
  if (containsMatches.length) return { score: 0.76, matchType: "contains" as const, alias: containsMatches[0] };
  const requestedTokens = requested.split("_").filter((token) => token.length > 1);
  const bestOverlap = names.reduce((best, name) => {
    const nameTokens = new Set(name.split("_").filter((token) => token.length > 1));
    const overlap = requestedTokens.filter((token) => nameTokens.has(token) || name.includes(token)).length / Math.max(1, requestedTokens.length);
    return Math.max(best, overlap);
  }, 0);
  return { score: bestOverlap >= 0.5 ? bestOverlap * 0.58 : 0, matchType: bestOverlap >= 0.75 ? "contains" as const : "semantic" as const, alias: undefined };
}

function catalogMatches(prompt: string, context: ColumnResolverContext, intent: ColumnIntent): ColumnMatch[] {
  const catalog = buildDatasetCatalog(context.datasetProfile);
  const concept = conceptForIntent(prompt, intent);
  return catalog.columns
    .flatMap((catalogColumn) => {
      const profileColumn = profileColumnByName(context.datasetProfile, catalogColumn.normalizedName);
      if (!profileColumn) return [];
      const direct = directMatchScore(prompt, catalogColumn);
      const semantic = roleScore(catalogColumn, intent, concept);
      const usability =
        intent === "metric" || intent === "revenue" || intent === "margin"
          ? catalogColumn.usableAsMetric ? 0.1 : 0
          : intent === "date"
            ? catalogColumn.usableAsDate ? 0.1 : 0
            : catalogColumn.usableAsBreakdown || catalogColumn.usableAsDimension ? 0.1 : 0;
      const confidence = Math.min(0.99, Number((direct.score * 0.6 + semantic * 0.38 + usability + catalogColumn.confidence * 0.08).toFixed(2)));
      const matchType: ColumnMatchType = direct.score >= 1 ? "exact" : direct.score >= 0.7 ? "contains" : semantic >= 0.75 ? "semantic" : "fallback";
      return [{
        column: profileColumn,
        confidence,
        matchType,
        matchedAlias: direct.alias,
        reason:
          matchType === "exact"
            ? `Coincide exactamente con "${profileColumn.displayName}".`
            : matchType === "contains"
              ? `Coincide por nombre o alias de "${profileColumn.displayName}".`
              : matchType === "semantic"
              ? `Coincide por rol ${catalogColumn.role}.`
                : `Candidato posible por utilidad como ${intent}.`
      }];
    })
    .filter((match) => match.confidence >= 0.18)
    .sort((left, right) => right.confidence - left.confidence || left.column.normalizedName.localeCompare(right.column.normalizedName));
}

function resultFromMatches(prompt: string, intent: ColumnIntent, requestedConcept: RequestedColumnConcept, matches: ColumnMatch[]): ColumnResolveResult {
  const best = matches[0];
  const ambiguity = Boolean(best && matches[1] && best.confidence - matches[1].confidence < 0.08 && matches[1].confidence >= 0.55);
  if (!best || best.confidence < 0.42) {
    return {
      intent,
      requestedText: prompt,
      requestedConcept,
      candidates: matches.slice(0, 8),
      matchType: "not_found",
      confidence: 0,
      reason: `No encontre una columna compatible con "${prompt}".`,
      alternatives: matches.slice(0, 4),
      ambiguity: false,
      needsClarification: false
    };
  }

  return {
    intent,
    requestedText: prompt,
    requestedConcept,
    candidates: matches.slice(0, 8),
    matchedColumn: best.column,
    selectedColumn: best.column,
    originalName: best.column.originalName,
    normalizedName: best.column.normalizedName,
    matchType: best.matchType ?? "semantic",
    confidence: best.confidence,
    reason: ambiguity
      ? `Encontre varias columnas posibles; seleccione "${best.column.displayName}" por mayor confianza.`
      : best.reason,
    alternatives: matches.slice(1, 5),
    ambiguity,
    needsClarification: ambiguity && best.confidence < 0.72,
    uniqueCount: best.column.uniqueCount,
    sampleValues: best.column.sampleValues
  };
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
  const requestedConcept = conceptForIntent(prompt, intent);
  const matches = intent === "geography" ? geographyMatches(prompt, context) : catalogMatches(prompt, context, intent);
  const catalogBased = catalogMatches(prompt, context, intent);
  const merged = [...matches, ...catalogBased]
    .sort((left, right) => right.confidence - left.confidence)
    .filter((match, index, list) => list.findIndex((item) => item.column.normalizedName === match.column.normalizedName) === index);
  return resultFromMatches(prompt, intent, requestedConcept, merged);
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
