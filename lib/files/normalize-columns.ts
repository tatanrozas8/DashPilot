import type { DataRow, NormalizedColumn } from "@/types/dataset";
import { slugify } from "@/lib/utils";

function cleanHeader(value: unknown, position: number) {
  const text = String(value ?? "").trim();
  return text.length ? text : `Columna ${position + 1}`;
}

export function normalizeColumnName(value: string) {
  const withoutUnits = value.replace(/[$]/g, "").replace(/\([^)]*%[^)]*\)/g, "").replace(/%/g, "");
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
