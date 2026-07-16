"use client";

import type { ShareLink } from "@/types/export";
import type { Json } from "@/types/supabase";
import type { PublicSharedDashboard } from "@/lib/data-access/types";
import type { PublicDashboardSnapshot, PublicSharePayload } from "@/lib/share/public-snapshot";
import { publicShareScopes } from "@/lib/share/public-snapshot";
import { createPasswordSalt, createPublicShareToken, hashPublicSharePassword, hashPublicShareToken, isPublicShareUsable } from "@/lib/share/public-access";
import { getCurrentAuthState } from "@/lib/supabase/auth";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { shareLinkSchema } from "@/lib/validation/schemas";

export function createShareLinkToken() {
  return createPublicShareToken();
}

export function isShareLinkValid(link: Pick<ShareLink, "expiresAt"> & { isActive?: boolean }) {
  return isPublicShareUsable(link);
}

const localShareLinks = new Map<string, { link: ShareLink & { isActive?: boolean }; snapshot?: PublicDashboardSnapshot; payload?: PublicSharePayload; passwordHash?: string; passwordSalt?: string }>();

function snapshotRowsJson(result: PublicDashboardSnapshot["widgetResults"][number]): Json {
  return JSON.parse(JSON.stringify(result.rows)) as Json;
}

export async function createShareLink(link: ShareLink, options: { password?: string; snapshot?: PublicDashboardSnapshot; payload?: PublicSharePayload } = {}) {
  shareLinkSchema.parse(link);
  if (!link.token) throw new Error("No se puede crear un enlace publico sin token efimero.");
  const scopes = link.scopes ?? publicShareScopes({ allowFilters: link.allowFilters, allowDownload: link.allowDownload });
  const tokenHash = await hashPublicShareToken(link.token);
  const passwordSalt = options.password ? createPasswordSalt() : undefined;
  const passwordHash = options.password && passwordSalt ? await hashPublicSharePassword(options.password, passwordSalt) : undefined;
  const supabase = getSupabaseBrowserClient();
  const auth = await getCurrentAuthState();
  if (!supabase || !auth.user) {
    localShareLinks.set(tokenHash, { link, snapshot: options.snapshot, payload: options.payload, passwordHash, passwordSalt });
    return { mode: "local" as const, token: link.token };
  }

  const { data, error } = await supabase.from("share_links").insert({
    dashboard_id: link.dashboardId,
    user_id: auth.user.id,
    token: null,
    token_hash: tokenHash,
    access: link.access,
    scopes,
    password_hash: passwordHash,
    password_salt: passwordSalt,
    expires_at: link.expiresAt,
    allow_filters: link.allowFilters,
    allow_download: link.allowDownload,
    is_active: true
  }).select("id").single();
  if (error) throw new Error(`No se pudo crear el enlace: ${error.message}`);
  if (options.snapshot) {
    const { error: snapshotError } = await supabase.from("share_widget_results").insert(
      options.snapshot.widgetResults.map((result) => ({
        share_link_id: data.id,
        widget_id: result.widgetId,
        revision_id: result.revisionId,
        result_json: snapshotRowsJson(result)
      }))
    );
    if (snapshotError) throw new Error(`No se pudo guardar el snapshot publico: ${snapshotError.message}`);
  }
  return { mode: "supabase" as const, token: link.token };
}

export async function getShareLinkByToken(token: string) {
  const tokenHash = await hashPublicShareToken(token);
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    return localShareLinks.get(tokenHash)?.link ?? null;
  }
  const { data, error } = await supabase.from("share_links").select("*").eq("token_hash", tokenHash).maybeSingle();
  if (error) throw new Error(`No se pudo cargar el enlace: ${error.message}`);
  if (!data) return null;
  return {
    id: data.id as string,
    dashboardId: data.dashboard_id as string,
    access: data.access as ShareLink["access"],
    expiresAt: data.expires_at as string | undefined,
    allowFilters: Boolean(data.allow_filters),
    allowDownload: Boolean(data.allow_download),
    scopes: Array.isArray(data.scopes) ? data.scopes as ShareLink["scopes"] : undefined,
    passwordRequired: Boolean(data.password_hash),
    createdAt: data.created_at as string
  } satisfies ShareLink;
}

export async function updateShareLink(token: string, changes: Partial<ShareLink>) {
  const tokenHash = await hashPublicShareToken(token);
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    const current = await getShareLinkByToken(token);
    const local = localShareLinks.get(tokenHash);
    if (current && local) localShareLinks.set(tokenHash, { ...local, link: { ...current, ...changes } });
    return { mode: "local" as const, token };
  }
  const { error } = await supabase
    .from("share_links")
    .update({
      access: changes.access,
      expires_at: changes.expiresAt,
      allow_filters: changes.allowFilters,
      allow_download: changes.allowDownload,
      scopes: changes.scopes
    })
    .eq("token_hash", tokenHash);
  if (error) throw new Error(`No se pudo actualizar el enlace: ${error.message}`);
  return { mode: "supabase" as const, token };
}

export async function disableShareLink(token: string) {
  const tokenHash = await hashPublicShareToken(token);
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    const current = localShareLinks.get(tokenHash);
    if (current) localShareLinks.set(tokenHash, { ...current, link: { ...current.link, isActive: false } });
    return;
  }
  const { error } = await supabase.from("share_links").update({ is_active: false, revoked_at: new Date().toISOString() }).eq("token_hash", tokenHash);
  if (error) throw new Error(`No se pudo desactivar el enlace: ${error.message}`);
}

export async function getPublicSharedDashboard(token: string, password?: string): Promise<PublicSharedDashboard | null> {
  const tokenHash = await hashPublicShareToken(token);
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    const local = localShareLinks.get(tokenHash);
    const link = local?.link;
    if (!link || !isShareLinkValid(link)) return null;
    if (local.passwordHash && local.passwordSalt) {
      const providedHash = password ? await hashPublicSharePassword(password, local.passwordSalt) : "";
      if (providedHash !== local.passwordHash) return null;
    }
    if (!local.snapshot) return null;
    if (!local.payload) return null;
    return {
      link: { ...link, token: undefined, passwordRequired: Boolean(local.passwordHash) },
      dashboard: local.payload.dashboard,
      viewState: local.payload.viewState,
      widgetResults: local.snapshot.widgetResults,
      allowedFilters: link.allowFilters ? local.snapshot.allowedFilters : []
    };
  }

  const { data, error } = await supabase.rpc("get_public_shared_dashboard", { share_token: token, share_password: password ?? null });
  if (error) throw new Error(`No se pudo abrir el enlace compartido: ${error.message}`);
  if (!data) return null;
  const payload = data as unknown as {
    link: ShareLink;
    dashboard: PublicSharedDashboard["dashboard"];
    viewState: PublicSharedDashboard["viewState"];
    widgetResults: PublicSharedDashboard["widgetResults"];
    allowedFilters: PublicSharedDashboard["allowedFilters"];
  };
  return {
    link: payload.link,
    dashboard: payload.dashboard,
    viewState: payload.viewState,
    widgetResults: payload.widgetResults ?? [],
    allowedFilters: payload.allowedFilters ?? []
  };
}
