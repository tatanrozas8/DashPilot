import type { DataRow, DatasetColumnProfile, DatasetProfile, GeoRole, InferredColumnType, NormalizedColumn, SemanticColumnType } from "@/types/dataset";
import { parseDateValue, parseLocaleNumber } from "@/lib/data/parse-values";
import { slugify } from "@/lib/utils";

const geoHints = ["region", "zona", "pais", "ciudad", "comuna", "territorio", "ubicacion", "geographic", "geography", "country", "city", "state", "province", "provincia"];
const dateHints = ["fecha", "date", "periodo", "mes", "dia"];
const idHints = ["id", "pedido", "order", "codigo", "sku"];
const moneyHints = ["venta", "sales", "revenue", "costo", "precio", "monto", "total", "ingreso"];
const percentHints = ["porcentaje", "percent", "%", "margen", "descuento", "tasa"];

function isEmpty(value: unknown) {
  return value === null || value === undefined || value === "";
}

function isDateLike(value: unknown) {
  return parseDateValue(value) !== null;
}

function inferType(name: string, values: unknown[], metadata?: NormalizedColumn): InferredColumnType {
  const normalized = slugify(name);
  const populated = values.filter((value) => !isEmpty(value));
  if (populated.length === 0) return "unknown";
  const typeCounts = metadata?.parseSummary?.typeCounts;
  const parsedTotal = Object.values(typeCounts ?? {}).reduce((total, count) => total + (count ?? 0), 0);
  if (typeCounts && parsedTotal > 0) {
    const typedEntries = Object.entries(typeCounts)
      .filter(([type, count]) => type !== "empty" && (count ?? 0) > 0)
      .sort((left, right) => (right[1] ?? 0) - (left[1] ?? 0));
    const [dominantType, dominantCount] = typedEntries[0] ?? [];
    const dominance = dominantCount && populated.length ? dominantCount / populated.length : 0;
    if (dominantType === "datetime" && dominance >= 0.7) return "datetime";
    if (dominantType === "date" && dominance >= 0.7) return "date";
    if (dominantType === "percentage" && dominance >= 0.7) return "percentage";
    if (dominantType === "currency" && dominance >= 0.7) return "currency";
    if (dominantType === "number" && dominance >= 0.7) return "number";
    if (dominantType === "boolean" && dominance >= 0.8) return "boolean";
  }
  const dateRatio = populated.filter(isDateLike).length / populated.length;
  const numberRatio = populated.filter((value) => parseLocaleNumber(value) !== null).length / populated.length;
  const booleanRatio = populated.filter((value) => typeof value === "boolean" || ["true", "false", "si", "no"].includes(String(value).toLowerCase())).length / populated.length;

  if (dateRatio > 0.75 || dateHints.some((hint) => normalized.includes(hint))) return "date";
  if (percentHints.some((hint) => normalized.includes(hint))) return "percentage";
  if (moneyHints.some((hint) => normalized.includes(hint))) return "currency";
  if (geoHints.some((hint) => normalized.includes(hint))) return "geography";
  if (booleanRatio > 0.8) return "boolean";
  if (numberRatio > 0.8) return "number";
  return "string";
}

export function detectGeoRole(name: string): { geoRole?: GeoRole; confidence: number } {
  const normalized = slugify(name);
  const tokens = new Set(normalized.split("_").filter(Boolean));

  if (tokens.has("region") || normalized === "region") return { geoRole: "region", confidence: 0.98 };
  if (normalized.includes("region")) return { geoRole: "region", confidence: 0.92 };
  if (tokens.has("zona") || tokens.has("zone")) return { geoRole: "zone", confidence: 0.9 };
  if (tokens.has("territorio") || tokens.has("territory")) return { geoRole: "territory", confidence: 0.88 };
  if (tokens.has("ciudad") || tokens.has("city")) return { geoRole: "city", confidence: 0.86 };
  if (tokens.has("comuna")) return { geoRole: "commune", confidence: 0.86 };
  if (tokens.has("pais") || tokens.has("country")) return { geoRole: "country", confidence: 0.82 };
  if (tokens.has("provincia") || tokens.has("province") || tokens.has("state")) return { geoRole: "region", confidence: 0.72 };
  if (tokens.has("ubicacion") || tokens.has("geographic") || tokens.has("geography")) return { geoRole: "unknown", confidence: 0.62 };
  return { confidence: 0 };
}

function semanticType(name: string, inferredType: InferredColumnType, uniqueCount: number, rowCount: number, geoRole?: GeoRole): SemanticColumnType {
  const normalized = slugify(name);
  if (inferredType === "date" || inferredType === "datetime") return "time";
  if (geoRole || inferredType === "geography") return "geo";
  if (idHints.some((hint) => normalized.includes(hint))) return "identifier";
  if (["currency", "number", "percentage"].includes(inferredType)) return "metric";
  if (uniqueCount <= Math.max(20, rowCount * 0.35)) return "dimension";
  return "unknown";
}

function displayName(name: string) {
  return name.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

export function profileDataset(rows: DataRow[], fileName = "Datos de ejemplo.xlsx", normalizedColumns: NormalizedColumn[] = []): DatasetProfile {
  const columns = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  const rowCount = rows.length;
  const columnMap = new Map(normalizedColumns.map((column) => [column.normalizedName, column]));
  const profiles: DatasetColumnProfile[] = columns.map((column) => {
    const metadata = columnMap.get(column);
    const values = rows.map((row) => row[column]);
    const nullCount = values.filter(isEmpty).length;
    const populated = values.filter((value) => !isEmpty(value));
    const unique = new Set(populated.map((value) => String(value)));
    const inferredType = inferType(metadata?.originalName ?? column, values, metadata);
    const geo = detectGeoRole(`${metadata?.originalName ?? column} ${metadata?.displayName ?? ""} ${column}`);
    const resolvedSemanticType = semanticType(metadata?.originalName ?? column, inferredType, unique.size, rowCount, geo.geoRole);
    const numeric = populated.map(parseLocaleNumber).filter((value): value is number => value !== null);
    const numericRatio = populated.length ? numeric.length / populated.length : 0;
    const parseSummary = metadata?.parseSummary;
    const concreteTypes = Object.entries(parseSummary?.typeCounts ?? {})
      .filter(([type, count]) => type !== "empty" && (count ?? 0) > 0)
      .map(([type]) => type);
    const mixedType = concreteTypes.length > 1;
    const parseWarnings = [
      ...(metadata?.warnings ?? []),
      mixedType ? `${metadata?.displayName ?? column} mezcla tipos detectados (${concreteTypes.join(", ")}). Corrige el tipo antes de generar el dashboard si no coincide con el dato de negocio.` : undefined,
      parseSummary?.ambiguousCount ? `${metadata?.displayName ?? column} tiene ${parseSummary.ambiguousCount} fecha(s) ambiguas no resueltas.` : undefined,
      parseSummary?.invalidCount ? `${metadata?.displayName ?? column} tiene ${parseSummary.invalidCount} valor(es) que no pudieron normalizarse.` : undefined
    ].filter((warning): warning is string => Boolean(warning));

    return {
      originalName: metadata?.originalName ?? column,
      normalizedName: column,
      displayName: metadata?.displayName ?? displayName(column),
      canonicalName: metadata?.canonicalName ?? column,
      rawHeader: metadata?.rawHeader,
      inferredType,
      semanticType: resolvedSemanticType,
      semanticConfidence: resolvedSemanticType === "geo" ? geo.confidence : undefined,
      geoRole: resolvedSemanticType === "geo" ? geo.geoRole ?? "unknown" : undefined,
      geoConfidence: resolvedSemanticType === "geo" ? geo.confidence : undefined,
      nullCount,
      nullPercentage: rowCount === 0 ? 0 : Number(((nullCount / rowCount) * 100).toFixed(1)),
      uniqueCount: unique.size,
      sampleValues: populated.slice(0, 5),
      min: numeric.length ? Math.min(...numeric) : undefined,
      max: numeric.length ? Math.max(...numeric) : undefined,
      parseSummary,
      parseWarnings,
      mixedType,
      statistics: {
        numericRatio: Number(numericRatio.toFixed(2)),
        cardinalityRatio: rowCount ? Number((unique.size / rowCount).toFixed(2)) : 0,
        mixedType,
        ambiguousCount: parseSummary?.ambiguousCount ?? 0,
        invalidCount: parseSummary?.invalidCount ?? 0
      }
    };
  });

  const qualityWarnings = [
    ...profiles.flatMap((profile) => profile.parseWarnings ?? []),
    ...profiles
      .filter((profile) => profile.nullPercentage > 10)
      .map((profile) => `${profile.displayName} tiene ${profile.nullPercentage}% de valores nulos.`),
    ...profiles
      .filter((profile) => profile.semanticType === "dimension" && profile.uniqueCount > Math.max(50, rowCount * 0.7))
      .map((profile) => `${profile.displayName} tiene demasiados valores unicos para ser un filtro comodo.`),
    ...(rowCount < 5 ? ["El dataset es pequeno; los insights pueden ser poco representativos."] : []),
    ...(rowCount > 50_000 ? ["El dataset es grande; esta version procesa una muestra inicial."] : [])
  ];
  const qualityScore = Math.max(45, Math.min(100, 100 - qualityWarnings.length * 8));

  return {
    id: `dataset_${slugify(fileName).slice(0, 24) || "empty"}`,
    fileName,
    rowCount,
    columnCount: columns.length,
    columns: profiles,
    detectedDateColumns: profiles.filter((column) => column.semanticType === "time").map((column) => column.normalizedName),
    detectedMetricColumns: profiles.filter((column) => column.semanticType === "metric").map((column) => column.normalizedName),
    detectedDimensionColumns: profiles.filter((column) => ["dimension", "category", "identifier"].includes(column.semanticType)).map((column) => column.normalizedName),
    detectedGeoColumns: profiles.filter((column) => column.semanticType === "geo").map((column) => column.normalizedName),
    qualityWarnings,
    qualityScore,
    createdAt: new Date().toISOString()
  };
}
