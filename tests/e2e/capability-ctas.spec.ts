import { expect, test, type Page } from "@playwright/test";

async function openDemoShareExport(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Probar con datos de ejemplo" }).click();
  await expect(page).toHaveURL(/\/app\/datasets\/preview$/);
  await expect(page.getByText(/Vista previa de datos/)).toBeVisible();

  await page.getByRole("link", { name: /Generar dashboard automaticamente/ }).click();
  await expect(page).toHaveURL(/\/app\/dashboards\//, { timeout: 30_000 });
  await expect(page.getByRole("link", { name: "Compartir" })).toBeVisible();

  await page.getByRole("link", { name: "Compartir" }).click();
  await expect(page).toHaveURL(/\/compartir$/);
  await expect(page.getByText("Compartir enlace interactivo")).toBeVisible();
}

test("main capability CTAs reflect real, beta and disabled behavior", async ({ page }) => {
  await openDemoShareExport(page);
  await expect(page.getByText("Requerir contrasena")).toBeVisible();
  await expect(page.getByText(/resultados agregados por widget/)).toBeVisible();

  await expect(page.getByRole("button", { name: "No disponible" })).toHaveCount(4);
  for (const title of ["Manifest interactivo", "Exportar PDF", "Exportar PNG", "Exportar PowerPoint"]) {
    const card = page.locator("article").filter({ has: page.getByRole("heading", { name: title }) });
    await expect(card.getByRole("button", { name: "No disponible" })).toBeDisabled();
  }

  const specDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Descargar JSON" }).click();
  await expect((await specDownload).suggestedFilename()).toContain("spec.json");

  const csvDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Descargar CSV" }).click();
  await expect((await csvDownload).suggestedFilename()).toContain("rows.csv");

  await page.getByRole("link", { name: "Crear presentacion" }).click();
  await expect(page).toHaveURL(/\/app\/presentaciones\/crear$/);
  await expect(page.getByRole("heading", { name: "2. Esquema generado por reglas" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Ajustes deterministicos" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Presentar ahora" })).toHaveAttribute("href", /\/app\/present\//);
  await page.getByRole("link", { name: "Presentar ahora" }).click();
  await expect(page).toHaveURL(/\/app\/present\//);
});

test("public share links expose usable allowlisted filters", async ({ page }) => {
  await openDemoShareExport(page);

  await page.getByRole("button", { name: "Crear y copiar" }).click();
  await expect(page.getByRole("link", { name: "Abrir vista previa" })).toBeVisible();
  await page.getByRole("link", { name: "Abrir vista previa" }).click();

  await expect(page).toHaveURL(/\/share\/share_/);
  await expect(page.getByText("Filtros permitidos")).toBeVisible();
  const firstFilter = page.getByRole("combobox").first();
  await firstFilter.selectOption({ index: 1 });
  await page.getByRole("button", { name: "Aplicar filtros" }).click();

  await expect(page.getByRole("button", { name: "Limpiar" })).toBeEnabled();
  await expect(page.getByText("Sin filtros activos")).toHaveCount(0);

  await page.getByRole("button", { name: "Limpiar" }).click();
  await expect(page.getByText("Sin filtros activos")).toBeVisible();
  await expect(page.getByText(/No se pudo|no es valido|error critico/i)).toHaveCount(0);
});

test("uploaded files start a recoverable background import job", async ({ page }) => {
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles({
    name: "ventas-e2e.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("Region,Ventas\nNorte,100\nSur,200\n")
  });

  await expect(page).toHaveURL(/\/app\/datasets\/dataset_.*\/preview$/, { timeout: 30_000 });
  await expect(page.getByText("Importacion recuperable")).toBeVisible();
  await expect(page.getByText(/Estado queued/)).toBeVisible();
  await expect(page.getByText("Preview seguro")).toBeVisible();
  await expect(page.getByText("Region,Ventas")).toBeVisible();
  await expect(page.getByText("Vista previa de datos")).toHaveCount(0);
});
