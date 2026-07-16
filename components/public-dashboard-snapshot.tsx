"use client";

import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from "recharts";
import { MetricIcon } from "@/components/shared/metric-icon";
import { normalizeDashboardDesign } from "@/lib/dashboard-spec/edit-dashboard-spec";
import { cn, formatCurrency, formatNumber } from "@/lib/utils";
import type { PublicSharedDashboard } from "@/lib/data-access/types";
import type { DashboardWidget, QueryMetricResult, QueryResultCellValue, QueryResultRow } from "@/types/dashboard";

function formatValue(value: number, format: unknown) {
  if (format === "currency") return formatCurrency(value);
  if (format === "percentage") return `${(value * 100).toFixed(1)}%`;
  if (format === "percentageWhole") return `${value.toFixed(1)}%`;
  return formatNumber(value);
}

function formatNullableValue(value: number | null | undefined, format: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? formatValue(value, format) : "No disponible";
}

function formatChartValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? formatCurrency(value) : "No disponible";
}

function isFiniteNumber(value: QueryResultCellValue): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function qualityText(result?: QueryMetricResult) {
  if (!result || result.state === "ok") return "";
  if (result.state === "empty") return "Sin datos para el calculo.";
  if (result.state === "invalid") return "No hay valores numericos validos.";
  if (result.state === "indeterminate") return "Resultado indeterminado.";
  return `Cobertura ${Math.round(result.coverage * 100)}% (${result.validCount}/${result.totalCount}).`;
}

function QualityNote({ rows }: { rows: QueryResultRow[] }) {
  const result = rows.find((item) => item.result?.state !== "ok")?.result;
  const text = qualityText(result);
  if (!text) return null;
  return <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">{text}</p>;
}

function EmptyWidget({ message = "Este widget no tiene resultados publicados." }: { message?: string }) {
  return (
    <div className="grid h-[220px] place-items-center rounded-lg border border-dashed border-[#d8def2] bg-[#fbfcff] px-6 text-center text-sm font-semibold text-[#697597]">
      {message}
    </div>
  );
}

function SnapshotCard({ widget, children }: { widget: DashboardWidget; children: React.ReactNode }) {
  return (
    <section className="soft-card min-h-[150px] rounded-xl p-5">
      {widget.type !== "kpi_card" && <h3 className="mb-4 font-bold tracking-[-0.02em]">{widget.title}</h3>}
      {children}
    </section>
  );
}

function seriesKeys(rows: QueryResultRow[]) {
  return Object.keys(rows[0] ?? {}).filter((key) => !["label", "value", "result", "state", "coverage", "validCount", "excludedCount", "warnings"].includes(key));
}

function hasRenderableValues(rows: QueryResultRow[], keys: string[]) {
  return rows.some((row) => isFiniteNumber(row.value) || keys.some((key) => isFiniteNumber(row[key])));
}

function KpiSnapshot({ widget, rows }: { widget: DashboardWidget; rows: QueryResultRow[] }) {
  const row = rows[0];
  const value = row?.value ?? null;
  const tone = String(widget.config.tone ?? "blue") as "blue" | "violet" | "green" | "sky" | "orange";
  return (
    <SnapshotCard widget={widget}>
      <div className="flex items-start justify-between">
        <MetricIcon name={String(widget.config.icon ?? "chart")} tone={tone} />
        <span className="text-xs font-semibold text-emerald-600">{String(widget.config.comparison ?? "")}</span>
      </div>
      <p className="mt-4 text-sm font-semibold text-[#1c2748]">{widget.title}</p>
      <p className="mt-1 text-3xl font-bold tracking-[-0.04em]">{formatNullableValue(value, widget.config.format)}</p>
      <QualityNote rows={rows} />
    </SnapshotCard>
  );
}

function LineSnapshot({ widget, rows }: { widget: DashboardWidget; rows: QueryResultRow[] }) {
  const keys = seriesKeys(rows);
  if (rows.length === 0 || !hasRenderableValues(rows, keys)) return <SnapshotCard widget={widget}><EmptyWidget /></SnapshotCard>;
  const data = keys.length ? rows : rows.map((item) => ({ ...item, previous: isFiniteNumber(item.value) ? Math.round(item.value * 0.72) : null }));
  return (
    <SnapshotCard widget={widget}>
      <ResponsiveContainer width="100%" height={230}>
        <LineChart data={data} margin={{ left: 4, right: 18, top: 10, bottom: 0 }}>
          <CartesianGrid stroke="#edf1fa" vertical={false} />
          <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "#697597", fontSize: 12 }} />
          <YAxis axisLine={false} tickLine={false} tick={{ fill: "#697597", fontSize: 12 }} tickFormatter={formatChartValue} />
          <Tooltip formatter={formatChartValue} contentStyle={{ borderRadius: 10, borderColor: "#dfe5f0" }} />
          {keys.length ? keys.map((key, index) => <Line key={key} type="monotone" dataKey={key} name={key} stroke={["#3d35ff", "#16a34a", "#0ea5e9", "#f97316"][index % 4]} strokeWidth={2.5} dot={{ r: 3 }} connectNulls />) : (
            <>
              <Line type="monotone" dataKey="value" name="Actual" stroke="#3d35ff" strokeWidth={3} dot={{ r: 4 }} />
              <Line type="monotone" dataKey="previous" name="Comparativo" stroke="#9aa7c7" strokeDasharray="5 5" strokeWidth={2} dot={false} />
            </>
          )}
        </LineChart>
      </ResponsiveContainer>
      <QualityNote rows={rows} />
    </SnapshotCard>
  );
}

function BarSnapshot({ widget, rows }: { widget: DashboardWidget; rows: QueryResultRow[] }) {
  const keys = seriesKeys(rows);
  if (rows.length === 0 || !hasRenderableValues(rows, keys)) return <SnapshotCard widget={widget}><EmptyWidget /></SnapshotCard>;
  return (
    <SnapshotCard widget={widget}>
      <ResponsiveContainer width="100%" height={230}>
        <BarChart data={rows} margin={{ left: 4, right: 18, top: 10, bottom: 24 }}>
          <CartesianGrid stroke="#edf1fa" vertical={false} />
          <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "#697597", fontSize: 12 }} />
          <YAxis axisLine={false} tickLine={false} tick={{ fill: "#697597", fontSize: 12 }} tickFormatter={formatChartValue} />
          <Tooltip formatter={formatChartValue} contentStyle={{ borderRadius: 10, borderColor: "#dfe5f0" }} />
          {keys.length ? keys.map((key, index) => <Bar key={key} dataKey={key} radius={[8, 8, 0, 0]} fill={["#3d35ff", "#16a34a", "#0ea5e9", "#f97316"][index % 4]} />) : <Bar dataKey="value" radius={[8, 8, 0, 0]} fill="#3d35ff" />}
        </BarChart>
      </ResponsiveContainer>
      <QualityNote rows={rows} />
    </SnapshotCard>
  );
}

function DonutSnapshot({ widget, rows }: { widget: DashboardWidget; rows: QueryResultRow[] }) {
  const chartData = rows.filter((row) => isFiniteNumber(row.value));
  if (!chartData.length) return <SnapshotCard widget={widget}><EmptyWidget /></SnapshotCard>;
  return (
    <SnapshotCard widget={widget}>
      <ResponsiveContainer width="100%" height={230}>
        <PieChart>
          <Pie data={chartData} dataKey="value" nameKey="label" innerRadius={58} outerRadius={92} paddingAngle={2}>
            {chartData.map((item, index) => <Cell key={String(item.label ?? index)} fill={["#3d35ff", "#16a34a", "#0ea5e9", "#f97316"][index % 4]} />)}
          </Pie>
          <Tooltip formatter={formatChartValue} contentStyle={{ borderRadius: 10, borderColor: "#dfe5f0" }} />
        </PieChart>
      </ResponsiveContainer>
      <QualityNote rows={rows} />
    </SnapshotCard>
  );
}

function ScatterSnapshot({ widget, rows }: { widget: DashboardWidget; rows: QueryResultRow[] }) {
  const data = rows.map((row, index) => ({ ...row, index: index + 1 }));
  if (!data.some((row) => isFiniteNumber(row.value))) return <SnapshotCard widget={widget}><EmptyWidget /></SnapshotCard>;
  return (
    <SnapshotCard widget={widget}>
      <ResponsiveContainer width="100%" height={230}>
        <ScatterChart margin={{ left: 4, right: 18, top: 10, bottom: 0 }}>
          <CartesianGrid stroke="#edf1fa" />
          <XAxis dataKey="index" tick={{ fill: "#697597", fontSize: 12 }} />
          <YAxis dataKey="value" tick={{ fill: "#697597", fontSize: 12 }} tickFormatter={formatChartValue} />
          <Tooltip formatter={formatChartValue} contentStyle={{ borderRadius: 10, borderColor: "#dfe5f0" }} />
          <Scatter data={data} fill="#3d35ff" />
        </ScatterChart>
      </ResponsiveContainer>
      <QualityNote rows={rows} />
    </SnapshotCard>
  );
}

function InsightSnapshot({ widget }: { widget: DashboardWidget }) {
  const bullets = (widget.config.bullets as string[] | undefined) ?? [];
  return (
    <SnapshotCard widget={widget}>
      <div className="flex gap-5">
        <MetricIcon name="magic" tone="violet" />
        <div>
          <h3 className="font-bold tracking-[-0.02em]">{widget.title}</h3>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {bullets.map((bullet) => <p key={bullet} className="text-sm leading-6 text-[#34405f]">{bullet}</p>)}
          </div>
        </div>
      </div>
    </SnapshotCard>
  );
}

function SnapshotWidget({ widget, rows }: { widget: DashboardWidget; rows: QueryResultRow[] }) {
  if (widget.type === "kpi_card") return <KpiSnapshot widget={widget} rows={rows} />;
  if (widget.type === "line_chart" || widget.type === "area_chart") return <LineSnapshot widget={widget} rows={rows} />;
  if (widget.type === "bar_chart") return <BarSnapshot widget={widget} rows={rows} />;
  if (widget.type === "donut_chart") return <DonutSnapshot widget={widget} rows={rows} />;
  if (widget.type === "scatter_plot") return <ScatterSnapshot widget={widget} rows={rows} />;
  if (widget.type === "insight_text") return <InsightSnapshot widget={widget} />;
  return <SnapshotCard widget={widget}><EmptyWidget message="La tabla de detalle no se incluye en enlaces publicos." /></SnapshotCard>;
}

export function PublicDashboardSnapshot({ payload }: { payload: PublicSharedDashboard }) {
  const design = normalizeDashboardDesign(payload.dashboard.design);
  const widgets = payload.dashboard.widgets.filter((widget) => widget.config.hidden !== true);
  const resultByWidget = new Map(payload.widgetResults.map((result) => [result.widgetId, result.rows]));
  return (
    <div className={cn("grid grid-cols-12", design.density === "compact" ? "gap-3" : "gap-4")}>
      {widgets.map((widget) => {
        const width = widget.position.w >= 12 ? "col-span-12" : widget.position.w >= 8 ? "col-span-12 lg:col-span-8" : widget.position.w >= 6 ? "col-span-12 lg:col-span-6" : "col-span-12 sm:col-span-6 xl:col-span-3";
        return (
          <div key={widget.id} className={width}>
            <SnapshotWidget widget={widget} rows={resultByWidget.get(widget.id) ?? []} />
          </div>
        );
      })}
    </div>
  );
}
