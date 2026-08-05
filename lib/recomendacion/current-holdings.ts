import { classifyHolding, type HoldingForClassification } from "@/lib/comite-categories";
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
export function detectDirectTipo(h: RawHolding): "stock" | "bond" | null {
  const sid = (h.securityId || "").trim().toUpperCase();
  const asset = (h.assetClass || "").toLowerCase();
  // Bono: cupón+vencimiento, o CUSIP alfanumérico de 9 con dígitos y letras.
  const cusipBond = /^[A-Z0-9]{9}$/.test(sid) && /\d/.test(sid) && /[A-Z]/.test(sid);
  if ((h.couponRate != null && h.maturityDate) || asset === "bond" || cusipBond) return "bond";
  // Fondo: RUN numérico, o assetClass fondo/etf.
  if (/^\d+$/.test(sid) || asset === "fund" || asset === "etf") return null;
  // Acción: assetClass equity, o ticker puramente alfabético (2-6 letras, con o sin sufijo .SN).
  if (asset === "equity" || /^[A-Z]{1,6}(\.[A-Z]{1,3})?$/.test(sid)) return "stock";
  return null;
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
