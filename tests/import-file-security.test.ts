import { describe, expect, it } from "vitest";
import { detectMimeTypeFromMagicBytes, validateImportFileInspection } from "@/lib/imports/file-security";

describe("import file security validation", () => {
  it("rejects large files before browser parsing", () => {
    const result = validateImportFileInspection({
      fileName: "ventas.csv",
      declaredMimeType: "text/csv",
      sizeBytes: 251 * 1024 * 1024,
      headerBytes: new TextEncoder().encode("region,ventas\nNorte,1")
    });

    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain("file_too_large");
  });

  it("rejects damaged files when extension and magic bytes disagree", () => {
    const result = validateImportFileInspection({
      fileName: "ventas.xlsx",
      declaredMimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      sizeBytes: 2048,
      headerBytes: new TextEncoder().encode("not a workbook")
    });

    expect(result.ok).toBe(false);
    expect(result.detectedMimeType).toBe("text/plain");
    expect(result.issues.map((issue) => issue.code)).toContain("magic_bytes_mismatch");
  });

  it("rejects zip-bomb style workbooks by compression ratio", () => {
    const result = validateImportFileInspection({
      fileName: "ventas.xlsx",
      declaredMimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      sizeBytes: 1024,
      headerBytes: new Uint8Array([0x50, 0x4b, 0x03, 0x04]),
      workbook: {
        sheetCount: 1,
        compressedSizeBytes: 1_000,
        uncompressedSizeBytes: 200_000,
        archiveEntryCount: 10
      }
    });

    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain("compression_ratio_exceeded");
  });

  it("rejects malicious archive entries", () => {
    const result = validateImportFileInspection({
      fileName: "ventas.xlsx",
      declaredMimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      sizeBytes: 1024,
      headerBytes: new Uint8Array([0x50, 0x4b, 0x03, 0x04]),
      workbook: {
        sheetCount: 1,
        archiveEntryCount: 2,
        entryNames: ["xl/workbook.xml", "xl/vbaProject.bin"]
      }
    });

    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain("malicious_archive_entry");
  });

  it("detects supported magic bytes", () => {
    expect(detectMimeTypeFromMagicBytes(new Uint8Array([0x50, 0x4b, 0x03, 0x04]))).toBe("application/zip");
    expect(detectMimeTypeFromMagicBytes(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))).toBe("application/vnd.ms-excel");
  });
});
