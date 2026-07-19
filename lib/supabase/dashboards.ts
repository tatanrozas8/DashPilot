"use client";

import type { DataRow, DatasetProfile } from "@/types/dataset";
import type { DashboardSpec, DashboardViewState } from "@/types/dashboard";
import { getCurrentAuthState } from "@/lib/supabase/auth";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { dashboardSpecSchema } from "@/lib/validation/schemas";
import { getDatasetProfile } from "@/lib/supabase/datasets";
import { dashboardDocumentToPersistedPayload, loadDashboardDocumentV2, persistDashboardDocumentV2 } from "@/lib/supabase/dashboard-documents";

const localDashboards = new Map<string, { spec: DashboardSpec; viewState: DashboardViewState; rows?: DataRow[]; profile?: DatasetProfile }>();

export function saveLocalDashboard(spec: DashboardSpec, viewState: DashboardViewState, rows?: DataRow[], profile?: DatasetProfile) {
  localDashboards.set(spec.id, { spec, viewState, rows, profile });
}

export async function createDashboardSpec(spec: DashboardSpec, viewState: DashboardViewState, projectId?: string) {
  dashboardSpecSchema.parse(spec);
  const supabase = getSupabaseBrowserClient();
  const auth = await getCurrentAuthState();
  if (!supabase || !auth.user || !projectId) {
    saveLocalDashboard(spec, viewState);
    return { mode: "local" as const, dashboardId: spec.id };
  }

  const { data, error } = await supabase
    .from("dashboard_specs")
    .insert({
      project_id: projectId,
      dataset_id: spec.datasetId,
      dataset_version_id: spec.datasetVersionId,
      user_id: auth.user.id,
      title: spec.title,
      description: spec.subtitle,
      spec_json: spec,
      view_state_json: viewState,
      status: "active"
    })
    .select("id")
    .single();
  if (error) throw new Error(`No se pudo guardar el dashboard: ${error.message}`);

  await createDashboardVersion(data.id as string, spec, "version inicial");
  await persistDashboardDocumentV2(supabase, {
    dashboardId: data.id as string,
    projectId,
    userId: auth.user.id,
    spec,
    viewState,
    reason: "version inicial",
    source: "manual"
  });
  return { mode: "supabase" as const, dashboardId: data.id as string };
}

export async function getDashboardById(dashboardId: string) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    return localDashboards.get(dashboardId) ?? null;
  }
  try {
    const documentPayload = await loadDashboardDocumentV2(supabase, dashboardId);
    if (documentPayload) {
      const payload = dashboardDocumentToPersistedPayload(documentPayload);
      const profile = await getDatasetProfile(payload.spec.datasetId, payload.spec.datasetVersionId);
      return { ...payload, profile: profile ?? undefined };
    }
  } catch (error) {
    console.warn("[DashPilot] dashboard v2 load fallback", error);
  }
  const { data, error } = await supabase.from("dashboard_specs").select("*").eq("id", dashboardId).maybeSingle();
  if (error) throw new Error(`No se pudo cargar el dashboard: ${error.message}`);
  if (!data) return null;
  const datasetId = data.dataset_id as string;
  const datasetVersionId = typeof data.dataset_version_id === "string" ? data.dataset_version_id : undefined;
  const profile = await getDatasetProfile(datasetId, datasetVersionId);
  return {
    spec: { ...(data.spec_json as DashboardSpec), datasetId, datasetVersionId: datasetVersionId ?? (data.spec_json as DashboardSpec).datasetVersionId },
    viewState: data.view_state_json as DashboardViewState,
    profile: profile ?? undefined
  };
}

export async function updateDashboardSpec(dashboardId: string, spec: DashboardSpec, viewState: DashboardViewState) {
  dashboardSpecSchema.parse(spec);
  const supabase = getSupabaseBrowserClient();
  const auth = await getCurrentAuthState();
  if (!supabase) {
    saveLocalDashboard(spec, viewState);
    return { mode: "local" as const, dashboardId: spec.id };
  }
  if (!auth.user) throw new Error("Debes iniciar sesion para actualizar este dashboard.");
  const { data: current, error: currentError } = await supabase.from("dashboard_specs").select("project_id").eq("id", dashboardId).maybeSingle();
  if (currentError) throw new Error(`No se pudo validar ownership del dashboard: ${currentError.message}`);
  if (!current?.project_id) throw new Error("No existe el dashboard solicitado.");
  const { error } = await supabase
    .from("dashboard_specs")
    .update({ spec_json: spec, view_state_json: viewState, title: spec.title, description: spec.subtitle, dataset_version_id: spec.datasetVersionId })
    .eq("id", dashboardId);
  if (error) throw new Error(`No se pudo actualizar el dashboard: ${error.message}`);
  await createDashboardVersion(dashboardId, spec, "actualizacion manual");
  await persistDashboardDocumentV2(supabase, {
    dashboardId,
    projectId: current.project_id as string,
    userId: auth.user.id,
    spec,
    viewState,
    reason: "actualizacion manual",
    source: "manual"
  });
  return { mode: "supabase" as const, dashboardId };
}

export async function createDashboardVersion(dashboardId: string, spec: DashboardSpec, changeReason?: string) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return;
  const { error } = await supabase.from("dashboard_versions").insert({
    dashboard_id: dashboardId,
    spec_json: spec,
    change_reason: changeReason
  });
  if (error) throw new Error(`No se pudo crear version del dashboard: ${error.message}`);
}

export async function listDashboardsByProject(projectId: string) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return [];
  const { data, error } = await supabase.from("dashboard_specs").select("*").eq("project_id", projectId).order("created_at", { ascending: false });
  if (error) throw new Error(`No se pudieron listar dashboards: ${error.message}`);
  return data ?? [];
}

export async function deleteDashboard(dashboardId: string) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    localDashboards.delete(dashboardId);
    return;
  }
  const { error } = await supabase.from("dashboard_specs").delete().eq("id", dashboardId);
  if (error) throw new Error(`No se pudo eliminar el dashboard: ${error.message}`);
}
