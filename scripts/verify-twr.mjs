// Usage: node --env-file=.env.local scripts/verify-twr.mjs
// READ-ONLY: compara el cumulative_return actual (ingenuo) vs el TWR encadenado.
// No escribe nada. Muestra el cliente donde más difieren (donde hubo flujos).
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const sb = createClient(url, key);

function computeSnapshotReturns(ordered) {
  let factor = 1;
  return ordered.map((s, i) => {
    if (i === 0) return { cumulativeReturn: 0, periodReturn: null };
    const prev = ordered[i - 1].value;
    const flow = s.netCashFlow || 0;
    let r = 0;
    if (prev > 0) r = ((s.value - flow - prev) / prev) * 100;
    factor *= 1 + r / 100;
    return { cumulativeReturn: (factor - 1) * 100, periodReturn: r };
  });
}

async function main() {
  const { data: clients } = await sb.from("clients").select("id, nombre, apellido");
  const rows = [];

  for (const c of clients) {
    const { data: snaps } = await sb
      .from("portfolio_snapshots")
      .select("total_value, net_cash_flow, cumulative_return, snapshot_date")
      .eq("client_id", c.id)
      .order("snapshot_date", { ascending: true });
    if (!snaps || snaps.length < 2) continue;

    const first = snaps[0].total_value ?? 0;
    const last = snaps[snaps.length - 1].total_value ?? 0;
    const naive = first > 0 ? ((last - first) / first) * 100 : 0;
    const storedLast = snaps[snaps.length - 1].cumulative_return ?? 0;

    const twr = computeSnapshotReturns(
      snaps.map((s) => ({ value: s.total_value ?? 0, netCashFlow: s.net_cash_flow ?? 0 })),
    );
    const twrLast = twr[twr.length - 1].cumulativeReturn;
    const totalFlows = snaps.reduce((sum, s) => sum + Math.abs(s.net_cash_flow ?? 0), 0);

    rows.push({
      name: `${c.nombre} ${c.apellido}`.trim(),
      id: c.id,
      snaps: snaps.length,
      storedPct: storedLast,
      naivePct: naive,
      twrPct: twrLast,
      diff: twrLast - storedLast,
      totalFlows,
      series: snaps,
    });
  }

  rows.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));

  console.log("\n=== Top 8 clientes por diferencia (TWR - almacenado) ===");
  console.log("cliente".padEnd(28), "snaps", "almacenado%", "TWR%", "dif(pp)", "flujos$");
  for (const r of rows.slice(0, 8)) {
    console.log(
      r.name.slice(0, 27).padEnd(28),
      String(r.snaps).padStart(5),
      r.storedPct.toFixed(2).padStart(11),
      r.twrPct.toFixed(2).padStart(7),
      r.diff.toFixed(2).padStart(8),
      Math.round(r.totalFlows).toLocaleString("es-CL").padStart(12),
    );
  }

  const top = rows.find((r) => r.totalFlows > 0) || rows[0];
  if (top) {
    console.log(`\n=== Detalle del cliente con flujos: ${top.name} ===`);
    const twr = computeSnapshotReturns(
      top.series.map((s) => ({ value: s.total_value ?? 0, netCashFlow: s.net_cash_flow ?? 0 })),
    );
    console.log("fecha".padEnd(12), "valor".padStart(14), "flujoNeto".padStart(12), "almacenado%".padStart(12), "TWR%".padStart(9));
    top.series.forEach((s, i) => {
      console.log(
        String(s.snapshot_date).padEnd(12),
        Math.round(s.total_value ?? 0).toLocaleString("es-CL").padStart(14),
        Math.round(s.net_cash_flow ?? 0).toLocaleString("es-CL").padStart(12),
        (s.cumulative_return ?? 0).toFixed(2).padStart(12),
        twr[i].cumulativeReturn.toFixed(2).padStart(9),
      );
    });
  }
  console.log("\n(read-only: no se modificó ningún dato)");
}

main();
