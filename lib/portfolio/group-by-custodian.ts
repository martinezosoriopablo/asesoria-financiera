// lib/portfolio/group-by-custodian.ts
import { stripAccents } from "@/lib/text";

export interface CustodianGroup {
  custodio: string;
  valorCLP: number;
  pct: number;
}

// Clave de agrupación: sin tildes, minúsculas, espacios colapsados.
function normKey(s: string): string {
  return stripAccents(s).toLowerCase().replace(/\s+/g, " ").trim();
}

// Agrupa holdings por custodio. `getSource` extrae el custodio (nombre "bonito"),
// `getValueCLP` su valor en CLP. Vacío/null → "Sin custodio". Ordena por valor desc
// y calcula el % de cada grupo sobre el total.
export function groupByCustodian<T>(
  holdings: T[],
  getSource: (h: T) => string | null | undefined,
  getValueCLP: (h: T) => number
): CustodianGroup[] {
  const byKey = new Map<string, { custodio: string; valorCLP: number }>();
  for (const h of holdings) {
    const raw = (getSource(h) ?? "").trim();
    const key = raw ? normKey(raw) : "__none__";
    const label = raw || "Sin custodio";
    const value = getValueCLP(h) || 0;
    const existing = byKey.get(key);
    if (existing) existing.valorCLP += value;
    else byKey.set(key, { custodio: label, valorCLP: value });
  }
  const total = Array.from(byKey.values()).reduce((s, g) => s + g.valorCLP, 0);
  return Array.from(byKey.values())
    .map((g) => ({ custodio: g.custodio, valorCLP: g.valorCLP, pct: total > 0 ? (g.valorCLP / total) * 100 : 0 }))
    .sort((a, b) => b.valorCLP - a.valorCLP);
}
