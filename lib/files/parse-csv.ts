"use client";

import type { FileParseResult, ParsedSheet } from "@/types/dataset";
import { normalizeColumns, normalizeRows } from "@/lib/files/normalize-columns";

export async function parseCsvFile(file: File): Promise<FileParseResult> {
  const Papa = await import("papaparse");
  const text = await file.text();
  if (!text.trim()) throw new Error("El archivo esta vacio.");

  const parsed = Papa.parse<string[]>(text, {
    skipEmptyLines: true,
    dynamicTyping: true
  });
  if (parsed.errors.length) throw new Error(parsed.errors[0]?.message ?? "No se pudo leer el CSV.");

  const raw = parsed.data.filter((row) => row.some((cell) => String(cell ?? "").trim().length > 0));
  const headers = raw[0] ?? [];
  if (!headers.length) throw new Error("No se detectaron columnas en el CSV.");

  const columns = normalizeColumns(headers);
  const body = raw.slice(1);
  const { rows, warnings } = normalizeRows(body, columns);
  if (!rows.length) warnings.push("El archivo no contiene filas de datos despues de los encabezados.");

  const sheet: ParsedSheet = {
    name: "CSV",
    rowCount: rows.length,
    columnCount: columns.length,
    isSelected: true,
    columns,
    rows,
    previewRows: rows.slice(0, 100)
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
