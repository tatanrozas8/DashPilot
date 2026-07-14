import type { DashboardWidget } from "@/types/dashboard";

export function barOrientation(widget: DashboardWidget): "horizontal" | "vertical" {
  return widget.config.visualConfig?.orientation ?? (widget.config.horizontal === false ? "vertical" : "horizontal");
}
