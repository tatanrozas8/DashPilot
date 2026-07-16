"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { logDomainError, toDomainError } from "@/lib/observability/domain-error";
import { purgeDashPilotBrowserState } from "@/lib/security/browser-storage";
import { useDashPilotStore } from "@/lib/store/app-store";

interface AuthContextValue {
  configured: boolean;
  loading: boolean;
  session: Session | null;
  user: User | null;
  isLocalMode: boolean;
}

const AuthContext = createContext<AuthContextValue>({
  configured: false,
  loading: true,
  session: null,
  user: null,
  isLocalMode: true
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const configured = isSupabaseConfigured();
  const [loading, setLoading] = useState(configured);
  const [session, setSession] = useState<Session | null>(null);
  const lastUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      return;
    }

    void supabase.auth.getSession()
      .then(({ data }) => {
        lastUserIdRef.current = data.session?.user?.id ?? null;
        setSession(data.session);
      })
      .catch((error) => {
        logDomainError(toDomainError(error, {
          code: "supabase_unavailable",
          fallbackMessage: "No se pudo obtener la sesion de Supabase.",
          executionMode: "degraded",
          syncStatus: "failed"
        }), "auth.session");
      })
      .finally(() => setLoading(false));

    const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
      const nextUserId = nextSession?.user?.id ?? null;
      const changedUser = lastUserIdRef.current !== null && nextUserId !== null && lastUserIdRef.current !== nextUserId;
      if (event === "SIGNED_OUT" || changedUser) {
        purgeDashPilotBrowserState();
        useDashPilotStore.getState().clearSensitiveWorkspace();
      }
      lastUserIdRef.current = nextUserId;
      setSession(nextSession);
      setLoading(false);
    });

    return () => data.subscription.unsubscribe();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      configured,
      loading,
      session,
      user: session?.user ?? null,
      isLocalMode: !configured || !session
    }),
    [configured, loading, session]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
