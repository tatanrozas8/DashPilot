import type {
  Dashboard,
  DashboardDocument,
  DashboardFilter,
  DashboardPage,
  DashboardRevision,
  DashboardSpec,
  DashboardTargetSelection,
  DashboardWidget,
  WidgetContentSpec,
  WidgetSpec,
  WidgetVisualSpec
} from "@/types/dashboard";
import { dashboardDocumentSchema } from "@/lib/validation/schemas";

export interface DashboardModelIssue {
  code: "duplicate_id" | "missing_reference" | "invalid_layout" | "invalid_query" | "invalid_revision" | "mutable_published_revision";
  message: string;
  id?: string;
}

export interface DashboardModelValidationResult {
  valid: boolean;
  issues: DashboardModelIssue[];
}

export interface DashboardMigrationOptions {
  semanticModelId: string;
  datasetVersionId: string;
  createdBy?: string;
  now?: Date;
}

function nowIso(options?: { now?: Date }) {
  return (options?.now ?? new Date()).toISOString();
}

function unique<T>(items: T[]) {
  return [...new Set(items)];
}

function assertDraftRevision(revision: DashboardRevision) {
  if (!revision.mutable || revision.status !== "draft") {
    throw new Error("Solo se puede editar una revision draft mutable.");
  }
}

function sortedWidgetsForV1(spec: DashboardSpec) {
  return [...spec.widgets].sort((left, right) => left.position.y - right.position.y || left.position.x - right.position.x || left.id.localeCompare(right.id));
}

function visualFromConfig(config: DashboardWidget["config"]): WidgetVisualSpec {
  return {
    format: typeof config.format === "string" ? config.format : undefined,
    tone: typeof config.tone === "string" ? config.tone : undefined,
    icon: typeof config.icon === "string" ? config.icon : undefined,
    compact: typeof config.compact === "boolean" ? config.compact : undefined,
    comparison: typeof config.comparison === "string" || typeof config.comparison === "boolean" ? config.comparison : undefined,
    visualConfig: config.visualConfig,
    horizontal: typeof config.horizontal === "boolean" ? config.horizontal : undefined,
    columns: config.columns,
    hidden: typeof config.hidden === "boolean" ? config.hidden : undefined,
    emptyMessage: typeof config.emptyMessage === "string" ? config.emptyMessage : undefined
  };
}

function contentFromConfig(config: DashboardWidget["config"]): WidgetContentSpec | undefined {
  const bullets = config.bullets;
  if (Array.isArray(bullets) && bullets.every((bullet) => typeof bullet === "string")) return { bullets };
  const text = config.text;
  if (typeof text === "string") return { text };
  return undefined;
}

function configFromV2(widget: WidgetSpec): DashboardWidget["config"] {
  return {
    ...widget.visual,
    ...(widget.content?.bullets ? { bullets: widget.content.bullets } : {}),
    ...(widget.content?.text ? { text: widget.content.text } : {})
  };
}

function widgetToV2(widget: DashboardWidget, pageId: string): WidgetSpec {
  return {
    id: widget.id,
    type: widget.type,
    title: widget.title,
    description: widget.description,
    query: widget.query
      ? {
          metricId: widget.query.metricId,
          dimensionIds: widget.query.dimensionIds ?? [],
          timeDimensionId: widget.query.timeDimensionId,
          filters: widget.query.filters ?? [],
          orderBy: widget.query.orderBy,
          limit: widget.query.limit,
          legacyQuery: widget.query
        }
      : undefined,
    visual: visualFromConfig(widget.config),
    content: contentFromConfig(widget.config),
    layout: {
      pageId,
      ...widget.position
    },
    lineage: widget.lineage
  };
}

function widgetToV1(widget: WidgetSpec): DashboardWidget {
  const legacyQuery = widget.query?.legacyQuery;
  return {
    id: widget.id,
    type: widget.type,
    title: widget.title,
    description: widget.description,
    query: legacyQuery
      ? {
          ...legacyQuery,
          metricId: widget.query?.metricId ?? legacyQuery.metricId,
          dimensionIds: widget.query?.dimensionIds.length ? widget.query.dimensionIds : legacyQuery.dimensionIds,
          timeDimensionId: widget.query?.timeDimensionId ?? legacyQuery.timeDimensionId,
          filters: widget.query?.filters.length ? widget.query.filters : legacyQuery.filters
        }
      : undefined,
    lineage: widget.lineage,
    config: configFromV2(widget),
    position: {
      x: widget.layout.x,
      y: widget.layout.y,
      w: widget.layout.w,
      h: widget.layout.h
    }
  };
}

export function migrateDashboardSpecV1ToV2(spec: DashboardSpec, options: DashboardMigrationOptions): DashboardDocument {
  const createdAt = nowIso(options);
  const pageId = "page_main";
  const widgets = sortedWidgetsForV1(spec);
  const revisionId = `${spec.id}_rev_1`;
  const dashboard: Dashboard = {
    id: spec.id,
    title: spec.title,
    subtitle: spec.subtitle,
    datasetId: spec.datasetId,
    currentRevisionId: revisionId,
    publishedRevisionId: revisionId,
    globalFilters: spec.globalFilters,
    createdAt: spec.createdAt,
    updatedAt: createdAt
  };
  const page: DashboardPage = {
    id: pageId,
    title: "Principal",
    order: 0,
    layout: { mode: "grid_12", columns: 12 },
    filters: [],
    widgetIds: widgets.map((widget) => widget.id)
  };
  const revision: DashboardRevision = {
    id: revisionId,
    dashboardId: spec.id,
    revisionNumber: 1,
    status: "published",
    semanticModelId: options.semanticModelId,
    datasetVersionId: options.datasetVersionId,
    pages: [page],
    widgets: widgets.map((widget) => widgetToV2(widget, pageId)),
    createdAt,
    createdBy: options.createdBy ?? "system",
    publishedAt: createdAt,
    mutable: false
  };
  return dashboardDocumentSchema.parse({ dashboard, revisions: [revision] });
}

export function dashboardRevisionToDashboardSpec(document: DashboardDocument, revisionId = document.dashboard.currentRevisionId): DashboardSpec {
  const revision = document.revisions.find((item) => item.id === revisionId);
  if (!revision) throw new Error(`No existe la revision ${revisionId}.`);
  const pageOrder = new Map(revision.pages.sort((left, right) => left.order - right.order).flatMap((page, pageIndex) => page.widgetIds.map((widgetId, widgetIndex) => [widgetId, pageIndex * 10_000 + widgetIndex])));
  const widgets = [...revision.widgets]
    .sort((left, right) => (pageOrder.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (pageOrder.get(right.id) ?? Number.MAX_SAFE_INTEGER) || left.layout.y - right.layout.y || left.layout.x - right.layout.x)
    .map(widgetToV1);
  return {
    id: document.dashboard.id,
    title: document.dashboard.title,
    subtitle: document.dashboard.subtitle,
    datasetId: document.dashboard.datasetId,
    datasetVersionId: revision.datasetVersionId,
    semanticModelId: revision.semanticModelId,
    globalFilters: document.dashboard.globalFilters,
    pages: revision.pages,
    widgets,
    createdAt: document.dashboard.createdAt,
    updatedAt: document.dashboard.updatedAt
  };
}

export function createDashboardPage(revision: DashboardRevision, input: { id: string; title: string; filters?: DashboardFilter[] }): DashboardRevision {
  assertDraftRevision(revision);
  if (revision.pages.some((page) => page.id === input.id)) throw new Error(`Ya existe la pagina ${input.id}.`);
  const page: DashboardPage = {
    id: input.id,
    title: input.title.trim() || "Nueva pagina",
    order: revision.pages.length,
    layout: { mode: "grid_12", columns: 12 },
    filters: input.filters ?? [],
    widgetIds: []
  };
  return { ...revision, pages: [...revision.pages, page] };
}

export function reorderDashboardPages(revision: DashboardRevision, pageIds: string[]): DashboardRevision {
  assertDraftRevision(revision);
  const requested = pageIds.filter((pageId) => revision.pages.some((page) => page.id === pageId));
  const rest = revision.pages.map((page) => page.id).filter((pageId) => !requested.includes(pageId));
  const order = [...requested, ...rest];
  return {
    ...revision,
    pages: revision.pages
      .map((page) => ({ ...page, order: order.indexOf(page.id) }))
      .sort((left, right) => left.order - right.order)
  };
}

export function addWidgetToPage(revision: DashboardRevision, pageId: string, widget: WidgetSpec): DashboardRevision {
  assertDraftRevision(revision);
  const page = revision.pages.find((item) => item.id === pageId);
  if (!page) throw new Error(`No existe la pagina ${pageId}.`);
  if (revision.widgets.some((item) => item.id === widget.id)) throw new Error(`Ya existe el widget ${widget.id}.`);
  return {
    ...revision,
    pages: revision.pages.map((item) => item.id === pageId ? { ...item, widgetIds: [...item.widgetIds, widget.id] } : item),
    widgets: [...revision.widgets, { ...widget, layout: { ...widget.layout, pageId } }]
  };
}

export function publishDashboardRevision(document: DashboardDocument, revisionId: string, at = new Date().toISOString()): DashboardDocument {
  const revision = document.revisions.find((item) => item.id === revisionId);
  if (!revision) throw new Error(`No existe la revision ${revisionId}.`);
  const validation = validateDashboardDocument({ ...document, revisions: document.revisions.map((item) => item.id === revisionId ? { ...item, status: "published", mutable: false, publishedAt: at } : item) });
  if (!validation.valid) throw new Error(`Revision invalida: ${validation.issues.map((issue) => issue.message).join(" ")}`);
  return dashboardDocumentSchema.parse({
    dashboard: { ...document.dashboard, currentRevisionId: revisionId, publishedRevisionId: revisionId, updatedAt: at },
    revisions: document.revisions.map((item) => item.id === revisionId ? { ...item, status: "published", mutable: false, publishedAt: at } : item)
  });
}

export function resolveTargetFromRevision(revision: DashboardRevision, selection: DashboardTargetSelection) {
  if (selection.revisionId !== revision.id) return undefined;
  if (selection.widgetId) return revision.widgets.find((widget) => widget.id === selection.widgetId);
  if (selection.pageId) return revision.pages.find((page) => page.id === selection.pageId);
  return revision;
}

function duplicateIssues(ids: string[], entity: string): DashboardModelIssue[] {
  return unique(ids)
    .filter((id) => ids.filter((item) => item === id).length > 1)
    .map((id) => ({ code: "duplicate_id", id, message: `${entity} duplicado: ${id}.` }));
}

function validateRevision(revision: DashboardRevision): DashboardModelIssue[] {
  const pageIds = revision.pages.map((page) => page.id);
  const widgetIds = revision.widgets.map((widget) => widget.id);
  const widgetSet = new Set(widgetIds);
  const pageSet = new Set(pageIds);
  const issues: DashboardModelIssue[] = [
    ...duplicateIssues(pageIds, "Page ID"),
    ...duplicateIssues(widgetIds, "Widget ID")
  ];

  if (!revision.semanticModelId || !revision.datasetVersionId) {
    issues.push({ code: "invalid_revision", id: revision.id, message: "La revision debe apuntar a semanticModelId y datasetVersionId." });
  }
  if (revision.status === "published" && revision.mutable) {
    issues.push({ code: "mutable_published_revision", id: revision.id, message: "Una revision publicada debe ser inmutable." });
  }
  if (revision.status === "published" && !revision.publishedAt) {
    issues.push({ code: "invalid_revision", id: revision.id, message: "Una revision publicada debe registrar publishedAt." });
  }

  for (const page of revision.pages) {
    for (const widgetId of page.widgetIds) {
      if (!widgetSet.has(widgetId)) issues.push({ code: "missing_reference", id: widgetId, message: `La pagina ${page.id} referencia un widget inexistente: ${widgetId}.` });
    }
  }

  for (const widget of revision.widgets) {
    if (!pageSet.has(widget.layout.pageId)) issues.push({ code: "missing_reference", id: widget.id, message: `El widget ${widget.id} referencia una pagina inexistente: ${widget.layout.pageId}.` });
    if (widget.layout.x < 0 || widget.layout.y < 0 || widget.layout.w < 1 || widget.layout.h < 1 || widget.layout.x + widget.layout.w > 12) {
      issues.push({ code: "invalid_layout", id: widget.id, message: `Layout invalido para widget ${widget.id}.` });
    }
    if (widget.query?.metricId && !widget.query.legacyQuery?.metric && !widget.lineage?.metricIds.includes(widget.query.metricId)) {
      issues.push({ code: "invalid_query", id: widget.id, message: `La query del widget ${widget.id} no tiene lineage compatible con metricId.` });
    }
  }
  return issues;
}

export function validateDashboardDocument(document: DashboardDocument): DashboardModelValidationResult {
  const revisionIds = document.revisions.map((revision) => revision.id);
  const issues: DashboardModelIssue[] = [...duplicateIssues(revisionIds, "Revision ID")];
  const current = document.revisions.find((revision) => revision.id === document.dashboard.currentRevisionId);
  if (!current) issues.push({ code: "missing_reference", id: document.dashboard.currentRevisionId, message: "El dashboard apunta a una revision vigente inexistente." });
  if (document.dashboard.publishedRevisionId) {
    const published = document.revisions.find((revision) => revision.id === document.dashboard.publishedRevisionId);
    if (!published) issues.push({ code: "missing_reference", id: document.dashboard.publishedRevisionId, message: "El dashboard publicado apunta a una revision inexistente." });
    if (published && published.status !== "published") issues.push({ code: "invalid_revision", id: published.id, message: "publishedRevisionId debe apuntar a una revision publicada." });
  }
  for (const revision of document.revisions) issues.push(...validateRevision(revision));
  return { valid: issues.length === 0, issues };
}
