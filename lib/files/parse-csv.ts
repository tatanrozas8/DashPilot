"use client";

import type { FileParseResult, ParsedSheet } from "@/types/dataset";
import { detectTableRange, normalizeColumns, normalizeRows } from "@/lib/files/normalize-columns";

export async function parseCsvFile(file: File): Promise<FileParseResult> {
  const Papa = await import("papaparse");
  const text = await file.text();
  if (!text.trim()) throw new Error("El archivo esta vacio.");

  const parsed = Papa.parse<string[]>(text, {
    skipEmptyLines: true,
    dynamicTyping: false
  });
  if (parsed.errors.length) throw new Error(parsed.errors[0]?.message ?? "No se pudo leer el CSV.");

  const raw = parsed.data.filter((row) => row.some((cell) => String(cell ?? "").trim().length > 0));
  const detected = detectTableRange(raw);
  const headers = detected.headers;
  if (!headers.length) throw new Error("No se detectaron columnas en el CSV.");

  const columns = normalizeColumns(headers);
  const body = detected.bodyRows;
  const { rows, warnings, columns: parsedColumns, parseAudit } = normalizeRows(body, columns);
  warnings.unshift(...detected.warnings);
  if (!rows.length) warnings.push("El archivo no contiene filas de datos despues de los encabezados.");

  const sheet: ParsedSheet = {
    name: "CSV",
    rowCount: rows.length,
    columnCount: parsedColumns.length,
    isSelected: true,
    columns: parsedColumns,
    rows,
    previewRows: rows.slice(0, 100),
    parseAudit
  };

  return {
    fileName: file.name,
    fileType: "csv",
    fileSize: file.size,
    sheets: [sheet],
    selectedSheetName: sheet.name,
    warnings
  };
}
