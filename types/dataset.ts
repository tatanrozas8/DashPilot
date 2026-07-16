export type DataRow = Record<string, string | number | boolean | null>;

export type InferredColumnType =
  | "string"
  | "number"
  | "date"
  | "datetime"
  | "boolean"
  | "currency"
  | "percentage"
  | "geography"
  | "unknown";

export type CellParseStatus = "empty" | "raw" | "parsed" | "ambiguous" | "invalid";
export type ParsedCellType = "string" | "number" | "date" | "datetime" | "boolean" | "currency" | "percentage" | "empty" | "unknown";

export interface ParsedCellAudit {
  rowIndex: number;
  columnId: string;
  originalName: string;
  rawValue: string;
  normalizedValue: string | number | boolean | null;
  status: CellParseStatus;
  detectedType: ParsedCellType;
  message: string;
}

export interface ColumnParseSummary {
  totalCount: number;
  emptyCount: number;
  parsedCount: number;
  ambiguousCount: number;
  invalidCount: number;
  typeCounts: Partial<Record<ParsedCellType, number>>;
  warnings: string[];
}

export type SemanticColumnType =
  | "metric"
  | "dimension"
  | "time"
  | "geo"
  | "identifier"
  | "category"
  | "measure"
  | "unknown";

export type GeoRole = "region" | "country" | "city" | "zone" | "commune" | "territory" | "unknown";
export type MetricRole = "revenue" | "margin" | "cost" | "quantity" | "percentage" | "measure" | "unknown";
export type DimensionRole = "geography" | "client" | "seller" | "product" | "category" | "channel" | "identifier" | "time" | "breakdown" | "unknown";

export interface DatasetCatalogColumn {
  originalName: string;
  normalizedName: string;
  displayName: string;
  inferredType: InferredColumnType;
  parseSummary?: ColumnParseSummary;
  parseWarnings?: string[];
  mixedType?: boolean;
  canonicalName?: string;
  rawHeader?: string;
  semanticType: SemanticColumnType;
  role: SemanticColumnType | DimensionRole | MetricRole;
  geoRole?: GeoRole;
  metricRole?: MetricRole;
  dimensionRole?: DimensionRole;
  uniqueCount: number;
  nullCount: number;
  nullPercentage: number;
  sampleValues: unknown[];
  min?: number | string;
  max?: number | string;
  usableAsFilter: boolean;
  usableAsMetric: boolean;
  usableAsDimension: boolean;
  usableAsDate: boolean;
  usableAsBreakdown: boolean;
  confidence: number;
  aliases: string[];
  synonyms: string[];
  isHidden?: boolean;
}

export interface DatasetCatalog {
  datasetId: string;
  fileName: string;
  rowCount: number;
  columnCount: number;
  columns: DatasetCatalogColumn[];
  metrics: DatasetCatalogColumn[];
  dimensions: DatasetCatalogColumn[];
  dates: DatasetCatalogColumn[];
  filters: DatasetCatalogColumn[];
  breakdowns: DatasetCatalogColumn[];
  geographies: DatasetCatalogColumn[];
  clients: DatasetCatalogColumn[];
  sellers: DatasetCatalogColumn[];
  products: DatasetCatalogColumn[];
  categories: DatasetCatalogColumn[];
  channels: DatasetCatalogColumn[];
}

export interface DatasetColumnProfile {
  originalName: string;
  normalizedName: string;
  displayName: string;
  businessName?: string;
  description?: string;
  synonyms?: string[];
  isHidden?: boolean;
  inferredType: InferredColumnType;
  parseSummary?: ColumnParseSummary;
  parseWarnings?: string[];
  mixedType?: boolean;
  canonicalName?: string;
  rawHeader?: string;
  semanticType: SemanticColumnType;
  userSemanticType?: SemanticColumnType;
  semanticConfidence?: number;
  geoRole?: GeoRole;
  geoConfidence?: number;
  nullCount: number;
  nullPercentage: number;
  uniqueCount: number;
  sampleValues: unknown[];
  min?: number | string;
  max?: number | string;
  statistics?: Record<string, unknown>;
}

export interface DatasetProfile {
  id: string;
  datasetVersionId?: string;
  fileName: string;
  rowCount: number;
  columnCount: number;
  columns: DatasetColumnProfile[];
  detectedDateColumns: string[];
  detectedMetricColumns: string[];
  detectedDimensionColumns: string[];
  detectedGeoColumns: string[];
  qualityWarnings: string[];
  qualityScore: number;
  createdAt: string;
}

export interface DatasetRecord {
  id: string;
  activeVersionId?: string;
  fileName: string;
  fileType: string;
  fileSize?: number;
  selectedSheetName?: string;
  createdAt: string;
}

export type DatasetImportStatus = "created" | "uploading" | "processing" | "validating" | "ready" | "failed" | "cancelled" | "superseded";

export interface DatasetVersion {
  id: string;
  datasetId: string;
  versionNumber: number;
  status: DatasetImportStatus;
  checksum: string;
  schemaHash: string;
  rowCount: number;
  columnCount: number;
  fileName: string;
  fileType: FileParseResult["fileType"];
  fileSize: number;
  selectedSheetName: string;
  idempotencyKey?: string;
  profile?: DatasetProfile;
  storagePath?: string;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
  readyAt?: string;
  failedAt?: string;
  cancelledAt?: string;
  supersededAt?: string;
}

export interface DatasetImportJob {
  id: string;
  datasetId: string;
  datasetVersionId: string;
  status: DatasetImportStatus;
  progress: number;
  idempotencyKey?: string;
  errorMessage?: string;
  startedAt?: string;
  finishedAt?: string;
  createdAt: string;
}

export interface NormalizedColumn {
  id: string;
  rawHeader: string;
  originalName: string;
  canonicalName: string;
  normalizedName: string;
  displayName: string;
  position: number;
  warnings?: string[];
  parseSummary?: ColumnParseSummary;
}

export interface SheetInfo {
  name: string;
  rowCount: number;
  columnCount: number;
  isSelected: boolean;
  columns: NormalizedColumn[];
}

export interface ParsedSheet extends SheetInfo {
  rows: DataRow[];
  previewRows: DataRow[];
  parseAudit?: ParsedCellAudit[];
}

export interface FileParseResult {
  fileName: string;
  fileType: "csv" | "xlsx" | "xls";
  fileSize: number;
  sheets: ParsedSheet[];
  selectedSheetName: string;
  warnings: string[];
}

export type ParsedDataset = FileParseResult;

export interface ColumnInferenceResult {
  column: string;
  inferredType: InferredColumnType;
  semanticType: SemanticColumnType;
  confidence: number;
}
