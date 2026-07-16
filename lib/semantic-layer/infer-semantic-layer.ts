import type { DataRow, DatasetColumnProfile, DatasetProfile, GeoRole, InferredColumnType } from "@/types/dataset";
import { slugify } from "@/lib/utils";

export type SemanticDomainName = "sales" | "finance" | "operations" | "inventory" | "hr" | "marketing" | "generic";

export type SemanticRole =
  | "metric"
  | "dimension"
  | "date"
  | "geography"
  | "client"
  | "seller"
  | "product"
  | "category"
  | "order"
  | "revenue"
  | "cost"
  | "margin"
  | "quantity";

export interface SemanticField {
  field: string;
  originalName: string;
  displayName: string;
  role: SemanticRole;
  confidence: number;
  inferredType: InferredColumnType;
  geoRole?: GeoRole;
}

export interface SemanticLayer {
  domain: {
    name: SemanticDomainName;
    confidence: number;
  };
  metrics: SemanticField[];
  dimensions: SemanticField[];
  dates: SemanticField[];
  geographies: SemanticField[];
  clients: SemanticField[];
  sellers: SemanticField[];
  products: SemanticField[];
  categories: SemanticField[];
  orders: SemanticField[];
  revenueMetrics: SemanticField[];
  costMetrics: SemanticField[];
  marginMetrics: SemanticField[];
  quantityMetrics: SemanticField[];
  primaryMetric?: SemanticField;
  secondaryMetric?: SemanticField;
  primaryDate?: SemanticField;
  primaryDimension?: SemanticField;
  primaryGeography?: SemanticField;
  primaryClient?: SemanticField;
  primarySeller?: SemanticField;
  primaryProduct?: SemanticField;
  primaryCategory?: SemanticField;
  primaryOrder?: SemanticField;
}

const roleHints: Record<SemanticRole, string[]> = {
  metric: ["amount", "monto", "total", "valor", "value", "importe", "score", "puntaje", "rate", "ratio"],
  dimension: ["tipo", "type", "estado", "status", "canal", "channel", "segmento", "segment", "departamento", "department"],
  date: ["fecha", "date", "periodo", "period", "mes", "month", "dia", "day", "semana", "week", "year", "ano"],
  geography: ["region", "zona", "pais", "country", "ciudad", "city", "comuna", "provincia", "territorio"],
  client: ["cliente", "client", "customer", "cuenta", "account", "empresa", "company"],
  seller: ["vendedor", "seller", "sales_rep", "representante", "asesor", "ejecutivo", "agent"],
  product: ["producto", "product", "sku", "item", "articulo", "servicio", "service"],
  category: ["categoria", "category", "familia", "linea", "segmento", "canal", "channel"],
  order: ["pedido", "order", "orden", "ticket", "factura", "invoice", "id", "folio", "codigo"],
  revenue: ["venta", "ventas", "sales", "revenue", "ingreso", "ingresos", "total", "monto", "importe"],
  cost: ["costo", "cost", "expense", "gasto", "egreso"],
  margin: ["margen", "margin", "utilidad", "profit", "ganancia"],
  quantity: ["cantidad", "quantity", "qty", "unidades", "units", "volumen", "volume"]
};

const domainHints: Record<Exclude<SemanticDomainName, "generic">, string[]> = {
  sales: ["venta", "ventas", "sales", "revenue", "pedido", "cliente", "customer", "vendedor", "seller", "producto", "sku", "canal", "margen"],
  finance: ["finanza", "finance", "presupuesto", "budget", "balance", "cuenta", "accounting", "gasto", "expense", "egreso", "cash", "caja", "factura"],
  operations: ["operacion", "operation", "proceso", "process", "ticket", "sla", "stock", "inventario", "inventory", "produccion", "production", "lead_time"],
  inventory: ["inventario", "inventory", "stock", "bodega", "almacen", "almacÃ©n", "sku", "rotacion", "rotaciÃ³n", "quiebre"],
  hr: ["rrhh", "hr", "empleado", "employee", "colaborador", "cargo", "puesto", "salario", "salary", "contratacion", "hiring", "ausencia", "turno"],
  marketing: ["marketing", "campana", "campaÃ±a", "campaign", "lead", "leads", "conversion", "ctr", "cpc", "roas", "canal"]
};

function clamp(value: number) {
  return Math.max(0, Math.min(0.99, Number(value.toFixed(2))));
}

function columnText(column: DatasetColumnProfile) {
  return slugify(`${column.normalizedName} ${column.originalName} ${column.displayName}`);
}

function tokenSet(text: string) {
  return new Set(text.split("_").filter(Boolean));
}

function nameScore(column: DatasetColumnProfile, hints: string[]) {
  const text = columnText(column);
  const tokens = tokenSet(text);
  return hints.reduce((best, hint) => {
    const normalizedHint = slugify(hint);
    if (tokens.has(normalizedHint)) return Math.max(best, 0.58);
    if (text.includes(normalizedHint)) return Math.max(best, 0.42);
    return best;
  }, 0);
}

function geoRoleScore(column: DatasetColumnProfile) {
  if (column.geoRole === "region") return 0.42;
  if (column.geoRole === "zone" || column.geoRole === "territory") return 0.34;
  if (column.geoRole === "city" || column.geoRole === "commune") return 0.28;
  if (column.geoRole === "country") return 0.18;
  if (column.geoRole === "unknown") return 0.1;
  return 0;
}

function typeScore(column: DatasetColumnProfile, role: SemanticRole) {
  const numeric = ["number", "currency", "percentage"].includes(column.inferredType);
  if (role === "date") return column.inferredType === "date" || column.inferredType === "datetime" || column.semanticType === "time" ? 0.38 : 0;
  if (role === "geography") return (column.inferredType === "geography" || column.semanticType === "geo" ? 0.24 : 0) + geoRoleScore(column);
  if (["metric", "revenue", "cost", "margin", "quantity"].includes(role)) return numeric || column.semanticType === "metric" ? 0.32 : 0;
  if (role === "order") return column.semanticType === "identifier" ? 0.24 : 0;
  if (["dimension", "client", "seller", "product", "category"].includes(role)) return ["dimension", "category", "identifier", "geo"].includes(column.semanticType) ? 0.24 : 0;
  return 0;
}

function cardinalityScore(column: DatasetColumnProfile, rowCount: number, role: SemanticRole) {
  const ratio = rowCount ? column.uniqueCount / rowCount : 0;
  if (role === "order" && ratio > 0.7) return 0.16;
  if (["client", "seller", "product"].includes(role) && ratio > 0 && ratio <= 0.75) return 0.12;
  if (["dimension", "category", "geography"].includes(role) && ratio > 0 && ratio <= 0.45) return 0.14;
  if (["metric", "revenue", "cost", "margin", "quantity"].includes(role) && column.uniqueCount > 1) return 0.08;
  return 0;
}

function inferField(column: DatasetColumnProfile, role: SemanticRole, rowCount: number): SemanticField | undefined {
  const score = nameScore(column, roleHints[role]) + typeScore(column, role) + cardinalityScore(column, rowCount, role);
  const threshold = role === "metric" || role === "dimension" ? 0.36 : 0.5;
  if (score < threshold) return undefined;

  return {
    field: column.normalizedName,
    originalName: column.originalName,
    displayName: column.displayName,
    role,
    confidence: clamp(score),
    inferredType: column.inferredType,
    geoRole: role === "geography" ? column.geoRole : undefined
  };
}

function uniqueByField(fields: SemanticField[], preserveOrder = false) {
  const seen = new Set<string>();
  const ordered = preserveOrder ? fields : fields.sort((left, right) => right.confidence - left.confidence);
  return ordered
    .filter((field) => {
      if (seen.has(field.field)) return false;
      seen.add(field.field);
      return true;
    });
}

function geoPriority(role?: GeoRole) {
  if (role === "region") return 6;
  if (role === "zone" || role === "territory") return 5;
  if (role === "city" || role === "commune") return 4;
  if (role === "country") return 3;
  if (role === "unknown") return 1;
  return 0;
}

function inferRole(columns: DatasetColumnProfile[], role: SemanticRole, rowCount: number) {
  const fields = columns.map((column) => inferField(column, role, rowCount)).filter((field): field is SemanticField => Boolean(field));
  if (role === "geography") {
    return uniqueByField(fields.sort((left, right) => geoPriority(right.geoRole) - geoPriority(left.geoRole) || right.confidence - left.confidence), true);
  }
  return uniqueByField(fields);
}

function inferDomain(profile: DatasetProfile, fieldsByRole: Pick<SemanticLayer, "clients" | "sellers" | "products" | "orders" | "revenueMetrics" | "costMetrics" | "marginMetrics" | "quantityMetrics">): SemanticLayer["domain"] {
  const corpus = slugify(`${profile.fileName} ${profile.columns.map((column) => `${column.originalName} ${column.displayName}`).join(" ")}`);
  const scores = (Object.keys(domainHints) as Exclude<SemanticDomainName, "generic">[]).map((name) => {
    const hintScore = domainHints[name].filter((hint) => corpus.includes(slugify(hint))).length * 0.08;
    const roleScore =
      (name === "sales" ? fieldsByRole.revenueMetrics.length * 0.22 + fieldsByRole.clients.length * 0.12 + fieldsByRole.sellers.length * 0.16 + fieldsByRole.products.length * 0.14 + fieldsByRole.orders.length * 0.1 : 0) +
      (name === "finance" ? fieldsByRole.costMetrics.length * 0.16 + fieldsByRole.marginMetrics.length * 0.14 + fieldsByRole.revenueMetrics.length * 0.1 : 0) +
      (name === "operations" ? fieldsByRole.quantityMetrics.length * 0.12 + fieldsByRole.orders.length * 0.12 : 0);
    return { name, confidence: clamp(hintScore + roleScore) };
  });

  const best = scores.sort((left, right) => right.confidence - left.confidence)[0];
  if (!best || best.confidence < 0.35) return { name: "generic", confidence: 0.5 };
  return best;
}

function firstUsefulDimension(layer: Pick<SemanticLayer, "geographies" | "sellers" | "products" | "clients" | "categories" | "dimensions">) {
  return layer.geographies[0] ?? layer.sellers[0] ?? layer.products[0] ?? layer.clients[0] ?? layer.categories[0] ?? layer.dimensions[0];
}

export function inferSemanticLayer(profile: DatasetProfile, _rows: DataRow[] = []): SemanticLayer {
  const columns = profile.columns;
  const rowCount = profile.rowCount;
  const metrics = inferRole(columns, "metric", rowCount);
  const dimensions = inferRole(columns, "dimension", rowCount);
  const dates = inferRole(columns, "date", rowCount);
  const geographies = inferRole(columns, "geography", rowCount);
  const clients = inferRole(columns, "client", rowCount);
  const sellers = inferRole(columns, "seller", rowCount);
  const products = inferRole(columns, "product", rowCount);
  const categories = inferRole(columns, "category", rowCount);
  const orders = inferRole(columns, "order", rowCount);
  const revenueMetrics = inferRole(columns, "revenue", rowCount);
  const costMetrics = inferRole(columns, "cost", rowCount);
  const marginMetrics = inferRole(columns, "margin", rowCount);
  const quantityMetrics = inferRole(columns, "quantity", rowCount);
  const domain = inferDomain(profile, { clients, sellers, products, orders, revenueMetrics, costMetrics, marginMetrics, quantityMetrics });
  const primaryMetric = domain.name === "sales" ? revenueMetrics[0] ?? metrics[0] : metrics[0] ?? revenueMetrics[0];
  const secondaryMetric = marginMetrics.find((field) => field.field !== primaryMetric?.field) ?? costMetrics.find((field) => field.field !== primaryMetric?.field) ?? metrics.find((field) => field.field !== primaryMetric?.field);

  return {
    domain,
    metrics,
    dimensions,
    dates,
    geographies,
    clients,
    sellers,
    products,
    categories,
    orders,
    revenueMetrics,
    costMetrics,
    marginMetrics,
    quantityMetrics,
    primaryMetric,
    secondaryMetric,
    primaryDate: dates[0],
    primaryDimension: firstUsefulDimension({ geographies, sellers, products, clients, categories, dimensions }),
    primaryGeography: geographies[0],
    primaryClient: clients[0],
    primarySeller: sellers[0],
    primaryProduct: products[0],
    primaryCategory: categories[0],
    primaryOrder: orders[0]
  };
}
