"use client";

import type { ShareLink } from "@/types/export";
import type { PublicSharedDashboard } from "@/lib/data-access/types";
import { getCurrentAuthState } from "@/lib/supabase/auth";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { shareLinkSchema } from "@/lib/validation/schemas";

export function createShareLinkToken() {
  return `share_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

export function isShareLinkValid(link: Pick<ShareLink, "expiresAt"> & { isActive?: boolean }) {
  if (link.isActive === false) return false;
  return !link.expiresAt || new Date(link.expiresAt).getTime() > Date.now();
}

const localShareLinks = new Map<string, ShareLink & { isActive?: boolean }>();

export async function createShareLink(link: ShareLink) {
  shareLinkSchema.parse(link);
  const supabase = getSupabaseBrowserClient();
  const auth = await getCurrentAuthState();
  if (!supabase || !auth.user) {
    localShareLinks.set(link.token, link);
    return { mode: "local" as const, token: link.token };
  }

  const { error } = await supabase.from("share_links").insert({
    dashboard_id: link.dashboardId,
    user_id: auth.user.id,
    token: link.token,
    access: link.access,
    expires_at: link.expiresAt,
    allow_filters: link.allowFilters,
    allow_download: link.allowDownload,
    is_active: true
  });
  if (error) throw new Error(`No se pudo crear el enlace: ${error.message}`);
  return { mode: "supabase" as const, token: link.token };
}

export async function getShareLinkByToken(token: string) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    return localShareLinks.get(token) ?? null;
  }
  const { data, error } = await supabase.from("share_links").select("*").eq("token", token).maybeSingle();
  if (error) throw new Error(`No se pudo cargar el enlace: ${error.message}`);
  if (!data) return null;
  return {
    id: data.id as string,
    dashboardId: data.dashboard_id as string,
    token: data.token as string,
    access: data.access as ShareLink["access"],
    expiresAt: data.expires_at as string | undefined,
    allowFilters: Boolean(data.allow_filters),
    allowDownload: Boolean(data.allow_download),
    createdAt: data.created_at as string
  } satisfies ShareLink;
}

export async function updateShareLink(token: string, changes: Partial<ShareLink>) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    const current = await getShareLinkByToken(token);
    if (current) localShareLinks.set(token, { ...current, ...changes });
    return { mode: "local" as const, token };
  }
  const { error } = await supabase
    .from("share_links")
    .update({
      access: changes.access,
      expires_at: changes.expiresAt,
      allow_filters: changes.allowFilters,
      allow_download: changes.allowDownload
    })
    .eq("token", token);
  if (error) throw new Error(`No se pudo actualizar el enlace: ${error.message}`);
  return { mode: "supabase" as const, token };
}

export async function disableShareLink(token: string) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    const current = await getShareLinkByToken(token);
    if (current) localShareLinks.set(token, { ...current, isActive: false });
    return;
  }
  const { error } = await supabase.from("share_links").update({ is_active: false }).eq("token", token);
  if (error) throw new Error(`No se pudo desactivar el enlace: ${error.message}`);
}

export async function getPublicSharedDashboard(token: string): Promise<PublicSharedDashboard | null> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    const link = await getShareLinkByToken(token);
    if (!link || !isShareLinkValid(link)) return null;
    return null;
  }

  const { data, error } = await supabase.rpc("get_public_shared_dashboard", { share_token: token });
  if (error) throw new Error(`No se pudo abrir el enlace compartido: ${error.message}`);
  if (!data) return null;
  const payload = data as unknown as {
    link: ShareLink;
    dashboard: PublicSharedDashboard["dashboard"];
    viewState: PublicSharedDashboard["viewState"];
    rows: PublicSharedDashboard["rows"];
    profile?: PublicSharedDashboard["profile"];
  };
  return {
    link: payload.link,
    dashboard: payload.dashboard,
    viewState: payload.viewState,
    rows: payload.rows ?? [],
    profile: payload.profile
  };
}
