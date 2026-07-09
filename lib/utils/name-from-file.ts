const removableWords = new Set(["demo", "dashboard", "dataset", "data", "datos", "archivo", "file", "tipo"]);

const preservedTerms: Record<string, string> = {
  fmcg: "FMCG",
  nestle: "Nestlé",
  region: "Región",
  regiones: "Regiones"
};

function stripExtension(fileName: string) {
  const baseName = fileName.split(/[\\/]/).pop() ?? fileName;
  return baseName.replace(/\.[^.]+$/, "");
}

function titleCase(word: string) {
  const normalized = word.toLowerCase();
  return preservedTerms[normalized] ?? `${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}`;
}

export function nameFromFile(fileName?: string | null, fallback = "Sin proyecto activo") {
  if (!fileName?.trim()) return fallback;

  const words = stripExtension(fileName)
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((word) => word.trim())
    .filter(Boolean)
    .filter((word) => !removableWords.has(word.toLowerCase()));

  const cleaned = words.map((word) => (/^\d+$/.test(word) ? word : titleCase(word))).join(" ").trim();
  return cleaned || fallback;
}
