// Usage: node --env-file=.env.local scripts/backfill-twr.mjs
// Recomputa daily_return/cumulative_return de TODOS los clientes como TWR
// encadenado (flow-independiente), para que los clientes existentes muestren el
// número correcto de inmediato. Espeja lib/returns/twr.ts (computeSnapshotReturns).
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const sb = createClient(url, key);

const clamp = (v) => Math.max(-9999.99, Math.min(9999.99, Math.round(v * 100) / 100));

// TWR encadenado: r_i = (V_i - V_{i-1} - flujoNeto_i)/V_{i-1}; cum = Π(1+r_i)-1.
function computeSnapshotReturns(ordered) {
  let factor = 1;
  return ordered.map((s, i) => {
    if (i === 0) return { id: s.id, dailyReturn: null, cumulativeReturn: 0 };
    const prev = ordered[i - 1].value;
    const flow = s.netCashFlow || 0;
    let r = 0;
    if (prev > 0) r = ((s.value - flow - prev) / prev) * 100;
    factor *= 1 + r / 100;
    return { id: s.id, dailyReturn: r, cumulativeReturn: (factor - 1) * 100 };
  });
}

async function main() {
  const { data: clients, error } = await sb.from("clients").select("id");
  if (error) {
    console.error("Error cargando clientes:", error.message);
    process.exit(1);
  }
  console.log(`Clientes: ${clients.length}`);

  let totalSnaps = 0;
  let clientsWithData = 0;
  for (const c of clients) {
    const { data: snaps } = await sb
      .from("portfolio_snapshots")
      .select("id, total_value, net_cash_flow, snapshot_date")
      .eq("client_id", c.id)
      .order("snapshot_date", { ascending: true });
    if (!snaps || snaps.length === 0) continue;
    clientsWithData++;

    const results = computeSnapshotReturns(
      snaps.map((s) => ({ id: s.id, value: s.total_value ?? 0, netCashFlow: s.net_cash_flow ?? 0 })),
    );

    for (const r of results) {
      const { error: upErr } = await sb
        .from("portfolio_snapshots")
        .update({
          daily_return: r.dailyReturn == null ? null : clamp(r.dailyReturn),
          cumulative_return: clamp(r.cumulativeReturn),
        })
        .eq("id", r.id);
      if (upErr) console.error(`  error snapshot ${r.id}: ${upErr.message}`);
    }
    totalSnaps += results.length;
    const finalRet = results.length ? results[results.length - 1].cumulativeReturn.toFixed(2) : "0";
    console.log(`  cliente ${c.id}: ${results.length} snapshots, retorno acumulado ${finalRet}%`);
  }

  console.log(`Listo. ${totalSnaps} snapshots recalculados en ${clientsWithData} clientes con datos.`);
}

main();
