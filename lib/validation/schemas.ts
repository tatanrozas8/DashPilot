import { z } from "zod";

const dataValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);

export const datasetColumnProfileSchema = z.object({
  originalName: z.string(),
  normalizedName: z.string(),
  displayName: z.string(),
  businessName: z.string().optional(),
  description: z.string().optional(),
  synonyms: z.array(z.string()).optional(),
  isHidden: z.boolean().optional(),
  inferredType: z.enum(["string", "number", "date", "datetime", "boolean", "currency", "percentage", "geography", "unknown"]),
  semanticType: z.enum(["metric", "dimension", "time", "geo", "identifier", "category", "measure", "unknown"]),
  userSemanticType: z.enum(["metric", "dimension", "time", "geo", "identifier", "category", "measure", "unknown"]).optional(),
  semanticConfidence: z.number().optional(),
  geoRole: z.enum(["region", "country", "city", "zone", "commune", "territory", "unknown"]).optional(),
  geoConfidence: z.number().optional(),
  nullCount: z.number(),
  nullPercentage: z.number(),
  uniqueCount: z.number(),
  sampleValues: z.array(z.unknown()),
  min: z.union([z.string(), z.number()]).optional(),
  max: z.union([z.string(), z.number()]).optional(),
  statistics: z.record(z.string(), z.unknown()).optional()
});

export const datasetProfileSchema = z.object({
  id: z.string(),
  datasetVersionId: z.string().optional(),
  fileName: z.string(),
  rowCount: z.number(),
  columnCount: z.number(),
  columns: z.array(datasetColumnProfileSchema),
  detectedDateColumns: z.array(z.string()),
  detectedMetricColumns: z.array(z.string()),
  detectedDimensionColumns: z.array(z.string()),
  detectedGeoColumns: z.array(z.string()),
  qualityWarnings: z.array(z.string()),
  qualityScore: z.number().min(0).max(100),
  createdAt: z.string()
});

export const datasetImportStatusSchema = z.enum(["created", "uploading", "processing", "validating", "ready", "failed", "cancelled", "superseded"]);

export const datasetVersionSchema = z.object({
  id: z.string(),
  datasetId: z.string(),
  versionNumber: z.number().int().positive(),
  status: datasetImportStatusSchema,
  checksum: z.string().min(32),
  schemaHash: z.string().min(32),
  rowCount: z.number().int().nonnegative(),
  columnCount: z.number().int().nonnegative(),
  fileName: z.string(),
  fileType: z.enum(["csv", "xlsx", "xls"]),
  fileSize: z.number().int().nonnegative(),
  selectedSheetName: z.string(),
  idempotencyKey: z.string().optional(),
  profile: datasetProfileSchema.optional(),
  storagePath: z.string().optional(),
  errorMessage: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  readyAt: z.string().optional(),
  failedAt: z.string().optional(),
  cancelledAt: z.string().optional(),
  supersededAt: z.string().optional()
}).superRefine((version, context) => {
  if ((version.status === "ready" || version.status === "superseded") && !version.readyAt) {
    context.addIssue({ code: "custom", path: ["readyAt"], message: "Una version ready/superseded debe registrar readyAt." });
  }
  if (version.status === "failed" && !version.failedAt) {
    context.addIssue({ code: "custom", path: ["failedAt"], message: "Una version failed debe registrar failedAt." });
  }
  if (version.status === "cancelled" && !version.cancelledAt) {
    context.addIssue({ code: "custom", path: ["cancelledAt"], message: "Una version cancelled debe registrar cancelledAt." });
  }
});

export const dashboardFilterSchema = z.object({
  field: z.string(),
  operator: z.enum(["eq", "neq", "contains", "gt", "lt", "gte", "lte", "in", "between", "range"]),
  value: z.unknown()
});

export const dashboardQuerySchema = z.object({
  metric: z.object({
    field: z.string(),
    aggregation: z.enum(["sum", "avg", "count", "count_distinct", "min", "max"])
  }).optional(),
  metricId: z.string().optional(),
  x: z.object({
    field: z.string(),
    granularity: z.enum(["day", "week", "month", "quarter", "year"]).optional()
  }).optional(),
  timeDimensionId: z.string().optional(),
  groupBy: z.array(z.string()).optional(),
  dimensionIds: z.array(z.string()).optional(),
  seriesBy: z.string().optional(),
  seriesGranularity: z.enum(["day", "week", "month", "quarter", "year"]).optional(),
  filters: z.array(dashboardFilterSchema).optional(),
  orderBy: z.object({
    field: z.string(),
    direction: z.enum(["asc", "desc"])
  }).optional(),
  limit: z.number().optional()
});

export const dashboardWidgetVisualConfigSchema = z.object({
  orientation: z.enum(["horizontal", "vertical"]).optional(),
  legend: z.boolean().optional()
});

export const widgetQuerySchema = z.object({
  metricId: z.string().optional(),
  dimensionIds: z.array(z.string()).default([]),
  timeDimensionId: z.string().optional(),
  filters: z.array(dashboardFilterSchema).default([]),
  orderBy: z.object({
    field: z.string(),
    direction: z.enum(["asc", "desc"])
  }).optional(),
  limit: z.number().int().positive().optional(),
  legacyQuery: dashboardQuerySchema.optional()
});

export const widgetVisualSpecSchema = z.object({
  format: z.string().optional(),
  tone: z.string().optional(),
  icon: z.string().optional(),
  compact: z.boolean().optional(),
  comparison: z.union([z.string(), z.boolean()]).optional(),
  visualConfig: dashboardWidgetVisualConfigSchema.optional(),
  horizontal: z.boolean().optional(),
  columns: z.array(z.string()).optional(),
  hidden: z.boolean().optional(),
  emptyMessage: z.string().optional()
});

export const dashboardPageSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  order: z.number().int().nonnegative(),
  layout: z.object({
    mode: z.literal("grid_12"),
    columns: z.literal(12)
  }),
  filters: z.array(dashboardFilterSchema),
  widgetIds: z.array(z.string())
});

export const widgetSpecSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["kpi_card", "line_chart", "bar_chart", "area_chart", "donut_chart", "scatter_plot", "map", "table", "insight_text"]),
  title: z.string().min(1),
  description: z.string().optional(),
  query: widgetQuerySchema.optional(),
  visual: widgetVisualSpecSchema,
  content: z.object({
    bullets: z.array(z.string()).optional(),
    text: z.string().optional()
  }).optional(),
  layout: z.object({
    pageId: z.string().min(1),
    x: z.number().int().nonnegative(),
    y: z.number().int().nonnegative(),
    w: z.number().int().positive(),
    h: z.number().int().positive()
  }),
  lineage: z.object({
    semanticModelId: z.string(),
    datasetVersionId: z.string().optional(),
    metricIds: z.array(z.string()),
    calculatedMetricIds: z.array(z.string()),
    dimensionIds: z.array(z.string()),
    timeDimensionIds: z.array(z.string()),
    sourceColumnIds: z.array(z.string()),
    filters: z.array(dashboardFilterSchema),
    migratedAt: z.string(),
    warnings: z.array(z.string())
  }).optional()
});

export const dashboardRevisionSchema = z.object({
  id: z.string().min(1),
  dashboardId: z.string().min(1),
  revisionNumber: z.number().int().positive(),
  status: z.enum(["draft", "published", "archived"]),
  semanticModelId: z.string().min(1),
  datasetVersionId: z.string().min(1),
  pages: z.array(dashboardPageSchema).min(1),
  widgets: z.array(widgetSpecSchema),
  createdAt: z.string(),
  createdBy: z.string().min(1),
  publishedAt: z.string().optional(),
  mutable: z.boolean()
});

export const dashboardDocumentSchema = z.object({
  dashboard: z.object({
    id: z.string().min(1),
    title: z.string().min(1),
    subtitle: z.string().optional(),
    datasetId: z.string().min(1),
    currentRevisionId: z.string().min(1),
    publishedRevisionId: z.string().optional(),
    globalFilters: z.array(z.object({
      id: z.string(),
      field: z.string(),
      label: z.string(),
      type: z.enum(["date_range", "multi_select", "single_select", "number_range"]),
      allowedValues: z.array(z.object({
        label: z.string(),
        value: z.union([z.string(), z.number(), z.boolean()])
      })).optional()
    })),
    createdAt: z.string(),
    updatedAt: z.string()
  }),
  revisions: z.array(dashboardRevisionSchema).min(1)
});

export const dashboardSpecSchema = z.object({
  id: z.string(),
  title: z.string(),
  subtitle: z.string().optional(),
  businessDomain: z.string().optional(),
  datasetId: z.string(),
  datasetVersionId: z.string().optional(),
  semanticModelId: z.string().optional(),
  design: z.object({
    density: z.enum(["compact", "comfortable"]).optional(),
    accentColor: z.enum(["indigo", "emerald", "sky", "slate"]).optional(),
    cardStyle: z.enum(["soft", "bordered"]).optional(),
    chartPalette: z.enum(["default", "business", "contrast"]).optional()
  }).optional(),
  globalFilters: z.array(z.object({
    id: z.string(),
    field: z.string(),
    label: z.string(),
    type: z.enum(["date_range", "multi_select", "single_select", "number_range"]),
    allowedValues: z.array(z.object({
      label: z.string(),
      value: z.union([z.string(), z.number(), z.boolean()])
    })).optional()
  })),
  widgets: z.array(z.object({
    id: z.string(),
    type: z.enum(["kpi_card", "line_chart", "bar_chart", "area_chart", "donut_chart", "scatter_plot", "map", "table", "insight_text"]),
    title: z.string(),
    description: z.string().optional(),
    query: dashboardQuerySchema.optional(),
    lineage: z.object({
      semanticModelId: z.string(),
      datasetVersionId: z.string().optional(),
      metricIds: z.array(z.string()),
      calculatedMetricIds: z.array(z.string()),
      dimensionIds: z.array(z.string()),
      timeDimensionIds: z.array(z.string()),
      sourceColumnIds: z.array(z.string()),
      filters: z.array(dashboardFilterSchema),
      migratedAt: z.string(),
      warnings: z.array(z.string())
    }).optional(),
    config: z.record(z.string(), z.unknown()).and(z.object({
      visualConfig: dashboardWidgetVisualConfigSchema.optional(),
      horizontal: z.boolean().optional(),
      hidden: z.boolean().optional(),
      columns: z.array(z.string()).optional()
    }).partial()),
    position: z.object({
      x: z.number(),
      y: z.number(),
      w: z.number(),
      h: z.number()
    })
  })),
  executiveSummary: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const presentationSpecSchema = z.object({
  id: z.string(),
  dashboardId: z.string(),
  sourceDashboardRevisionId: z.string(),
  sourceDashboardTitle: z.string(),
  sourceDashboardUpdatedAt: z.string(),
  snapshotMode: z.literal("snapshot"),
  title: z.string(),
  subtitle: z.string().optional(),
  theme: z.enum(["executive", "commercial", "financial", "operations"]),
  slides: z.array(z.object({
    id: z.string(),
    title: z.string(),
    subtitle: z.string().optional(),
    narrative: z.string().optional(),
    speakerNotes: z.string().optional(),
    layout: z.enum(["cover", "executive_summary", "kpi_grid", "chart_focus", "comparison", "ranking", "table_detail", "insights"]),
    widgetIds: z.array(z.string()),
    viewState: z.object({
      filters: z.array(dashboardFilterSchema),
      selectedDateRange: z.object({ from: z.string(), to: z.string() }).optional(),
      highlightedWidgetId: z.string().optional(),
      hiddenWidgetIds: z.array(z.string()).optional(),
      sortState: z.object({ field: z.string(), direction: z.enum(["asc", "desc"]) }).optional(),
      dataExplorer: z.object({
        isOpen: z.boolean().optional(),
        search: z.string().optional(),
        visibleColumns: z.array(z.string()).optional(),
        sort: z.object({ field: z.string(), direction: z.enum(["asc", "desc"]) }).optional(),
        columnSearch: z.object({ field: z.string(), query: z.string() }).optional(),
        pageSize: z.number().optional()
      }).optional()
    }).optional()
  })),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const shareLinkSchema = z.object({
  id: z.string(),
  dashboardId: z.string(),
  token: z.string().optional(),
  access: z.enum(["public", "private", "password"]),
  expiresAt: z.string().optional(),
  allowFilters: z.boolean(),
  allowDownload: z.boolean(),
  scopes: z.array(z.enum(["view_dashboard", "use_filters", "export_snapshot"])).optional(),
  passwordRequired: z.boolean().optional(),
  createdAt: z.string()
});

export const parsedDatasetRowsSchema = z.array(z.record(z.string(), dataValueSchema));
