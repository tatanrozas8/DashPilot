import type {
  ImportFileInspection,
  ImportFileType,
  ImportSecurityPolicy,
  ImportValidationIssue,
  SafeImportPreview,
  WorkbookSecurityMetadata
} from "@/types/imports";

export const DEFAULT_IMPORT_SECURITY_POLICY: ImportSecurityPolicy = {
  maxSizeBytes: 250 * 1024 * 1024,
  maxSheets: 25,
  maxCompressionRatio: 80,
  maxArchiveEntries: 2_000
};

const supportedExtensions: ImportFileType[] = ["csv", "xlsx", "xls"];

const acceptedMimeTypes: Array<{ fileType: ImportFileType; mimeTypes: string[] }> = [
  { fileType: "csv", mimeTypes: ["text/csv", "text/plain", "application/csv", "application/vnd.ms-excel"] },
  { fileType: "xlsx", mimeTypes: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/zip", "application/octet-stream"] },
  { fileType: "xls", mimeTypes: ["application/vnd.ms-excel", "application/octet-stream"] }
];

export function extensionFromFileName(fileName: string): ImportFileType | null {
  const ext = fileName.split(".").pop()?.toLowerCase();
  return supportedExtensions.find((item) => item === ext) ?? null;
}

function startsWith(bytes: Uint8Array, signature: number[]) {
  if (bytes.length < signature.length) return false;
  return signature.every((value, index) => bytes[index] === value);
}

function isLikelyText(bytes: Uint8Array) {
  if (!bytes.length) return false;
  const inspected = bytes.slice(0, Math.min(bytes.length, 512));
  return Array.from(inspected).every((byte) => byte === 9 || byte === 10 || byte === 13 || (byte >= 32 && byte <= 126) || byte >= 128);
}

export function detectMimeTypeFromMagicBytes(bytes: Uint8Array): string {
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]) || startsWith(bytes, [0x50, 0x4b, 0x05, 0x06]) || startsWith(bytes, [0x50, 0x4b, 0x07, 0x08])) {
    return "application/zip";
  }
  if (startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) {
    return "application/vnd.ms-excel";
  }
  if (startsWith(bytes, [0xef, 0xbb, 0xbf]) || isLikelyText(bytes)) {
    return "text/plain";
  }
  return "application/octet-stream";
}

function mimeAllowedForType(fileType: ImportFileType, declaredMimeType: string, detectedMimeType: string) {
  const normalizedDeclared = declaredMimeType.toLowerCase();
  const allowed = acceptedMimeTypes.find((item) => item.fileType === fileType)?.mimeTypes ?? [];
  const declaredAllowed = !normalizedDeclared || allowed.includes(normalizedDeclared);
  const magicAllowed = fileType === "xlsx"
    ? detectedMimeType === "application/zip"
    : fileType === "xls"
      ? detectedMimeType === "application/vnd.ms-excel"
      : detectedMimeType === "text/plain";
  return declaredAllowed && magicAllowed;
}

function archiveIssues(workbook: WorkbookSecurityMetadata | undefined, policy: ImportSecurityPolicy): ImportValidationIssue[] {
  if (!workbook) return [];
  const issues: ImportValidationIssue[] = [];
  if (typeof workbook.sheetCount === "number" && workbook.sheetCount > policy.maxSheets) {
    issues.push({ code: "too_many_sheets", severity: "error", message: `El archivo contiene ${workbook.sheetCount} hojas; el limite es ${policy.maxSheets}.` });
  }
  if (typeof workbook.archiveEntryCount === "number" && workbook.archiveEntryCount > policy.maxArchiveEntries) {
    issues.push({ code: "malicious_archive_entry", severity: "error", message: `El archivo contiene demasiadas entradas internas (${workbook.archiveEntryCount}).` });
  }
  if (workbook.compressedSizeBytes && workbook.uncompressedSizeBytes) {
    const ratio = workbook.uncompressedSizeBytes / Math.max(workbook.compressedSizeBytes, 1);
    if (ratio > policy.maxCompressionRatio) {
      issues.push({ code: "compression_ratio_exceeded", severity: "error", message: `El ratio de compresion ${ratio.toFixed(1)} excede el limite ${policy.maxCompressionRatio}.` });
    }
  }
  if (workbook.hasMacros || workbook.hasEncryptedContent) {
    issues.push({ code: "encrypted_or_macro_enabled", severity: "error", message: "El archivo contiene macros o contenido cifrado no permitido." });
  }
  for (const entryName of workbook.entryNames ?? []) {
    const normalized = entryName.replace(/\\/g, "/").toLowerCase();
    if (normalized.includes("../") || normalized.startsWith("/") || normalized.includes("vbaproject.bin") || normalized.startsWith("xl/externallinks/")) {
      issues.push({ code: "malicious_archive_entry", severity: "error", message: `Entrada interna no permitida: ${entryName}.` });
    }
  }
  return issues;
}

export function validateImportFileInspection(
  inspection: ImportFileInspection,
  policy: ImportSecurityPolicy = DEFAULT_IMPORT_SECURITY_POLICY
) {
  const issues: ImportValidationIssue[] = [];
  const fileType = extensionFromFileName(inspection.fileName);
  const detectedMimeType = detectMimeTypeFromMagicBytes(inspection.headerBytes);

  if (!fileType) {
    issues.push({ code: "unsupported_extension", severity: "error", message: "Formato no soportado. Sube un archivo .csv, .xlsx o .xls." });
  }
  if (inspection.sizeBytes <= 0) {
    issues.push({ code: "empty_file", severity: "error", message: "El archivo esta vacio." });
  }
  if (inspection.sizeBytes > policy.maxSizeBytes) {
    issues.push({ code: "file_too_large", severity: "error", message: `El archivo supera el limite de ${Math.floor(policy.maxSizeBytes / 1024 / 1024)}MB.` });
  }
  if (fileType && !mimeAllowedForType(fileType, inspection.declaredMimeType, detectedMimeType)) {
    issues.push({ code: "magic_bytes_mismatch", severity: "error", message: "La extension, el MIME declarado y la firma real del archivo no coinciden." });
  }
  issues.push(...archiveIssues(inspection.workbook, policy));

  return {
    ok: issues.every((issue) => issue.severity !== "error"),
    fileType,
    detectedMimeType,
    issues
  };
}

function decodeSafeLines(bytes: Uint8Array) {
  const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes.slice(0, 4096));
  return text
    .replace(/\0/g, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 5);
}

export function createSafeImportPreview(
  inspection: ImportFileInspection,
  fileType: ImportFileType,
  detectedMimeType: string,
  issues: ImportValidationIssue[]
): SafeImportPreview {
  return {
    fileName: inspection.fileName,
    fileType,
    sizeBytes: inspection.sizeBytes,
    detectedMimeType,
    sampleTextLines: fileType === "csv" ? decodeSafeLines(inspection.headerBytes) : [],
    warnings: issues.filter((issue) => issue.severity === "warning").map((issue) => issue.message)
  };
}

export async function inspectBrowserFile(file: File): Promise<ImportFileInspection> {
  const headerBytes = new Uint8Array(await file.slice(0, 64 * 1024).arrayBuffer());
  return {
    fileName: file.name,
    declaredMimeType: file.type,
    sizeBytes: file.size,
    headerBytes
  };
}
