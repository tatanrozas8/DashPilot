import { describe, expect, it } from "vitest";
import { generateDashboardSpec } from "@/lib/dashboard-spec/generate-dashboard-spec";
import { inferSemanticLayer } from "@/lib/semantic-layer";
import { profileDataset } from "@/lib/profiling/profile-dataset";
import type { DashboardSpec } from "@/types/dashboard";
import type { DataRow } from "@/types/dataset";

function referencedFields(spec: DashboardSpec) {
  const fields = new Set<string>();
  for (const filter of spec.globalFilters) fields.add(filter.field);
  for (const widget of spec.widgets) {
    if (widget.query?.metric?.field) fields.add(widget.query.metric.field);
    if (widget.query?.x?.field) fields.add(widget.query.x.field);
    for (const field of widget.query?.groupBy ?? []) fields.add(field);
    for (const field of (widget.config.columns as string[] | undefined) ?? []) fields.add(field);
  }
  return fields;
}

describe("semantic layer", () => {
  it("detects sales roles and uses them in dashboard queries", () => {
    const rows: DataRow[] = [
      { "Fecha Operacion": "2026-01-05", "Orden Comercial": "OC-1", "Cuenta Cliente": "Acme", Representante: "Maria", "SKU Producto": "Laptop", Territorio: "Norte", "Importe Neto": 1200, "Margen %": 0.32 },
      { "Fecha Operacion": "2026-01-10", "Orden Comercial": "OC-2", "Cuenta Cliente": "Delta", Representante: "Juan", "SKU Producto": "Monitor", Territorio: "Sur", "Importe Neto": 900, "Margen %": 0.28 },
      { "Fecha Operacion": "2026-02-02", "Orden Comercial": "OC-3", "Cuenta Cliente": "Acme", Representante: "Maria", "SKU Producto": "Laptop", Territorio: "Norte", "Importe Neto": 1500, "Margen %": 0.35 },
      { "Fecha Operacion": "2026-02-15", "Orden Comercial": "OC-4", "Cuenta Cliente": "Nova", Representante: "Sofia", "SKU Producto": "Tablet", Territorio: "Centro", "Importe Neto": 1100, "Margen %": 0.3 }
    ];
    const profile = profileDataset(rows, "pipeline_comercial.csv");
    const semantic = inferSemanticLayer(profile, rows);
    const dashboard = generateDashboardSpec(profile, rows);

    expect(semantic.domain.name).toBe("sales");
    expect(semantic.primaryMetric?.field).toBe("Importe Neto");
    expect(semantic.primaryClient?.field).toBe("Cuenta Cliente");
    expect(semantic.primarySeller?.field).toBe("Representante");
    expect(semantic.primaryProduct?.field).toBe("SKU Producto");
    expect(semantic.primaryMetric?.confidence).toBeGreaterThan(0.5);
    expect(dashboard.widgets.find((widget) => widget.id === "kpi_sales")?.query?.metric?.field).toBe("Importe Neto");
    expect(dashboard.widgets.find((widget) => widget.id === "top_sellers")?.query?.groupBy).toContain("Representante");
  });

  it("keeps generic datasets generic and references only existing columns", () => {
    const rows: DataRow[] = [
      { fecha_evento: "2026-01-01", sensor: "A", estado: "ok", temperatura: 21.4 },
      { fecha_evento: "2026-01-02", sensor: "A", estado: "ok", temperatura: 22.1 },
      { fecha_evento: "2026-01-03", sensor: "B", estado: "alerta", temperatura: 29.8 },
      { fecha_evento: "2026-01-04", sensor: "B", estado: "ok", temperatura: 23.3 }
    ];
    const profile = profileDataset(rows, "lecturas_sensores.csv");
    const semantic = inferSemanticLayer(profile, rows);
    const dashboard = generateDashboardSpec(profile, rows);
    const columns = new Set(Object.keys(rows[0]!));

    expect(semantic.domain.name).toBe("generic");
    expect(semantic.primaryMetric?.field).toBe("temperatura");
    expect(semantic.primaryDimension?.field).toBeDefined();
    expect(semantic.clients).toHaveLength(0);
    expect(semantic.sellers).toHaveLength(0);
    expect(semantic.products).toHaveLength(0);
    expect(dashboard.businessDomain).toBe("generic");
    expect(dashboard.globalFilters.map((filter) => filter.id)).not.toContain("region");
    expect([...referencedFields(dashboard)].every((field) => columns.has(field))).toBe(true);
  });
});
