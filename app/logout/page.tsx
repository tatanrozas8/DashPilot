"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "@/lib/supabase/auth";
import { logDomainError, toDomainError } from "@/lib/observability/domain-error";
import { purgeDashPilotBrowserState } from "@/lib/security/browser-storage";
import { useDashPilotStore } from "@/lib/store/app-store";

export default function LogoutPage() {
  const router = useRouter();

  useEffect(() => {
    void signOut()
      .catch((error) => {
        logDomainError(toDomainError(error, {
          code: "supabase_unavailable",
          fallbackMessage: "No se pudo cerrar la sesion de Supabase.",
          executionMode: "degraded",
          syncStatus: "failed"
        }), "auth.logout");
      })
      .finally(() => {
        purgeDashPilotBrowserState();
        useDashPilotStore.getState().clearSensitiveWorkspace();
        router.replace("/");
      });
  }, [router]);

  return (
    <main className="grid min-h-[100dvh] place-items-center bg-[#f8faff] text-sm font-semibold text-[#3d35ff]">
      Cerrando sesion...
    </main>
  );
}
