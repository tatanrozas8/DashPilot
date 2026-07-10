import type { DataRow } from "@/types/dataset";
import type { DashboardFilter, DashboardQuerySpec, DashboardViewState, QueryResultRow } from "@/types/dashboard";
import { compareDataValues, parseDateValue, parseLocaleNumber } from "@/lib/data/parse-values";

function toNumber(value: unknown) {
  return parseLocaleNumber(value) ?? 0;
}

type Aggregation = NonNullable<DashboardQuerySpec["metric"]>["aggregation"];
type TimeGranularity = NonNullable<DashboardQuerySpec["x"]>["granularity"];

function timeLabel(value: unknown, granularity: TimeGranularity) {
  const date = parseDateValue(value);
  if (!date) return String(value);
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
  if (filter.operator === "contains") return String(value ?? "").toLowerCase().includes(String(filter.value ?? "").toLowerCase());
  if (filter.operator === "in") return Array.isArray(filter.value) ? filter.value.includes(value) : true;
  if ((filter.operator === "between" || filter.operator === "range") && Array.isArray(filter.value)) {
    return compareDataValues(value, filter.value[0]) >= 0 && compareDataValues(value, filter.value[1]) <= 0;
  }
  const left = toNumber(value);
  const right = toNumber(filter.value);
  if (filter.operator === "gt") return left > right;
  if (filter.operator === "gte") return left >= right;
  if (filter.operator === "lt") return left < right;
  if (filter.operator === "lte") return left <= right;
  return true;
}

function aggregate(values: unknown[], aggregation: Aggregation) {
  if (aggregation === "count") return values.length;
  if (aggregation === "count_distinct") return new Set(values.map((value) => String(value ?? ""))).size;
  const numericValues = values.map(toNumber);
  if (numericValues.length === 0) return 0;
  if (aggregation === "avg") return numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length;
  if (aggregation === "min") return Math.min(...numericValues);
  if (aggregation === "max") return Math.max(...numericValues);
  return numericValues.reduce((sum, value) => sum + value, 0);
}

export function applyDashboardFilters(rows: DataRow[], filters: DashboardFilter[] = []) {
  return rows.filter((row) => filters.every((filter) => matchesFilter(row, filter)));
}

export function executeDashboardQuery(rows: DataRow[], query: DashboardQuerySpec = {}, viewState: DashboardViewState = { filters: [] }): QueryResultRow[] {
  const filters = [...(query.filters ?? []), ...(viewState.filters ?? [])];
  let filtered = applyDashboardFilters(rows, filters);

  if (viewState.selectedDateRange && query.x?.field) {
    filtered = filtered.filter((row) => {
      const value = row[query.x!.field];
      return compareDataValues(value, viewState.selectedDateRange!.from) >= 0 && compareDataValues(value, viewState.selectedDateRange!.to) <= 0;
    });
  }

  if (!query.groupBy?.length && !query.x?.field) {
    const field = query.metric?.field;
    const values = field ? filtered.map((row) => row[field]) : filtered.map(() => 1);
    return [{ label: query.metric?.aggregation ?? "count", value: aggregate(values, query.metric?.aggregation ?? "count") }];
  }

  const groupFields = query.x?.field ? [query.x.field] : query.groupBy ?? [];
  if (!groupFields.length) return filtered.slice(0, query.limit ?? 100);

  const grouped = new Map<string, DataRow[]>();
  for (const row of filtered) {
    const label = groupFields
      .map((field) => query.x?.granularity && field === query.x.field ? timeLabel(row[field], query.x.granularity) : String(row[field] ?? ""))
      .join(" / ");
    grouped.set(label, [...(grouped.get(label) ?? []), row]);
  }

  const metricField = query.metric?.field;
  let result = Array.from(grouped.entries()).map(([label, groupRows]) => {
    const values = metricField ? groupRows.map((row) => row[metricField]) : groupRows.map(() => 1);
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
