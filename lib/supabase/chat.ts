"use client";

import type { ChatMessage } from "@/types/ai";
import type { DashboardAction } from "@/types/dashboard";
import { getCurrentAuthState } from "@/lib/supabase/auth";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export async function saveChatMessage(projectId: string, dashboardId: string | undefined, message: ChatMessage) {
  const supabase = getSupabaseBrowserClient();
  const auth = await getCurrentAuthState();
  if (!supabase || !auth.user) return { mode: "local" as const };

  const { error } = await supabase.from("chat_messages").insert({
    project_id: projectId,
    dashboard_id: dashboardId,
    user_id: auth.user.id,
    role: message.role,
    content: message.content,
    structured_action_json: message.structuredAction ?? null
  });
  if (error) throw new Error(`No se pudo guardar el chat: ${error.message}`);
  return { mode: "supabase" as const };
}

export async function listChatMessages(projectId: string, dashboardId?: string) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return [];
  let query = supabase.from("chat_messages").select("*").eq("project_id", projectId).order("created_at", { ascending: true });
  if (dashboardId) query = query.eq("dashboard_id", dashboardId);
  const { data, error } = await query;
  if (error) throw new Error(`No se pudo cargar el chat: ${error.message}`);
  return (data ?? []).map((message) => ({
    id: message.id as string,
    role: message.role as ChatMessage["role"],
    content: message.content as string,
    createdAt: message.created_at as string,
    structuredAction: message.structured_action_json as DashboardAction | undefined
  }));
}

export async function saveStructuredAction(projectId: string, dashboardId: string, content: string, action: DashboardAction) {
  return saveChatMessage(projectId, dashboardId, {
    id: crypto.randomUUID(),
    role: "assistant",
    content,
    createdAt: new Date().toISOString(),
    structuredAction: action
  });
}
