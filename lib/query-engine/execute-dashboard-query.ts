import type { DataRow } from "@/types/dataset";
import type { DashboardFilter, DashboardQuerySpec, DashboardViewState, QueryMetricResult, QueryResultRow, QueryWarning } from "@/types/dashboard";
import { compareDataValues, parseDateValue, parseLocaleNumber } from "@/lib/data/parse-values";

type Aggregation = NonNullable<DashboardQuerySpec["metric"]>["aggregation"];
type TimeGranularity = NonNullable<DashboardQuerySpec["x"]>["granularity"];
type NumericInvalidReason = "null" | "undefined" | "empty" | "nan" | "infinite" | "non_numeric";

type NumericParseResult =
  | { status: "valid"; value: number }
  | { status: "invalid"; reason: NumericInvalidReason };

/*
Aggregation policy:
- null, undefined, empty strings, NaN, infinities and non-numeric text are never coerced to 0.
- numeric zero, negative values, currency strings and percentage strings parsed by parseLocaleNumber are valid numbers.
- sum, avg, min and max use only valid numeric values and expose valid/excluded counts plus coverage.
- count counts rows after filters, including null or invalid field values.
- count_distinct excludes null, undefined and empty strings, then counts distinct remaining values.
- division by zero produces an indeterminate null result with a structured warning.
*/

export type ComparisonMode = "previous_period" | "previous_quarter" | "previous_year";

export interface ComparisonResult {
  current: number | null;
  previous: number | null;
  change: number | null;
  changePercent: number | null;
  warnings: QueryWarning[];
}

function parseNumericValue(value: unknown): NumericParseResult {
  if (value === null) return { status: "invalid", reason: "null" };
  if (value === undefined) return { status: "invalid", reason: "undefined" };
  if (typeof value === "number") {
    if (Number.isNaN(value)) return { status: "invalid", reason: "nan" };
    if (!Number.isFinite(value)) return { status: "invalid", reason: "infinite" };
    return { status: "valid", value };
  }
  if (typeof value === "string" && value.trim() === "") return { status: "invalid", reason: "empty" };
  const parsed = parseLocaleNumber(value);
  return parsed === null ? { status: "invalid", reason: "non_numeric" } : { status: "valid", value: parsed };
}

function warningForExcluded(reason: NumericInvalidReason, count: number, field: string | undefined, aggregation: Aggregation): QueryWarning {
  if (reason === "null" || reason === "undefined") {
    return {
      code: "null_value_excluded",
      field,
      aggregation,
      count,
      message: `${count} valor(es) nulos fueron excluidos del calculo de ${aggregation}.`
    };
  }
  if (reason === "empty") {
    return {
      code: "empty_value_excluded",
      field,
      aggregation,
      count,
      message: `${count} cadena(s) vacias fueron excluidas del calculo de ${aggregation}.`
    };
  }
  return {
    code: "numeric_value_excluded",
    field,
    aggregation,
    count,
    message: `${count} valor(es) no numericos o no finitos fueron excluidos del calculo de ${aggregation}.`
  };
}

function metricResult(input: {
  value: number | null;
  aggregation: Aggregation;
  field?: string;
  totalCount: number;
  validCount: number;
  excludedReasons?: Map<NumericInvalidReason, number>;
  extraWarnings?: QueryWarning[];
}): QueryMetricResult {
  const excludedCount = [...(input.excludedReasons?.values() ?? [])].reduce((total, count) => total + count, 0);
  const coverage = input.totalCount === 0 ? 1 : Number((input.validCount / input.totalCount).toFixed(4));
  const warnings = [
    ...(input.excludedReasons
      ? [...input.excludedReasons.entries()].map(([reason, count]) => warningForExcluded(reason, count, input.field, input.aggregation))
      : []),
    ...(input.extraWarnings ?? [])
  ];
  const state =
    input.extraWarnings?.some((warning) => warning.code === "division_by_zero")
      ? "indeterminate"
      : input.totalCount === 0
        ? "empty"
        : input.validCount === 0
          ? "invalid"
          : excludedCount > 0
            ? "partial"
            : "ok";

  return {
    value: input.value,
    state,
    totalCount: input.totalCount,
    validCount: input.validCount,
    excludedCount,
    coverage,
    warnings: input.validCount === 0 && input.totalCount > 0 && input.value === null
      ? [
          ...warnings,
          {
            code: "no_valid_numeric_values",
            field: input.field,
            aggregation: input.aggregation,
            count: input.totalCount,
            message: `No hay valores numericos validos para calcular ${input.aggregation}.`
          }
        ]
      : warnings
  };
}

function attachResult(row: QueryResultRow, result: QueryMetricResult): QueryResultRow {
  Object.defineProperties(row, {
    result: { value: result, enumerable: false, configurable: true },
    state: { value: result.state, enumerable: false, configurable: true },
    coverage: { value: result.coverage, enumerable: false, configurable: true },
    validCount: { value: result.validCount, enumerable: false, configurable: true },
    excludedCount: { value: result.excludedCount, enumerable: false, configurable: true },
    warnings: { value: result.warnings, enumerable: false, configurable: true }
  });
  return row;
}

function numericValue(value: QueryResultRow["value"]) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
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
  const left = parseNumericValue(value);
  const right = parseNumericValue(filter.value);
  if (left.status !== "valid" || right.status !== "valid") return false;
  if (filter.operator === "gt") return left.value > right.value;
  if (filter.operator === "gte") return left.value >= right.value;
  if (filter.operator === "lt") return left.value < right.value;
  if (filter.operator === "lte") return left.value <= right.value;
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

function countDistinctResult(values: unknown[], field: string | undefined, aggregation: Aggregation): QueryMetricResult {
  const excludedReasons = new Map<NumericInvalidReason, number>();
  const distinct = new Set<string>();
  for (const value of values) {
    if (value === null) excludedReasons.set("null", (excludedReasons.get("null") ?? 0) + 1);
    else if (value === undefined) excludedReasons.set("undefined", (excludedReasons.get("undefined") ?? 0) + 1);
    else if (typeof value === "string" && value.trim() === "") excludedReasons.set("empty", (excludedReasons.get("empty") ?? 0) + 1);
    else distinct.add(String(value));
  }
  const validCount = values.length - [...excludedReasons.values()].reduce((total, count) => total + count, 0);
  return metricResult({ value: distinct.size, aggregation, field, totalCount: values.length, validCount, excludedReasons });
}

function aggregate(values: unknown[], aggregation: Aggregation, field?: string): QueryMetricResult {
  if (aggregation === "count") {
    return metricResult({ value: values.length, aggregation, field, totalCount: values.length, validCount: values.length });
  }
  if (aggregation === "count_distinct") return countDistinctResult(values, field, aggregation);

  const excludedReasons = new Map<NumericInvalidReason, number>();
  const numericValues: number[] = [];
  for (const value of values) {
    const parsed = parseNumericValue(value);
    if (parsed.status === "valid") numericValues.push(parsed.value);
    else excludedReasons.set(parsed.reason, (excludedReasons.get(parsed.reason) ?? 0) + 1);
  }

  if (values.length === 0) {
    return metricResult({ value: null, aggregation, field, totalCount: 0, validCount: 0 });
  }
  if (!numericValues.length) {
    return metricResult({ value: null, aggregation, field, totalCount: values.length, validCount: 0, excludedReasons });
  }
  if (aggregation === "avg") {
    return metricResult({
      value: numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length,
      aggregation,
      field,
      totalCount: values.length,
      validCount: numericValues.length,
      excludedReasons
    });
  }
  if (aggregation === "min") {
    return metricResult({ value: Math.min(...numericValues), aggregation, field, totalCount: values.length, validCount: numericValues.length, excludedReasons });
  }
  if (aggregation === "max") {
    return metricResult({ value: Math.max(...numericValues), aggregation, field, totalCount: values.length, validCount: numericValues.length, excludedReasons });
  }
  return metricResult({
    value: numericValues.reduce((sum, value) => sum + value, 0),
    aggregation,
    field,
    totalCount: values.length,
    validCount: numericValues.length,
    excludedReasons
  });
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
    const aggregation = query.metric?.aggregation ?? "count";
    const values = field ? filtered.map((row) => row[field]) : filtered.map(() => 1);
    const result = aggregate(values, aggregation, field);
    return [attachResult({ label: aggregation, value: result.value }, result)];
  }

  const seriesField = query.x?.field ? query.seriesBy ?? query.groupBy?.find((field) => field !== query.x?.field) : undefined;
  if (query.x?.field && seriesField) {
    const metricField = query.metric?.field;
    const aggregation = query.metric?.aggregation ?? "sum";
    const xGranularity = query.x.granularity;
    const seriesGranularity = query.seriesGranularity;
    const seriesTotals = new Map<string, number>();
    const grouped = new Map<string, { label: string; sortKey: number; series: Map<string, unknown[]> }>();

    for (const row of filtered) {
      const seriesLabel = seriesGranularity ? timeLabel(row[seriesField], seriesGranularity) : String(row[seriesField] ?? "Sin valor");
      const periodLabel = xGranularity ? timeLabel(row[query.x.field], xGranularity) : String(row[query.x.field] ?? "Sin valor");
      const periodSortKey = xGranularity ? timeSortKey(row[query.x.field], xGranularity) : 0;
      const values = metricField ? [row[metricField]] : [1];
      const value = aggregate(values, aggregation, metricField).value;
      seriesTotals.set(seriesLabel, (seriesTotals.get(seriesLabel) ?? 0) + (value ?? 0));
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
        const output: QueryResultRow = { label: period.label, value: null };
        const warnings: QueryWarning[] = [];
        let total = 0;
        let hasValue = false;
        let validCount = 0;
        let excludedCount = 0;
        let totalCount = 0;
        for (const [series, values] of period.series.entries()) {
          if (!allowedSeries.has(series)) continue;
          const result = aggregate(values, aggregation, metricField);
          output[series] = result.value;
          if (result.value !== null) {
            total += result.value;
            hasValue = true;
          }
          validCount += result.validCount;
          excludedCount += result.excludedCount;
          totalCount += result.totalCount;
          warnings.push(...result.warnings);
        }
        const coverage = totalCount ? Number((validCount / totalCount).toFixed(4)) : 1;
        const state = totalCount === 0 ? "empty" : validCount === 0 ? "invalid" : excludedCount > 0 ? "partial" : "ok";
        const result: QueryMetricResult = {
          value: hasValue ? total : null,
          state,
          totalCount,
          validCount,
          excludedCount,
          coverage,
          warnings
        };
        return attachResult({ ...output, value: result.value }, result);
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
  const aggregation = query.metric?.aggregation ?? "sum";
  let result = Array.from(grouped.entries()).map(([label, groupRows]) => {
    const values = metricField ? groupRows.map((row) => row[metricField]) : groupRows.map(() => 1);
    const aggregated = aggregate(values, aggregation, metricField);
    return attachResult({ label, value: aggregated.value }, aggregated);
  });

  if (query.orderBy) {
    result = result.sort((a, b) => {
      if (query.orderBy!.field === "label") {
        return query.orderBy!.direction === "asc" ? String(a.label).localeCompare(String(b.label), "es") : String(b.label).localeCompare(String(a.label), "es");
      }
      const left = numericValue(a.value);
      const right = numericValue(b.value);
      if (left === null && right === null) return String(a.label).localeCompare(String(b.label), "es", { numeric: true });
      if (left === null) return 1;
      if (right === null) return -1;
      const diff = left - right;
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
  if (!viewState.selectedDateRange) return { current: null, previous: null, change: null, changePercent: null, warnings: [] };
  const previousRange = shiftRange(viewState.selectedDateRange, mode);
  if (!previousRange) return { current: null, previous: null, change: null, changePercent: null, warnings: [] };
  const currentResult = executeDashboardQuery(rows, query, {
    ...viewState,
    filters: [...(viewState.filters ?? []), { field: dateField, operator: "between", value: [viewState.selectedDateRange.from, viewState.selectedDateRange.to] }]
  })[0]?.result;
  const previousResult = executeDashboardQuery(rows, query, {
    ...viewState,
    selectedDateRange: undefined,
    filters: [...(viewState.filters ?? []), { field: dateField, operator: "between", value: [previousRange.from, previousRange.to] }]
  })[0]?.result;
  const current = currentResult?.value ?? null;
  const previous = previousResult?.value ?? null;
  const change = current === null || previous === null ? null : current - previous;
  return {
    current,
    previous,
    change,
    changePercent: change === null || previous === 0 || previous === null ? null : change / previous,
    warnings: [...(currentResult?.warnings ?? []), ...(previousResult?.warnings ?? [])]
  };
}

function tokenizeFormula(formula: string) {
  return formula.match(/[a-zA-Z_][a-zA-Z0-9_]*|\d+(?:\.\d+)?|[()+\-*/]/g) ?? [];
}

function precedence(token: string) {
  if (token === "+" || token === "-") return 1;
  if (token === "*" || token === "/") return 2;
  return 0;
}

function toRpn(tokens: string[]) {
  const output: string[] = [];
  const operators: string[] = [];
  for (const token of tokens) {
    if (/^\d/.test(token) || /^[a-zA-Z_]/.test(token)) output.push(token);
    else if (token === "(") operators.push(token);
    else if (token === ")") {
      while (operators.length && operators.at(-1) !== "(") output.push(operators.pop()!);
      operators.pop();
    } else {
      while (operators.length && precedence(operators.at(-1) ?? "") >= precedence(token)) output.push(operators.pop()!);
      operators.push(token);
    }
  }
  return [...output, ...operators.reverse()];
}

function invalidFormulaResult(message: string, warning: QueryWarning): QueryMetricResult {
  return {
    value: null,
    state: warning.code === "division_by_zero" ? "indeterminate" : "invalid",
    totalCount: 1,
    validCount: 0,
    excludedCount: 1,
    coverage: 0,
    warnings: [{ ...warning, message }]
  };
}

export function evaluateCalculatedMetricResult(row: DataRow, formula: string, operands: string[]): QueryMetricResult {
  if (!/^[a-zA-Z0-9_\s+\-*/().]+$/.test(formula)) {
    return invalidFormulaResult("La formula contiene caracteres no permitidos.", { code: "invalid_formula", message: "La formula contiene caracteres no permitidos." });
  }
  const aliasToOperand = new Map(operands.map((operand, index) => [`c${index}`, operand]));
  const expression = [...aliasToOperand.entries()]
    .sort((left, right) => right[1].length - left[1].length)
    .reduce((current, [alias, operand]) => current.replaceAll(operand, alias), formula);
  const allowed = new Set(aliasToOperand.keys());
  const stack: number[] = [];
  for (const token of toRpn(tokenizeFormula(expression))) {
    if (/^\d/.test(token)) stack.push(Number(token));
    else if (/^[a-zA-Z_]/.test(token)) {
      if (!allowed.has(token)) {
        return invalidFormulaResult("La formula referencia un operando no permitido.", { code: "invalid_formula", message: "La formula referencia un operando no permitido." });
      }
      const operand = aliasToOperand.get(token);
      const parsed = parseNumericValue(operand ? row[operand] : undefined);
      if (parsed.status !== "valid") {
        return invalidFormulaResult(`El operando ${operand ?? token} no tiene un valor numerico valido.`, {
          code: parsed.reason === "empty" ? "empty_value_excluded" : parsed.reason === "null" || parsed.reason === "undefined" ? "null_value_excluded" : "numeric_value_excluded",
          field: operand,
          count: 1,
          message: `El operando ${operand ?? token} no tiene un valor numerico valido.`
        });
      }
      stack.push(parsed.value);
    } else {
      const right = stack.pop();
      const left = stack.pop();
      if (left === undefined || right === undefined) {
        return invalidFormulaResult("La formula no pudo resolverse con operandos suficientes.", { code: "invalid_formula", message: "La formula no pudo resolverse con operandos suficientes." });
      }
      if (token === "+") stack.push(left + right);
      if (token === "-") stack.push(left - right);
      if (token === "*") stack.push(left * right);
      if (token === "/") {
        if (right === 0) {
          return invalidFormulaResult("Division por cero: el resultado es indeterminado.", { code: "division_by_zero", message: "Division por cero: el resultado es indeterminado." });
        }
        stack.push(left / right);
      }
    }
  }
  if (stack.length !== 1 || !Number.isFinite(stack[0])) {
    return invalidFormulaResult("La formula produjo un resultado no finito.", { code: "invalid_formula", message: "La formula produjo un resultado no finito." });
  }
  return { value: stack[0], state: "ok", totalCount: 1, validCount: 1, excludedCount: 0, coverage: 1, warnings: [] };
}

export function evaluateCalculatedMetric(row: DataRow, formula: string, operands: string[]) {
  return evaluateCalculatedMetricResult(row, formula, operands).value;
}
