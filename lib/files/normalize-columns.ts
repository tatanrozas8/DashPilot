import type { DataRow, NormalizedColumn } from "@/types/dataset";
import { slugify } from "@/lib/utils";

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
    const originalName = cleanHeader(header, position);
    const baseName = normalizeColumnName(originalName);
    const count = (seen.get(baseName) ?? 0) + 1;
    seen.set(baseName, count);
    const normalizedName = count === 1 ? baseName : `${baseName}_${count}`;

    return {
      originalName,
      normalizedName,
      displayName: originalName,
      position
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

export function normalizeRows(rawRows: unknown[][], columns: NormalizedColumn[], limit = 50_000): { rows: DataRow[]; warnings: string[] } {
  const warnings: string[] = [];
  const cappedRows = rawRows.length > limit ? rawRows.slice(0, limit) : rawRows;
  if (rawRows.length > limit) {
    warnings.push("Este archivo supera el limite recomendado para la version actual. Se procesaran las primeras 50.000 filas.");
  }

  const rows = cappedRows
    .map((rawRow) => {
      const entries = columns.map((column) => {
        const raw = rawRow[column.position];
        return [column.normalizedName, normalizeCell(raw)] as const;
      });
      return Object.fromEntries(entries) as DataRow;
    })
    .filter((row) => Object.values(row).some((value) => value !== null && value !== ""));

  return { rows, warnings };
}

function normalizeCell(value: unknown): DataRow[string] {
  if (value === undefined || value === null || value === "") return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "number" || typeof value === "boolean") return value;
  return String(value).trim();
}
