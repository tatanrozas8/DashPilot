"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BarChart3, FileUp, Lock, MessageCircle, Presentation, Sparkles, Upload, WandSparkles, type LucideIcon } from "lucide-react";
import { Button } from "@/components/shared/button";
import { Logo } from "@/components/shared/logo";
import { parseUploadedFile } from "@/lib/files/parse-file";
import { persistParsedDataset } from "@/lib/data-access";
import { useDashPilotStore } from "@/lib/store/app-store";

export function LandingPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const loadDemo = useDashPilotStore((state) => state.loadDemo);
  const setParsedDataset = useDashPilotStore((state) => state.setParsedDataset);
  const setPersistenceState = useDashPilotStore((state) => state.setPersistenceState);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  async function handleFile(file: File) {
    try {
      setError("");
      setStatus("Subiendo archivo...");
      const parsed = await parseUploadedFile(file);
      setParsedDataset(parsed);
      setStatus("Guardando dataset...");
      const result = await persistParsedDataset({ file, parsed });
      setPersistenceState({
        activeDatasetId: result.datasetId,
        activeProjectId: result.projectId ?? "local-project",
        persistenceMode: result.mode,
        persistenceStatus: result.warning ?? (result.mode === "supabase" ? "Guardado en Supabase" : "Modo local")
      });
      router.push(`/app/datasets/${result.datasetId}/preview`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo procesar el archivo.");
      setStatus("");
    }
  }

  function startDemo() {
    loadDemo();
    router.push("/app/datasets/preview");
  }

  function startDemoDashboard() {
    loadDemo();
    router.push("/app/dashboards/demo");
  }

  return (
    <div className="min-h-[100dvh] bg-white text-[#071334]">
      <header className="border-b border-[#e4e9f7]">
        <nav className="mx-auto flex h-[88px] max-w-[1440px] items-center justify-between px-6">
          <Logo />
          <div className="hidden items-center gap-12 text-sm font-medium text-[#071334] lg:flex">
            <span>Producto⌄</span>
            <span>Soluciones⌄</span>
            <span>Precios</span>
            <span>Recursos⌄</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/login" className="hidden h-11 items-center rounded-lg border border-[#dce3f4] bg-white px-5 text-sm font-semibold text-[#071334] transition hover:border-[#bfc9ea] sm:inline-flex">
              Iniciar sesion
            </Link>
            <Link href="/login" className="inline-flex h-11 items-center rounded-lg bg-[#3d35ff] px-5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 transition hover:bg-[#3028df]">
              Comenzar gratis
            </Link>
          </div>
        </nav>
      </header>

      <main className="mx-auto max-w-[1440px] px-6 pb-10 pt-14">
        <section className="grid items-center gap-14 lg:grid-cols-[0.82fr_1fr]">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[#dce0ff] bg-[#f6f5ff] px-4 py-2 text-sm font-semibold text-[#3d35ff]">
              <Sparkles className="size-4" /> Tu copiloto de datos con IA
            </div>
            <h1 className="mt-6 max-w-[680px] text-5xl font-black leading-[1.05] tracking-[-0.06em] sm:text-6xl lg:text-7xl">
              Convierte Excel en dashboards ejecutivos con <span className="text-[#3d35ff]">IA</span>
            </h1>
            <p className="mt-5 max-w-[660px] text-lg leading-8 text-[#617094]">
              Sube tu archivo de Excel o CSV y obten en minutos un dashboard profesional, interactivo y listo para tomar mejores decisiones.
            </p>

            <div
              className="mt-7 rounded-2xl border-2 border-dashed border-[#bfc7ff] bg-white p-7 text-center"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                const file = event.dataTransfer.files[0];
                if (file) void handleFile(file);
              }}
            >
              <div className="mx-auto grid size-14 place-items-center rounded-xl bg-[#eef0ff] text-[#3d35ff]">
                <Upload className="size-7" />
              </div>
              <h2 className="mt-5 text-lg font-bold">Arrastra tu archivo aqui</h2>
              <p className="mt-2 text-sm text-[#617094]">o sube un archivo Excel o CSV</p>
              <div className="mt-6 flex flex-wrap justify-center gap-3">
                <input
                  ref={inputRef}
                  hidden
                  type="file"
                  accept=".csv,.xls,.xlsx"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void handleFile(file);
                  }}
                />
                <Button onClick={() => inputRef.current?.click()}><FileUp className="size-4" /> Subir Excel</Button>
                <Button variant="secondary" onClick={startDemo}><Sparkles className="size-4" /> Probar con datos de ejemplo</Button>
              </div>
              <p className="mt-5 flex items-center justify-center gap-2 text-sm text-[#617094]"><Lock className="size-4" /> Tus datos estan seguros y nunca se comparten.</p>
              {status && <p className="mt-4 text-sm font-semibold text-[#3d35ff]">{status}</p>}
              {error && <p className="mt-4 text-sm font-semibold text-red-600">{error}</p>}
            </div>

            <div className="mt-5">
              <p className="mb-3 text-sm font-semibold text-[#536088]">Prueba con estas sugerencias</p>
              <div className="flex flex-wrap gap-3">
                {["Analiza mis ventas", "Muestrame los mejores clientes", "Haz un resumen ejecutivo"].map((item) => (
                  <button key={item} onClick={startDemoDashboard} className="rounded-full border border-[#dfe5fb] px-4 py-2 text-sm font-semibold text-[#3d35ff]">
                    <Sparkles className="mr-2 inline size-4" /> {item}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="shell-shadow rounded-2xl border border-[#e3e8f5] bg-white p-5">
            <div className="mb-5 flex items-center justify-between">
              <Logo compact />
              <span className="text-sm font-bold">Datos de ejemplo</span>
              <Link href="/app/presentaciones/crear" className="inline-flex h-9 items-center rounded-lg bg-[#3d35ff] px-4 text-sm font-semibold text-white">Presentar</Link>
            </div>
            <div className="grid grid-cols-4 gap-3">
              {[
                ["Ventas Totales", "$2.45M", "blue"],
                ["Margen Bruto", "37.8%", "violet"],
                ["Tickets", "24,812", "green"],
                ["Crecimiento", "18.6%", "sky"]
              ].map(([label, value, tone]) => (
                <div key={label} className="rounded-xl border border-[#e3e8f5] p-4">
                  <div className="mb-3"><BarChart3 className={`size-6 ${tone === "green" ? "text-emerald-600" : "text-[#3d35ff]"}`} /></div>
                  <p className="text-xs font-semibold text-[#617094]">{label}</p>
                  <p className="mt-1 text-2xl font-black">{value}</p>
                  <div className="mt-4 h-8 rounded-full bg-gradient-to-r from-[#3d35ff] to-[#8c87ff]" />
                </div>
              ))}
            </div>
            <div className="mt-4 grid gap-4 lg:grid-cols-[1.25fr_1fr]">
              <div className="rounded-xl border border-[#e3e8f5] p-5">
                <h3 className="font-bold">Ventas Totales por Mes</h3>
                <div className="mt-5 h-56 rounded-lg bg-[linear-gradient(180deg,#ffffff,#f6f8ff)]">
                  <svg viewBox="0 0 520 220" className="h-full w-full">
                    <polyline fill="none" stroke="#3d35ff" strokeWidth="5" points="40,150 120,128 190,104 270,90 350,78 460,68" />
                    <polyline fill="none" stroke="#aab4d4" strokeDasharray="8 8" strokeWidth="3" points="40,180 120,160 190,150 270,130 350,122 460,108" />
                  </svg>
                </div>
              </div>
              <div className="rounded-xl border border-[#e3e8f5] p-5">
                <h3 className="font-bold">Copiloto IA</h3>
                <div className="mt-5 space-y-3 text-sm text-[#34405f]">
                  <div className="rounded-xl bg-[#f0efff] p-4">Haz que este dashboard sea mas ejecutivo.</div>
                  <div className="rounded-xl border border-[#e3e8f5] p-4">Actualice KPIs, comparaciones y resumen ejecutivo.</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-16 grid gap-7 lg:grid-cols-3">
          {([
            [WandSparkles, "Generacion automatica", "La IA analiza tus datos y construye dashboards con KPIs, graficos y tablas relevantes."],
            [MessageCircle, "Edicion por chat", "Pide cambios en lenguaje natural. DashPilot actualiza el spec al instante."],
            [Presentation, "Presentaciones interactivas", "Presenta, filtra y explora datos en vivo con dashboards disenados para impresionar."]
          ] as Array<[LucideIcon, string, string]>).map(([Icon, title, copy]) => (
            <article key={String(title)} className="soft-card rounded-2xl p-8">
              <Icon className="size-12 rounded-xl bg-[#f0f1ff] p-3 text-[#3d35ff]" />
              <h3 className="mt-6 text-2xl font-bold tracking-[-0.03em]">{String(title)}</h3>
              <p className="mt-3 leading-7 text-[#617094]">{String(copy)}</p>
              <p className="mt-6 font-bold text-[#3d35ff]">Saber mas →</p>
            </article>
          ))}
        </section>
      </main>
    </div>
  );
}
