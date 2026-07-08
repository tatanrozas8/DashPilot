"use client";

import type { DataRow } from "@/types/dataset";
import { parseUploadedFile } from "@/lib/files/parse-file";

export async function parseSpreadsheetFile(file: File): Promise<DataRow[]> {
  const parsed = await parseUploadedFile(file);
  return parsed.sheets.find((sheet) => sheet.name === parsed.selectedSheetName)?.rows ?? parsed.sheets[0]?.rows ?? [];
}
