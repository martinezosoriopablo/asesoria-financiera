// lib/returns/persist.ts
// Recalcula y persiste daily_return / cumulative_return de un cliente como TWR
// encadenado (flow-independiente). Fuente única del retorno almacenado — reemplaza
// el cálculo ingenuo valor/valor que estaba disperso en el POST de snapshots y en
// la función SQL calculate_snapshot_returns.

import type { SupabaseClient } from "@supabase/supabase-js";
import { computeSnapshotReturnsHybrid } from "./unit-return";

// DECIMAL(10,4) admite ±999999.9999; se usa ±9999.99 como cota razonable de %.
const clamp = (v: number) => Math.max(-9999.99, Math.min(9999.99, Math.round(v * 100) / 100));

/**
 * Recalcula el TWR de TODOS los snapshots del cliente (ordenados por fecha) y
 * persiste daily_return (TWR del período) y cumulative_return (TWR acumulado).
 * Llamar después de cualquier alta/edición/borrado de snapshot.
 */
export async function recomputeClientReturns(
  supabase: SupabaseClient,
  clientId: string,
): Promise<void> {
  const { data: snaps } = await supabase
    .from("portfolio_snapshots")
    .select("id, total_value, net_cash_flow, holdings")
    .eq("client_id", clientId)
    .order("snapshot_date", { ascending: true });

  if (!snaps || snaps.length === 0) return;

  type RawHolding = { fundName?: string; securityId?: string | null; serie?: string | null; quantity?: number; marketValue?: number; marketValueCLP?: number };
  const results = computeSnapshotReturnsHybrid(
    (snaps as Array<{ id: string; total_value: number | null; net_cash_flow: number | null; holdings: unknown }>).map((s) => ({
      id: s.id,
      value: s.total_value ?? 0,
      netCashFlow: s.net_cash_flow ?? 0,
      // Valor cuota en CLP (marketValueCLP) para que el retorno incluya el efecto FX
      holdings: Array.isArray(s.holdings)
        ? (s.holdings as RawHolding[])
            .filter((h) => h && h.fundName)
            .map((h) => ({
              fundName: h.fundName!,
              securityId: h.securityId,
              serie: h.serie,
              quantity: h.quantity,
              marketValue: (h.marketValueCLP && h.marketValueCLP > 0) ? h.marketValueCLP : (h.marketValue ?? 0),
            }))
        : undefined,
    })),
  );

  // Updates por lotes para no saturar la conexión en series largas (interpolados diarios)
  const CHUNK = 50;
  for (let i = 0; i < results.length; i += CHUNK) {
    const chunk = results.slice(i, i + CHUNK);
    await Promise.all(
      chunk.map(async (r) => {
        const core = {
          daily_return: r.dailyReturn == null ? null : clamp(r.dailyReturn),
          cumulative_return: clamp(r.cumulativeReturn),
        };
        // Incluye returns_confidence; si la columna aún no está migrada, reintenta sin ella
        const { error } = await supabase
          .from("portfolio_snapshots")
          .update({ ...core, returns_confidence: r.confidence })
          .eq("id", r.id);
        if (error) {
          await supabase.from("portfolio_snapshots").update(core).eq("id", r.id);
        }
      }),
    );
  }
}
