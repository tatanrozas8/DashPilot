import { expect, test, type Page } from "@playwright/test";

async function openDemoDashboard(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Probar con datos de ejemplo" }).click();
  await expect(page).toHaveURL(/\/app\/datasets\/preview$/);
  await page.getByRole("link", { name: /Generar dashboard automaticamente/ }).click();
  await expect(page).toHaveURL(/\/app\/dashboards\//, { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: /Copiloto/ })).toBeVisible();
}

async function askCopilot(page: Page, prompt: string) {
  await page.getByPlaceholder("Escribe tu mensaje...").fill(prompt);
  await page.getByRole("button", { name: "Enviar mensaje" }).click();
}

test("copilot answers a direct analytical question with evidence", async ({ page }) => {
  await openDemoDashboard(page);

  await askCopilot(page, "Cual es el total de ventas?");

  await expect(page.getByText("Resultado", { exact: true })).toBeVisible();
  await expect(page.getByText(/Evidencia: evidence_/)).toBeVisible();
  await expect(page.getByText("Periodo: Todo el dataset disponible (inferido)", { exact: true })).toBeVisible();
  await expect(page.getByText(/No se pudo|error critico|Unhandled Runtime Error/i)).toHaveCount(0);
});

test("copilot applies a multipage BI blueprint as real dashboard pages", async ({ page }) => {
  await openDemoDashboard(page);

  await askCopilot(page, "Disenar dashboard ejecutivo completo para gerencia.");
  await expect(page.getByText("Blueprint", { exact: true })).toBeVisible();
  await expect(page.locator("p").filter({ hasText: /^Self-check: aprobado/ })).toBeVisible();
  await expect(page.getByText(/Vista ejecutiva: \d+ widgets/)).toBeVisible();
  await expect(page.getByText(/Vista operacional: \d+ widgets/)).toBeVisible();
  await expect(page.getByText(/Detalle: \d+ widgets/)).toBeVisible();

  await page.getByRole("button", { name: "Aplicar" }).last().click();

  await expect(page.getByRole("heading", { name: "Vista ejecutiva" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Vista operacional" })).toBeVisible();
  await expect(page.locator("section[aria-label='Detalle'] h2")).toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", { name: /Copiloto/ })).toBeVisible();
  await expect(page.getByText(/No se pudo|error critico|Unhandled Runtime Error/i)).toHaveCount(0);
});

test("copilot corrects a selected chart dimension without breaking the metric", async ({ page }) => {
  await openDemoDashboard(page);

  await page.getByRole("button", { name: /Seleccionar Ventas por Region/ }).click();
  await expect(page.getByText(/Actuando sobre: Ventas por Region/)).toBeVisible();

  await askCopilot(page, "Cambialo a ventas por canal.");
  await expect(page.getByText(/Plan listo/)).toBeVisible();
  await page.getByRole("button", { name: "Aplicar" }).last().click();
  await expect(page.getByText(/Accion aplicada/)).toBeVisible();
  await expect(page.getByText(/Canal/i).first()).toBeVisible();

  await askCopilot(page, "Corrige la dimension a region sin cambiar ventas.");
  await expect(page.getByText(/Plan listo/).last()).toBeVisible();
  await page.getByRole("button", { name: "Aplicar" }).last().click();
  await expect(page.getByText(/Ventas/i).first()).toBeVisible();
  await expect(page.getByText(/Region/i).first()).toBeVisible();
  await expect(page.getByText(/No se pudo|error critico|Unhandled Runtime Error/i)).toHaveCount(0);
});

test("copilot asks clarification for ambiguous dashboard requests", async ({ page }) => {
  await openDemoDashboard(page);

  await askCopilot(page, "Hazlo mejor.");

  await expect(page.getByText(/Necesito una aclaracion/)).toBeVisible();
  await expect(page.getByText(/Opciones: Cambiar visualizacion/)).toBeVisible();
  await expect(page.getByText(/No se pudo|error critico|Unhandled Runtime Error/i)).toHaveCount(0);
});

test("copilot undo restores the previous dashboard state", async ({ page }) => {
  await openDemoDashboard(page);

  await page.getByRole("button", { name: /Seleccionar Ventas por Region/ }).click();
  await askCopilot(page, "Cambialo a barras verticales.");
  await expect(page.getByText(/Plan listo/)).toBeVisible();
  await page.getByRole("button", { name: "Aplicar" }).click();
  await expect(page.getByText(/Estado: verified/)).toBeVisible();

  await page.getByRole("button", { name: "Deshacer cambio del Copiloto" }).click();

  await expect(page.getByText(/Deshice/)).toBeVisible();
  await expect(page.getByText(/No se pudo|error critico|Unhandled Runtime Error/i)).toHaveCount(0);
});
