"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { DashboardDocument, DashboardPage, DashboardRevision, DashboardSpec, DashboardViewState, WidgetSpec } from "@/types/dashboard";
import type { Database, Json } from "@/types/supabase";
import { createCorrelationId } from "@/lib/observability/domain-error";
import { dashboardRevisionToDashboardSpec, migrateDashboardSpecV1ToV2, validateDashboardDocument } from "@/lib/dashboard-spec/model-v2";
import { dashboardDocumentSchema, dashboardPageSchema, widgetSpecSchema } from "@/lib/validation/schemas";
import { insertAuditEvent } from "@/lib/supabase/audit";

interface PersistDashboardDocumentInput {
  dashboardId: string;
  projectId: string;
  userId: string;
  spec: DashboardSpec;
  viewState: DashboardViewState;
  reason: string;
  source: "manual" | "copilot" | "import" | "restore";
}

type DashboardDocumentRow = Database["public"]["Tables"]["dashboard_documents"]["Row"];
type DashboardRevisionRow = Database["public"]["Tables"]["dashboard_revisions"]["Row"];
type DashboardPageRow = Database["public"]["Tables"]["dashboard_pages"]["Row"];
type DashboardWidgetRow = Database["public"]["Tables"]["dashboard_widgets"]["Row"];

function jsonValue(value: unknown): Json {
  return JSON.parse(JSON.stringify(value)) as Json;
}

function semanticModelId(spec: DashboardSpec) {
  return spec.semanticModelId ?? `semantic_${spec.datasetVersionId ?? spec.datasetId}`;
}

function datasetVersionId(spec: DashboardSpec) {
  return spec.datasetVersionId ?? spec.datasetId;
}

function specForDashboardId(spec: DashboardSpec, dashboardId: string): DashboardSpec {
  return { ...spec, id: dashboardId, semanticModelId: semanticModelId(spec), datasetVersionId: datasetVersionId(spec) };
}

function pageInsert(input: { dashboardId: string; revisionId: string; page: DashboardPage }) {
  return {
    id: input.page.id,
    dashboard_id: input.dashboardId,
    revision_id: input.revisionId,
    title: input.page.title,
    page_order: input.page.order,
    layout_json: jsonValue(input.page.layout),
    filters_json: jsonValue(input.page.filters),
    widget_ids: input.page.widgetIds
  };
}

function widgetInsert(input: { dashboardId: string; revisionId: string; widget: WidgetSpec }) {
  return {
    id: input.widget.id,
    dashboard_id: input.dashboardId,
    revision_id: input.revisionId,
    page_id: input.widget.layout.pageId,
    widget_type: input.widget.type,
    title: input.widget.title,
    widget_json: jsonValue(input.widget),
    layout_json: jsonValue(input.widget.layout),
    query_json: input.widget.query ? jsonValue(input.widget.query) : null
  };
}

function revisionFromRows(revision: DashboardRevisionRow, pages: DashboardPageRow[], widgets: DashboardWidgetRow[]): DashboardRevision {
  const parsedPages = pages
    .filter((page) => page.revision_id === revision.id)
    .sort((left, right) => left.page_order - right.page_order)
    .map((page) => dashboardPageSchema.parse({
      id: page.id,
      title: page.title,
      order: page.page_order,
      layout: page.layout_json,
      filters: page.filters_json,
      widgetIds: page.widget_ids
    }));
  const parsedWidgets = widgets
    .filter((widget) => widget.revision_id === revision.id)
    .map((widget) => widgetSpecSchema.parse(widget.widget_json));
  return {
    id: revision.id,
    dashboardId: revision.dashboard_id,
    revisionNumber: revision.revision_number,
    status: revision.status,
    semanticModelId: revision.semantic_model_id,
    datasetVersionId: revision.dataset_version_id,
    pages: parsedPages,
    widgets: parsedWidgets,
    createdAt: revision.created_at,
    createdBy: revision.created_by ?? "system",
    publishedAt: revision.published_at ?? undefined,
    mutable: revision.mutable
  };
}

export function buildDashboardDocumentForPersistence(input: PersistDashboardDocumentInput, revisionNumber: number): DashboardDocument {
  const spec = specForDashboardId(input.spec, input.dashboardId);
  const migrated = migrateDashboardSpecV1ToV2(spec, {
    semanticModelId: semanticModelId(spec),
    datasetVersionId: datasetVersionId(spec),
    createdBy: input.userId
  });
  const revisionId = `${input.dashboardId}_rev_${revisionNumber}`;
  const pages = spec.pages?.length ? spec.pages : migrated.revisions[0]!.pages;
  const fallbackPageId = pages[0]?.id ?? "page_main";
  const pageByWidgetId = new Map(pages.flatMap((page) => page.widgetIds.map((widgetId) => [widgetId, page.id])));
  const widgets = migrated.revisions[0]!.widgets.map((widget) => ({
    ...widget,
    layout: { ...widget.layout, pageId: pageByWidgetId.get(widget.id) ?? fallbackPageId }
  }));
  const revision = {
    ...migrated.revisions[0]!,
    id: revisionId,
    dashboardId: input.dashboardId,
    revisionNumber,
    pages,
    widgets,
    createdBy: input.userId
  };
  return dashboardDocumentSchema.parse({
    dashboard: {
      ...migrated.dashboard,
      id: input.dashboardId,
      currentRevisionId: revisionId,
      publishedRevisionId: revisionId
    },
    revisions: [revision]
  });
}

async function nextRevisionNumber(supabase: SupabaseClient<Database>, dashboardId: string) {
  const { data, error } = await supabase
    .from("dashboard_revisions")
    .select("revision_number")
    .eq("dashboard_id", dashboardId)
    .order("revision_number", { ascending: false })
    .limit(1);
  if (error) throw new Error(`No se pudo calcular la proxima revision: ${error.message}`);
  return ((data?.[0]?.revision_number as number | undefined) ?? 0) + 1;
}

export async function persistDashboardDocumentV2(supabase: SupabaseClient<Database>, input: PersistDashboardDocumentInput) {
  const revisionNumber = await nextRevisionNumber(supabase, input.dashboardId);
  const document = buildDashboardDocumentForPersistence(input, revisionNumber);
  const revision = document.revisions[0]!;
  const correlationId = createCorrelationId("dashrev");
  const validation = validateDashboardDocument(document);
  if (!validation.valid) throw new Error(`Documento dashboard invalido: ${validation.issues.map((issue) => issue.message).join(" ")}`);

  const { error: documentError } = await supabase.from("dashboard_documents").upsert({
    id: input.dashboardId,
    project_id: input.projectId,
    dataset_id: document.dashboard.datasetId,
    dataset_version_id: revision.datasetVersionId,
    user_id: input.userId,
    title: document.dashboard.title,
    subtitle: document.dashboard.subtitle,
    current_revision_id: revision.id,
    published_revision_id: revision.id,
    global_filters_json: jsonValue(document.dashboard.globalFilters),
    status: "active",
    updated_at: document.dashboard.updatedAt
  });
  if (documentError) throw new Error(`No se pudo guardar DashboardDocument v2: ${documentError.message}`);

  const { error: revisionError } = await supabase.from("dashboard_revisions").insert({
    id: revision.id,
    dashboard_id: input.dashboardId,
    revision_number: revision.revisionNumber,
    status: revision.status,
    semantic_model_id: revision.semanticModelId,
    dataset_version_id: revision.datasetVersionId,
    spec_json: jsonValue(specForDashboardId(input.spec, input.dashboardId)),
    view_state_json: jsonValue(input.viewState),
    reason: input.reason,
    source: input.source,
    created_by: input.userId,
    mutable: revision.mutable,
    published_at: revision.publishedAt
  });
  if (revisionError) throw new Error(`No se pudo guardar DashboardRevision v2: ${revisionError.message}`);

  const { error: pageError } = await supabase.from("dashboard_pages").insert(revision.pages.map((page) => pageInsert({ dashboardId: input.dashboardId, revisionId: revision.id, page })));
  if (pageError) throw new Error(`No se pudieron guardar DashboardPage v2: ${pageError.message}`);

  if (revision.widgets.length) {
    const { error: widgetError } = await supabase.from("dashboard_widgets").insert(revision.widgets.map((widget) => widgetInsert({ dashboardId: input.dashboardId, revisionId: revision.id, widget })));
    if (widgetError) throw new Error(`No se pudieron guardar DashboardWidget v2: ${widgetError.message}`);
  }

  const { error: activeError } = await supabase
    .from("dashboard_specs")
    .update({
      active_revision_id: revision.id,
      semantic_model_id: revision.semanticModelId,
      spec_json: jsonValue(specForDashboardId(input.spec, input.dashboardId)),
      view_state_json: jsonValue(input.viewState),
      updated_at: document.dashboard.updatedAt
    })
    .eq("id", input.dashboardId);
  if (activeError) throw new Error(`No se pudo activar revision v2: ${activeError.message}`);

  await insertAuditEvent(supabase, {
    userId: input.userId,
    projectId: input.projectId,
    entityType: "dashboard",
    entityId: input.dashboardId,
    action: revisionNumber === 1 ? "dashboard.create" : "dashboard.revision.create",
    result: "success",
    reason: input.reason,
    correlationId,
    revisionId: revision.id,
    metadata: { source: input.source, revisionNumber, widgetCount: revision.widgets.length, pageCount: revision.pages.length }
  });

  return { document, revisionId: revision.id, revisionNumber };
}

export async function loadDashboardDocumentV2(supabase: SupabaseClient<Database>, dashboardId: string) {
  const { data: documentRow, error: documentError } = await supabase.from("dashboard_documents").select("*").eq("id", dashboardId).maybeSingle();
  if (documentError) throw new Error(`No se pudo cargar DashboardDocument v2: ${documentError.message}`);
  if (!documentRow) return null;
  const document = documentRow as DashboardDocumentRow;
  const { data: revisionRows, error: revisionError } = await supabase.from("dashboard_revisions").select("*").eq("dashboard_id", dashboardId).order("revision_number", { ascending: true });
  if (revisionError) throw new Error(`No se pudieron cargar revisiones v2: ${revisionError.message}`);
  const revisions = (revisionRows ?? []) as DashboardRevisionRow[];
  const revisionIds = revisions.map((revision) => revision.id);
  const { data: pageRows, error: pageError } = await supabase.from("dashboard_pages").select("*").eq("dashboard_id", dashboardId).in("revision_id", revisionIds);
  if (pageError) throw new Error(`No se pudieron cargar paginas v2: ${pageError.message}`);
  const { data: widgetRows, error: widgetError } = await supabase.from("dashboard_widgets").select("*").eq("dashboard_id", dashboardId).in("revision_id", revisionIds);
  if (widgetError) throw new Error(`No se pudieron cargar widgets v2: ${widgetError.message}`);

  const parsed = dashboardDocumentSchema.parse({
    dashboard: {
      id: document.id,
      title: document.title,
      subtitle: document.subtitle ?? undefined,
      datasetId: document.dataset_id,
      currentRevisionId: document.current_revision_id,
      publishedRevisionId: document.published_revision_id ?? undefined,
      globalFilters: document.global_filters_json,
      createdAt: document.created_at,
      updatedAt: document.updated_at
    },
    revisions: revisions.map((revision) => revisionFromRows(revision, (pageRows ?? []) as DashboardPageRow[], (widgetRows ?? []) as DashboardWidgetRow[]))
  });
  const viewStates = new Map(revisions.map((revision) => [revision.id, revision.view_state_json as DashboardViewState]));
  return { document: parsed, viewStates };
}

export function dashboardDocumentToPersistedPayload(input: { document: DashboardDocument; viewStates?: Map<string, DashboardViewState> }, revisionId = input.document.dashboard.currentRevisionId) {
  const { document } = input;
  const revision = document.revisions.find((item) => item.id === revisionId);
  if (!revision) throw new Error(`No existe la revision activa ${revisionId}.`);
  const spec = {
    ...dashboardRevisionToDashboardSpec(document, revisionId),
    pages: revision.pages
  };
  return {
    spec,
    viewState: input.viewStates?.get(revisionId) ?? { filters: [] }
  };
}

export async function restoreDashboardRevisionV2(supabase: SupabaseClient<Database>, dashboardId: string, revisionId: string, reason = "restore") {
  const { data, error } = await supabase.rpc("restore_dashboard_revision", {
    target_dashboard_id: dashboardId,
    source_revision_id: revisionId,
    restore_reason: reason
  });
  if (error) throw new Error(`No se pudo restaurar la revision: ${error.message}`);
  return data;
}
