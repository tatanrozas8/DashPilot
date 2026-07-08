import { generateDashboardSpec } from "@/lib/dashboard-spec/generate-dashboard-spec";
import { demoRows } from "@/lib/data/demo-dataset";
import { generatePresentationSpec } from "@/lib/presentation-spec/generate-presentation-spec";
import { profileDataset } from "@/lib/profiling/profile-dataset";

export const demoDataset = demoRows;
export const demoDatasetProfile = profileDataset(demoDataset, "Ventas_Q2_2024.xlsx");
export const demoDashboardSpec = generateDashboardSpec(demoDatasetProfile, demoDataset);
export const demoPresentationSpec = generatePresentationSpec(demoDashboardSpec);

export const demoProject = {
  id: "project_demo",
  name: "Analisis Comercial Q2 2024",
  owner: "Carlos Mendoza",
  updatedAt: "Actualizado hace 5 min"
};

export const demoKpis = {
  sales: "$2.45M",
  margin: "37.8%",
  tickets: "24,812",
  growth: "18.6%"
};
