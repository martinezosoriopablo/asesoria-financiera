import { NextRequest, NextResponse } from "next/server";
import { requireAdvisor, createAdminClient } from "@/lib/auth/api-auth";
import { applyRateLimit } from "@/lib/rate-limit";

// GET - List advisor's preferred funds
export async function GET(request: NextRequest) {
  const blocked = await applyRateLimit(request, "preferred-funds", { limit: 30, windowSeconds: 60 });
  if (blocked) return blocked;

  const { advisor, error: authError } = await requireAdvisor();
  if (authError) return authError;

  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("advisor_preferred_funds")
    .select("*")
    .eq("advisor_id", advisor!.id)
    .eq("active", true)
    .order("category", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, funds: data });
}

// POST - Add a fund to preferred list
export async function POST(request: NextRequest) {
  const blocked = await applyRateLimit(request, "preferred-funds-post", { limit: 10, windowSeconds: 60 });
  if (blocked) return blocked;

  const { advisor, error: authError } = await requireAdvisor();
  if (authError) return authError;

  const supabase = createAdminClient();
  const body = await request.json();
  const { fund_run, fund_name, category, notes } = body;

  if (!fund_run) {
    return NextResponse.json({ error: "fund_run requerido" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("advisor_preferred_funds")
    .upsert({
      advisor_id: advisor!.id,
      fund_run,
      fund_name: fund_name || null,
      category: category || null,
      notes: notes || null,
      active: true,
    }, { onConflict: "advisor_id,fund_run" })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, fund: data });
}

// DELETE - Remove a fund from preferred list (soft delete)
export async function DELETE(request: NextRequest) {
  const blocked = await applyRateLimit(request, "preferred-funds-delete", { limit: 10, windowSeconds: 60 });
  if (blocked) return blocked;

  const { advisor, error: authError } = await requireAdvisor();
  if (authError) return authError;

  const supabase = createAdminClient();
  const { searchParams } = new URL(request.url);
  const fundId = searchParams.get("id");

  if (!fundId) {
    return NextResponse.json({ error: "id requerido" }, { status: 400 });
  }

  const { error } = await supabase
    .from("advisor_preferred_funds")
    .update({ active: false })
    .eq("id", fundId)
    .eq("advisor_id", advisor!.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
