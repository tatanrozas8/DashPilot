"use client";

import { useState, useSyncExternalStore } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/shared/button";
import { useToast } from "@/components/shared/toast";

const settingKeys = new Set(["dashpilot.workspaceName", "dashpilot.language"]);

function readStoredSetting(key: string, fallback: string) {
  if (typeof window === "undefined") return fallback;
  return localStorage.getItem(key) ?? fallback;
}

function subscribeToStoredSettings(onStoreChange: () => void) {
  if (typeof window === "undefined") return () => {};
  const listener = (event: StorageEvent) => {
    if (!event.key || settingKeys.has(event.key)) onStoreChange();
  };
  window.addEventListener("storage", listener);
  return () => window.removeEventListener("storage", listener);
}

function useStoredSetting(key: string, fallback: string) {
  return useSyncExternalStore(
    subscribeToStoredSettings,
    () => readStoredSetting(key, fallback),
    () => fallback
  );
}

export function SettingsPage() {
  const toast = useToast();
  const storedWorkspaceName = useStoredSetting("dashpilot.workspaceName", "DashPilot Comercial");
  const storedLanguage = useStoredSetting("dashpilot.language", "es-LatAm");
  const [workspaceNameDraft, setWorkspaceNameDraft] = useState<string | null>(null);
  const [languageDraft, setLanguageDraft] = useState<string | null>(null);
  const workspaceName = workspaceNameDraft ?? storedWorkspaceName;
  const language = languageDraft ?? storedLanguage;

  function saveSettings() {
    localStorage.setItem("dashpilot.workspaceName", workspaceName);
    localStorage.setItem("dashpilot.language", language);
    toast("Configuracion guardada localmente.");
  }

  return (
    <AppShell>
      <div className="p-5 lg:p-8">
        <h1 className="text-3xl font-black tracking-[-0.04em]">Configuracion</h1>
        <p className="mt-2 text-[#617094]">Preferencias basicas del workspace para este MVP.</p>
        <section className="mt-7 max-w-3xl soft-card rounded-xl p-6">
          <label htmlFor="workspaceName" className="block text-sm font-bold">Nombre del workspace</label>
          <input id="workspaceName" className="mt-2 h-11 w-full rounded-lg border border-[#dfe5f0] px-4" value={workspaceName} onChange={(event) => setWorkspaceNameDraft(event.target.value)} />
          <label htmlFor="workspaceLanguage" className="mt-5 block text-sm font-bold">Idioma</label>
          <select id="workspaceLanguage" className="mt-2 h-11 w-full rounded-lg border border-[#dfe5f0] bg-white px-4" value={language} onChange={(event) => setLanguageDraft(event.target.value)}>
            <option value="es-LatAm">Espanol Latinoamerica</option>
          </select>
          <Button onClick={saveSettings} className="mt-6">Guardar configuracion</Button>
        </section>
      </div>
    </AppShell>
  );
}
