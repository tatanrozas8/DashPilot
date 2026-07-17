"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PublicDashboardSnapshot } from "@/components/public-dashboard-snapshot";
import { Logo } from "@/components/shared/logo";
import { loadPublicShare } from "@/lib/data-access";
import type { DashboardFilter, DashboardFilterOption } from "@/types/dashboard";
import type { PublicSharedDashboard } from "@/lib/data-access/types";

interface DraftPublicFilter {
  field: string;
  optionIndex: number;
}

export function PublicSharePage() {
  const params = useParams<{ token?: string }>();
  const token = params.token ?? "demo";
  const [loading, setLoading] = useState(token !== "demo");
  const [filterLoading, setFilterLoading] = useState(false);
  const [payload, setPayload] = useState<PublicSharedDashboard | null>(null);
  const [password, setPassword] = useState("");
  const [draftFilter, setDraftFilter] = useState<DraftPublicFilter | null>(null);
  const [activeFilters, setActiveFilters] = useState<DashboardFilter[]>([]);
  const [error, setError] = useState("");
  const [filterError, setFilterError] = useState("");

  useEffect(() => {
    if (token === "demo") return;
    let active = true;
    void Promise.resolve().then(() => {
      if (active) setLoading(true);
    });
    void loadPublicShare(token)
      .then((payload) => {
        if (!active) return;
        if (!payload) {
          setError("No se pudo abrir este enlace. Puede haber expirado, estar revocado o requerir credenciales.");
          return;
        }
        setPayload(payload);
        setError("");
      })
      .catch(() => setError("No se pudo abrir este enlace. Puede haber expirado, estar revocado o requerir credenciales."))
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [token]);

  async function submitPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const nextPayload = await loadPublicShare(token, password);
      if (!nextPayload) {
        setError("No se pudo abrir este enlace. Puede haber expirado, estar revocado o requerir credenciales.");
        return;
      }
      setPayload(nextPayload);
    } catch {
      setError("No se pudo abrir este enlace. Puede haber expirado, estar revocado o requerir credenciales.");
    } finally {
      setLoading(false);
    }
  }

  function filterFromDraft(currentPayload: PublicSharedDashboard): DashboardFilter[] {
    if (!draftFilter) return [];
    const filter = currentPayload.allowedFilters.find((item) => item.field === draftFilter.field);
    const option = filter?.allowedValues?.[draftFilter.optionIndex];
    if (!filter || !option) return [];
    return [{ field: filter.field, operator: "in", value: [option.value] }];
  }

  async function applyFilters() {
    if (!payload) return;
    const nextFilters = filterFromDraft(payload);
    if (!nextFilters.length) {
      setFilterError("Selecciona un valor permitido antes de aplicar filtros.");
      return;
    }
    setFilterLoading(true);
    setFilterError("");
    try {
      const nextPayload = await loadPublicShare(token, password || undefined, nextFilters);
      if (!nextPayload) {
        setFilterError("El filtro solicitado no es valido para este enlace.");
        return;
      }
      setPayload(nextPayload);
      setActiveFilters(nextFilters);
    } catch {
      setFilterError("No se pudo aplicar el filtro. El dashboard conserva el ultimo estado valido.");
    } finally {
      setFilterLoading(false);
    }
  }

  async function clearFilters() {
    setFilterLoading(true);
    setFilterError("");
    try {
      const basePayload = await loadPublicShare(token, password || undefined, []);
      if (!basePayload) {
        setFilterError("No se pudo limpiar el filtro para este enlace.");
        return;
      }
      setPayload(basePayload);
      setDraftFilter(null);
      setActiveFilters([]);
    } catch {
      setFilterError("No se pudo limpiar el filtro. El dashboard conserva el ultimo estado valido.");
    } finally {
      setFilterLoading(false);
    }
  }

  function optionLabel(option: DashboardFilterOption) {
    return option.label || String(option.value);
  }

  if (loading) {
    return (
      <div className="grid min-h-[100dvh] place-items-center bg-[#f8faff] text-[#071334]">
        <p className="rounded-xl border border-[#e3e8f5] bg-white px-6 py-4 text-sm font-semibold text-[#3d35ff]">Cargando enlace compartido...</p>
      </div>
    );
  }

  if (error && !payload) {
    return (
      <div className="grid min-h-[100dvh] place-items-center bg-[#f8faff] px-6 text-[#071334]">
        <section className="w-full max-w-md rounded-2xl border border-[#e3e8f5] bg-white p-8 text-center shadow-xl shadow-slate-900/5">
          <Logo />
          <h1 className="mt-6 text-2xl font-black tracking-[-0.04em]">Enlace no disponible</h1>
          <p className="mt-3 text-[#617094]">{error}</p>
          <form onSubmit={submitPassword} className="mt-6 text-left">
            <label className="text-sm font-bold text-[#34405f]">
              Contrasena del enlace
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="mt-2 h-11 w-full rounded-lg border border-[#dfe5f0] px-4"
                autoComplete="current-password"
              />
            </label>
            <button type="submit" className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-lg bg-[#3d35ff] px-5 text-sm font-semibold text-white">Intentar acceso</button>
          </form>
          <Link href="/" className="mt-6 inline-flex h-11 items-center rounded-lg bg-[#3d35ff] px-5 text-sm font-semibold text-white">Crear mi dashboard</Link>
        </section>
      </div>
    );
  }

  if (!payload) {
    return (
      <div className="grid min-h-[100dvh] place-items-center bg-[#f8faff] px-6 text-[#071334]">
        <section className="max-w-md rounded-2xl border border-[#e3e8f5] bg-white p-8 text-center shadow-xl shadow-slate-900/5">
          <Logo />
          <h1 className="mt-6 text-2xl font-black tracking-[-0.04em]">Enlace no disponible</h1>
          <p className="mt-3 text-[#617094]">No se pudo abrir este enlace.</p>
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
          <p className="font-semibold">{payload.dashboard.title}</p>
          <span className="rounded-full bg-[#f0f1ff] px-3 py-1 text-xs font-semibold text-[#3d35ff]">Vista compartida</span>
        </div>
        <Link href="/" className="rounded-lg bg-[#3d35ff] px-4 py-2 text-sm font-semibold text-white">Crear mi dashboard</Link>
      </header>
      <main className={`grid gap-5 p-6 ${payload.link.allowFilters ? "xl:grid-cols-[1fr_280px]" : "grid-cols-1"}`}>
        <section>
          <PublicDashboardSnapshot payload={payload} />
        </section>
        {payload.link.allowFilters && (
          <aside className="h-fit rounded-xl border border-[#e3e8f5] bg-white p-5">
            <h2 className="font-bold">Filtros permitidos</h2>
            {payload.allowedFilters.length ? (
              <>
                <div className="mt-4 space-y-3">
                  {payload.allowedFilters.map((filter) => (
                    <label key={filter.id} className="block rounded-lg border border-[#e3e8f5] p-3">
                      <span className="text-sm font-bold">{filter.label}</span>
                      <select
                        className="mt-2 h-10 w-full rounded-md border border-[#dfe5f0] bg-white px-3 text-sm"
                        value={draftFilter?.field === filter.field ? String(draftFilter.optionIndex) : ""}
                        onChange={(event) => {
                          const nextValue = event.target.value;
                          setDraftFilter(nextValue === "" ? null : { field: filter.field, optionIndex: Number(nextValue) });
                          setFilterError("");
                        }}
                      >
                        <option value="">Todos</option>
                        {(filter.allowedValues ?? []).map((option, index) => (
                          <option key={`${filter.field}-${index}`} value={index}>{optionLabel(option)}</option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
                <div className="mt-4 flex gap-2">
                  <button type="button" onClick={applyFilters} disabled={filterLoading} className="h-10 flex-1 rounded-lg bg-[#3d35ff] px-4 text-sm font-semibold text-white disabled:opacity-60">
                    {filterLoading ? "Aplicando..." : "Aplicar filtros"}
                  </button>
                  <button type="button" onClick={clearFilters} disabled={filterLoading || activeFilters.length === 0} className="h-10 rounded-lg border border-[#dce3f4] px-4 text-sm font-semibold text-[#34405f] disabled:opacity-50">
                    Limpiar
                  </button>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {activeFilters.length ? activeFilters.map((filter) => (
                    <span key={`${filter.field}-${String(filter.value)}`} className="rounded-full bg-[#f0f1ff] px-3 py-1 text-xs font-semibold text-[#3d35ff]">
                      {filter.field}: {Array.isArray(filter.value) ? filter.value.join(", ") : String(filter.value)}
                    </span>
                  )) : <span className="text-xs font-semibold text-[#697597]">Sin filtros activos</span>}
                </div>
                {filterError && <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{filterError}</p>}
              </>
            ) : (
              <p className="mt-4 text-sm text-[#617094]">Este dashboard no publico filtros utilizables.</p>
            )}
          </aside>
        )}
      </main>
    </div>
  );
}
