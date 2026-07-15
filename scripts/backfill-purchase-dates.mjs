// Usage: node --env-file=.env.local scripts/backfill-purchase-dates.mjs
// Rellena holding.purchaseDate en snapshots de cartola existentes (solo vacios,
// solo match exacto). Espeja lib/tax/infer-purchase-date.ts + enrich-purchase-dates.ts.
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error("Faltan env vars"); process.exit(1); }
const sb = createClient(url, key);

const WINDOW_DAYS = 30;
function inferPurchaseDate(unitCost, serie) {
  if (!(unitCost > 0) || !serie || serie.length === 0) return null;
  const eps = Math.max(0.01, unitCost * 0.00005);
  const dates = serie.filter((p) => Math.abs(p.valorCuota - unitCost) <= eps).map((p) => p.fecha).sort();
  if (dates.length === 0) return null;
  const span = (new Date(dates[dates.length - 1] + "T00:00:00") - new Date(dates[0] + "T00:00:00")) / 86400000;
  return span > WINDOW_DAYS ? null : dates[0];
}
async function seriesForFondo(id) {
  const { data } = await sb.from("fund_cuota_history").select("fecha, valor_cuota").eq("fondo_id", id).order("fecha", { ascending: true });
  return (data ?? []).filter((r) => r.valor_cuota > 0).map((r) => ({ fecha: r.fecha, valorCuota: r.valor_cuota }));
}

async function main() {
  const { data: snaps } = await sb
    .from("portfolio_snapshots")
    .select("id, holdings")
    .in("source", ["manual", "statement", "excel"]);
  let filledTotal = 0, snapsChanged = 0;
  for (const s of snaps ?? []) {
    const hs = Array.isArray(s.holdings) ? s.holdings : [];
    let changed = false;
    for (const h of hs) {
      if (h.purchaseDate) continue;
      const sid = (h.securityId ?? "").toString().trim();
      if (!/^\d{3,7}$/.test(sid) || !(h.unitCost > 0)) continue;
      let q = sb.from("fondos_mutuos").select("id, fm_serie").eq("fo_run", parseInt(sid, 10));
      const serie = (h.serie ?? "").toString().trim();
      if (serie) q = q.eq("fm_serie", serie);
      const { data: fondos } = await q.limit(30);
      if (!fondos || fondos.length === 0) continue;
      const hits = [];
      for (const f of fondos) { const d = inferPurchaseDate(h.unitCost, await seriesForFondo(f.id)); if (d) hits.push(d); }
      const uniq = [...new Set(hits)];
      if (uniq.length === 1) { h.purchaseDate = uniq[0]; changed = true; filledTotal++; }
    }
    if (changed) {
      const { error } = await sb.from("portfolio_snapshots").update({ holdings: hs }).eq("id", s.id);
      if (error) console.error(`  error snapshot ${s.id}: ${error.message}`); else snapsChanged++;
    }
  }
  console.log(`Listo. ${filledTotal} fechas inferidas en ${snapsChanged} snapshots.`);
}
main();
