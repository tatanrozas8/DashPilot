import type { DataRow } from "@/types/dataset";
import type { DashboardFilter, DashboardQuerySpec, DashboardViewState, QueryResultRow } from "@/types/dashboard";
import { compareDataValues, parseDateValue, parseLocaleNumber } from "@/lib/data/parse-values";

function toNumber(value: unknown) {
  return parseLocaleNumber(value) ?? 0;
}

type Aggregation = NonNullable<DashboardQuerySpec["metric"]>["aggregation"];
type TimeGranularity = NonNullable<DashboardQuerySpec["x"]>["granularity"];

export type ComparisonMode = "previous_period" | "previous_quarter" | "previous_year";

export interface ComparisonResult {
  current: number;
  previous: number;
  change: number;
  changePercent: number | null;
}

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

function timeSortKey(value: unknown, granularity: TimeGranularity) {
  const date = parseDateValue(value);
  if (!date) return Number.MAX_SAFE_INTEGER;
  if (granularity === "year") return Date.UTC(date.getUTCFullYear(), 0, 1);
  if (granularity === "quarter") return Date.UTC(date.getUTCFullYear(), Math.floor(date.getUTCMonth() / 3) * 3, 1);
  if (granularity === "month") return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
  if (granularity === "week") {
    const firstDay = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    const dayOffset = Math.floor((date.getTime() - firstDay.getTime()) / 86400000);
    const week = Math.ceil((dayOffset + firstDay.getUTCDay() + 1) / 7);
    return Date.UTC(date.getUTCFullYear(), 0, week * 7);
  }
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
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

function isActiveFilter(filter: DashboardFilter) {
  if (!filter.field) return false;
  if (filter.operator === "in") return Array.isArray(filter.value) && filter.value.length > 0;
  if (filter.operator === "between" || filter.operator === "range") {
    return Array.isArray(filter.value) && filter.value.length >= 2 && filter.value[0] !== "" && filter.value[1] !== "";
  }
  if (filter.operator === "contains") return String(filter.value ?? "").trim().length > 0;
  return filter.value !== undefined && filter.value !== null && String(filter.value).trim().length > 0;
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
  const activeFilters = filters.filter(isActiveFilter);
  if (!activeFilters.length) return rows;
  return rows.filter((row) => activeFilters.every((filter) => matchesFilter(row, filter)));
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

  const seriesField = query.x?.field ? query.seriesBy ?? query.groupBy?.find((field) => field !== query.x?.field) : undefined;
  if (query.x?.field && seriesField) {
    const metricField = query.metric?.field;
    const xGranularity = query.x.granularity;
    const seriesGranularity = query.seriesGranularity;
    const seriesTotals = new Map<string, number>();
    const grouped = new Map<string, { label: string; sortKey: number; series: Map<string, unknown[]> }>();

    for (const row of filtered) {
      const seriesLabel = seriesGranularity ? timeLabel(row[seriesField], seriesGranularity) : String(row[seriesField] ?? "Sin valor");
      const periodLabel = xGranularity ? timeLabel(row[query.x.field], xGranularity) : String(row[query.x.field] ?? "Sin valor");
      const periodSortKey = xGranularity ? timeSortKey(row[query.x.field], xGranularity) : 0;
      const values = metricField ? [row[metricField]] : [1];
      seriesTotals.set(seriesLabel, (seriesTotals.get(seriesLabel) ?? 0) + aggregate(values, query.metric?.aggregation ?? "sum"));
      const period = grouped.get(periodLabel) ?? { label: periodLabel, sortKey: periodSortKey, series: new Map<string, unknown[]>() };
      period.series.set(seriesLabel, [...(period.series.get(seriesLabel) ?? []), ...values]);
      grouped.set(periodLabel, period);
    }

    const allowedSeries = new Set(
      [...seriesTotals.entries()]
        .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], "es"))
        .slice(0, query.limit ?? seriesTotals.size)
        .map(([series]) => series)
    );

    return [...grouped.values()]
      .sort((left, right) => left.sortKey - right.sortKey || left.label.localeCompare(right.label, "es", { numeric: true }))
      .map((period) => {
        const output: QueryResultRow = { label: period.label, value: 0 };
        for (const [series, values] of period.series.entries()) {
          if (!allowedSeries.has(series)) continue;
          const value = aggregate(values, query.metric?.aggregation ?? "sum");
          output[series] = value;
          output.value = Number(output.value ?? 0) + value;
        }
        return output;
      });
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

function rangeDates(range: NonNullable<DashboardViewState["selectedDateRange"]>) {
  const from = parseDateValue(range.from);
  const to = parseDateValue(range.to);
  return from && to ? { from, to } : null;
}

function shiftRange(range: NonNullable<DashboardViewState["selectedDateRange"]>, mode: ComparisonMode) {
  const parsed = rangeDates(range);
  if (!parsed) return undefined;
  const from = new Date(parsed.from);
  const to = new Date(parsed.to);
  if (mode === "previous_year") {
    from.setUTCFullYear(from.getUTCFullYear() - 1);
    to.setUTCFullYear(to.getUTCFullYear() - 1);
  } else if (mode === "previous_quarter") {
    from.setUTCMonth(from.getUTCMonth() - 3);
    to.setUTCMonth(to.getUTCMonth() - 3);
  } else {
    const duration = to.getTime() - from.getTime();
    to.setTime(from.getTime() - 86_400_000);
    from.setTime(to.getTime() - duration);
  }
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

export function executeComparisonQuery(rows: DataRow[], query: DashboardQuerySpec, viewState: DashboardViewState, dateField: string, mode: ComparisonMode = "previous_period"): ComparisonResult {
  if (!viewState.selectedDateRange) return { current: 0, previous: 0, change: 0, changePercent: null };
  const previousRange = shiftRange(viewState.selectedDateRange, mode);
  if (!previousRange) return { current: 0, previous: 0, change: 0, changePercent: null };
  const current = executeDashboardQuery(rows, query, {
    ...viewState,
    filters: [...(viewState.filters ?? []), { field: dateField, operator: "between", value: [viewState.selectedDateRange.from, viewState.selectedDateRange.to] }]
  })[0]?.value ?? 0;
  const previous = executeDashboardQuery(rows, query, {
    ...viewState,
    selectedDateRange: undefined,
    filters: [...(viewState.filters ?? []), { field: dateField, operator: "between", value: [previousRange.from, previousRange.to] }]
  })[0]?.value ?? 0;
  const change = current - previous;
  return { current, previous, change, changePercent: previous === 0 ? null : change / previous };
}

function tokenizeFormula(formula: string) {
  return formula.match(/[a-zA-Z_][a-zA-Z0-9_]*|\d+(?:\.\d+)?|[()+\-*/]/g) ?? [];
}

function toRpn(tokens: string[]) {
  const precedence: Record<string, number> = { "+": 1, "-": 1, "*": 2, "/": 2 };
  const output: string[] = [];
  const operators: string[] = [];
  for (const token of tokens) {
    if (/^\d/.test(token) || /^[a-zA-Z_]/.test(token)) output.push(token);
    else if (token === "(") operators.push(token);
    else if (token === ")") {
      while (operators.length && operators.at(-1) !== "(") output.push(operators.pop()!);
      operators.pop();
    } else {
      while (operators.length && precedence[operators.at(-1)!] >= precedence[token]) output.push(operators.pop()!);
      operators.push(token);
    }
  }
  return [...output, ...operators.reverse()];
}

export function evaluateCalculatedMetric(row: DataRow, formula: string, operands: string[]) {
  if (!/^[a-zA-Z0-9_\s+\-*/().]+$/.test(formula)) return null;
  const aliasToOperand = new Map(operands.map((operand, index) => [`c${index}`, operand]));
  const expression = [...aliasToOperand.entries()]
    .sort((left, right) => right[1].length - left[1].length)
    .reduce((current, [alias, operand]) => current.replaceAll(operand, alias), formula);
  const allowed = new Set(aliasToOperand.keys());
  const stack: number[] = [];
  for (const token of toRpn(tokenizeFormula(expression))) {
    if (/^\d/.test(token)) stack.push(Number(token));
    else if (/^[a-zA-Z_]/.test(token)) {
      if (!allowed.has(token)) return null;
      stack.push(parseLocaleNumber(row[aliasToOperand.get(token)!]) ?? 0);
    } else {
      const right = stack.pop();
      const left = stack.pop();
      if (left === undefined || right === undefined) return null;
      if (token === "+") stack.push(left + right);
      if (token === "-") stack.push(left - right);
      if (token === "*") stack.push(left * right);
      if (token === "/") stack.push(right === 0 ? 0 : left / right);
    }
  }
  return stack.length === 1 && Number.isFinite(stack[0]) ? stack[0] : null;
}
