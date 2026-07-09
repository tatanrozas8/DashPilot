import { generateDashboardSpec } from "@/lib/dashboard-spec/generate-dashboard-spec";
import { demoRows as sampleRows } from "@/lib/data/demo-dataset";
import { generatePresentationSpec } from "@/lib/presentation-spec/generate-presentation-spec";
import { profileDataset } from "@/lib/profiling/profile-dataset";

export const sampleDataset = sampleRows;
export const sampleDatasetProfile = profileDataset(sampleDataset, "ejemplo_comercial.xlsx");
export const sampleDashboardSpec = generateDashboardSpec(sampleDatasetProfile, sampleDataset);
export const samplePresentationSpec = generatePresentationSpec(sampleDashboardSpec);

export const sampleProject = {
  id: "sample-project",
  name: "Ejemplo comercial",
  owner: "Usuario",
  updatedAt: "Datos de ejemplo"
};

export const sampleKpis = {
  sales: "$2.45M",
  margin: "37.8%",
  tickets: "24,812",
  growth: "18.6%"
};
