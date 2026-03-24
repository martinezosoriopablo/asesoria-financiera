import { NextResponse } from "next/server";
import { requireClient } from "@/lib/auth/require-client";
import { createAdminClient } from "@/lib/auth/api-auth";

export async function GET() {
  const { client, error } = await requireClient();
  if (error) return error;

  const admin = createAdminClient();

  // Snapshot más reciente
  const { data: snapshot } = await admin
    .from("portfolio_snapshots")
    .select("*")
    .eq("client_id", client!.id)
    .order("snapshot_date", { ascending: false })
    .limit(1)
    .single();

  // Benchmark del perfil de riesgo
  const { data: riskProfile } = await admin
    .from("risk_profiles")
    .select("benchmark_allocation")
    .eq("client_id", client!.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  return NextResponse.json({
    snapshot: snapshot || null,
    benchmark: riskProfile?.benchmark_allocation || null,
  });
}
