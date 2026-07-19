import type { DashboardAction, DashboardPage, DashboardWidget } from "@/types/dashboard";
import type { BusinessIntentResolution, DashboardBlueprint, DatasetIntelligence, VisualizationRecommendation } from "@/lib/copilot-bi/types";
import { planAnalyticalQueries, tableQueryPlan } from "@/lib/copilot-bi/analytical-query-planner";
import { generateComputedInsights } from "@/lib/copilot-bi/insight-engine";
import { layoutWidgets } from "@/lib/copilot-bi/layout-planner";
import { buildSummaryTableWidget } from "@/lib/copilot-bi/table-builder";
import { dashboardSubtitle, dashboardTitle, narrativeBullets } from "@/lib/copilot-bi/title-narrative-generator";
import { recommendVisualizations, visualFormat } from "@/lib/copilot-bi/visualization-recommender";
import type { DataRow } from "@/types/dataset";

function nextId(existingIds: Set<string>, prefix: string) {
  let index = existingIds.size + 1;
  let id = `${prefix}_${index}`;
  while (existingIds.has(id)) {
    index += 1;
    id = `${prefix}_${index}`;
  }
  existingIds.add(id);
  return id;
}

function widgetFromRecommendation(recommendation: VisualizationRecommendation, id: string, position: DashboardWidget["position"]): DashboardWidget {
  return {
    id,
    type: recommendation.type,
    title: recommendation.title,
    description: recommendation.reason,
    query: recommendation.query,
    config: {
      format: visualFormat(recommendation.metric),
      generatedBy: "copilot-bi",
      visualConfig: recommendation.type === "bar_chart" ? { orientation: "horizontal", legend: Boolean(recommendation.series) } : recommendation.type === "line_chart" ? { legend: Boolean(recommendation.series) } : undefined,
      horizontal: recommendation.type === "bar_chart"
    },
    position
  };
}

function insightWidget(id: string, bullets: string[], position: DashboardWidget["position"]): DashboardWidget {
  return {
    id,
    type: "insight_text",
    title: "Resumen ejecutivo con evidencia",
    description: "Narrativa generada desde perfil, queries planificadas e insights computados.",
    config: { bullets, generatedBy: "copilot-bi" },
    position
  };
}

function filterNames(intelligence: DatasetIntelligence) {
  return intelligence.filters.slice(0, 5).map((filter) => filter.label);
}

function pageWidget(widget: DashboardWidget) {
  return { id: widget.id, type: widget.type, title: widget.title, reason: widget.description ?? "Visual recomendado por el motor BI." };
}

function buildPages(input: { audience: BusinessIntentResolution["audience"]; widgets: DashboardWidget[] }): DashboardBlueprint["pages"] {
  const executiveWidgets = input.widgets.filter((widget) => widget.type === "kpi_card" || widget.type === "insight_text");
  const operationalWidgets = input.widgets.filter((widget) => !["kpi_card", "table", "insight_text"].includes(widget.type));
  const detailWidgets = input.widgets.filter((widget) => widget.type === "table");
  return [
    {
      title: input.audience === "executive" ? "Vista ejecutiva" : "Vista principal",
      purpose: "KPIs, tendencia y resumen con evidencia.",
      widgets: executiveWidgets.map(pageWidget)
    },
    {
      title: "Vista operacional",
      purpose: "Comparaciones, tendencias y segmentos accionables.",
      widgets: operationalWidgets.map(pageWidget)
    },
    {
      title: "Detalle",
      purpose: "Tabla resumen y drilldown controlado por QueryService.",
      widgets: detailWidgets.map(pageWidget)
    }
  ];
}

function dashboardPagesFromBlueprint(pages: DashboardBlueprint["pages"]): DashboardPage[] {
  return pages.map((page, index) => ({
    id: index === 0 ? "page_executive" : index === 1 ? "page_operational" : "page_detail",
    title: page.title,
    order: index,
    layout: { mode: "grid_12", columns: 12 },
    filters: [],
    widgetIds: page.widgets.map((widget) => widget.id)
  }));
}

export function buildDashboardBlueprint(input: {
  intent: BusinessIntentResolution;
  intelligence: DatasetIntelligence;
  rows?: DataRow[];
  existingWidgetIds?: string[];
}): DashboardBlueprint {
  const { intent, intelligence } = input;
  const metric = intelligence.primaryMetric;
  const dimension = intent.requestedDimensions.includes("geography") ? intelligence.geographies[0] ?? intelligence.primaryDimension : intelligence.primaryDimension;
  const date = intelligence.primaryDate;
  const ids = new Set(input.existingWidgetIds ?? []);
  const recommendations = recommendVisualizations(intent, intelligence);
  const widgets = recommendations.map((recommendation) => widgetFromRecommendation(recommendation, nextId(ids, `bi_${recommendation.type}`), { x: 0, y: 0, w: 6, h: 3 }));
  const table = buildSummaryTableWidget({
    id: nextId(ids, "bi_table"),
    intelligence,
    metric,
    dimension,
    limit: intent.requestedLimit ?? 10,
    position: { x: 0, y: 0, w: 8, h: 3 }
  });
  const queryPlans = [
    ...planAnalyticalQueries(intelligence, recommendations),
    ...(tableQueryPlan(intelligence, metric, dimension, intent.requestedLimit ?? 10) ? [tableQueryPlan(intelligence, metric, dimension, intent.requestedLimit ?? 10)!] : [])
  ];
  const insights = generateComputedInsights({ rows: input.rows, intelligence, metric, dimension, queryPlans });
  const narrative = narrativeBullets({ intelligence, metric, dimension, date });
  const insight = insightWidget(
    nextId(ids, "bi_insight"),
    [...narrative, ...insights.map((item) => `${item.text} Evidencia: ${item.evidenceId}.`)].slice(0, 6),
    { x: 0, y: 0, w: 12, h: 2 }
  );
  const laidOut = layoutWidgets([...widgets, ...(table ? [table] : []), insight]);
  const title = dashboardTitle({ audience: intent.audience, intelligence, metric });
  const subtitle = dashboardSubtitle({ intelligence, metric, dimension, date });
  const actions: DashboardAction[] = [
    { type: "update_dashboard_title", title },
    { type: "update_dashboard_subtitle", subtitle },
    { type: "update_dashboard_design", design: { density: "compact", accentColor: "slate", cardStyle: "bordered", chartPalette: "business" } },
    ...laidOut.map((widget) => ({ type: "add_widget" as const, widget }))
  ];
  const pages = buildPages({ audience: intent.audience, widgets: laidOut });
  const dashboardPages = dashboardPagesFromBlueprint(pages);
  actions.push({ type: "set_dashboard_pages", pages: dashboardPages });

  return {
    title,
    subtitle,
    audience: intent.audience,
    pages,
    filters: filterNames(intelligence),
    narrative,
    warnings: intelligence.qualityWarnings.slice(0, 4),
    queryPlans,
    insights,
    actions
  };
}
