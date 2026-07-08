import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { normalizeColumnName, normalizeColumns } from "@/lib/files/normalize-columns";
import { parseCsvFile } from "@/lib/files/parse-csv";
import { parseExcelFile } from "@/lib/files/parse-excel";

const csvText = [
  "Fecha Venta,Cliente,Region Cliente,Ventas $,Cantidad,Margen Bruto (%),Vendedor",
  "2024-04-01,Acme,Centro,1200,2,0.35,Maria",
  "2024-04-02,Delta,Norte,800,1,0.28,Juan"
].join("\n");

describe("file parsing", () => {
  it("normalizes column names and keeps duplicates unique", () => {
    expect(normalizeColumnName("Fecha Venta")).toBe("fecha_venta");
    expect(normalizeColumnName("Ventas $")).toBe("ventas");
    expect(normalizeColumnName("Margen Bruto (%)")).toBe("margen_bruto");

    const columns = normalizeColumns(["Ventas $", "Ventas $", "Region Cliente"]);
    expect(columns.map((column) => column.normalizedName)).toEqual(["ventas", "ventas_2", "region_cliente"]);
  });

  it("parses csv files into normalized rows", async () => {
    const file = new File([csvText], "ventas.csv", { type: "text/csv" });
    const parsed = await parseCsvFile(file);

    expect(parsed.fileType).toBe("csv");
    expect(parsed.sheets[0]?.columns.map((column) => column.normalizedName)).toContain("ventas");
    expect(parsed.sheets[0]?.rows[0]?.ventas).toBe(1200);
    expect(parsed.sheets[0]?.previewRows).toHaveLength(2);
  });

  it("parses excel sheets and exposes sheet metadata", async () => {
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet([
      ["Fecha Venta", "Cliente", "Ventas $"],
      ["2024-04-01", "Acme", 1200]
    ]);
    XLSX.utils.book_append_sheet(workbook, worksheet, "Ventas");
    const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
    const file = new File([buffer], "ventas.xlsx");
    const parsed = await parseExcelFile(file);

    expect(parsed.fileType).toBe("xlsx");
    expect(parsed.sheets[0]?.name).toBe("Ventas");
    expect(parsed.sheets[0]?.rows[0]?.ventas).toBe(1200);
  });
});
