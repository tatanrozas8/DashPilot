import type { CopilotResourceRef, ContextResolverAuthority, ContextResolveInput, ResolvedCopilotContext } from "@/lib/copilot-command-bus/types";

const validScopes = new Set(["dashboard", "page", "widget", "filter", "presentation"]);

function targetFor(input: ContextResolveInput, authority: ContextResolverAuthority): CopilotResourceRef {
  if (input.scope === "dashboard") {
    return { type: "dashboard", id: authority.dashboardSpec.id, title: authority.dashboardSpec.title };
  }
  if (input.scope === "presentation") {
    return { type: "presentation", id: authority.presentationSpec?.id, title: authority.presentationSpec?.title };
  }
  if (input.scope === "filter") {
    return { type: "filter", id: input.targetId, title: input.targetId };
  }
  const widget = input.targetId ? authority.dashboardSpec.widgets.find((item) => item.id === input.targetId) : undefined;
  if (!widget) return { type: "none" };
  return {
    type: widget.type === "kpi_card" ? "kpi" : widget.type === "table" ? "table" : "widget",
    id: widget.id,
    title: widget.title
  };
}

export function resolveCopilotContext(input: ContextResolveInput, authority: ContextResolverAuthority): { success: true; context: ResolvedCopilotContext } | { success: false; error: string } {
  if (!authority.hasAccess && authority.hasAccess !== undefined) return { success: false, error: "Acceso revocado o inexistente para este dashboard." };
  if (input.projectId !== authority.projectId) return { success: false, error: "El projectId no corresponde al contexto autorizado." };
  if (input.dashboardId !== authority.dashboardId || input.dashboardId !== authority.dashboardSpec.id) return { success: false, error: "El dashboardId no corresponde al dashboard autorizado." };
  if (input.revisionId !== authority.currentRevisionId) return { success: false, error: "La revision base esta desactualizada. Recarga antes de editar." };
  if (!validScopes.has(input.scope)) return { success: false, error: "Scope invalido para el Copiloto." };
  if (authority.allowedScopes && !authority.allowedScopes.includes(input.scope)) return { success: false, error: "El scope solicitado no esta permitido para este actor." };
  if (input.targetId && authority.deletedTargetIds?.includes(input.targetId)) return { success: false, error: "El objetivo seleccionado fue eliminado." };

  const selectedTarget = targetFor(input, authority);
  const requiresTarget = input.scope === "widget" || input.scope === "page";
  if (requiresTarget && selectedTarget.type === "none") return { success: false, error: "El targetId no existe en la revision autorizada." };

  return {
    success: true,
    context: {
      projectId: input.projectId,
      dashboardId: input.dashboardId,
      revisionId: input.revisionId,
      pageId: input.pageId,
      scope: input.scope,
      actor: authority.actor,
      dashboardSpec: authority.dashboardSpec,
      viewState: {
        ...authority.viewState,
        selectedTargetSpec: undefined,
        selectedTargetType: selectedTarget.type === "dashboard" || selectedTarget.type === "widget" || selectedTarget.type === "kpi" || selectedTarget.type === "table" || selectedTarget.type === "filter" || selectedTarget.type === "presentation" ? selectedTarget.type : "none",
        selectedTargetId: selectedTarget.id,
        selectedTargetTitle: selectedTarget.title
      },
      datasetProfile: authority.datasetProfile,
      semanticModel: authority.semanticModel,
      presentationSpec: authority.presentationSpec,
      messages: authority.messages ?? [],
      selectedTarget,
      warnings: input.selectedTargetSpec ? ["selectedTargetSpec del cliente fue ignorado; el servidor resolvio el target por ID."] : []
    }
  };
}
