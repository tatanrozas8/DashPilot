import type { z } from "zod";
import type { ChatMessage } from "@/types/ai";
import type { DatasetProfile } from "@/types/dataset";
import type { DashboardAction, DashboardFilter, DashboardSpec, DashboardTargetType, DashboardViewState, DashboardWidget } from "@/types/dashboard";
import type { PresentationSpec } from "@/types/presentation";
import type { SemanticLayer } from "@/lib/semantic-layer";

export type CopilotActorRole = "viewer" | "editor" | "admin";
export type CopilotCommandSource = "manual" | "copilot";
export type CopilotRiskLevel = "low" | "medium" | "high";
export type CopilotScope = "dashboard" | "page" | "widget" | "filter" | "presentation";
export type CopilotIntent =
  | "explain"
  | "query"
  | "create"
  | "update"
  | "replace"
  | "delete"
  | "visual_change"
  | "data_logic_change"
  | "filter"
  | "presentation"
  | "undo"
  | "redo"
  | "clarification"
  | "correction_with_action"
  | "correction_without_action";

export type CopilotToolName =
  | "dashboard.createWidget"
  | "dashboard.updateWidget"
  | "dashboard.replaceWidget"
  | "dashboard.removeWidget"
  | "dashboard.updateWidgetVisualConfig"
  | "dashboard.updateWidgetQuery"
  | "dashboard.addFilter"
  | "dashboard.removeFilter"
  | "dashboard.clearFilters"
  | "dashboard.selectColumns"
  | "dashboard.reorderWidget"
  | "dashboard.renameWidget"
  | "dashboard.renameDashboard"
  | "dashboard.updateDashboardSubtitle"
  | "dashboard.updateDashboardDesign"
  | "presentation.createSlide"
  | "presentation.updateSlide"
  | "presentation.removeSlide"
  | "control.undo"
  | "control.redo"
  | "control.requestClarification";

export interface CopilotActor {
  id: string;
  role: CopilotActorRole;
  displayName?: string;
}

export interface CopilotResourceRef {
  type: DashboardTargetType | "page" | "dashboard";
  id?: string;
  title?: string;
}

export interface CommandEnvelope<TTool extends CopilotToolName = CopilotToolName, TArguments = unknown> {
  actionRunId: string;
  actor: CopilotActor;
  projectId: string;
  dashboardId: string;
  revisionId: string;
  baseRevision: string;
  resource: CopilotResourceRef;
  tool: TTool;
  arguments: TArguments;
  idempotencyKey: string;
  riskLevel: CopilotRiskLevel;
  reason: string;
  requiresConfirmation: boolean;
  source: CopilotCommandSource;
}

export interface CommandToolDefinition<TArguments = unknown> {
  tool: CopilotToolName;
  riskLevel: CopilotRiskLevel;
  requiresConfirmation: boolean;
  schema: z.ZodType<TArguments>;
  toAction: (arguments_: TArguments) => DashboardAction | null;
  inverse?: (before: DashboardSpec, viewState: DashboardViewState, arguments_: TArguments) => DashboardAction | null;
}

export interface ResolvedCopilotContext {
  projectId: string;
  dashboardId: string;
  revisionId: string;
  pageId?: string;
  scope: CopilotScope;
  actor: CopilotActor;
  dashboardSpec: DashboardSpec;
  viewState: DashboardViewState;
  datasetProfile: DatasetProfile;
  semanticModel: SemanticLayer;
  presentationSpec?: PresentationSpec;
  messages: ChatMessage[];
  selectedTarget: CopilotResourceRef;
  warnings: string[];
}

export interface ContextResolveInput {
  projectId: string;
  dashboardId: string;
  revisionId: string;
  pageId?: string;
  targetId?: string;
  scope: CopilotScope;
  userMessage: string;
  selectedTargetSpec?: unknown;
}

export interface ContextResolverAuthority {
  actor: CopilotActor;
  projectId: string;
  dashboardId: string;
  currentRevisionId: string;
  dashboardSpec: DashboardSpec;
  viewState: DashboardViewState;
  datasetProfile: DatasetProfile;
  semanticModel: SemanticLayer;
  presentationSpec?: PresentationSpec;
  messages?: ChatMessage[];
  deletedTargetIds?: string[];
  allowedScopes?: CopilotScope[];
  hasAccess?: boolean;
}

export interface SemanticDiffEntry {
  path: string;
  before: unknown;
  after: unknown;
  kind: "created" | "updated" | "removed";
}

export interface CommandBusResult {
  envelope: CommandEnvelope;
  action: DashboardAction | null;
  beforeDashboardSpec: DashboardSpec;
  beforeViewState: DashboardViewState;
  afterDashboardSpec: DashboardSpec;
  afterViewState: DashboardViewState;
  diff: SemanticDiffEntry[];
  inverseAction?: DashboardAction;
  message: string;
}

export interface CopilotPlanAction {
  envelope: CommandEnvelope;
  semanticResolution?: {
    metric?: string;
    dimension?: string;
    series?: string;
    confidence: number;
    reason: string;
  };
}

export interface CopilotPlan {
  intent: CopilotIntent;
  target: CopilotResourceRef;
  scope: CopilotScope;
  actions: CopilotPlanAction[];
  dependencies: string[];
  riskLevel: CopilotRiskLevel;
  requiresConfirmation: boolean;
  confidence: number;
  semanticResolution: CopilotPlanAction["semanticResolution"][];
  expectedDiff: SemanticDiffEntry[];
  warnings: string[];
  blueprint?: {
    title: string;
    subtitle: string;
    pages: Array<{ title: string; purpose: string; widgets: Array<{ id: string; type: string; title: string; reason: string }> }>;
    filters: string[];
    narrative: string[];
  };
  evidence?: string[];
  selfCheck?: {
    passed: boolean;
    items: Array<{ label: string; passed: boolean; message: string }>;
    warnings: string[];
    errors: string[];
  };
  needsClarification: boolean;
  clarification?: {
    question: string;
    options: string[];
  };
  usesPreviousInstruction: boolean;
}

export interface PolicyDecision {
  allowed: boolean;
  errors: string[];
  warnings: string[];
  requiresConfirmation: boolean;
}

export interface CopilotAuditEvent {
  id: string;
  actionRunId: string;
  idempotencyKey: string;
  actorId: string;
  actorRole: CopilotActorRole;
  source: CopilotCommandSource;
  tool: CopilotToolName;
  dashboardId: string;
  revisionId: string;
  resultingRevisionId?: string;
  riskLevel: CopilotRiskLevel;
  reason: string;
  diff: SemanticDiffEntry[];
  createdAt: string;
}

export interface CopilotRevisionRecord {
  id: string;
  previousRevisionId?: string;
  dashboardSpec: DashboardSpec;
  viewState: DashboardViewState;
  createdAt: string;
  createdBy: string;
  reason: string;
  inverseAction?: DashboardAction;
}

export interface TransactionalExecutionState {
  currentRevisionId: string;
  revisions: CopilotRevisionRecord[];
  auditEvents: CopilotAuditEvent[];
  appliedIdempotencyKeys: string[];
  redoRevisions: CopilotRevisionRecord[];
}

export interface ToolArgumentMap {
  "dashboard.createWidget": { widget: DashboardWidget };
  "dashboard.updateWidget": { widgetId: string; changes: Partial<DashboardWidget> };
  "dashboard.replaceWidget": { widgetId: string; widget: DashboardWidget };
  "dashboard.removeWidget": { widgetId: string };
  "dashboard.updateWidgetVisualConfig": { widgetId: string; visualConfig: NonNullable<DashboardWidget["config"]["visualConfig"]> };
  "dashboard.updateWidgetQuery": { widgetId: string; query: DashboardWidget["query"] };
  "dashboard.addFilter": { filter: DashboardFilter };
  "dashboard.removeFilter": { field: string };
  "dashboard.clearFilters": Record<string, never>;
  "dashboard.selectColumns": { columns: string[] };
  "dashboard.reorderWidget": { widgetIds: string[] };
  "dashboard.renameWidget": { widgetId: string; title: string };
  "dashboard.renameDashboard": { title: string };
  "dashboard.updateDashboardSubtitle": { subtitle: string };
  "dashboard.updateDashboardDesign": { design: NonNullable<DashboardSpec["design"]> };
  "presentation.createSlide": { slide: unknown };
  "presentation.updateSlide": { slideId: string; changes: Record<string, unknown> };
  "presentation.removeSlide": { slideId: string };
  "control.undo": Record<string, never>;
  "control.redo": Record<string, never>;
  "control.requestClarification": { question: string; options?: string[] };
}
