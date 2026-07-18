import { applyDashboardAction } from "@/lib/dashboard-spec/apply-dashboard-action";
import { semanticDashboardDiff } from "@/lib/copilot-command-bus/diff";
import { parseCommandArguments, toolDefinition } from "@/lib/copilot-command-bus/registry";
import type { CommandBusResult, CommandEnvelope, CommandToolDefinition, ResolvedCopilotContext } from "@/lib/copilot-command-bus/types";

export function executeCommandDryRun(envelope: CommandEnvelope, context: ResolvedCopilotContext): CommandBusResult {
  const parsed = parseCommandArguments(envelope);
  if (!parsed.success) {
    throw new Error(`Argumentos invalidos para ${envelope.tool}.`);
  }
  const definition = toolDefinition(envelope.tool) as CommandToolDefinition<unknown>;
  const action = definition.toAction(parsed.data as never);
  const beforeDashboardSpec = context.dashboardSpec;
  const beforeViewState = context.viewState;
  if (!action) {
    return {
      envelope,
      action,
      beforeDashboardSpec,
      beforeViewState,
      afterDashboardSpec: beforeDashboardSpec,
      afterViewState: beforeViewState,
      diff: [],
      message: `La herramienta ${envelope.tool} fue validada pero no modifica el DashboardSpec en este contexto.`
    };
  }
  const applied = applyDashboardAction(beforeDashboardSpec, beforeViewState, action);
  return {
    envelope,
    action,
    beforeDashboardSpec,
    beforeViewState,
    afterDashboardSpec: applied.spec,
    afterViewState: applied.viewState,
    diff: semanticDashboardDiff(beforeDashboardSpec, beforeViewState, applied.spec, applied.viewState),
    inverseAction: definition.inverse?.(beforeDashboardSpec, beforeViewState, parsed.data as never) ?? undefined,
    message: applied.message
  };
}

export function dryRunCommands(envelopes: CommandEnvelope[], context: ResolvedCopilotContext): CommandBusResult[] {
  let nextContext = context;
  return envelopes.map((envelope) => {
    const result = executeCommandDryRun(envelope, nextContext);
    nextContext = { ...nextContext, dashboardSpec: result.afterDashboardSpec, viewState: result.afterViewState };
    return result;
  });
}
