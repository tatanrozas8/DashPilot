import type { ColumnParseSummary, DataRow, NormalizedColumn, ParsedCellAudit, ParsedCellType } from "@/types/dataset";
import { parseCellValue, toCellAudit } from "@/lib/files/parse-cell";
import { slugify } from "@/lib/utils";

const maxAuditCells = 500;

export interface DetectedTableRange {
  headerRowIndex: number;
  headers: unknown[];
  bodyRows: unknown[][];
  warnings: string[];
}

function cleanHeader(value: unknown, position: number) {
  const text = String(value ?? "").replace(/^\uFEFF/, "").replace(/\s+/g, " ").trim();
  return text.length ? text : `Columna ${position + 1}`;
}

export function normalizeColumnName(value: string) {
  const withoutUnits = value
    .replace(/[$]/g, "")
    .replace(/\([^)]*%[^)]*\)/g, "")
    .replace(/%/g, "")
    .replace(/[-\s]+/g, " ");
  const normalized = slugify(withoutUnits);
  return normalized || "columna";
}

export function normalizeColumns(headers: unknown[]): NormalizedColumn[] {
  const seen = new Map<string, number>();

  return headers.map((header, position) => {
    const rawHeader = String(header ?? "").replace(/^\uFEFF/, "");
    const originalName = cleanHeader(header, position);
    const baseName = normalizeColumnName(originalName);
    const count = (seen.get(baseName) ?? 0) + 1;
    seen.set(baseName, count);
    const normalizedName = count === 1 ? baseName : `${baseName}_${count}`;
    const warnings = [
      rawHeader.trim() ? undefined : `Encabezado vacio en posicion ${position + 1}; se asigno "${originalName}".`,
      count > 1 ? `El encabezado "${originalName}" colisiona con otra columna normalizada como "${baseName}"; se usara el ID canonico "${normalizedName}".` : undefined
    ].filter((warning): warning is string => Boolean(warning));

    return {
      id: normalizedName,
      rawHeader,
      originalName,
      canonicalName: normalizedName,
      normalizedName,
      displayName: originalName,
      position,
      warnings
    };
  });
}

function isFilledCell(value: unknown) {
  return value !== null && value !== undefined && String(value).trim() !== "";
}

function rowDensity(row: unknown[]) {
  return row.filter(isFilledCell).length;
}

function textCellScore(value: unknown) {
  if (!isFilledCell(value)) return 0;
  if (value instanceof Date) return 0;
  if (typeof value === "number" || typeof value === "boolean") return 0;
  const text = String(value).trim();
  if (!text) return 0;
  return /[a-zA-ZÀ-ÿ_]/.test(text) ? 1 : 0;
}

export function detectTableRange(rawRows: unknown[][]): DetectedTableRange {
  const rows = rawRows.filter((row) => row.some(isFilledCell));
  if (!rows.length) return { headerRowIndex: -1, headers: [], bodyRows: [], warnings: ["No se detectaron filas con datos."] };

  const maxScan = Math.min(rows.length, 30);
  let bestIndex = 0;
  let bestScore = -Infinity;

  for (let index = 0; index < maxScan; index += 1) {
    const row = rows[index] ?? [];
    const filled = rowDensity(row);
    if (filled < 2) continue;
    const textCells = row.filter((cell) => textCellScore(cell) > 0).length;
    const nextRows = rows.slice(index + 1, index + 6);
    const strongestNext = Math.max(0, ...nextRows.map(rowDensity));
    const hasBody = strongestNext >= Math.max(2, Math.min(filled, Math.ceil(filled * 0.5)));
    const mostlyText = textCells >= Math.ceil(filled * 0.5);
    const score = filled * 4 + textCells * 3 + (hasBody ? 8 : -8) + (mostlyText ? 6 : -4) - index * 0.2;
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  }

  const headers = rows[bestIndex] ?? [];
  const bodyRows = rows.slice(bestIndex + 1);
  const warnings = bestIndex > 0 ? [`Se omitieron ${bestIndex} fila(s) antes del encabezado detectado.`] : [];
  return { headerRowIndex: bestIndex, headers, bodyRows, warnings };
}

function createSummary(): ColumnParseSummary {
  return {
    totalCount: 0,
    emptyCount: 0,
    parsedCount: 0,
    ambiguousCount: 0,
    invalidCount: 0,
    typeCounts: {},
    warnings: []
  };
}

function incrementType(summary: ColumnParseSummary, type: ParsedCellType) {
  summary.typeCounts[type] = (summary.typeCounts[type] ?? 0) + 1;
}

function summarizeColumns(columns: NormalizedColumn[], summaries: Map<string, ColumnParseSummary>) {
  return columns.map((column) => {
    const summary = summaries.get(column.normalizedName) ?? createSummary();
    const concreteTypes = Object.entries(summary.typeCounts)
      .filter(([type, count]) => type !== "empty" && (count ?? 0) > 0)
      .map(([type]) => type);
    const mixedWarning = concreteTypes.length > 1
      ? `La columna "${column.displayName}" mezcla tipos (${concreteTypes.join(", ")}); revisa o corrige el tipo antes de generar el dashboard.`
      : undefined;
    const parseWarnings = [
      ...summary.warnings,
      mixedWarning
    ].filter((warning): warning is string => Boolean(warning));
    return {
      ...column,
      parseSummary: {
        ...summary,
        warnings: parseWarnings
      },
      warnings: [...(column.warnings ?? []), ...parseWarnings]
    };
  });
}

export function normalizeRows(rawRows: unknown[][], columns: NormalizedColumn[], limit = 50_000): { rows: DataRow[]; warnings: string[]; columns: NormalizedColumn[]; parseAudit: ParsedCellAudit[] } {
  const warnings: string[] = [];
  const parseAudit: ParsedCellAudit[] = [];
  const summaries = new Map(columns.map((column) => [column.normalizedName, createSummary()]));
  const cappedRows = rawRows.length > limit ? rawRows.slice(0, limit) : rawRows;
  if (rawRows.length > limit) {
    warnings.push("Este archivo supera el limite recomendado para la version actual. Se procesaran las primeras 50.000 filas.");
  }

  const rows = cappedRows
    .map((rawRow, rowIndex) => {
      const entries = columns.map((column) => {
        const raw = rawRow[column.position];
        const parsed = parseCellValue(raw, column);
        const summary = summaries.get(column.normalizedName) ?? createSummary();
        summary.totalCount += 1;
        if (parsed.status === "empty") summary.emptyCount += 1;
        if (parsed.status === "parsed") summary.parsedCount += 1;
        if (parsed.status === "ambiguous") summary.ambiguousCount += 1;
        if (parsed.status === "invalid") summary.invalidCount += 1;
        incrementType(summary, parsed.detectedType);
        if (parsed.message && (parsed.status === "ambiguous" || parsed.status === "invalid") && !summary.warnings.includes(parsed.message)) {
          summary.warnings.push(parsed.message);
        }
        summaries.set(column.normalizedName, summary);
        if (parsed.audited && parseAudit.length < maxAuditCells) {
          parseAudit.push(toCellAudit({ rowIndex, column, raw, parsed }));
        }
        return [column.normalizedName, parsed.value] as const;
      });
      return Object.fromEntries(entries) as DataRow;
    })
    .filter((row) => Object.values(row).some((value) => value !== null && value !== ""));

  const parsedColumns = summarizeColumns(columns, summaries);
  warnings.push(...parsedColumns.flatMap((column) => column.warnings ?? []));
  if (parseAudit.length >= maxAuditCells) warnings.push("La auditoria de normalizacion fue truncada a 500 celdas para mantener el archivo manejable.");

  return { rows, warnings: Array.from(new Set(warnings)), columns: parsedColumns, parseAudit };
}
