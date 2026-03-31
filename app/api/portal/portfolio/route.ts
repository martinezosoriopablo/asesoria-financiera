import { NextResponse } from "next/server";
import { requireClient } from "@/lib/auth/require-client";
import { createAdminClient } from "@/lib/auth/api-auth";

export async function GET() {
  const { client, error } = await requireClient();
  if (error) return error;

  const admin = createAdminClient();

  // All snapshots for evolution chart (last 24 months max)
  const { data: allSnapshots } = await admin
    .from("portfolio_snapshots")
    .select("snapshot_date, total_value, twr_cumulative")
    .eq("client_id", client!.id)
    .order("snapshot_date", { ascending: true })
    .limit(100);

  // Latest snapshot (full detail)
  const snapshot = allSnapshots && allSnapshots.length > 0
    ? null // We'll fetch full detail separately
    : null;

  const { data: latestSnapshot } = await admin
    .from("portfolio_snapshots")
    .select("*")
    .eq("client_id", client!.id)
    .order("snapshot_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Benchmark del perfil de riesgo
  const { data: riskProfile } = await admin
    .from("risk_profiles")
    .select("benchmark_allocation")
    .eq("client_id", client!.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Transform snapshot for portal display
  let portalSnapshot = null;
  if (latestSnapshot) {
    const holdings = Array.isArray(latestSnapshot.holdings) ? latestSnapshot.holdings : [];
    const totalVal = latestSnapshot.total_value || 1;
    portalSnapshot = {
      id: latestSnapshot.id,
      snapshot_date: latestSnapshot.snapshot_date,
      total_value: latestSnapshot.total_value,
      equity_percent: latestSnapshot.equity_percent || 0,
      fixed_income_percent: latestSnapshot.fixed_income_percent || 0,
      alternatives_percent: latestSnapshot.alternatives_percent || 0,
      cash_percent: latestSnapshot.cash_percent || 0,
      twr_cumulative: latestSnapshot.twr_cumulative,
      twr_period: latestSnapshot.twr_period,
      holdings: holdings.map((h: Record<string, unknown>) => ({
        nombre: (h.fundName || h.nombre || h.name || "Sin nombre") as string,
        tipo: (h.assetClass || h.tipo || "—") as string,
        valor: (h.marketValue || h.marketValueCLP || h.valor || 0) as number,
        porcentaje: ((h.marketValue || h.marketValueCLP || h.valor || 0) as number) / totalVal * 100,
      })),
    };
  }

  return NextResponse.json({
    snapshot: portalSnapshot,
    history: (allSnapshots || []).map(s => ({
      date: s.snapshot_date,
      value: s.total_value,
      twr: s.twr_cumulative,
    })),
    benchmark: riskProfile?.benchmark_allocation || null,
  });
}
