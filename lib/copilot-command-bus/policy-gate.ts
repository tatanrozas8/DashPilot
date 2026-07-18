import { knownCopilotTool, parseCommandArguments, toolDefinition } from "@/lib/copilot-command-bus/registry";
import type { CommandEnvelope, PolicyDecision, ResolvedCopilotContext } from "@/lib/copilot-command-bus/types";

const mutableTools = new Set<string>([
  "dashboard.createWidget",
  "dashboard.updateWidget",
  "dashboard.replaceWidget",
  "dashboard.removeWidget",
  "dashboard.updateWidgetVisualConfig",
  "dashboard.updateWidgetQuery",
  "dashboard.addFilter",
  "dashboard.removeFilter",
  "dashboard.clearFilters",
  "dashboard.selectColumns",
  "dashboard.reorderWidget",
  "dashboard.renameWidget",
  "dashboard.renameDashboard",
  "presentation.createSlide",
  "presentation.updateSlide",
  "presentation.removeSlide"
]);

function targetsExistingResource(envelope: CommandEnvelope, context: ResolvedCopilotContext) {
  const arguments_ = envelope.arguments as Record<string, unknown>;
  const widgetId = typeof arguments_.widgetId === "string" ? arguments_.widgetId : undefined;
  if (!widgetId) return true;
  return context.dashboardSpec.widgets.some((widget) => widget.id === widgetId);
}

export function evaluatePolicy(envelopes: CommandEnvelope[], context: ResolvedCopilotContext, options: { confirmed?: boolean } = {}): PolicyDecision {
  const errors: string[] = [];
  const warnings: string[] = [];
  let requiresConfirmation = false;

  for (const envelope of envelopes) {
    if (!knownCopilotTool(envelope.tool)) {
      errors.push(`Herramienta desconocida rechazada: ${envelope.tool}.`);
      continue;
    }
    const definition = toolDefinition(envelope.tool);
    const parsed = parseCommandArguments(envelope);
    if (!parsed.success) {
      errors.push(`Argumentos invalidos para ${envelope.tool}.`);
      continue;
    }
    if (envelope.dashboardId !== context.dashboardId || envelope.projectId !== context.projectId) {
      errors.push("El comando apunta a un recurso fuera del contexto autorizado.");
    }
    if (envelope.baseRevision !== context.revisionId || envelope.revisionId !== context.revisionId) {
      errors.push("Conflicto de revision: el comando fue planeado sobre otra base.");
    }
    if (context.actor.role === "viewer" && mutableTools.has(envelope.tool)) {
      errors.push("Un viewer no puede obtener ni ejecutar un plan mutable.");
    }
    if (!targetsExistingResource(envelope, context)) {
      errors.push("El comando referencia un target inexistente o manipulado.");
    }
    if ((definition.requiresConfirmation || envelope.requiresConfirmation || envelope.riskLevel === "high") && !options.confirmed) {
      requiresConfirmation = true;
      warnings.push(`La accion ${envelope.tool} requiere confirmacion explicita.`);
    }
  }

  return {
    allowed: errors.length === 0 && !requiresConfirmation,
    errors,
    warnings,
    requiresConfirmation
  };
}
