import type { DataRow, DatasetColumnProfile, DatasetProfile, InferredColumnType, NormalizedColumn, SemanticColumnType } from "@/types/dataset";
import { slugify } from "@/lib/utils";

const geoHints = ["region", "pais", "ciudad", "zona", "comuna", "estado"];
const dateHints = ["fecha", "date", "periodo", "mes", "dia"];
const idHints = ["id", "pedido", "order", "codigo", "sku"];
const moneyHints = ["venta", "sales", "revenue", "costo", "precio", "monto", "total", "ingreso"];
const percentHints = ["porcentaje", "percent", "%", "margen", "descuento", "tasa"];

function isEmpty(value: unknown) {
  return value === null || value === undefined || value === "";
}

function asNumber(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const normalized = value.replace(/[$,%\s]/g, "").replace(/\./g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function isDateLike(value: unknown) {
  if (value instanceof Date) return !Number.isNaN(value.getTime());
  if (typeof value !== "string") return false;
  const parsed = Date.parse(value);
  return !Number.isNaN(parsed) && /\d{1,4}[-/]\d{1,2}[-/]\d{1,4}/.test(value);
}

function inferType(name: string, values: unknown[]): InferredColumnType {
  const normalized = slugify(name);
  const populated = values.filter((value) => !isEmpty(value));
  if (populated.length === 0) return "unknown";
  const dateRatio = populated.filter(isDateLike).length / populated.length;
  const numberRatio = populated.filter((value) => asNumber(value) !== null).length / populated.length;
  const booleanRatio = populated.filter((value) => typeof value === "boolean" || ["true", "false", "si", "no"].includes(String(value).toLowerCase())).length / populated.length;

  if (dateRatio > 0.75 || dateHints.some((hint) => normalized.includes(hint))) return "date";
  if (percentHints.some((hint) => normalized.includes(hint))) return "percentage";
  if (moneyHints.some((hint) => normalized.includes(hint))) return "currency";
  if (geoHints.some((hint) => normalized.includes(hint))) return "geography";
  if (booleanRatio > 0.8) return "boolean";
  if (numberRatio > 0.8) return "number";
  return "string";
}

function semanticType(name: string, inferredType: InferredColumnType, uniqueCount: number, rowCount: number): SemanticColumnType {
  const normalized = slugify(name);
  if (inferredType === "date") return "time";
  if (inferredType === "geography") return "geo";
  if (idHints.some((hint) => normalized.includes(hint))) return "identifier";
  if (["currency", "number", "percentage"].includes(inferredType)) return "metric";
  if (uniqueCount <= Math.max(20, rowCount * 0.35)) return "dimension";
  return "unknown";
}

function displayName(name: string) {
  return name.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

export function profileDataset(rows: DataRow[], fileName = "Ventas_Q2_2024.xlsx", normalizedColumns: NormalizedColumn[] = []): DatasetProfile {
  const columns = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  const rowCount = rows.length;
  const columnMap = new Map(normalizedColumns.map((column) => [column.normalizedName, column]));
  const profiles: DatasetColumnProfile[] = columns.map((column) => {
    const metadata = columnMap.get(column);
    const values = rows.map((row) => row[column]);
    const nullCount = values.filter(isEmpty).length;
    const populated = values.filter((value) => !isEmpty(value));
    const unique = new Set(populated.map((value) => String(value)));
    const inferredType = inferType(metadata?.originalName ?? column, values);
    const numeric = populated.map(asNumber).filter((value): value is number => value !== null);
    const numericRatio = populated.length ? numeric.length / populated.length : 0;

    return {
      originalName: metadata?.originalName ?? column,
      normalizedName: column,
      displayName: metadata?.displayName ?? displayName(column),
      inferredType,
      semanticType: semanticType(metadata?.originalName ?? column, inferredType, unique.size, rowCount),
      nullCount,
      nullPercentage: rowCount === 0 ? 0 : Number(((nullCount / rowCount) * 100).toFixed(1)),
      uniqueCount: unique.size,
      sampleValues: populated.slice(0, 5),
      min: numeric.length ? Math.min(...numeric) : undefined,
      max: numeric.length ? Math.max(...numeric) : undefined,
      statistics: {
        numericRatio: Number(numericRatio.toFixed(2)),
        cardinalityRatio: rowCount ? Number((unique.size / rowCount).toFixed(2)) : 0
      }
    };
  });

  const qualityWarnings = [
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
    id: `dataset_${slugify(fileName).slice(0, 24) || "demo"}`,
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
