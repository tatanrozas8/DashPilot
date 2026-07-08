"use client";

import type { PresentationSpec } from "@/types/presentation";
import { getCurrentAuthState } from "@/lib/supabase/auth";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { presentationSpecSchema } from "@/lib/validation/schemas";

function localPresentationKey(id: string) {
  return `dashpilot:presentation:${id}`;
}

export async function createPresentation(spec: PresentationSpec) {
  presentationSpecSchema.parse(spec);
  const supabase = getSupabaseBrowserClient();
  const auth = await getCurrentAuthState();
  if (!supabase || !auth.user) {
    window.localStorage.setItem(localPresentationKey(spec.id), JSON.stringify(spec));
    return { mode: "local" as const, presentationId: spec.id };
  }
  const { data, error } = await supabase
    .from("presentations")
    .insert({
      dashboard_id: spec.dashboardId,
      user_id: auth.user.id,
      title: spec.title,
      spec_json: spec,
      status: "draft"
    })
    .select("id")
    .single();
  if (error) throw new Error(`No se pudo guardar la presentacion: ${error.message}`);
  await createPresentationVersion(data.id as string, spec, "version inicial");
  return { mode: "supabase" as const, presentationId: data.id as string };
}

export async function getPresentationById(presentationId: string) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    const raw = window.localStorage.getItem(localPresentationKey(presentationId));
    return raw ? JSON.parse(raw) as PresentationSpec : null;
  }
  const { data, error } = await supabase.from("presentations").select("spec_json").eq("id", presentationId).maybeSingle();
  if (error) throw new Error(`No se pudo cargar la presentacion: ${error.message}`);
  return data?.spec_json as PresentationSpec | null;
}

export async function updatePresentation(presentationId: string, spec: PresentationSpec) {
  presentationSpecSchema.parse(spec);
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    window.localStorage.setItem(localPresentationKey(presentationId), JSON.stringify(spec));
    return { mode: "local" as const, presentationId };
  }
  const { error } = await supabase.from("presentations").update({ spec_json: spec, title: spec.title }).eq("id", presentationId);
  if (error) throw new Error(`No se pudo actualizar la presentacion: ${error.message}`);
  await createPresentationVersion(presentationId, spec, "actualizacion manual");
  return { mode: "supabase" as const, presentationId };
}

export async function createPresentationVersion(presentationId: string, spec: PresentationSpec, changeReason?: string) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return;
  const { error } = await supabase.from("presentation_versions").insert({
    presentation_id: presentationId,
    spec_json: spec,
    change_reason: changeReason
  });
  if (error) throw new Error(`No se pudo crear version de presentacion: ${error.message}`);
}
