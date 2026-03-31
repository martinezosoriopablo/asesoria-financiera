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

  return NextResponse.json({
    snapshot: latestSnapshot || null,
    history: (allSnapshots || []).map(s => ({
      date: s.snapshot_date,
      value: s.total_value,
      twr: s.twr_cumulative,
    })),
    benchmark: riskProfile?.benchmark_allocation || null,
  });
}
