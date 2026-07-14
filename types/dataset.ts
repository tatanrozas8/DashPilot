export type DataRow = Record<string, string | number | boolean | null>;

export type InferredColumnType =
  | "string"
  | "number"
  | "date"
  | "boolean"
  | "currency"
  | "percentage"
  | "geography"
  | "unknown";

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

export interface DatasetColumnProfile {
  originalName: string;
  normalizedName: string;
  displayName: string;
  businessName?: string;
  description?: string;
  synonyms?: string[];
  isHidden?: boolean;
  inferredType: InferredColumnType;
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
  fileName: string;
  fileType: string;
  fileSize?: number;
  selectedSheetName?: string;
  createdAt: string;
}

export interface NormalizedColumn {
  originalName: string;
  normalizedName: string;
  displayName: string;
  position: number;
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
