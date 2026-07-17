import { describe, expect, it } from "vitest";
import {
  addWidgetToPage,
  createDashboardPage,
  dashboardRevisionToDashboardSpec,
  migrateDashboardSpecV1ToV2,
  publishDashboardRevision,
  reorderDashboardPages,
  resolveTargetFromRevision,
  validateDashboardDocument
} from "@/lib/dashboard-spec/model-v2";
import { generatePresentationSpec } from "@/lib/presentation-spec/generate-presentation-spec";
import { dashboardDocumentSchema } from "@/lib/validation/schemas";
import type { DashboardDocument, DashboardRevision, DashboardSpec, WidgetSpec } from "@/types/dashboard";

function v1Dashboard(): DashboardSpec {
  return {
    id: "dashboard_sales",
    title: "Ventas",
    subtitle: "Resumen comercial",
    datasetId: "dataset-1",
    datasetVersionId: "version-1",
    semanticModelId: "semantic-model-1",
    globalFilters: [{ id: "date", field: "fecha", label: "Fecha", type: "date_range" }],
    widgets: [
      {
        id: "kpi_sales",
        type: "kpi_card",
        title: "Ventas",
        query: { metric: { field: "ventas", aggregation: "sum" }, metricId: "metric.revenue" },
        lineage: {
          semanticModelId: "semantic-model-1",
          datasetVersionId: "version-1",
          metricIds: ["metric.revenue"],
          calculatedMetricIds: [],
          dimensionIds: [],
          timeDimensionIds: [],
          sourceColumnIds: ["ventas"],
          filters: [],
          migratedAt: "2026-07-17T00:00:00.000Z",
          warnings: []
        },
        config: { format: "currency", tone: "blue", fallbackValue: 1000, queryWarnings: [] },
        position: { x: 0, y: 0, w: 3, h: 1 }
      },
      {
        id: "sales_by_region",
        type: "bar_chart",
        title: "Ventas por region",
        query: {
          metric: { field: "ventas", aggregation: "sum" },
          metricId: "metric.revenue",
          groupBy: ["region"],
          dimensionIds: ["dimension.geo.region"],
          filters: [{ field: "canal", operator: "eq", value: "Retail" }],
          orderBy: { field: "value", direction: "desc" },
          limit: 5
        },
        lineage: {
          semanticModelId: "semantic-model-1",
          datasetVersionId: "version-1",
          metricIds: ["metric.revenue"],
          calculatedMetricIds: [],
          dimensionIds: ["dimension.geo.region"],
          timeDimensionIds: [],
          sourceColumnIds: ["ventas", "region"],
          filters: [{ field: "canal", operator: "eq", value: "Retail" }],
          migratedAt: "2026-07-17T00:00:00.000Z",
          warnings: []
        },
        config: { format: "currency", visualConfig: { orientation: "horizontal" }, horizontal: true },
        position: { x: 3, y: 0, w: 6, h: 3 }
      }
    ],
    executiveSummary: "Ventas por region.",
    createdAt: "2026-07-17T00:00:00.000Z",
    updatedAt: "2026-07-17T00:00:00.000Z"
  };
}

function documentV2() {
  return migrateDashboardSpecV1ToV2(v1Dashboard(), {
    semanticModelId: "semantic-model-1",
    datasetVersionId: "version-1",
    createdBy: "user-1",
    now: new Date("2026-07-17T00:00:00.000Z")
  });
}

function draftFrom(document: DashboardDocument): DashboardRevision {
  const published = document.revisions[0]!;
  return {
    ...published,
    id: "dashboard_sales_rev_2",
    revisionNumber: 2,
    status: "draft",
    mutable: true,
    publishedAt: undefined,
    pages: published.pages.map((page) => ({ ...page, widgetIds: [...page.widgetIds], filters: [...page.filters] })),
    widgets: published.widgets.map((widget) => ({ ...widget, layout: { ...widget.layout }, visual: { ...widget.visual }, query: widget.query ? { ...widget.query, filters: [...widget.query.filters], dimensionIds: [...widget.query.dimensionIds] } : undefined }))
  };
}

function profitabilityWidget(pageId: string): WidgetSpec {
  return {
    id: "profitability_by_region",
    type: "bar_chart",
    title: "Rentabilidad por region",
    query: {
      metricId: "metric.margin",
      dimensionIds: ["dimension.geo.region"],
      filters: [{ field: "margen", operator: "gte", value: 0 }],
      orderBy: { field: "value", direction: "desc" },
      limit: 10,
      legacyQuery: {
        metric: { field: "margen", aggregation: "avg" },
        metricId: "metric.margin",
        groupBy: ["region"],
        dimensionIds: ["dimension.geo.region"],
        filters: [{ field: "margen", operator: "gte", value: 0 }],
        orderBy: { field: "value", direction: "desc" },
        limit: 10
      }
    },
    visual: { format: "percentage", visualConfig: { orientation: "horizontal" }, horizontal: true },
    layout: { pageId, x: 0, y: 0, w: 6, h: 3 },
    lineage: {
      semanticModelId: "semantic-model-1",
      datasetVersionId: "version-1",
      metricIds: ["metric.margin"],
      calculatedMetricIds: [],
      dimensionIds: ["dimension.geo.region"],
      timeDimensionIds: [],
      sourceColumnIds: ["margen", "region"],
      filters: [{ field: "margen", operator: "gte", value: 0 }],
      migratedAt: "2026-07-17T00:00:00.000Z",
      warnings: []
    }
  };
}

describe("dashboard v2 model", () => {
  it("migrates v1 specs to a published immutable revision with pages", () => {
    const document = documentV2();
    const revision = document.revisions[0]!;

    expect(document.dashboard.publishedRevisionId).toBe(revision.id);
    expect(revision.status).toBe("published");
    expect(revision.mutable).toBe(false);
    expect(revision.semanticModelId).toBe("semantic-model-1");
    expect(revision.datasetVersionId).toBe("version-1");
    expect(revision.pages).toEqual([
      expect.objectContaining({ id: "page_main", title: "Principal", order: 0, widgetIds: ["kpi_sales", "sales_by_region"] })
    ]);
    expect(revision.widgets[0]?.visual).not.toHaveProperty("fallbackValue");
    expect(validateDashboardDocument(document).valid).toBe(true);
  });

  it("creates and reorders pages so profitability can be modeled without hacks", () => {
    const document = documentV2();
    const draft = draftFrom(document);
    const withPage = createDashboardPage(draft, {
      id: "page_profitability",
      title: "Rentabilidad",
      filters: [{ field: "linea", operator: "eq", value: "Enterprise" }]
    });
    const withWidget = addWidgetToPage(withPage, "page_profitability", profitabilityWidget("page_profitability"));
    const reordered = reorderDashboardPages(withWidget, ["page_profitability", "page_main"]);

    expect(reordered.pages.map((page) => [page.id, page.order])).toEqual([
      ["page_profitability", 0],
      ["page_main", 1]
    ]);
    expect(reordered.pages[0]?.filters).toEqual([{ field: "linea", operator: "eq", value: "Enterprise" }]);
    expect(reordered.pages[0]?.widgetIds).toEqual(["profitability_by_region"]);
    expect(validateDashboardDocument({ dashboard: { ...document.dashboard, currentRevisionId: reordered.id }, revisions: [document.revisions[0]!, reordered] }).valid).toBe(true);
  });

  it("keeps global, page and widget filters separate", () => {
    const document = documentV2();
    const draft = addWidgetToPage(
      createDashboardPage(draftFrom(document), { id: "page_profitability", title: "Rentabilidad", filters: [{ field: "linea", operator: "eq", value: "Enterprise" }] }),
      "page_profitability",
      profitabilityWidget("page_profitability")
    );

    expect(document.dashboard.globalFilters.map((filter) => filter.field)).toEqual(["fecha"]);
    expect(draft.pages.find((page) => page.id === "page_profitability")?.filters.map((filter) => filter.field)).toEqual(["linea"]);
    expect(draft.widgets.find((widget) => widget.id === "profitability_by_region")?.query?.filters.map((filter) => filter.field)).toEqual(["margen"]);
  });

  it("rejects broken references, invalid layouts and incompatible queries before persistence", () => {
    const document = documentV2();
    const brokenRevision: DashboardRevision = {
      ...draftFrom(document),
      pages: [{ ...document.revisions[0]!.pages[0]!, widgetIds: ["missing_widget"] }],
      widgets: [
        {
          ...document.revisions[0]!.widgets[0]!,
          layout: { pageId: "missing_page", x: 10, y: 0, w: 4, h: 1 },
          query: { metricId: "metric.revenue", dimensionIds: [], filters: [] },
          lineage: undefined
        }
      ]
    };
    const validation = validateDashboardDocument({ dashboard: { ...document.dashboard, currentRevisionId: brokenRevision.id }, revisions: [document.revisions[0]!, brokenRevision] });

    expect(validation.valid).toBe(false);
    expect(validation.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining(["missing_reference", "invalid_layout", "invalid_query"]));
  });

  it("serializes through the v2 Zod contract and resolves selected targets from revision IDs", () => {
    const document = documentV2();
    const parsed = dashboardDocumentSchema.parse(JSON.parse(JSON.stringify(document)));
    const target = resolveTargetFromRevision(parsed.revisions[0]!, { revisionId: parsed.revisions[0]!.id, widgetId: "sales_by_region" });

    expect(parsed.dashboard.id).toBe("dashboard_sales");
    expect(target).toEqual(expect.objectContaining({ id: "sales_by_region", title: "Ventas por region" }));
  });

  it("publishes a draft as an immutable revision and keeps presentation compatible through v1 adapter", () => {
    const document = documentV2();
    const draft = addWidgetToPage(createDashboardPage(draftFrom(document), { id: "page_profitability", title: "Rentabilidad" }), "page_profitability", profitabilityWidget("page_profitability"));
    const nextDocument = publishDashboardRevision({ dashboard: { ...document.dashboard, currentRevisionId: draft.id }, revisions: [document.revisions[0]!, draft] }, draft.id, "2026-07-17T01:00:00.000Z");
    const compatible = dashboardRevisionToDashboardSpec(nextDocument, draft.id);
    const presentation = generatePresentationSpec(compatible);

    expect(nextDocument.dashboard.publishedRevisionId).toBe(draft.id);
    expect(nextDocument.revisions.find((revision) => revision.id === draft.id)).toMatchObject({ status: "published", mutable: false });
    expect(compatible.widgets.map((widget) => widget.id)).toContain("profitability_by_region");
    expect(presentation.dashboardId).toBe("dashboard_sales");
    expect(presentation.slides.some((slide) => slide.widgetIds.includes("profitability_by_region"))).toBe(false);
    expect(presentation.slides.some((slide) => slide.widgetIds.includes("sales_by_region"))).toBe(true);
  });
});
