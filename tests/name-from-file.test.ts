import { describe, expect, it } from "vitest";
import { nameFromFile } from "@/lib/utils/name-from-file";

describe("nameFromFile", () => {
  it("cleans technical words and preserves relevant business terms", () => {
    expect(nameFromFile("dataset_fmcg_tipo_nestle_demo_dashboard.xlsx")).toBe("FMCG Nestlé");
    expect(nameFromFile("ventas_junio_2025.xlsx")).toBe("Ventas Junio 2025");
    expect(nameFromFile("clientes_region_sur.csv")).toBe("Clientes Región Sur");
  });

  it("returns the fallback for empty names", () => {
    expect(nameFromFile("")).toBe("Sin proyecto activo");
  });
});
