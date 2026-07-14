// Usage: node --env-file=.env.local scripts/backfill-twr.mjs
// Recomputa daily_return/cumulative_return de TODOS los clientes con el método
// híbrido (valor cuota por posición + fallback value-based), inmune a
// aportes/retiros. Espeja lib/returns/unit-return.ts.
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const sb = createClient(url, key);

const clamp = (v) => Math.max(-9999.99, Math.min(9999.99, Math.round(v * 100) / 100));

function keyOf(h) {
  const sid = (h.securityId ?? "").toString().trim();
  return sid ? `${sid}|${(h.serie ?? "").toString().trim()}` : `name:${(h.fundName || "").trim().toLowerCase()}`;
}
function unitPrice(h) {
  const q = h.quantity || 0;
  return q > 0 ? h.__mv / q : null;
}
const COVERAGE_THRESHOLD = 0.8;
// Retorno del período por valor cuota + cobertura (fracción del valor previo matcheada).
function periodUnitReturn(prev, curr) {
  if (!prev || !curr || !prev.length || !curr.length) return { returnPct: null, coverage: 0 };
  const totalPrev = prev.reduce((a, h) => a + (h.__mv || 0), 0);
  const m = new Map();
  for (const h of curr) m.set(keyOf(h), h);
  let base = 0, weighted = 0, matched = 0;
  for (const p of prev) {
    const c = m.get(keyOf(p));
    if (!c) continue;
    const up = unitPrice(p), uc = unitPrice(c);
    if (up == null || uc == null || up <= 0) continue;
    base += p.__mv;
    weighted += p.__mv * (uc / up - 1);
    matched++;
  }
  if (matched === 0 || base <= 0) return { returnPct: null, coverage: 0 };
  return { returnPct: (weighted / base) * 100, coverage: totalPrev > 0 ? base / totalPrev : 0 };
}
function computeSnapshotReturns(ordered) {
  let factor = 1;
  let chainConf = "high";
  return ordered.map((s, i) => {
    if (i === 0) return { id: s.id, dailyReturn: null, cumulativeReturn: 0, confidence: "high" };
    const { returnPct, coverage } = periodUnitReturn(ordered[i - 1].holdings, s.holdings);
    let r, conf;
    if (returnPct != null && coverage >= COVERAGE_THRESHOLD) {
      r = returnPct; conf = "high";
    } else {
      const prev = ordered[i - 1].value;
      const flow = s.netCashFlow || 0;
      r = prev > 0 ? ((s.value - flow - prev) / prev) * 100 : 0;
      conf = Math.abs(flow) > 0 ? "high" : "low";
    }
    if (conf === "low") chainConf = "low";
    factor *= 1 + r / 100;
    return { id: s.id, dailyReturn: r, cumulativeReturn: (factor - 1) * 100, confidence: chainConf };
  });
}

function mapHoldings(raw) {
  if (!Array.isArray(raw)) return undefined;
  return raw.filter((h) => h && h.fundName).map((h) => ({
    ...h,
    __mv: (h.marketValueCLP && h.marketValueCLP > 0) ? h.marketValueCLP : (h.marketValue ?? 0),
  }));
}

async function main() {
  const { data: clients, error } = await sb.from("clients").select("id");
  if (error) { console.error("Error cargando clientes:", error.message); process.exit(1); }
  console.log(`Clientes: ${clients.length}`);

  let totalSnaps = 0, clientsWithData = 0;
  for (const c of clients) {
    const { data: snaps } = await sb
      .from("portfolio_snapshots")
      .select("id, total_value, net_cash_flow, holdings, snapshot_date")
      .eq("client_id", c.id)
      .order("snapshot_date", { ascending: true });
    if (!snaps || snaps.length === 0) continue;
    clientsWithData++;

    const ordered = snaps.map((s) => ({
      id: s.id,
      value: s.total_value ?? 0,
      netCashFlow: s.net_cash_flow ?? 0,
      holdings: mapHoldings(s.holdings),
    }));
    const results = computeSnapshotReturns(ordered);

    for (const r of results) {
      const core = {
        daily_return: r.dailyReturn == null ? null : clamp(r.dailyReturn),
        cumulative_return: clamp(r.cumulativeReturn),
      };
      const { error: upErr } = await sb
        .from("portfolio_snapshots")
        .update({ ...core, returns_confidence: r.confidence })
        .eq("id", r.id);
      if (upErr) {
        // Columna returns_confidence quizás no migrada -> reintentar sin ella
        const { error: e2 } = await sb.from("portfolio_snapshots").update(core).eq("id", r.id);
        if (e2) console.error(`  error snapshot ${r.id}: ${e2.message}`);
      }
    }
    totalSnaps += results.length;
    const last = results[results.length - 1];
    const finalRet = last ? last.cumulativeReturn.toFixed(2) : "0";
    console.log(`  cliente ${c.id}: ${results.length} snapshots, retorno ${finalRet}% (${last ? last.confidence : "-"})`);
  }
  console.log(`Listo. ${totalSnaps} snapshots recalculados en ${clientsWithData} clientes con datos.`);
}

main();
