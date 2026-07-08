"use client";

import type { FileParseResult } from "@/types/dataset";
import { parseCsvFile } from "@/lib/files/parse-csv";
import { parseExcelFile } from "@/lib/files/parse-excel";

const supported = ["csv", "xlsx", "xls"];
const maxFileSize = 25 * 1024 * 1024;

export async function parseUploadedFile(file: File): Promise<FileParseResult> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!supported.includes(ext)) throw new Error("Formato no soportado. Sube un archivo .xlsx, .xls o .csv.");
  if (file.size === 0) throw new Error("El archivo esta vacio.");
  if (file.size > maxFileSize) throw new Error("El archivo supera el limite de 25MB para esta version.");

  if (ext === "csv") return parseCsvFile(file);
  return parseExcelFile(file);
}
