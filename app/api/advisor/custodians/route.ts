// app/api/advisor/custodians/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAdvisor, createAdminClient } from "@/lib/auth/api-auth";
import { applyRateLimit } from "@/lib/rate-limit";

const DEFAULT_COMMISSIONS: Record<string, number> = {
  agf: 0,
  corredora: 0.5,
  internacional: 0.1,
};

// GET — list advisor's custodians
export async function GET(request: NextRequest) {
  const blocked = await applyRateLimit(request, "custodians-get", { limit: 30, windowSeconds: 60 });
  if (blocked) return blocked;

  const { advisor, error: authError } = await requireAdvisor();
  if (authError) return authError;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("custodian_config")
    .select("*")
    .eq("advisor_id", advisor!.id)
    .order("type", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, custodians: data || [] });
}

// POST — create or update custodian
export async function POST(request: NextRequest) {
  const blocked = await applyRateLimit(request, "custodians-post", { limit: 10, windowSeconds: 60 });
  if (blocked) return blocked;

  const { advisor, error: authError } = await requireAdvisor();
  if (authError) return authError;

  const supabase = createAdminClient();
  const { name, type, commission_pct, notes } = await request.json();

  if (!name || !type) {
    return NextResponse.json({ error: "name y type son requeridos" }, { status: 400 });
  }

  if (!["agf", "corredora", "internacional"].includes(type)) {
    return NextResponse.json({ error: "type debe ser agf, corredora o internacional" }, { status: 400 });
  }

  const commission = commission_pct ?? DEFAULT_COMMISSIONS[type] ?? 0;

  const { data, error } = await supabase
    .from("custodian_config")
    .upsert({
      advisor_id: advisor!.id,
      name,
      type,
      commission_pct: commission,
      notes: notes || null,
    }, { onConflict: "advisor_id,name" })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, custodian: data });
}

// PATCH — update commission/notes
export async function PATCH(request: NextRequest) {
  const blocked = await applyRateLimit(request, "custodians-patch", { limit: 20, windowSeconds: 60 });
  if (blocked) return blocked;

  const { advisor, error: authError } = await requireAdvisor();
  if (authError) return authError;

  const supabase = createAdminClient();
  const { id, commission_pct, notes } = await request.json();

  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });

  const updates: Record<string, unknown> = {};
  if (commission_pct !== undefined) updates.commission_pct = commission_pct;
  if (notes !== undefined) updates.notes = notes || null;

  const { error } = await supabase
    .from("custodian_config")
    .update(updates)
    .eq("id", id)
    .eq("advisor_id", advisor!.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

// DELETE — remove custodian
export async function DELETE(request: NextRequest) {
  const blocked = await applyRateLimit(request, "custodians-delete", { limit: 10, windowSeconds: 60 });
  if (blocked) return blocked;

  const { advisor, error: authError } = await requireAdvisor();
  if (authError) return authError;

  const supabase = createAdminClient();
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });

  const { error } = await supabase
    .from("custodian_config")
    .delete()
    .eq("id", id)
    .eq("advisor_id", advisor!.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
