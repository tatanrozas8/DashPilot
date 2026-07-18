import { evaluatePolicy } from "@/lib/copilot-command-bus/policy-gate";
import { dryRunCommands } from "@/lib/copilot-command-bus/bus";
import type { CommandEnvelope, CopilotAuditEvent, CopilotRevisionRecord, ResolvedCopilotContext, TransactionalExecutionState } from "@/lib/copilot-command-bus/types";

function newId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return `${prefix}_${crypto.randomUUID()}`;
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function lastInverseAction(runs: Array<{ inverseAction?: unknown }>) {
  for (let index = runs.length - 1; index >= 0; index -= 1) {
    if (runs[index].inverseAction) return runs[index].inverseAction;
  }
  return undefined;
}

export function createExecutionState(context: ResolvedCopilotContext): TransactionalExecutionState {
  return {
    currentRevisionId: context.revisionId,
    revisions: [{
      id: context.revisionId,
      dashboardSpec: structuredClone(context.dashboardSpec),
      viewState: structuredClone(context.viewState),
      createdAt: new Date().toISOString(),
      createdBy: context.actor.id,
      reason: "Revision base"
    }],
    auditEvents: [],
    appliedIdempotencyKeys: [],
    redoRevisions: []
  };
}

export function executeTransaction(input: {
  envelopes: CommandEnvelope[];
  context: ResolvedCopilotContext;
  state: TransactionalExecutionState;
  confirmed?: boolean;
}): { success: true; context: ResolvedCopilotContext; state: TransactionalExecutionState; revision: CopilotRevisionRecord; auditEvents: CopilotAuditEvent[] } | { success: false; errors: string[]; warnings: string[]; state: TransactionalExecutionState } {
  const pending = input.envelopes.filter((envelope) => !input.state.appliedIdempotencyKeys.includes(envelope.idempotencyKey));
  if (!pending.length) {
    const current = input.state.revisions.find((revision) => revision.id === input.state.currentRevisionId) ?? input.state.revisions.at(-1);
    if (!current) return { success: false, errors: ["No existe revision actual para idempotencia."], warnings: [], state: input.state };
    return {
      success: true,
      context: { ...input.context, dashboardSpec: current.dashboardSpec, viewState: current.viewState, revisionId: current.id },
      state: input.state,
      revision: current,
      auditEvents: []
    };
  }

  const policy = evaluatePolicy(pending, input.context, { confirmed: input.confirmed });
  if (!policy.allowed) return { success: false, errors: policy.errors, warnings: policy.warnings, state: input.state };

  const runs = dryRunCommands(pending, input.context);
  const last = runs.at(-1);
  if (!last) return { success: false, errors: ["No habia comandos para ejecutar."], warnings: [], state: input.state };

  const revision: CopilotRevisionRecord = {
    id: newId("rev"),
    previousRevisionId: input.state.currentRevisionId,
    dashboardSpec: last.afterDashboardSpec,
    viewState: last.afterViewState,
    createdAt: new Date().toISOString(),
    createdBy: input.context.actor.id,
    reason: pending.map((envelope) => envelope.reason).join(" "),
    inverseAction: lastInverseAction(runs) as CopilotRevisionRecord["inverseAction"]
  };
  const auditEvents = runs.map<CopilotAuditEvent>((run) => ({
    id: newId("audit"),
    actionRunId: run.envelope.actionRunId,
    idempotencyKey: run.envelope.idempotencyKey,
    actorId: run.envelope.actor.id,
    actorRole: run.envelope.actor.role,
    source: run.envelope.source,
    tool: run.envelope.tool,
    dashboardId: run.envelope.dashboardId,
    revisionId: run.envelope.revisionId,
    resultingRevisionId: revision.id,
    riskLevel: run.envelope.riskLevel,
    reason: run.envelope.reason,
    diff: run.diff,
    createdAt: new Date().toISOString()
  }));
  const nextState: TransactionalExecutionState = {
    currentRevisionId: revision.id,
    revisions: [...input.state.revisions, revision],
    auditEvents: [...input.state.auditEvents, ...auditEvents],
    appliedIdempotencyKeys: [...input.state.appliedIdempotencyKeys, ...pending.map((envelope) => envelope.idempotencyKey)],
    redoRevisions: []
  };

  return {
    success: true,
    context: { ...input.context, dashboardSpec: revision.dashboardSpec, viewState: revision.viewState, revisionId: revision.id },
    state: nextState,
    revision,
    auditEvents
  };
}

export function undoTransaction(state: TransactionalExecutionState): { success: true; state: TransactionalExecutionState; revision: CopilotRevisionRecord } | { success: false; error: string } {
  if (state.revisions.length < 2) return { success: false, error: "No hay revision anterior para deshacer." };
  const current = state.revisions.at(-1)!;
  const previous = state.revisions.at(-2)!;
  const restored: CopilotRevisionRecord = {
    ...previous,
    id: newId("rev"),
    previousRevisionId: current.id,
    createdAt: new Date().toISOString(),
    reason: `Undo: ${current.reason}`
  };
  return {
    success: true,
    revision: restored,
    state: {
      ...state,
      currentRevisionId: restored.id,
      revisions: [...state.revisions.slice(0, -1), restored],
      redoRevisions: [current, ...state.redoRevisions]
    }
  };
}

export function redoTransaction(state: TransactionalExecutionState): { success: true; state: TransactionalExecutionState; revision: CopilotRevisionRecord } | { success: false; error: string } {
  const next = state.redoRevisions[0];
  if (!next) return { success: false, error: "No hay revision para rehacer." };
  const restored: CopilotRevisionRecord = {
    ...next,
    id: newId("rev"),
    previousRevisionId: state.currentRevisionId,
    createdAt: new Date().toISOString(),
    reason: `Redo: ${next.reason}`
  };
  return {
    success: true,
    revision: restored,
    state: {
      ...state,
      currentRevisionId: restored.id,
      revisions: [...state.revisions, restored],
      redoRevisions: state.redoRevisions.slice(1)
    }
  };
}
