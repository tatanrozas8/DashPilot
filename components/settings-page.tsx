"use client";

import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/shared/button";
import { useToast } from "@/components/shared/toast";

export function SettingsPage() {
  const toast = useToast();

  return (
    <AppShell>
      <div className="p-5 lg:p-8">
        <h1 className="text-3xl font-black tracking-[-0.04em]">Configuracion</h1>
        <p className="mt-2 text-[#617094]">Preferencias basicas del workspace para este MVP.</p>
        <section className="mt-7 max-w-3xl soft-card rounded-xl p-6">
          <label className="block text-sm font-bold">Nombre del workspace</label>
          <input className="mt-2 h-11 w-full rounded-lg border border-[#dfe5f0] px-4" defaultValue="DashPilot Comercial" />
          <label className="mt-5 block text-sm font-bold">Idioma</label>
          <select className="mt-2 h-11 w-full rounded-lg border border-[#dfe5f0] bg-white px-4">
            <option>Espanol Latinoamerica</option>
          </select>
          <Button onClick={() => toast("Configuracion guardada.")} className="mt-6">Guardar configuracion</Button>
        </section>
      </div>
    </AppShell>
  );
}
