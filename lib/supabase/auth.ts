"use client";

import type { Session, User } from "@supabase/supabase-js";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";

export interface AuthState {
  configured: boolean;
  session: Session | null;
  user: User | null;
}

export const localMockUser = {
  id: "local-user",
  email: "local@dashpilot.dev"
};

export async function getCurrentAuthState(): Promise<AuthState> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { configured: false, session: null, user: null };

  const { data } = await supabase.auth.getSession();
  return {
    configured: isSupabaseConfigured(),
    session: data.session,
    user: data.session?.user ?? null
  };
}

export async function signInWithPassword(email: string, password: string) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) throw new Error("Supabase no esta configurado. DashPilot esta funcionando en modo local.");
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message);
  return data;
}

export async function signUpWithPassword(email: string, password: string) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) throw new Error("Supabase no esta configurado. DashPilot esta funcionando en modo local.");
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw new Error(error.message);
  return data;
}

export async function signOut() {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return;
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error(error.message);
}
