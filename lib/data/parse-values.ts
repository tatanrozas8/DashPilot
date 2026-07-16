export function parseLocaleNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  const signed = trimmed
    .replace(/[^\d,.\-+]/g, "")
    .replace(/(?!^)[-+]/g, "");
  if (!signed || signed === "-" || signed === "+") return null;

  const commaIndex = signed.lastIndexOf(",");
  const dotIndex = signed.lastIndexOf(".");
  let normalized = signed;

  if (commaIndex >= 0 && dotIndex >= 0) {
    const decimalSeparator = commaIndex > dotIndex ? "," : ".";
    const thousandsSeparator = decimalSeparator === "," ? "." : ",";
    normalized = signed.replaceAll(thousandsSeparator, "").replace(decimalSeparator, ".");
  } else if (commaIndex >= 0) {
    const decimals = signed.length - commaIndex - 1;
    normalized = decimals > 0 && decimals <= 2 ? signed.replaceAll(".", "").replace(",", ".") : signed.replaceAll(",", "");
  } else if (dotIndex >= 0) {
    const decimals = signed.length - dotIndex - 1;
    const integerPart = signed.slice(0, dotIndex).replace(/[-+]/g, "");
    normalized = decimals === 3 && integerPart.length <= 3 ? signed.replaceAll(".", "") : signed;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseDateValue(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "number" && Number.isFinite(value) && value > 25_000 && value < 80_000) {
    return new Date(Math.round((value - 25_569) * 86_400_000));
  }
  if (typeof value !== "string") return null;

  const text = value.trim();
  if (!text) return null;

  const iso = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (iso) {
    const date = new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const latam = text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
  if (latam) {
    if (Number(latam[1]) <= 12 && Number(latam[2]) <= 12) return null;
    const year = Number(latam[3].length === 2 ? `20${latam[3]}` : latam[3]);
    const first = Number(latam[1]);
    const second = Number(latam[2]);
    const day = first > 12 ? first : second;
    const month = first > 12 ? second : first;
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date : null;
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function compareDataValues(left: unknown, right: unknown) {
  const leftDate = parseDateValue(left);
  const rightDate = parseDateValue(right);
  if (leftDate && rightDate) return leftDate.getTime() - rightDate.getTime();

  const leftNumber = parseLocaleNumber(left);
  const rightNumber = parseLocaleNumber(right);
  if (leftNumber !== null && rightNumber !== null) return leftNumber - rightNumber;

  return String(left ?? "").localeCompare(String(right ?? ""), "es", { numeric: true, sensitivity: "base" });
}
