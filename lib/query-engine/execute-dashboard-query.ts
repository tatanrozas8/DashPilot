import type { DataRow } from "@/types/dataset";
import type { DashboardFilter, DashboardQuerySpec, DashboardViewState, QueryResultRow } from "@/types/dashboard";

function toNumber(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return 0;
  return Number(value.replace(/[$,%\s]/g, "").replace(",", ".")) || 0;
}

type Aggregation = NonNullable<DashboardQuerySpec["metric"]>["aggregation"];
type TimeGranularity = NonNullable<DashboardQuerySpec["x"]>["granularity"];

function timeLabel(value: unknown, granularity: TimeGranularity) {
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  if (granularity === "day") return date.toISOString().slice(0, 10);
  if (granularity === "week") {
    const firstDay = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    const dayOffset = Math.floor((date.getTime() - firstDay.getTime()) / 86400000);
    return `${date.getUTCFullYear()}-S${String(Math.ceil((dayOffset + firstDay.getUTCDay() + 1) / 7)).padStart(2, "0")}`;
  }
  if (granularity === "quarter") return `Q${Math.floor(date.getUTCMonth() / 3) + 1} ${date.getUTCFullYear()}`;
  if (granularity === "year") return String(date.getUTCFullYear());
  return new Intl.DateTimeFormat("es", { month: "short", year: "2-digit", timeZone: "UTC" }).format(date).replace(".", "");
}

function matchesFilter(row: DataRow, filter: DashboardFilter) {
  const value = row[filter.field];
  if (filter.operator === "eq") return value === filter.value;
  if (filter.operator === "neq") return value !== filter.value;
  if (filter.operator === "in") return Array.isArray(filter.value) ? filter.value.includes(value) : true;
  if (filter.operator === "between" && Array.isArray(filter.value)) {
    const raw = String(value);
    return raw >= String(filter.value[0]) && raw <= String(filter.value[1]);
  }
  const left = toNumber(value);
  const right = toNumber(filter.value);
  if (filter.operator === "gt") return left > right;
  if (filter.operator === "gte") return left >= right;
  if (filter.operator === "lt") return left < right;
  if (filter.operator === "lte") return left <= right;
  return true;
}

function aggregate(values: number[], aggregation: Aggregation) {
  if (aggregation === "count") return values.length;
  if (values.length === 0) return 0;
  if (aggregation === "avg") return values.reduce((sum, value) => sum + value, 0) / values.length;
  if (aggregation === "min") return Math.min(...values);
  if (aggregation === "max") return Math.max(...values);
  return values.reduce((sum, value) => sum + value, 0);
}

export function applyDashboardFilters(rows: DataRow[], filters: DashboardFilter[] = []) {
  return rows.filter((row) => filters.every((filter) => matchesFilter(row, filter)));
}

export function executeDashboardQuery(rows: DataRow[], query: DashboardQuerySpec = {}, viewState: DashboardViewState = { filters: [] }): QueryResultRow[] {
  const filters = [...(query.filters ?? []), ...(viewState.filters ?? [])];
  let filtered = applyDashboardFilters(rows, filters);

  if (viewState.selectedDateRange && query.x?.field) {
    filtered = filtered.filter((row) => {
      const value = String(row[query.x!.field]);
      return value >= viewState.selectedDateRange!.from && value <= viewState.selectedDateRange!.to;
    });
  }

  if (!query.groupBy?.length && !query.x?.field) {
    const field = query.metric?.field;
    const values = field ? filtered.map((row) => toNumber(row[field])) : filtered.map(() => 1);
    return [{ label: query.metric?.aggregation ?? "count", value: aggregate(values, query.metric?.aggregation ?? "count") }];
  }

  const groupField = query.x?.field ?? query.groupBy?.[0];
  if (!groupField) return filtered.slice(0, query.limit ?? 100);

  const grouped = new Map<string, DataRow[]>();
  for (const row of filtered) {
    const label = query.x?.granularity ? timeLabel(row[groupField], query.x.granularity) : String(row[groupField]);
    grouped.set(label, [...(grouped.get(label) ?? []), row]);
  }

  const metricField = query.metric?.field;
  let result = Array.from(grouped.entries()).map(([label, groupRows]) => {
    const values = metricField ? groupRows.map((row) => toNumber(row[metricField])) : groupRows.map(() => 1);
    return { label, value: aggregate(values, query.metric?.aggregation ?? "sum") };
  });

  if (query.orderBy) {
    result = result.sort((a, b) => {
      const left = query.orderBy!.field === "label" ? a.label : a.value;
      const right = query.orderBy!.field === "label" ? b.label : b.value;
      const diff = toNumber(left) - toNumber(right);
      return query.orderBy!.direction === "asc" ? diff : -diff;
    });
  }

  return result.slice(0, query.limit ?? result.length);
}
