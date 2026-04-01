// app/api/clients/[id]/rebalance-executions/route.ts
// Track actual trades executed for a client's rebalancing

import { NextRequest, NextResponse } from "next/server";
import { requireAdvisor, createAdminClient } from "@/lib/auth/api-auth";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAdvisor();
  if (error) return error;

  const { id: clientId } = await params;
  const admin = createAdminClient();

  const { data, error: dbError } = await admin
    .from("rebalance_executions")
    .select("*")
    .eq("client_id", clientId)
    .order("executed_at", { ascending: false })
    .limit(100);

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  return NextResponse.json({ executions: data || [] });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { advisor, error } = await requireAdvisor();
  if (error) return error;

  const { id: clientId } = await params;
  const body = await request.json();
  const admin = createAdminClient();

  // Validate client belongs to advisor
  const { data: client } = await admin
    .from("clients")
    .select("id, asesor_id")
    .eq("id", clientId)
    .maybeSingle();

  if (!client || client.asesor_id !== advisor!.id) {
    return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });
  }

  // Accept single execution or batch
  const executions: any[] = Array.isArray(body.executions) ? body.executions : [body];

  const records = executions.map(exec => ({
    client_id: clientId,
    advisor_id: advisor!.id,
    recommendation_version_id: exec.recommendation_version_id || null,
    ticker: exec.ticker,
    nombre: exec.nombre,
    asset_class: exec.asset_class || exec.clase,
    action: exec.action,
    target_percent: exec.target_percent ?? null,
    actual_percent: exec.actual_percent ?? null,
    amount: exec.amount ?? null,
    units: exec.units ?? null,
    notes: exec.notes || null,
    executed_at: exec.executed_at || new Date().toISOString().split("T")[0],
  }));

  const { data, error: insertError } = await admin
    .from("rebalance_executions")
    .insert(records)
    .select();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, executions: data });
}
