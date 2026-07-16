"use client";

import { useEffect, useMemo } from "react";
import { createCorrelationId } from "@/lib/observability/domain-error";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const correlationId = useMemo(() => error.digest ?? createCorrelationId("ui"), [error.digest]);

  useEffect(() => {
    console.error("[DashPilot] ui.error", {
      correlationId,
      message: error.message,
      digest: error.digest
    });
  }, [correlationId, error]);

  return (
    <main className="grid min-h-[100dvh] place-items-center bg-[#f8faff] p-6 text-[#071334]">
      <section className="max-w-lg rounded-xl border border-rose-200 bg-white p-6 shadow-xl shadow-slate-900/10">
        <p className="text-sm font-bold text-rose-700">Error de aplicacion</p>
        <h1 className="mt-2 text-2xl font-black tracking-[-0.04em]">No pudimos completar la operacion.</h1>
        <p className="mt-3 text-sm leading-6 text-[#536088]">
          El fallo quedo registrado para diagnostico. No vuelvas a intentar una accion destructiva hasta verificar el estado guardado.
        </p>
        <p className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800">Correlation ID: {correlationId}</p>
        <button onClick={reset} className="mt-5 rounded-lg bg-[#3d35ff] px-4 py-2 text-sm font-semibold text-white">
          Reintentar
        </button>
      </section>
    </main>
  );
}
