"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { DashboardFilters, DashboardRenderer } from "@/components/dashboard/dashboard-renderer";
import { Logo } from "@/components/shared/logo";
import { loadPublicShare } from "@/lib/data-access";
import { useDashPilotStore } from "@/lib/store/app-store";

export function PublicSharePage() {
  const params = useParams<{ token?: string }>();
  const token = params.token ?? "demo";
  const allowFilters = useDashPilotStore((state) => state.shareSettings.allowFilters);
  const dashboard = useDashPilotStore((state) => state.dashboard);
  const hydrateDashboard = useDashPilotStore((state) => state.hydrateDashboard);
  const setShareSettings = useDashPilotStore((state) => state.setShareSettings);
  const [loading, setLoading] = useState(token !== "demo");
  const [error, setError] = useState("");

  useEffect(() => {
    if (token === "demo") return;
    let active = true;
    setLoading(true);
    void loadPublicShare(token)
      .then((payload) => {
        if (!active) return;
        if (!payload) {
          setError("Este enlace no existe o ha expirado.");
          return;
        }
        hydrateDashboard({ rows: payload.rows, dashboard: payload.dashboard, viewState: payload.viewState, profile: payload.profile });
        setShareSettings({
          access: payload.link.access,
          expiresAt: payload.link.expiresAt ?? "",
          allowFilters: payload.link.allowFilters,
          allowDownload: payload.link.allowDownload
        });
      })
      .catch(() => setError("Este enlace no existe o ha expirado."))
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [hydrateDashboard, setShareSettings, token]);

  if (loading) {
    return (
      <div className="grid min-h-[100dvh] place-items-center bg-[#f8faff] text-[#071334]">
        <p className="rounded-xl border border-[#e3e8f5] bg-white px-6 py-4 text-sm font-semibold text-[#3d35ff]">Cargando enlace compartido...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="grid min-h-[100dvh] place-items-center bg-[#f8faff] px-6 text-[#071334]">
        <section className="max-w-md rounded-2xl border border-[#e3e8f5] bg-white p-8 text-center shadow-xl shadow-slate-900/5">
          <Logo />
          <h1 className="mt-6 text-2xl font-black tracking-[-0.04em]">Enlace no disponible</h1>
          <p className="mt-3 text-[#617094]">{error}</p>
          <Link href="/" className="mt-6 inline-flex h-11 items-center rounded-lg bg-[#3d35ff] px-5 text-sm font-semibold text-white">Crear mi dashboard</Link>
        </section>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-[#f8faff]">
      <header className="flex h-16 items-center justify-between border-b border-[#e3e8f5] bg-white px-6">
        <Logo />
        <div className="text-center">
          <p className="font-semibold">{dashboard.title}</p>
          <span className="rounded-full bg-[#f0f1ff] px-3 py-1 text-xs font-semibold text-[#3d35ff]">Vista compartida</span>
        </div>
        <Link href="/" className="rounded-lg bg-[#3d35ff] px-4 py-2 text-sm font-semibold text-white">Crear mi dashboard</Link>
      </header>
      <main className={`grid gap-5 p-6 ${allowFilters ? "xl:grid-cols-[1fr_280px]" : "grid-cols-1"}`}>
        <section>
          <DashboardRenderer />
        </section>
        {allowFilters && <DashboardFilters />}
      </main>
    </div>
  );
}
