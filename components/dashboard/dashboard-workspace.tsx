"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Download, FileImage, FileText, Link2, MonitorPlay, Pencil, Play, Save, Share2, Sparkles, Users, X } from "lucide-react";
import { DashboardEditor } from "@/components/dashboard/dashboard-editor";
import { DataExplorerPanel } from "@/components/dashboard/data-explorer";
import { CopilotPanel, DashboardFilters, DashboardRenderer } from "@/components/dashboard/dashboard-renderer";
import { AppShell } from "@/components/shared/app-shell";
import { Button } from "@/components/shared/button";
import { useToast } from "@/components/shared/toast";
import { loadPersistedDashboard, updatePersistedDashboard } from "@/lib/data-access";
import { completeExportJob, createExportRequest, createQueuedExportJob, dashboardExportRevisionId, failExportJob, transitionExportJob, type ExportFormat, type ExportJob } from "@/lib/export/contracts";
import { downloadExportArtifact } from "@/lib/export/download";
import { generateDashboardExport, generatePresentationExport } from "@/lib/export/renderers";
import { createDirectDownloadStorageRecord } from "@/lib/export/storage-controls";
import { createCorrelationId } from "@/lib/observability/domain-error";
import { recordAuditEvent } from "@/lib/observability/audit";
import { getQueryableRowsForExport } from "@/lib/query-service/client";
import { useDashPilotStore } from "@/lib/store/app-store";
import { cn } from "@/lib/utils";

type DashboardWorkspaceView = "dashboard" | "data";

const dashboardWorkspaceViews: Array<{ value: DashboardWorkspaceView; label: string }> = [
  { value: "dashboard", label: "Dashboard" },
  { value: "data", label: "Datos" }
];

export function DashboardWorkspace() {
  const toast = useToast();
  const params = useParams<{ dashboardId?: string }>();
  const [exportOpen, setExportOpen] = useState(false);
  const [exportJob, setExportJob] = useState<ExportJob | null>(null);
  const [selectedView, setSelectedView] = useState<DashboardWorkspaceView>("dashboard");
  const dashboard = useDashPilotStore((state) => state.dashboard);
  const viewState = useDashPilotStore((state) => state.viewState);
  const setViewState = useDashPilotStore((state) => state.setViewState);
  const profile = useDashPilotStore((state) => state.profile);
  const presentation = useDashPilotStore((state) => state.presentation);
  const activeDatasetId = useDashPilotStore((state) => state.activeDatasetId);
  const activeDatasetVersionId = useDashPilotStore((state) => state.activeDatasetVersionId);
  const activeDashboardId = useDashPilotStore((state) => state.activeDashboardId);
  const isDashboardEditing = useDashPilotStore((state) => state.isDashboardEditing);
  const dashboardEditDraft = useDashPilotStore((state) => state.dashboardEditDraft);
  const isCopilotPanelOpen = useDashPilotStore((state) => state.isCopilotPanelOpen);
  const startDashboardEditing = useDashPilotStore((state) => state.startDashboardEditing);
  const cancelDashboardEditing = useDashPilotStore((state) => state.cancelDashboardEditing);
  const commitDashboardEditing = useDashPilotStore((state) => state.commitDashboardEditing);
  const toggleCopilotPanel = useDashPilotStore((state) => state.toggleCopilotPanel);
  const hydrateDashboard = useDashPilotStore((state) => state.hydrateDashboard);
  const setPersistenceState = useDashPilotStore((state) => state.setPersistenceState);
  const dashboardId = params.dashboardId ?? activeDashboardId;
  const shareHref = `/app/dashboards/${dashboardId}/compartir`;
  const visibleDashboard = isDashboardEditing && dashboardEditDraft ? dashboardEditDraft : dashboard;
  const hasRows = Boolean(activeDatasetId && profile.rowCount > 0);
  const hasPresentation = hasRows && presentation.slides.length > 0;
  const activeView = viewState.dataExplorer?.isOpen ? "data" : selectedView;

  function downloadText(fileName: string, content: string, type: string) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
  }

  function exportDashboardJson() {
    downloadText(`${activeDashboardId || "dashboard"}-spec.json`, JSON.stringify({ dashboard, viewState, profile }, null, 2), "application/json;charset=utf-8");
    toast("DashboardSpec exportado.");
  }

  function exportDatasetCsv() {
    const rows = getQueryableRowsForExport(activeDatasetVersionId || profile.datasetVersionId || activeDatasetId);
    if (!rows.length) {
      toast("No hay filas locales disponibles para exportar. Usa Data Explorer para consultas paginadas.");
      return;
    }
    const columns = profile.columns.map((column) => column.normalizedName);
    const header = columns.map((column) => `"${column.replace(/"/g, '""')}"`).join(",");
    const body = rows.map((row) => columns.map((column) => `"${String(row[column] ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    downloadText(`${profile.id || "dataset"}-completo.csv`, [header, body].filter(Boolean).join("\n"), "text/csv;charset=utf-8");
    toast("Dataset completo exportado en CSV.");
  }

  function rowsForExport() {
    return getQueryableRowsForExport(activeDatasetVersionId || profile.datasetVersionId || activeDatasetId);
  }

  function exportDashboardStatic(format: Extract<ExportFormat, "pdf" | "png">) {
    const rows = rowsForExport();
    if (!hasRows || !rows.length) {
      toast("No hay filas consultables para exportar este dashboard.");
      return;
    }
    const request = createExportRequest({
      target: { type: "dashboard" },
      format,
      scope: "private_workspace",
      dashboardId: activeDashboardId || dashboard.id,
      dashboardRevisionId: dashboardExportRevisionId(dashboard),
      filters: viewState.filters ?? [],
      actor: { id: "local-user", role: "editor" },
      allowDownload: true
    });
    let job = createQueuedExportJob(request);
    setExportJob(job);
    try {
      job = transitionExportJob(job, "rendering", "Preparando snapshot reproducible");
      setExportJob(job);
      const artifact = generateDashboardExport({ dashboard, viewState, rows, profile, format, request });
      job = transitionExportJob(job, "generating", "Generando archivo");
      setExportJob(job);
      downloadExportArtifact(artifact);
      setExportJob(completeExportJob(job, artifact.result));
      createDirectDownloadStorageRecord(completeExportJob(job, artifact.result));
      recordAuditEvent({
        action: "export.create",
        actorId: "local-user",
        actorType: "user",
        resourceType: "dashboard",
        resourceId: activeDashboardId || dashboard.id,
        result: "success",
        reason: `private_${format}`,
        correlationId: createCorrelationId("export"),
        revisionId: request.dashboardRevisionId,
        metadata: { format, byteLength: artifact.result.byteLength, storageMode: "direct-download" }
      });
      setExportOpen(false);
      toast(`${artifact.fileName} generado y descargado.`);
    } catch (error) {
      setExportJob(failExportJob(job, { code: "render_failed", message: error instanceof Error ? error.message : "No se pudo exportar el dashboard.", recoverable: true }));
      toast(error instanceof Error ? error.message : "No se pudo exportar el dashboard.");
    }
  }

  function exportPresentationPptx() {
    const rows = rowsForExport();
    if (!hasPresentation || !rows.length) {
      toast("Crea una presentacion desde este dashboard antes de exportar PowerPoint.");
      return;
    }
    const request = createExportRequest({
      target: { type: "presentation" },
      format: "pptx",
      scope: "private_workspace",
      dashboardId: activeDashboardId || dashboard.id,
      dashboardRevisionId: dashboardExportRevisionId(dashboard),
      presentationId: presentation.id,
      presentationRevisionId: `${presentation.id}:${presentation.updatedAt}`,
      filters: viewState.filters ?? [],
      actor: { id: "local-user", role: "editor" },
      allowDownload: true
    });
    let job = createQueuedExportJob(request);
    setExportJob(job);
    try {
      job = transitionExportJob(job, "rendering", "Preparando slides y notas");
      setExportJob(job);
      const artifact = generatePresentationExport({ dashboard, presentation, viewState, rows, profile, format: "pptx", request });
      job = transitionExportJob(job, "generating", "Empaquetando PPTX");
      setExportJob(job);
      downloadExportArtifact(artifact);
      setExportJob(completeExportJob(job, artifact.result));
      createDirectDownloadStorageRecord(completeExportJob(job, artifact.result));
      recordAuditEvent({
        action: "export.create",
        actorId: "local-user",
        actorType: "user",
        resourceType: "presentation",
        resourceId: presentation.id,
        result: "success",
        reason: "private_pptx",
        correlationId: createCorrelationId("export"),
        revisionId: request.presentationRevisionId,
        metadata: { format: "pptx", byteLength: artifact.result.byteLength, storageMode: "direct-download" }
      });
      setExportOpen(false);
      toast(`${artifact.fileName} generado y descargado.`);
    } catch (error) {
      setExportJob(failExportJob(job, { code: "render_failed", message: error instanceof Error ? error.message : "No se pudo exportar PowerPoint.", recoverable: true }));
      toast(error instanceof Error ? error.message : "No se pudo exportar PowerPoint.");
    }
  }

  useEffect(() => {
    if (!params.dashboardId || params.dashboardId === "demo" || params.dashboardId === activeDashboardId) return;
    let active = true;
    void loadPersistedDashboard(params.dashboardId).then((payload) => {
      if (!active || !payload) return;
      hydrateDashboard({ rows: payload.rows ?? [], dashboard: payload.spec, viewState: payload.viewState, profile: payload.profile });
      setPersistenceState({ activeDashboardId: params.dashboardId, persistenceStatus: "Dashboard cargado" });
    }).catch((error) => toast(error instanceof Error ? error.message : "No se pudo cargar el dashboard."));
    return () => {
      active = false;
    };
  }, [activeDashboardId, hydrateDashboard, params.dashboardId, setPersistenceState, toast]);

  async function saveDashboard() {
    try {
      const result = await updatePersistedDashboard(activeDashboardId, dashboard, viewState, undefined, profile);
      const warning = "warning" in result ? result.warning : undefined;
      setPersistenceState({ activeDashboardId: result.dashboardId, persistenceMode: result.mode, persistenceStatus: warning ?? "Dashboard guardado", executionMode: result.executionMode, syncStatus: result.syncStatus, lastSyncCorrelationId: result.correlationId, lastSyncError: warning });
      toast(warning ?? (result.mode === "local" ? "Dashboard guardado localmente." : "Dashboard guardado correctamente."));
    } catch (error) {
      toast(error instanceof Error ? error.message : "No se pudo guardar el dashboard.");
    }
  }

  async function saveDashboardEdits() {
    const draft = dashboardEditDraft;
    if (!draft) return;
    try {
      const result = await updatePersistedDashboard(activeDashboardId, draft, viewState, undefined, profile);
      const warning = "warning" in result ? result.warning : undefined;
      const committed = commitDashboardEditing();
      setPersistenceState({ activeDashboardId: result.dashboardId, persistenceMode: result.mode, persistenceStatus: warning ?? "Dashboard guardado", executionMode: result.executionMode, syncStatus: result.syncStatus, lastSyncCorrelationId: result.correlationId, lastSyncError: warning });
      toast(warning ?? (result.mode === "local" ? "Cambios guardados localmente." : "Cambios guardados correctamente."));
      if (!committed) toast("No habia cambios pendientes para confirmar.");
    } catch (error) {
      toast(error instanceof Error ? error.message : "No se pudieron guardar los cambios.");
    }
  }

  function selectView(value: "dashboard" | "data") {
    setSelectedView(value);
    if (value === "dashboard" && viewState.dataExplorer?.isOpen) {
      setViewState({ dataExplorer: { ...viewState.dataExplorer, isOpen: false } });
    }
  }

  return (
    <AppShell right={isDashboardEditing ? <DashboardEditor /> : isCopilotPanelOpen ? <CopilotPanel /> : undefined}>
      <div className="p-5 lg:p-8">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <h2 className="truncate text-xl font-bold tracking-[-0.02em]">{visibleDashboard.title}</h2>
            <p className="mt-1 text-sm font-semibold text-[#697597]">{isDashboardEditing ? "Modo edicion activo" : visibleDashboard.subtitle ?? "Dashboard generado desde DashboardSpec"}</p>
          </div>
          <div className="flex flex-wrap justify-end gap-3">
            {isDashboardEditing ? (
              <>
                <Button onClick={saveDashboardEdits} variant="primary"><Save className="size-4" /> Guardar</Button>
                <Button onClick={cancelDashboardEditing} variant="secondary"><X className="size-4" /> Cancelar</Button>
              </>
            ) : (
              <>
                <Button onClick={startDashboardEditing} variant="secondary"><Pencil className="size-4" /> Editar dashboard</Button>
                <Button onClick={saveDashboard} variant="secondary"><Save className="size-4" /> Guardar</Button>
                {!isCopilotPanelOpen && (
                  <Button onClick={toggleCopilotPanel} variant="soft"><Sparkles className="size-4" /> Copiloto</Button>
                )}
              </>
            )}
            <Link href="/app/presentaciones/crear" className="inline-flex h-11 items-center gap-2 rounded-lg bg-[#3d35ff] px-5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25"><Play className="size-4" /> Presentar</Link>
            <Link href={shareHref} className="inline-flex h-11 items-center gap-2 rounded-lg border border-[#dce3f4] bg-white px-5 text-sm font-semibold"><Users className="size-4" /> Compartir</Link>
            <div className="relative">
              <Button onClick={() => setExportOpen((value) => !value)} variant="secondary"><Download className="size-4" /> Exportar</Button>
              {exportOpen && (
                <div className="absolute right-0 top-12 z-30 w-72 rounded-xl border border-[#dfe5f0] bg-white p-2 shadow-2xl shadow-slate-900/10">
                  <Link href={shareHref} className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold hover:bg-[#f6f7ff]"><Link2 className="size-4" /> Compartir enlace interactivo</Link>
                  <Link href="/app/presentaciones/crear" className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold hover:bg-[#f6f7ff]"><MonitorPlay className="size-4" /> Crear presentacion interactiva</Link>
                  <button onClick={exportDatasetCsv} disabled={!hasRows} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-semibold hover:bg-[#f6f7ff] disabled:cursor-not-allowed disabled:opacity-50"><FileText className="size-4" /> Exportar datos CSV</button>
                  <button onClick={exportDashboardJson} disabled={!hasRows} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-semibold hover:bg-[#f6f7ff] disabled:cursor-not-allowed disabled:opacity-50"><FileText className="size-4" /> Exportar DashboardSpec</button>
                  <button onClick={() => exportDashboardStatic("pdf")} disabled={!hasRows} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-semibold hover:bg-[#f6f7ff] disabled:cursor-not-allowed disabled:opacity-50"><FileText className="size-4" /> Exportar PDF</button>
                  <button onClick={() => exportDashboardStatic("png")} disabled={!hasRows} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-semibold hover:bg-[#f6f7ff] disabled:cursor-not-allowed disabled:opacity-50"><FileImage className="size-4" /> Exportar PNG</button>
                  <button onClick={exportPresentationPptx} disabled={!hasPresentation} title={hasPresentation ? undefined : "Crea una presentacion antes de exportar PowerPoint."} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-semibold hover:bg-[#f6f7ff] disabled:cursor-not-allowed disabled:opacity-50"><FileText className="size-4" /> Exportar PowerPoint</button>
                </div>
              )}
            </div>
            <Link href={shareHref} className="inline-flex h-11 items-center gap-2 rounded-lg border border-[#dce3f4] bg-white px-5 text-sm font-semibold xl:hidden"><Share2 className="size-4" /> Share</Link>
          </div>
        </div>
        {hasRows ? (
          <>
            {exportJob && (
              <div className="mb-5 rounded-xl border border-[#dfe5f0] bg-white px-5 py-4 text-sm shadow-sm">
                <p className="font-bold">Exportacion: {exportJob.status}</p>
                <p className="mt-1 text-[#617094]">{exportJob.error?.message ?? exportJob.progressLabel}</p>
                {exportJob.result && <p className="mt-1 text-xs text-[#697597]">{exportJob.result.fileName} - revision {exportJob.result.metadata.dashboardRevisionId}</p>}
              </div>
            )}
            <div className="mb-5 flex flex-wrap gap-2">
              {dashboardWorkspaceViews.map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => selectView(value)}
                  className={cn(
                    "h-10 rounded-lg border px-4 text-sm font-semibold transition",
                    activeView === value ? "border-[#7a73ff] bg-[#f0f1ff] text-[#332cff]" : "border-[#dfe5f0] bg-white text-[#536088] hover:border-[#bfc9ea]"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            {activeView === "dashboard" ? (
              <div className="grid gap-5 xl:grid-cols-[220px_1fr]">
                <DashboardFilters />
                <DashboardRenderer />
              </div>
            ) : (
              <DataExplorerPanel />
            )}
            <footer className="mt-5 flex gap-8 text-xs text-[#697597]">
              <span>Fuente: {profile.fileName}</span>
              <span>Ultima actualizacion: {new Date(profile.createdAt).toLocaleDateString("es-CL")}</span>
            </footer>
          </>
        ) : (
          <section className="soft-card rounded-xl p-8 text-center">
            <h2 className="text-xl font-bold">Aún no hay dashboards</h2>
            <p className="mt-2 text-[#617094]">Sube un dataset para comenzar.</p>
            <Link href="/app" className="mt-5 inline-flex h-11 items-center rounded-lg bg-[#3d35ff] px-5 text-sm font-semibold text-white">Subir dataset</Link>
          </section>
        )}
      </div>
    </AppShell>
  );
}
