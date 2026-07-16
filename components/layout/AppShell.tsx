"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Bell, Boxes, ChartNoAxesCombined, FileStack, Home, MonitorPlay, Search, Settings, Share2 } from "lucide-react";
import { Logo } from "@/components/shared/logo";
import { useAuth } from "@/components/shared/auth-provider";
import { useToast } from "@/components/shared/toast";
import { signOut } from "@/lib/supabase/auth";
import { useDashPilotStore } from "@/lib/store/app-store";
import { cn } from "@/lib/utils";
import { modeLabel, syncStatusLabel } from "@/lib/observability/modes";

const nav = [
  { href: "/app", label: "Inicio", icon: Home },
  { href: "/app/proyectos", label: "Proyectos", icon: FileStack },
  { href: "/app/datasets/preview", label: "Datasets", icon: Boxes },
  { href: "/app/dashboards/demo", label: "Dashboards", icon: ChartNoAxesCombined },
  { href: "/app/presentaciones/crear", label: "Presentaciones", icon: MonitorPlay },
  { href: "/app/dashboards/demo/compartir", label: "Compartidos", icon: Share2 },
  { href: "/app/configuracion", label: "Configuracion", icon: Settings }
];

function isActive(pathname: string, href: string) {
  if (href === "/app") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const toast = useToast();
  const { configured, user, isLocalMode } = useAuth();
  const currentProject = useDashPilotStore((state) => state.currentProject);
  const activeDatasetId = useDashPilotStore((state) => state.activeDatasetId);
  const activeDashboardId = useDashPilotStore((state) => state.activeDashboardId);
  const rows = useDashPilotStore((state) => state.rows);
  const profile = useDashPilotStore((state) => state.profile);
  const persistenceStatus = useDashPilotStore((state) => state.persistenceStatus);
  const executionMode = useDashPilotStore((state) => state.executionMode);
  const syncStatus = useDashPilotStore((state) => state.syncStatus);
  const lastSyncCorrelationId = useDashPilotStore((state) => state.lastSyncCorrelationId);
  const outboxCount = useDashPilotStore((state) => state.outboxCount);
  const retryPendingSync = useDashPilotStore((state) => state.retryPendingSync);
  const setViewState = useDashPilotStore((state) => state.setViewState);
  const [globalSearch, setGlobalSearch] = useState("");
  const hasProject = Boolean(activeDatasetId && rows.length);
  const projectName = hasProject ? currentProject.name : "Sin proyecto activo";
  const projectStatus = hasProject ? persistenceStatus || currentProject.updatedAt : "Sube un dataset para comenzar";
  const notificationCount = profile.qualityWarnings.length + (hasProject && persistenceStatus ? 1 : 0);
  const hasCriticalUnsavedChanges = ["pending", "retrying", "failed", "conflict"].includes(syncStatus);
  const syncTone = syncStatus === "saved" ? "bg-emerald-50 text-emerald-700" : syncStatus === "failed" || syncStatus === "conflict" ? "bg-rose-50 text-rose-700" : syncStatus === "retrying" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-600";

  useEffect(() => {
    if (!hasCriticalUnsavedChanges) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "Hay cambios pendientes de sincronizar.";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasCriticalUnsavedChanges]);

  async function logout() {
    try {
      await signOut();
      toast("Sesion cerrada.");
    } catch (error) {
      toast(error instanceof Error ? error.message : "No se pudo cerrar sesion.");
    }
  }

  function runGlobalSearch() {
    const query = globalSearch.trim();
    if (!query) return;
    if (!hasProject) {
      toast("Sube un dataset para buscar en DashPilot.");
      return;
    }
    setViewState({ dataExplorer: { isOpen: true, search: query } });
    router.push(`/app/dashboards/${activeDashboardId || "demo"}`);
  }

  return (
    <div className="min-h-[100dvh] bg-[#f8faff] text-[#071334]">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[268px] border-r border-[#e3e8f5] bg-white px-5 py-7 lg:block">
        <Link href="/app" aria-label="Ir al inicio interno">
          <Logo />
        </Link>
        <nav className="mt-14 space-y-2" aria-label="Navegacion interna">
          {nav.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.label}
                href={item.href}
                className={cn(
                  "flex items-center gap-4 rounded-lg px-3 py-3 text-sm font-medium text-[#485579] transition hover:bg-[#f3f5ff]",
                  active && "bg-[#f0f1ff] text-[#332cff]"
                )}
              >
                <item.icon className="size-5" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="absolute bottom-8 left-5 right-5">
          <div className="rounded-lg border border-[#e3e8f5] bg-white p-4">
            <p className="text-sm font-semibold">Plan Empresarial</p>
            <p className="mt-4 text-xs text-[#657095]">Uso de IA este mes</p>
            <div className="mt-3 h-1.5 rounded-full bg-[#e5e9f6]">
              <div className="h-full w-[78%] rounded-full bg-[#3d35ff]" />
            </div>
            <p className="mt-3 text-xs text-[#657095]">2,340 / 3,000 creditos</p>
          </div>
        </div>
      </aside>

      <header className="sticky top-0 z-20 border-b border-[#e3e8f5] bg-white/92 backdrop-blur lg:ml-[268px]">
        <div className="flex h-20 items-center justify-between gap-4 px-5 lg:px-8">
          <div>
            <p className="text-xs text-[#6b7698]">Proyecto</p>
            <div className="mt-1 flex items-center gap-3">
              <h1 className="text-sm font-bold lg:text-base">{projectName}</h1>
              <span className={cn("size-2.5 rounded-full", hasProject ? "bg-emerald-500" : "bg-slate-300")} />
              <span className="hidden text-xs text-[#6b7698] sm:inline">{projectStatus}</span>
            </div>
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              runGlobalSearch();
            }}
            className="hidden h-11 w-[380px] items-center gap-3 rounded-lg border border-[#dfe5f0] bg-[#fbfcff] px-4 text-sm text-[#7a85a6] xl:flex"
          >
            <Search className="size-5" />
            <input className="min-w-0 flex-1 bg-transparent outline-none" placeholder="Buscar en DashPilot..." value={globalSearch} onChange={(event) => setGlobalSearch(event.target.value)} />
            <span className="ml-auto rounded border border-[#dfe5f0] px-1.5 text-xs">⌘ K</span>
          </form>
          <div className="flex items-center gap-4">
            {isLocalMode && (
              <span className="hidden rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 md:inline">
                Modo local
              </span>
            )}
            {configured && user && (
              <span className="hidden rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 md:inline">
                Conectado a Supabase
              </span>
            )}
            {configured && !user && (
              <Link href="/login" className="rounded-lg border border-[#dce3f4] px-3 py-2 text-sm font-semibold text-[#3d35ff]">
                Iniciar sesion
              </Link>
            )}
            {hasProject && (
              <button
                onClick={() => hasCriticalUnsavedChanges ? void retryPendingSync() : toast(`${syncStatusLabel(syncStatus)} via ${modeLabel(executionMode)}${lastSyncCorrelationId ? ` · ID ${lastSyncCorrelationId}` : ""}`)}
                className={cn("hidden rounded-full px-3 py-1 text-xs font-semibold md:inline", syncTone)}
                title={lastSyncCorrelationId ? `Correlation ID: ${lastSyncCorrelationId}` : undefined}
              >
                {syncStatusLabel(syncStatus)} · {modeLabel(executionMode)}{outboxCount ? ` · ${outboxCount} pendiente(s)` : ""}
              </button>
            )}
            <button onClick={() => toast(notificationCount ? [...profile.qualityWarnings, persistenceStatus].filter(Boolean).slice(0, 3).join(" ") : "No hay notificaciones pendientes.")} className="relative" aria-label="Ver notificaciones">
              <Bell className="size-5 text-[#536088]" />
              {notificationCount > 0 && <span className="absolute -right-2 -top-2 grid size-5 place-items-center rounded-full bg-red-500 text-[10px] font-bold text-white">{Math.min(9, notificationCount)}</span>}
            </button>
            <Link href="/app/configuracion" className="flex items-center gap-3">
              <div className="grid size-10 place-items-center rounded-full bg-gradient-to-br from-slate-200 to-slate-400 text-sm font-bold">CM</div>
              <div className="hidden md:block">
                <p className="text-sm font-bold">{user?.email ?? "Carlos Mendoza"}</p>
                <p className="text-xs text-[#6b7698]">{configured ? (user ? "Sesion Supabase" : "Sin sesion") : "Modo local"}</p>
              </div>
            </Link>
            {user && (
              <button onClick={logout} className="hidden rounded-lg border border-[#dce3f4] px-3 py-2 text-xs font-semibold md:inline">
                Salir
              </button>
            )}
          </div>
        </div>
      </header>

      <main className={cn("lg:ml-[268px]", right && "xl:mr-[360px]")}>
        {!configured && (
          <div className="border-b border-amber-200 bg-amber-50 px-5 py-2 text-sm font-semibold text-amber-800 lg:px-8">
            Supabase no esta configurado. DashPilot esta funcionando en modo local.
          </div>
        )}
        {configured && !user && (
          <div className="border-b border-[#dfe5fb] bg-[#f6f7ff] px-5 py-2 text-sm font-semibold text-[#3d35ff] lg:px-8">
            Inicia sesion para guardar datasets, dashboards y enlaces en Supabase.
          </div>
        )}
        {children}
      </main>
      {right}
    </div>
  );
}
