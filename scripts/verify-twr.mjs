// Usage: node --env-file=.env.local scripts/verify-twr.mjs
// READ-ONLY: compara el cumulative_return almacenado vs el TWR híbrido (valor
// cuota + fallback value-based). No escribe nada. Espeja lib/returns/unit-return.ts.
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const sb = createClient(url, key);

function keyOf(h) {
  const sid = (h.securityId ?? "").toString().trim();
  return sid ? `${sid}|${(h.serie ?? "").toString().trim()}` : `name:${(h.fundName || "").trim().toLowerCase()}`;
}
function unitPrice(h) { const q = h.quantity || 0; return q > 0 ? h.__mv / q : null; }
function periodUnitReturn(prev, curr) {
  if (!prev || !curr || !prev.length || !curr.length) return null;
  const m = new Map();
  for (const h of curr) m.set(keyOf(h), h);
  let base = 0, weighted = 0, matched = 0;
  for (const p of prev) {
    const c = m.get(keyOf(p));
    if (!c) continue;
    const up = unitPrice(p), uc = unitPrice(c);
    if (up == null || uc == null || up <= 0) continue;
    base += p.__mv; weighted += p.__mv * (uc / up - 1); matched++;
  }
  if (matched === 0 || base <= 0) return null;
  return (weighted / base) * 100;
}
function mapHoldings(raw) {
  if (!Array.isArray(raw)) return undefined;
  return raw.filter((h) => h && h.fundName).map((h) => ({ ...h, __mv: (h.marketValueCLP && h.marketValueCLP > 0) ? h.marketValueCLP : (h.marketValue ?? 0) }));
}
function computeSnapshotReturns(ordered) {
  let factor = 1;
  return ordered.map((s, i) => {
    if (i === 0) return { cumulativeReturn: 0, method: "-" };
    let r = periodUnitReturn(ordered[i - 1].holdings, s.holdings);
    let method = "cuota";
    if (r == null) {
      const prev = ordered[i - 1].value; const flow = s.netCashFlow || 0;
      r = prev > 0 ? ((s.value - flow - prev) / prev) * 100 : 0;
      method = "value";
    }
    factor *= 1 + r / 100;
    return { cumulativeReturn: (factor - 1) * 100, method };
  });
}

async function main() {
  const { data: clients } = await sb.from("clients").select("id, nombre, apellido");
  const rows = [];
  for (const c of clients) {
    const { data: snaps } = await sb
      .from("portfolio_snapshots")
      .select("total_value, net_cash_flow, holdings, cumulative_return, snapshot_date")
      .eq("client_id", c.id)
      .order("snapshot_date", { ascending: true });
    if (!snaps || snaps.length < 2) continue;

    const ordered = snaps.map((s) => ({ value: s.total_value ?? 0, netCashFlow: s.net_cash_flow ?? 0, holdings: mapHoldings(s.holdings) }));
    const twr = computeSnapshotReturns(ordered);
    const twrLast = twr[twr.length - 1].cumulativeReturn;
    const storedLast = snaps[snaps.length - 1].cumulative_return ?? 0;
    const totalFlows = snaps.reduce((sum, s) => sum + Math.abs(s.net_cash_flow ?? 0), 0);
    rows.push({ name: `${c.nombre} ${c.apellido}`.trim(), snaps: snaps.length, storedPct: storedLast, twrPct: twrLast, diff: twrLast - storedLast, totalFlows, series: snaps, twr });
  }

  rows.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
  console.log("\n=== Top 8 clientes por diferencia (TWR híbrido - almacenado) ===");
  console.log("cliente".padEnd(28), "snaps", "almacenado%", "TWR%", "dif(pp)", "flujos$");
  for (const r of rows.slice(0, 8)) {
    console.log(
      r.name.slice(0, 27).padEnd(28), String(r.snaps).padStart(5),
      r.storedPct.toFixed(2).padStart(11), r.twrPct.toFixed(2).padStart(7),
      r.diff.toFixed(2).padStart(8), Math.round(r.totalFlows).toLocaleString("es-CL").padStart(12),
    );
  }

  const top = rows[0];
  if (top) {
    console.log(`\n=== Detalle: ${top.name} ===`);
    console.log("fecha".padEnd(12), "valor".padStart(14), "flujoNeto".padStart(12), "almacenado%".padStart(12), "TWR%".padStart(9), "método".padStart(8));
    top.series.forEach((s, i) => {
      console.log(
        String(s.snapshot_date).padEnd(12),
        Math.round(s.total_value ?? 0).toLocaleString("es-CL").padStart(14),
        Math.round(s.net_cash_flow ?? 0).toLocaleString("es-CL").padStart(12),
        (s.cumulative_return ?? 0).toFixed(2).padStart(12),
        top.twr[i].cumulativeReturn.toFixed(2).padStart(9),
        top.twr[i].method.padStart(8),
      );
    });
  }
  console.log("\n(read-only: no se modificó ningún dato)");
}

main();
