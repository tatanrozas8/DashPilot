import type { DashboardAction, DashboardSpec, DashboardViewState } from "@/types/dashboard";
import { applyDashboardAction } from "@/lib/dashboard-spec/apply-dashboard-action";

export function applyAction(spec: DashboardSpec, viewState: DashboardViewState, action: DashboardAction) {
  return applyDashboardAction(spec, viewState, action);
}
