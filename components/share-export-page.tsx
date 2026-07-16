"use client";

import { useState } from "react";
import Link from "next/link";
import { Copy, Download, FileImage, FileText, Globe2, Lock, MonitorPlay, Sparkles, type LucideIcon } from "lucide-react";
import { DashboardRenderer } from "@/components/dashboard/dashboard-renderer";
import { AppShell } from "@/components/shared/app-shell";
import { Button } from "@/components/shared/button";
import { useToast } from "@/components/shared/toast";
import { persistShareLink } from "@/lib/data-access";
import { useDashPilotStore } from "@/lib/store/app-store";

export function ShareExportPage() {
  const toast = useToast();
  const [generatedUrl, setGeneratedUrl] = useState("");
  const shareSettings = useDashPilotStore((state) => state.shareSettings);
  const setShareSettings = useDashPilotStore((state) => state.setShareSettings);
  const dashboard = useDashPilotStore((state) => state.dashboard);
  const activeDashboardId = useDashPilotStore((state) => state.activeDashboardId);
  const rows = useDashPilotStore((state) => state.rows);
  const setPersistenceState = useDashPilotStore((state) => state.setPersistenceState);
  const hasDashboard = rows.length > 0 && dashboard.widgets.length > 0;
  const url = generatedUrl || "Aún no hay enlaces compartidos";
  const dashboardHref = `/app/dashboards/${activeDashboardId || dashboard.id}`;

  async function copyLink() {
    try {
      if (!hasDashboard) {
        toast("Sube un dataset para comenzar.");
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
      setPersistenceState({ persistenceMode: result.mode, persistenceStatus: result.warning ?? (result.mode === "supabase" ? "Enlace compartido creado" : "Enlace compartido local"), executionMode: result.executionMode, syncStatus: result.syncStatus, lastSyncCorrelationId: result.correlationId, lastSyncError: result.warning });
      await navigator.clipboard?.writeText(result.url);
      toast(result.mode === "supabase" ? "Enlace compartido creado y copiado." : "Enlace local creado y copiado.");
    } catch (error) {
      toast(error instanceof Error ? error.message : "No se pudo crear el enlace.");
    }
  }

  const exports: Array<[LucideIcon, string, string, string, string | undefined]> = [
    [Download, "Descargar dashboard interactivo", "Guarda una copia interactiva (.dpdash) para abrirla en DashPilot.", "Dashboard interactivo preparado para descarga.", undefined],
    [MonitorPlay, "Crear presentacion interactiva", "Genera una presentacion navegable con los insights clave.", "", "/app/presentaciones/crear"],
    [FileText, "Exportar PDF", "Exporta una version estatica en PDF, lista para compartir o imprimir.", "PDF generado correctamente.", undefined],
    [FileImage, "Exportar PNG", "Descarga una imagen en alta resolucion del dashboard actual.", "PNG generado correctamente.", undefined],
    [FileText, "Exportar PowerPoint", "Crea un archivo .pptx editable con graficos y tablas.", "PowerPoint generado correctamente.", undefined],
    [Lock, "Manifest interactivo", "Prepara el paquete estructurado para portabilidad futura.", "Manifest interactivo preparado.", undefined]
  ];

  return (
    <AppShell>
      <div className="p-5 lg:p-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-black tracking-[-0.04em]">Compartir y Exportar</h1>
            <p className="mt-2 text-[#617094]">Comparte tu dashboard o exportalo en el formato que mejor se adapte a tus necesidades.</p>
          </div>
          <Link href={dashboardHref} className="rounded-lg border border-[#dce3f4] bg-white px-5 py-3 text-sm font-semibold">Volver al dashboard</Link>
        </div>

        <div className="mt-7 grid gap-6 xl:grid-cols-[0.85fr_1fr]">
          <section className="soft-card rounded-xl p-6">
            <h2 className="flex items-center gap-2 text-xl font-bold">
              <Sparkles className="size-6 text-[#3d35ff]" /> Compartir enlace interactivo
              <span className="rounded-full bg-[#f0f1ff] px-3 py-1 text-xs text-[#3d35ff]">Recomendado</span>
            </h2>
            <p className="mt-3 text-[#617094]">Comparte un enlace interactivo para que otros exploren el dashboard con filtros y actualizaciones en tiempo real.</p>
            <label className="mt-6 block text-sm font-bold">Enlace generado</label>
            <div className="mt-2 flex gap-3">
              <input readOnly value={url} className="h-12 min-w-0 flex-1 rounded-lg border border-[#dfe5f0] px-4 text-[#536088]" />
              <Button onClick={copyLink}><Copy className="size-4" /> Copiar enlace</Button>
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
                ["Permitir descarga de datos", "Los usuarios podran descargar los datos visibles.", shareSettings.allowDownload, "allowDownload"],
                ["Requerir contrasena", "Anade una contrasena para restringir el acceso.", shareSettings.requirePassword, "requirePassword"]
              ].map(([title, copy, enabled, key]) => (
                <div key={String(title)} className="flex items-center justify-between gap-5">
                  <div>
                    <p className="font-bold">{String(title)}</p>
                    <p className="text-sm text-[#617094]">{String(copy)}</p>
                  </div>
                  <button
                    onClick={() => setShareSettings({ [String(key)]: !enabled })}
                    className={`relative h-7 w-12 rounded-full transition ${enabled ? "bg-[#3d35ff]" : "bg-[#cbd3e8]"}`}
                  >
                    <span className={`absolute top-1 size-5 rounded-full bg-white transition ${enabled ? "left-6" : "left-1"}`} />
                  </button>
                </div>
              ))}
            </div>
            <p className="mt-6 rounded-lg bg-[#f0f1ff] p-4 text-sm text-[#3d35ff]">Cualquier cambio en el dashboard se reflejara automaticamente en el enlace.</p>
          </section>

          <section className="soft-card rounded-xl p-6">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-xl font-bold">Vista previa del enlace interactivo</h2>
              <Link href={generatedUrl ? new URL(generatedUrl).pathname : "/app/proyectos"} className="rounded-lg border border-[#dce3f4] px-4 py-2 text-sm font-semibold">Abrir vista previa</Link>
            </div>
            <div className="max-h-[520px] overflow-hidden rounded-xl border border-[#e3e8f5] bg-white p-4">
              <DashboardRenderer slideWidgetIds={["kpi_sales", "kpi_margin", "kpi_tickets", "kpi_growth", "sales_by_month", "sales_by_region"]} />
            </div>
          </section>
        </div>

        <section className="mt-6 soft-card rounded-xl p-6">
          <h2 className="text-xl font-bold">Otras opciones de exportacion</h2>
          <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {exports.map(([Icon, title, copy, message, href]) => (
              <article key={title} className="rounded-xl border border-[#e3e8f5] p-5">
                <Icon className="size-11 rounded-lg bg-[#f0f1ff] p-2 text-[#3d35ff]" />
                <h3 className="mt-4 font-bold">{title}</h3>
                <p className="mt-2 min-h-12 text-sm leading-6 text-[#617094]">{copy}</p>
                {href ? (
                  <Link href={href} className="mt-4 inline-flex h-9 items-center rounded-lg border border-[#dce3f4] px-4 text-sm font-semibold">Crear presentacion</Link>
                ) : (
                  <Button onClick={() => toast(message)} variant="secondary" className="mt-4 h-9 px-4">
                    {title.includes("Descargar") ? "Descargar" : title.includes("Manifest") ? "Generar manifest" : title}
                  </Button>
                )}
              </article>
            ))}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
