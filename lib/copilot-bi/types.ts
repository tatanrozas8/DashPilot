import type { DataRow, DatasetCatalog, DatasetCatalogColumn, DatasetColumnProfile, DatasetProfile } from "@/types/dataset";
import type { DashboardAction, DashboardQuerySpec, WidgetType } from "@/types/dashboard";
import type { GovernedAnalyticalQuery } from "@/types/analytical-query";
import type { SemanticLayer } from "@/lib/semantic-layer";

export type BusinessIntentType =
  | "create_full_dashboard"
  | "create_executive_page"
  | "create_operational_page"
  | "create_detail_page"
  | "create_chart"
  | "create_kpi"
  | "create_table"
  | "create_filter"
  | "improve_layout"
  | "explain_result"
  | "find_insight"
  | "compare_periods"
  | "explain_variation"
  | "detect_anomaly"
  | "rank_contributors"
  | "create_title"
  | "create_narrative"
  | "prepare_presentation"
  | "answer_analytical_question"
  | "ask_clarification";

export type BusinessAudience = "executive" | "commercial" | "finance" | "operations" | "analyst";

export interface BusinessIntentResolution {
  intent: BusinessIntentType;
  secondaryIntents: BusinessIntentType[];
  audience: BusinessAudience;
  requestedMetric?: string;
  requestedDimensions: string[];
  requestedDate?: string;
  requestedLimit?: number;
  confidence: number;
  reason: string;
  destructive: boolean;
}

export interface DatasetFieldCandidate {
  field: string;
  label: string;
  role: string;
  confidence: number;
  coverage: number;
  uniqueCount: number;
  nullPercentage: number;
  warnings: string[];
  column: DatasetColumnProfile;
  catalogColumn?: DatasetCatalogColumn;
}

export interface DatasetIntelligence {
  profile: DatasetProfile;
  catalog: DatasetCatalog;
  semanticModel: SemanticLayer;
  metrics: DatasetFieldCandidate[];
  dimensions: DatasetFieldCandidate[];
  dates: DatasetFieldCandidate[];
  geographies: DatasetFieldCandidate[];
  filters: DatasetFieldCandidate[];
  monetaryMetrics: DatasetFieldCandidate[];
  percentageMetrics: DatasetFieldCandidate[];
  primaryMetric?: DatasetFieldCandidate;
  primaryDimension?: DatasetFieldCandidate;
  primaryDate?: DatasetFieldCandidate;
  qualityWarnings: string[];
  safeColumnSamples: Array<{ field: string; label: string; values: unknown[] }>;
}

export interface ClarificationDecision {
  needsClarification: boolean;
  question?: string;
  options: string[];
  reason: string;
  confidence: number;
}

export interface VisualizationRecommendation {
  type: WidgetType;
  metric?: DatasetFieldCandidate;
  dimension?: DatasetFieldCandidate;
  date?: DatasetFieldCandidate;
  series?: DatasetFieldCandidate;
  title: string;
  subtitle?: string;
  reason: string;
  query?: DashboardQuerySpec;
  limit?: number;
}

export interface AnalyticalQueryPlan {
  id: string;
  purpose: string;
  query: GovernedAnalyticalQuery;
  evidenceId: string;
  summary: string;
}

export interface ComputedInsight {
  id: string;
  title: string;
  text: string;
  evidenceId: string;
  queryId: string;
  datasetVersionId: string;
  metric?: string;
  filters: number;
  coverage: number;
  confidence: number;
  warning?: string;
}

export interface BlueprintWidget {
  id: string;
  type: WidgetType;
  title: string;
  reason: string;
}

export interface DashboardBlueprint {
  title: string;
  subtitle: string;
  audience: BusinessAudience;
  pages: Array<{ title: string; purpose: string; widgets: BlueprintWidget[] }>;
  filters: string[];
  narrative: string[];
  warnings: string[];
  queryPlans: AnalyticalQueryPlan[];
  insights: ComputedInsight[];
  actions: DashboardAction[];
}

export interface SelfCheckResult {
  passed: boolean;
  items: Array<{ label: string; passed: boolean; message: string }>;
  warnings: string[];
  errors: string[];
}

export interface CopilotBiPlan {
  handled: boolean;
  needsClarification: boolean;
  clarification?: ClarificationDecision;
  intent: BusinessIntentResolution;
  intelligence: DatasetIntelligence;
  blueprint?: DashboardBlueprint;
  actions: DashboardAction[];
  evidence: string[];
  selfCheck: SelfCheckResult;
  warnings: string[];
  confidence: number;
}

export interface CopilotBiPlanningInput {
  prompt: string;
  rows?: DataRow[];
  datasetProfile: DatasetProfile;
  semanticModel: SemanticLayer;
}
