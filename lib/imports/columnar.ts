import type { DataRow } from "@/types/dataset";
import type { ColumnarDatasetArtifact } from "@/types/imports";

function normalizeColumnOrder(rows: DataRow[]) {
  const columns = new Set<string>();
  for (const row of rows) {
    for (const column of Object.keys(row)) columns.add(column);
  }
  return Array.from(columns).sort();
}

export function convertRowsToColumnarArtifact(rows: DataRow[]): ColumnarDatasetArtifact {
  const columnNames = normalizeColumnOrder(rows);
  return {
    format: "columnar-json",
    mimeType: "application/vnd.dashpilot.columnar+json",
    rowCount: rows.length,
    columnCount: columnNames.length,
    columns: columnNames.map((name) => ({
      name,
      values: rows.map((row) => row[name] ?? null)
    }))
  };
}
