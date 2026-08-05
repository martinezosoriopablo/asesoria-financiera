import { classifyHolding, type HoldingForClassification } from "@/lib/comite-categories";
import { inferInstrumentType } from "@/lib/instrument-type";
import type { CustodianType } from "./types";

export interface DirectHolding {
  ticker: string | null;
  nombre: string;
  tipo: "stock" | "bond";
  sector: string | null;
  weight_pct: number;
  custodian_type: CustodianType;
}

type RawHolding = HoldingForClassification & {
  sector?: string | null;
  custodian_type?: CustodianType | null;
};

// Detecta si un holding es un instrumento DIRECTO (acción/bono) o no (fondo/ETF/caja → null).
// (Delegamos en lib/instrument-type.ts — la utilidad canónica del repo — en vez
//  de reimplementar la detección; ver CLAUDE.md: no duplicar utilidades compartidas.)
export function detectDirectTipo(h: RawHolding): "stock" | "bond" | null {
  const t = inferInstrumentType(h);
  return t === "bond" || t === "stock" ? t : null;
}

// Agrupa los holdings directos por sleeve (categoryId de classifyHolding).
export function classifyDirectHoldingsBySleeve(
  holdings: RawHolding[],
  totalValue: number,
): Map<string, DirectHolding[]> {
  const out = new Map<string, DirectHolding[]>();
  const total = totalValue > 0 ? totalValue : 1;
  for (const h of holdings || []) {
    const tipo = detectDirectTipo(h);
    if (!tipo) continue;
    const { categoryId } = classifyHolding(h);
    const d: DirectHolding = {
      ticker: h.securityId ?? null,
      nombre: h.fundName,
      tipo,
      sector: h.sector ?? null,
      weight_pct: (h.marketValue / total) * 100,
      custodian_type: (h.custodian_type as CustodianType) || "corredora",
    };
    const arr = out.get(categoryId) || [];
    arr.push(d);
    out.set(categoryId, arr);
  }
  return out;
}
