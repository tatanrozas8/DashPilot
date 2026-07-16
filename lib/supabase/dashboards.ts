"use client";

import type { DataRow, DatasetProfile } from "@/types/dataset";
import type { DashboardSpec, DashboardViewState } from "@/types/dashboard";
import { getCurrentAuthState } from "@/lib/supabase/auth";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { dashboardSpecSchema } from "@/lib/validation/schemas";
import { getDatasetProfile, getDatasetRows } from "@/lib/supabase/datasets";

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
  return { mode: "supabase" as const, dashboardId: data.id as string };
}

export async function getDashboardById(dashboardId: string) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    return localDashboards.get(dashboardId) ?? null;
  }
  const { data, error } = await supabase.from("dashboard_specs").select("*").eq("id", dashboardId).maybeSingle();
  if (error) throw new Error(`No se pudo cargar el dashboard: ${error.message}`);
  if (!data) return null;
  const datasetId = data.dataset_id as string;
  const [rows, profile] = await Promise.all([getDatasetRows(datasetId), getDatasetProfile(datasetId)]);
  return {
    spec: data.spec_json as DashboardSpec,
    viewState: data.view_state_json as DashboardViewState,
    rows,
    profile: profile ?? undefined
  };
}

export async function updateDashboardSpec(dashboardId: string, spec: DashboardSpec, viewState: DashboardViewState) {
  dashboardSpecSchema.parse(spec);
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    saveLocalDashboard(spec, viewState);
    return { mode: "local" as const, dashboardId: spec.id };
  }
  const { error } = await supabase
    .from("dashboard_specs")
    .update({ spec_json: spec, view_state_json: viewState, title: spec.title, description: spec.subtitle })
    .eq("id", dashboardId);
  if (error) throw new Error(`No se pudo actualizar el dashboard: ${error.message}`);
  await createDashboardVersion(dashboardId, spec, "actualizacion manual");
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
