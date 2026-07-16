"use client";

import { useState } from "react";
import Link from "next/link";
import { Copy, Download, FileImage, FileJson, FileText, Globe2, Lock, MonitorPlay, Sparkles, type LucideIcon } from "lucide-react";
import { DashboardRenderer } from "@/components/dashboard/dashboard-renderer";
import { AppShell } from "@/components/shared/app-shell";
import { Button } from "@/components/shared/button";
import { useToast } from "@/components/shared/toast";
import { persistShareLink } from "@/lib/data-access";
import { capability, type CapabilityId, type CapabilityStatus } from "@/lib/product/capabilities";
import { useDashPilotStore } from "@/lib/store/app-store";

interface ExportCard {
  capabilityId: CapabilityId;
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel: string;
  href?: string;
  onAction?: () => void;
}

function capabilityBadge(status: CapabilityStatus, beta: boolean) {
  if (beta) return "Beta";
  if (status === "future") return "Futuro";
  if (status === "partial") return "Parcial";
  return "Real";
}

function downloadText(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function escapeCsvCell(value: unknown) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll("\"", "\"\"")}"` : text;
}

export function ShareExportPage() {
  const toast = useToast();
  const [generatedUrl, setGeneratedUrl] = useState("");
  const shareSettings = useDashPilotStore((state) => state.shareSettings);
  const setShareSettings = useDashPilotStore((state) => state.setShareSettings);
  const dashboard = useDashPilotStore((state) => state.dashboard);
  const activeDashboardId = useDashPilotStore((state) => state.activeDashboardId);
  const rows = useDashPilotStore((state) => state.rows);
  const profile = useDashPilotStore((state) => state.profile);
  const viewState = useDashPilotStore((state) => state.viewState);
  const setPersistenceState = useDashPilotStore((state) => state.setPersistenceState);
  const hasDashboard = rows.length > 0 && dashboard.widgets.length > 0;
  const url = generatedUrl || "Aun no hay enlaces compartidos";
  const dashboardHref = `/app/dashboards/${activeDashboardId || dashboard.id}`;
  const shareLinkCapability = capability("share.interactiveLink");

  async function copyLink() {
    try {
      if (!hasDashboard) {
        toast("Sube un dataset para crear un enlace.");
        return;
      }
      const result = await persistShareLink({
        dashboardId: activeDashboardId || dashboard.id,
        access: shareSettings.access,
        expiresAt: shareSettings.expiresAt,
        allowFilters: shareSettings.allowFilters,
        allowDownload: shareSettings.allowDownload,
        origin: window.location.origin
      });
      setGeneratedUrl(result.url);
      setPersistenceState({
        persistenceMode: result.mode,
        persistenceStatus: result.warning ?? (result.mode === "supabase" ? "Enlace compartido creado" : "Enlace compartido local"),
        executionMode: result.executionMode,
        syncStatus: result.syncStatus,
        lastSyncCorrelationId: result.correlationId,
        lastSyncError: result.warning
      });

      try {
        await navigator.clipboard?.writeText(result.url);
        toast(result.mode === "supabase" ? "Enlace compartido creado y copiado." : "Enlace local creado y copiado.");
      } catch {
        toast("Enlace creado. No se pudo copiar automaticamente; copialo desde el campo.");
      }
    } catch (error) {
      toast(error instanceof Error ? error.message : "No se pudo crear el enlace.");
    }
  }

  function exportDashboardSpec() {
    if (!hasDashboard) {
      toast("Genera un dashboard antes de exportar su spec.");
      return;
    }
    downloadText(
      `${dashboard.id || "dashboard"}-spec.json`,
      JSON.stringify({ dashboard, viewState }, null, 2),
      "application/json;charset=utf-8"
    );
    toast("DashboardSpec JSON descargado.");
  }

  function exportDatasetCsv() {
    if (!rows.length) {
      toast("Sube un dataset antes de exportar CSV.");
      return;
    }
    const columns = profile.columns.map((column) => column.normalizedName);
    const csv = [
      columns.map(escapeCsvCell).join(","),
      ...rows.map((row) => columns.map((column) => escapeCsvCell(row[column])).join(","))
    ].join("\r\n");
    downloadText(`${profile.id || "dataset"}-rows.csv`, csv, "text/csv;charset=utf-8");
    toast("Dataset CSV descargado.");
  }

  const exportCards: ExportCard[] = [
    { capabilityId: "dashboard.exportSpecJson", icon: FileJson, title: "Exportar DashboardSpec JSON", description: "Descarga el spec real del dashboard y su estado visual actual.", actionLabel: "Descargar JSON", onAction: exportDashboardSpec },
    { capabilityId: "dashboard.exportCsv", icon: Download, title: "Exportar dataset CSV", description: "Descarga las filas actuales del dataset activo.", actionLabel: "Descargar CSV", onAction: exportDatasetCsv },
    { capabilityId: "presentation.generate", icon: MonitorPlay, title: "Crear presentacion interactiva", description: "Crea slides navegables desde el DashboardSpec actual.", actionLabel: "Crear presentacion", href: "/app/presentaciones/crear" },
    { capabilityId: "export.interactiveManifest", icon: Lock, title: "Manifest interactivo", description: capability("export.interactiveManifest").description, actionLabel: "No disponible" },
    { capabilityId: "export.staticPdf", icon: FileText, title: "Exportar PDF", description: capability("export.staticPdf").description, actionLabel: "No disponible" },
    { capabilityId: "export.staticPng", icon: FileImage, title: "Exportar PNG", description: capability("export.staticPng").description, actionLabel: "No disponible" },
    { capabilityId: "export.staticPptx", icon: FileText, title: "Exportar PowerPoint", description: capability("export.staticPptx").description, actionLabel: "No disponible" }
  ];

  return (
    <AppShell>
      <div className="p-5 lg:p-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-black tracking-[-0.04em]">Compartir y Exportar</h1>
            <p className="mt-2 text-[#617094]">Comparte capacidades reales y descarga formatos que DashPilot ya puede producir.</p>
          </div>
          <Link href={dashboardHref} className="rounded-lg border border-[#dce3f4] bg-white px-5 py-3 text-sm font-semibold">Volver al dashboard</Link>
        </div>

        <div className="mt-7 grid gap-6 xl:grid-cols-[0.85fr_1fr]">
          <section className="soft-card rounded-xl p-6">
            <h2 className="flex items-center gap-2 text-xl font-bold">
              <Sparkles className="size-6 text-[#3d35ff]" /> Compartir enlace interactivo
              <span className="rounded-full bg-[#f0f1ff] px-3 py-1 text-xs text-[#3d35ff]">{shareLinkCapability.beta ? "Beta" : capabilityBadge(shareLinkCapability.status, shareLinkCapability.beta)}</span>
            </h2>
            <p className="mt-3 text-[#617094]">
              {shareLinkCapability.description}
            </p>
            <label className="mt-6 block text-sm font-bold">Enlace generado</label>
            <div className="mt-2 flex gap-3">
              <input readOnly value={url} className="h-12 min-w-0 flex-1 rounded-lg border border-[#dfe5f0] px-4 text-[#536088]" />
              <Button onClick={copyLink} disabled={!hasDashboard}><Copy className="size-4" /> Crear y copiar</Button>
            </div>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div className="rounded-lg border border-[#e3e8f5] p-4">
                <p className="text-sm font-bold">Expira el</p>
                <p className="mt-2 text-[#536088]">{shareSettings.expiresAt || "Sin expiracion"}</p>
              </div>
              <div className="rounded-lg border border-[#e3e8f5] p-4">
                <p className="text-sm font-bold">Acceso</p>
                <p className="mt-2 flex items-center gap-2 text-[#536088]"><Globe2 className="size-4" /> {shareSettings.access === "public" ? "Publico" : "Privado"}</p>
              </div>
            </div>
            <div className="mt-6 space-y-5">
              {[
                ["Permitir usar filtros e interacciones", "Los usuarios podran filtrar, ordenar y explorar los datos.", shareSettings.allowFilters, "allowFilters"],
                ["Permitir descarga de datos", "Los usuarios podran descargar los datos visibles.", shareSettings.allowDownload, "allowDownload"]
              ].map(([title, copy, enabled, key]) => (
                <div key={String(title)} className="flex items-center justify-between gap-5">
                  <div>
                    <p className="font-bold">{String(title)}</p>
                    <p className="text-sm text-[#617094]">{String(copy)}</p>
                  </div>
                  <button
                    onClick={() => setShareSettings({ [String(key)]: !enabled })}
                    className={`relative h-7 w-12 rounded-full transition ${enabled ? "bg-[#3d35ff]" : "bg-[#cbd3e8]"}`}
                    aria-pressed={Boolean(enabled)}
                  >
                    <span className={`absolute top-1 size-5 rounded-full bg-white transition ${enabled ? "left-6" : "left-1"}`} />
                  </button>
                </div>
              ))}
            </div>
            <p className="mt-6 rounded-lg bg-amber-50 p-4 text-sm font-semibold text-amber-800">
              La proteccion con contrasena esta desactivada hasta contar con validacion server-side. No se simula seguridad en el cliente.
            </p>
          </section>

          <section className="soft-card rounded-xl p-6">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-xl font-bold">Vista previa del enlace interactivo</h2>
              {generatedUrl ? (
                <Link href={new URL(generatedUrl).pathname} className="rounded-lg border border-[#dce3f4] px-4 py-2 text-sm font-semibold">Abrir vista previa</Link>
              ) : (
                <button disabled className="rounded-lg border border-[#dce3f4] px-4 py-2 text-sm font-semibold text-[#9aa7c7]" title="Crea un enlace verificable antes de abrir la vista previa.">Abrir vista previa</button>
              )}
            </div>
            <div className="max-h-[520px] overflow-hidden rounded-xl border border-[#e3e8f5] bg-white p-4">
              <DashboardRenderer slideWidgetIds={["kpi_sales", "kpi_margin", "kpi_tickets", "kpi_growth", "sales_by_month", "sales_by_region"]} />
            </div>
          </section>
        </div>

        <section className="mt-6 soft-card rounded-xl p-6">
          <h2 className="text-xl font-bold">Opciones de exportacion</h2>
          <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {exportCards.filter((card) => capability(card.capabilityId).visible).map((item) => {
              const itemCapability = capability(item.capabilityId);
              const disabled = !itemCapability.enabled || (item.capabilityId === "dashboard.exportCsv" ? !rows.length : !hasDashboard);
              return (
                <article key={item.title} className="rounded-xl border border-[#e3e8f5] p-5">
                  <item.icon className="size-11 rounded-lg bg-[#f0f1ff] p-2 text-[#3d35ff]" />
                  <div className="mt-4 flex items-start justify-between gap-3">
                    <h3 className="font-bold">{item.title}</h3>
                    <span className="rounded-full bg-[#f6f7ff] px-2 py-1 text-xs font-semibold text-[#536088]">{capabilityBadge(itemCapability.status, itemCapability.beta)}</span>
                  </div>
                  <p className="mt-2 min-h-12 text-sm leading-6 text-[#617094]">{item.description}</p>
                  {item.href && itemCapability.enabled ? (
                    <Link href={item.href} className="mt-4 inline-flex h-9 items-center rounded-lg border border-[#dce3f4] px-4 text-sm font-semibold">{item.actionLabel}</Link>
                  ) : (
                    <Button onClick={item.onAction} disabled={disabled} variant="secondary" className="mt-4 h-9 px-4" title={disabled ? item.description : undefined}>
                      {item.actionLabel}
                    </Button>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
