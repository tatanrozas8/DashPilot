import type { DataRow, DatasetProfile } from "@/types/dataset";
import type { DashboardFilter } from "@/types/dashboard";
import { applyDashboardFilters } from "@/lib/query-engine/execute-dashboard-query";
import { slugify } from "@/lib/utils";

export interface TableQueryState {
  search?: string;
  columns?: string[];
  filters?: DashboardFilter[];
  sort?: {
    field: string;
    direction: "asc" | "desc";
  };
}

function valueText(value: unknown) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function compareValues(left: unknown, right: unknown) {
  const leftNumber = typeof left === "number" ? left : Number(String(left ?? "").replace(/[$,%\s]/g, "").replace(",", "."));
  const rightNumber = typeof right === "number" ? right : Number(String(right ?? "").replace(/[$,%\s]/g, "").replace(",", "."));
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) return leftNumber - rightNumber;
  return String(left ?? "").localeCompare(String(right ?? ""), "es", { numeric: true, sensitivity: "base" });
}

export function searchRows(rows: DataRow[], query = "", columns?: string[]) {
  const needle = valueText(query).trim();
  if (!needle) return rows;
  const searchableColumns = columns?.length ? columns : Object.keys(rows[0] ?? {});
  return rows.filter((row) => searchableColumns.some((column) => valueText(row[column]).includes(needle)));
}

export function selectColumns(rows: DataRow[], columns: string[]) {
  if (!columns.length) return rows;
  return rows.map((row) =>
    columns.reduce<DataRow>((selected, column) => {
      selected[column] = row[column];
      return selected;
    }, {})
  );
}

export function sortRows(rows: DataRow[], sort?: TableQueryState["sort"]) {
  if (!sort) return rows;
  return [...rows].sort((left, right) => {
    const diff = compareValues(left[sort.field], right[sort.field]);
    return sort.direction === "asc" ? diff : -diff;
  });
}

export function queryTableRows(rows: DataRow[], state: TableQueryState) {
  const filtered = searchRows(applyDashboardFilters(rows, state.filters ?? []), state.search);
  const sorted = sortRows(filtered, state.sort);
  return {
    rows: selectColumns(sorted, state.columns ?? []),
    totalRows: rows.length,
    filteredRows: sorted.length
  };
}

export function findSimilarColumns(profile: DatasetProfile, raw: string, limit = 5) {
  const target = slugify(raw);
  return profile.columns
    .map((column) => {
      const text = slugify(`${column.originalName} ${column.displayName} ${column.normalizedName}`);
      const confidence = text.includes(target) || target.includes(slugify(column.normalizedName))
        ? 0.9
        : target.split("_").filter(Boolean).filter((part) => text.includes(part)).length / Math.max(1, target.split("_").filter(Boolean).length);
      return { column, confidence };
    })
    .filter((match) => match.confidence > 0)
    .sort((left, right) => right.confidence - left.confidence)
    .slice(0, limit);
}
