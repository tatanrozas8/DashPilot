import type { DashboardSpec, DashboardViewState } from "@/types/dashboard";
import type { SemanticDiffEntry } from "@/lib/copilot-command-bus/types";

function sameJson(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function semanticDashboardDiff(before: DashboardSpec, beforeView: DashboardViewState, after: DashboardSpec, afterView: DashboardViewState): SemanticDiffEntry[] {
  const diff: SemanticDiffEntry[] = [];
  const beforeWidgets = new Map(before.widgets.map((widget) => [widget.id, widget]));
  const afterWidgets = new Map(after.widgets.map((widget) => [widget.id, widget]));

  for (const [id, widget] of afterWidgets) {
    const previous = beforeWidgets.get(id);
    if (!previous) {
      diff.push({ path: `widgets.${id}`, before: undefined, after: widget.title, kind: "created" });
      continue;
    }
    if (previous.title !== widget.title) diff.push({ path: `widgets.${id}.title`, before: previous.title, after: widget.title, kind: "updated" });
    if (previous.type !== widget.type) diff.push({ path: `widgets.${id}.type`, before: previous.type, after: widget.type, kind: "updated" });
    if (!sameJson(previous.query, widget.query)) diff.push({ path: `widgets.${id}.query`, before: previous.query, after: widget.query, kind: "updated" });
    if (!sameJson(previous.config.visualConfig, widget.config.visualConfig)) diff.push({ path: `widgets.${id}.visualConfig`, before: previous.config.visualConfig, after: widget.config.visualConfig, kind: "updated" });
    if (!sameJson(previous.position, widget.position)) diff.push({ path: `widgets.${id}.position`, before: previous.position, after: widget.position, kind: "updated" });
  }

  for (const [id, widget] of beforeWidgets) {
    if (!afterWidgets.has(id)) diff.push({ path: `widgets.${id}`, before: widget.title, after: undefined, kind: "removed" });
  }

  if (!sameJson(beforeView.filters ?? [], afterView.filters ?? [])) {
    diff.push({ path: "viewState.filters", before: beforeView.filters ?? [], after: afterView.filters ?? [], kind: "updated" });
  }
  if (!sameJson(beforeView.dataExplorer, afterView.dataExplorer)) {
    diff.push({ path: "viewState.dataExplorer", before: beforeView.dataExplorer, after: afterView.dataExplorer, kind: "updated" });
  }
  if (before.title !== after.title) diff.push({ path: "dashboard.title", before: before.title, after: after.title, kind: "updated" });
  if (!sameJson(before.pages ?? [], after.pages ?? [])) {
    diff.push({ path: "dashboard.pages", before: before.pages ?? [], after: after.pages ?? [], kind: before.pages?.length ? "updated" : "created" });
  }

  return diff;
}
