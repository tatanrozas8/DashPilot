"use client";

import type { FileParseResult, ParsedSheet } from "@/types/dataset";
import { detectTableRange, normalizeColumns, normalizeRows } from "@/lib/files/normalize-columns";

export async function parseExcelFile(file: File): Promise<FileParseResult> {
  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  if (!buffer.byteLength) throw new Error("El archivo esta vacio.");

  const workbook = XLSX.read(buffer, { cellDates: true });
  if (!workbook.SheetNames.length) throw new Error("No se detectaron hojas en el archivo Excel.");

  const warnings: string[] = [];
  const sheets: ParsedSheet[] = workbook.SheetNames.map((sheetName, index) => {
    const sheet = workbook.Sheets[sheetName];
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, blankrows: false });
    const detected = detectTableRange(matrix);
    const headers = detected.headers;
    const columns = normalizeColumns(headers);
    const { rows, warnings: rowWarnings } = normalizeRows(detected.bodyRows, columns);
    warnings.push(...detected.warnings.map((warning) => `${sheetName}: ${warning}`));
    warnings.push(...rowWarnings.map((warning) => `${sheetName}: ${warning}`));
    if (!rows.length) warnings.push(`${sheetName}: La hoja no contiene filas de datos despues de los encabezados.`);

    return {
      name: sheetName,
      rowCount: rows.length,
      columnCount: columns.length,
      isSelected: index === 0,
      columns,
      rows,
      previewRows: rows.slice(0, 100)
    };
  });

  const selected = sheets.find((sheet) => sheet.rows.length > 0 && sheet.columns.length > 0) ?? sheets.find((sheet) => sheet.columns.length > 0);
  if (!selected?.columns.length) throw new Error("No se detectaron columnas validas en el archivo Excel.");
  const selectedSheets = sheets.map((sheet) => ({ ...sheet, isSelected: sheet.name === selected.name }));

  return {
    fileName: file.name,
    fileType: file.name.toLowerCase().endsWith(".xls") ? "xls" : "xlsx",
    fileSize: file.size,
    sheets: selectedSheets,
    selectedSheetName: selected.name,
    warnings
  };
}
