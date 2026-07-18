// lib/returns/implied-flow.ts
// Estima el flujo de caja externo (aporte/retiro) IMPLÍCITO entre dos cartolas,
// para detectar movimientos que el asesor no registró.
//
//   flujoImplícito = (valorTotalNuevo − valorTotalPrevio)
//                    − Σ_tenidos[ qtyPrev × (precioUnitNuevo − precioUnitPrevio) ]
//
// "tenidos" = fondos presentes en ambas cartolas (mismo key). Su ganancia de
// PRECIO no es flujo; el resto del cambio de valor sí lo es. Un rebalanceo
// (vender A, comprar B por igual valor) se cancela → ~0. Compras/ventas del
// mismo fondo (cambio de cuotas) → el monto aportado/retirado.

export interface FlowHolding {
  fundName: string;
  securityId?: string | null;
  serie?: string | null;
  quantity?: number;
  marketValue: number;
}

export function keyOf(h: FlowHolding): string {
  const sid = (h.securityId ?? "").toString().trim();
  if (sid) return `${sid}|${(h.serie ?? "").toString().trim()}`;
  return `name:${h.fundName.trim().toLowerCase()}`;
}

export function unitPrice(h: FlowHolding): number | null {
  const q = h.quantity ?? 0;
  if (q > 0) return h.marketValue / q;
  return null;
}

export function estimateImpliedFlow(prev: FlowHolding[], next: FlowHolding[]): number {
  const totalPrev = prev.reduce((s, h) => s + (h.marketValue || 0), 0);
  const totalNext = next.reduce((s, h) => s + (h.marketValue || 0), 0);

  const prevByKey = new Map<string, FlowHolding>();
  for (const h of prev) prevByKey.set(keyOf(h), h);

  // Ganancia de mercado de lo tenido en ambas fechas (solo cambio de precio unitario).
  let marketGain = 0;
  for (const hNext of next) {
    const hPrev = prevByKey.get(keyOf(hNext));
    if (!hPrev) continue;
    const upPrev = unitPrice(hPrev);
    const upNext = unitPrice(hNext);
    if (upPrev == null || upNext == null) continue;
    const qtyPrev = hPrev.quantity ?? 0;
    marketGain += qtyPrev * (upNext - upPrev);
  }

  return (totalNext - totalPrev) - marketGain;
}
