import type { DataRow } from "@/types/dataset";

const regions = ["Centro", "Norte", "Sur", "Occidente", "Oriente"];
const sellers = ["Maria Lopez", "Juan Perez", "Ana Torres", "Luis Ramirez", "Diego Vargas", "Sofia Mendez"];
const categories = ["Tecnologia", "Hogar", "Oficina"] as const;
const products = {
  Tecnologia: ["Laptop Dell XPS 13", "Monitor LG 27", "Teclado Mecanico", "Tablet Pro"],
  Hogar: ["Silla Ergonomica", "Aspiradora Robot", "Licuadora Premium", "Cafetera Smart"],
  Oficina: ["Impresora HP 410", "Escritorio Ajustable", "Pack Papeleria", "Silla Ejecutiva"]
} as const;
const channels = ["Directo", "Ecommerce", "Partner"];

export function createDemoDataset(): DataRow[] {
  const rows: DataRow[] = [];
  let order = 1;

  for (let month = 0; month < 6; month += 1) {
    for (let index = 0; index < 18; index += 1) {
      const category = categories[(month + index) % categories.length];
      const region = regions[(index + month * 2) % regions.length];
      const seller = sellers[(index + month) % sellers.length];
      const productList = products[category];
      const product = productList[index % productList.length];
      const base = 14000 + month * 2600 + index * 780;
      const regionBoost = region === "Centro" ? 1.35 : region === "Norte" ? 1.12 : region === "Oriente" ? 0.72 : 0.95;
      const quantity = 1 + ((index + month) % 4);
      const discount = [0, 5, 8, 10, 12, 15][(index + month) % 6];
      const sales = Math.round(base * regionBoost * quantity * (1 - discount / 100));
      const costUnit = Math.round((sales / quantity) * (0.52 + ((index + month) % 4) * 0.035));
      const margin = Number(((sales - costUnit * quantity) / sales).toFixed(3));
      const day = String(2 + ((index * 3) % 24)).padStart(2, "0");
      const date = `2024-${String(month + 1).padStart(2, "0")}-${day}`;

      rows.push({
        Fecha: date,
        "Pedido ID": `PED-24${String(month + 1).padStart(2, "0")}${String(order).padStart(4, "0")}`,
        Cliente: ["Maria Lopez", "Juan Perez", "Valeria Soto", "Carlos Ruiz", "Camila Rojas", "Pedro Silva"][
          (index + month) % 6
        ],
        Region: region,
        Vendedor: seller,
        Categoria: category,
        Producto: product,
        Ventas: sales,
        Cantidad: quantity,
        "Descuento (%)": discount,
        "Costo Unitario": costUnit,
        "Margen Bruto": margin,
        Canal: channels[(index + month) % channels.length],
        Estado: index % 11 === 0 ? "Pendiente" : "Completado"
      });
      order += 1;
    }
  }

  return rows;
}

export const demoRows = createDemoDataset();
