"use client";

import type { ExportArtifact } from "@/lib/export/renderers";

export function downloadExportArtifact(artifact: ExportArtifact) {
  if (!artifact.bytes.byteLength) throw new Error("La exportacion no genero bytes descargables.");
  const blob = new Blob([artifact.bytes as BlobPart], { type: artifact.mimeType });
  if (blob.size <= 0) throw new Error("El archivo exportado esta vacio.");
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = artifact.fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
