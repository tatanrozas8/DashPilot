"use client";

import type { FileParseResult, ParsedSheet } from "@/types/dataset";
import { detectTableRange, normalizeColumns, normalizeRows } from "@/lib/files/normalize-columns";

const maxSheetsToProcess = 25;
const maxSheetRowsToRead = 50_500;
const maxSheetColumnsToRead = 250;

export async function parseExcelFile(file: File): Promise<FileParseResult> {
  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  if (!buffer.byteLength) throw new Error("El archivo esta vacio.");

  const workbook = XLSX.read(buffer, { cellDates: true });
  if (!workbook.SheetNames.length) throw new Error("No se detectaron hojas en el archivo Excel.");

  const warnings: string[] = [];
  const sheetNames = workbook.SheetNames.slice(0, maxSheetsToProcess);
  if (workbook.SheetNames.length > maxSheetsToProcess) {
    warnings.push(`El archivo contiene ${workbook.SheetNames.length} hojas; se procesaron solo las primeras ${maxSheetsToProcess}.`);
  }
  const sheets: ParsedSheet[] = sheetNames.map((sheetName, index) => {
    const sheet = workbook.Sheets[sheetName];
    const range = XLSX.utils.decode_range(sheet["!ref"] ?? "A1");
    if (range.e.r + 1 > maxSheetRowsToRead) warnings.push(`${sheetName}: La hoja excede ${maxSheetRowsToRead} filas leibles; se truncara para prevenir archivos anomalos.`);
    if (range.e.c + 1 > maxSheetColumnsToRead) warnings.push(`${sheetName}: La hoja excede ${maxSheetColumnsToRead} columnas leibles; se truncara para prevenir archivos anomalos.`);
    range.e.r = Math.min(range.e.r, maxSheetRowsToRead - 1);
    range.e.c = Math.min(range.e.c, maxSheetColumnsToRead - 1);
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, blankrows: false, range });
    const detected = detectTableRange(matrix);
    const headers = detected.headers;
    const columns = normalizeColumns(headers);
    const { rows, warnings: rowWarnings, columns: parsedColumns, parseAudit } = normalizeRows(detected.bodyRows, columns);
    warnings.push(...detected.warnings.map((warning) => `${sheetName}: ${warning}`));
    warnings.push(...rowWarnings.map((warning) => `${sheetName}: ${warning}`));
    if (!rows.length) warnings.push(`${sheetName}: La hoja no contiene filas de datos despues de los encabezados.`);

    return {
      name: sheetName,
      rowCount: rows.length,
      columnCount: parsedColumns.length,
      isSelected: index === 0,
      columns: parsedColumns,
      rows,
      previewRows: rows.slice(0, 100),
      parseAudit
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
