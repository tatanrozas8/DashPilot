import type { DatasetCatalog, DatasetCatalogColumn, DatasetColumnProfile, DatasetProfile, DimensionRole, MetricRole } from "@/types/dataset";
import { slugify } from "@/lib/utils";

const metricHints: Record<Exclude<MetricRole, "unknown">, string[]> = {
  revenue: ["venta", "ventas", "sales", "revenue", "ingreso", "ingresos", "monto", "importe", "facturacion"],
  margin: ["margen", "margin", "utilidad", "profit", "ganancia"],
  cost: ["costo", "cost", "gasto", "expense", "egreso"],
  quantity: ["cantidad", "quantity", "qty", "unidades", "volume", "volumen"],
  percentage: ["porcentaje", "percentage", "percent", "tasa", "rate", "ratio"],
  measure: ["valor", "value", "score", "puntaje", "total"]
};

const dimensionHints: Record<Exclude<DimensionRole, "unknown" | "geography" | "time" | "breakdown">, string[]> = {
  client: ["cliente", "client", "customer", "cuenta", "account"],
  seller: ["vendedor", "seller", "asesor", "ejecutivo", "representante", "sales_rep"],
  product: ["producto", "product", "sku", "item", "articulo", "servicio"],
  category: ["categoria", "category", "familia", "linea", "segmento"],
  channel: ["canal", "channel", "origen", "source"],
  identifier: ["id", "codigo", "code", "pedido", "order", "folio"]
};

function unique(items: string[]) {
  return [...new Set(items.map((item) => item.trim()).filter(Boolean))];
}

function columnCorpus(column: DatasetColumnProfile) {
  return slugify([
    column.originalName,
    column.normalizedName,
    column.displayName,
    column.businessName,
    column.description,
    ...(column.synonyms ?? [])
  ].filter(Boolean).join(" "));
}

function firstHintRole<T extends string>(corpus: string, hints: Record<string, string[]>, fallback: T): T {
  const role = Object.entries(hints).find(([, words]) => words.some((word) => corpus.includes(slugify(word))))?.[0];
  return (role as T | undefined) ?? fallback;
}

function aliasesFor(column: DatasetColumnProfile, metricRole: MetricRole, dimensionRole: DimensionRole) {
  const base = [
    column.originalName,
    column.normalizedName,
    column.displayName,
    column.businessName,
    ...(column.synonyms ?? []),
    ...column.normalizedName.split("_"),
    metricRole !== "unknown" ? metricRole : "",
    dimensionRole !== "unknown" ? dimensionRole : "",
    column.geoRole ?? ""
  ].filter(Boolean) as string[];

  const normalizedAliases = base.flatMap((item) => {
    const slug = slugify(item);
    return [item, slug, slug.replace(/_/g, " ")];
  });

  return unique(normalizedAliases);
}

function confidenceFor(column: DatasetColumnProfile, metricRole: MetricRole, dimensionRole: DimensionRole) {
  const typed = column.semanticType !== "unknown" || column.inferredType !== "unknown" ? 0.28 : 0;
  const role = metricRole !== "unknown" || dimensionRole !== "unknown" || column.geoRole ? 0.34 : 0;
  const quality = column.nullPercentage < 10 ? 0.18 : column.nullPercentage < 40 ? 0.1 : 0;
  const values = column.uniqueCount > 0 ? 0.12 : 0;
  const user = column.userSemanticType || column.businessName || column.synonyms?.length ? 0.08 : 0;
  return Math.min(0.99, Number((typed + role + quality + values + user).toFixed(2)));
}

export function buildDatasetCatalog(profile: DatasetProfile): DatasetCatalog {
  const columns: DatasetCatalogColumn[] = profile.columns.map((column) => {
    const corpus = columnCorpus(column);
    const metricRole = column.semanticType === "metric" || column.semanticType === "measure" || ["number", "currency", "percentage"].includes(column.inferredType)
      ? firstHintRole<MetricRole>(corpus, metricHints, column.inferredType === "percentage" ? "percentage" : "measure")
      : "unknown";
    const dimensionRole: DimensionRole =
      column.semanticType === "time" || column.inferredType === "date" || column.inferredType === "datetime"
        ? "time"
        : column.semanticType === "geo" || column.geoRole
          ? "geography"
          : firstHintRole<DimensionRole>(corpus, dimensionHints, ["dimension", "category", "identifier"].includes(column.semanticType) || column.inferredType === "string" ? "breakdown" : "unknown");
    const usableAsMetric = metricRole !== "unknown";
    const usableAsDate = dimensionRole === "time";
    const usableAsDimension = !usableAsMetric && (dimensionRole !== "unknown" || ["dimension", "category", "identifier", "geo"].includes(column.semanticType) || ["string", "geography", "boolean"].includes(column.inferredType));
    const usableAsBreakdown = usableAsDimension && column.uniqueCount > 0 && column.uniqueCount <= Math.max(100, profile.rowCount * 0.8);
    const usableAsFilter = (usableAsDimension || usableAsDate || usableAsMetric) && column.uniqueCount > 0;
    const confidence = confidenceFor(column, metricRole, dimensionRole);

    return {
      originalName: column.originalName,
      normalizedName: column.normalizedName,
      displayName: column.displayName,
      inferredType: column.inferredType,
      semanticType: column.semanticType,
      role: usableAsMetric ? metricRole : dimensionRole !== "unknown" ? dimensionRole : column.semanticType,
      geoRole: column.geoRole,
      metricRole,
      dimensionRole,
      uniqueCount: column.uniqueCount,
      nullCount: column.nullCount,
      nullPercentage: column.nullPercentage,
      sampleValues: column.sampleValues,
      min: column.min,
      max: column.max,
      usableAsFilter,
      usableAsMetric,
      usableAsDimension,
      usableAsDate,
      usableAsBreakdown,
      confidence,
      aliases: aliasesFor(column, metricRole, dimensionRole),
      synonyms: column.synonyms ?? [],
      isHidden: column.isHidden
    };
  });

  const visible = columns.filter((column) => !column.isHidden);
  return {
    datasetId: profile.id,
    fileName: profile.fileName,
    rowCount: profile.rowCount,
    columnCount: profile.columnCount,
    columns,
    metrics: visible.filter((column) => column.usableAsMetric),
    dimensions: visible.filter((column) => column.usableAsDimension),
    dates: visible.filter((column) => column.usableAsDate),
    filters: visible.filter((column) => column.usableAsFilter),
    breakdowns: visible.filter((column) => column.usableAsBreakdown),
    geographies: visible.filter((column) => column.dimensionRole === "geography"),
    clients: visible.filter((column) => column.dimensionRole === "client"),
    sellers: visible.filter((column) => column.dimensionRole === "seller"),
    products: visible.filter((column) => column.dimensionRole === "product"),
    categories: visible.filter((column) => column.dimensionRole === "category"),
    channels: visible.filter((column) => column.dimensionRole === "channel")
  };
}
