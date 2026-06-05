// app/api/advisor/fund-mapping/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAdvisor, createAdminClient } from "@/lib/auth/api-auth";
import { applyRateLimit } from "@/lib/rate-limit";
import { handleApiError } from "@/lib/api-response";

// GET — list all mappings for advisor, enriched with fund names
export async function GET(request: NextRequest) {
  const blocked = await applyRateLimit(request, "fund-mapping-get", { limit: 30, windowSeconds: 60 });
  if (blocked) return blocked;

  const { advisor, error: authError } = await requireAdvisor();
  if (authError) return authError;

  const supabase = createAdminClient();
  return handleApiError("advisor-fund-mapping-get", async () => {

    const { data, error } = await supabase
      .from("model_fund_mapping")
      .select(`
        id,
        categoria,
        custodian_type,
        preferred_fund_id,
        advisor_preferred_funds!inner (
          id, fund_run, fund_name, ticker, category, instrument_type, custodian_type
        )
      `)
      .eq("advisor_id", advisor!.id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, mappings: data || [] });

  });
}

// POST — create or update a mapping
export async function POST(request: NextRequest) {
  const blocked = await applyRateLimit(request, "fund-mapping-post", { limit: 20, windowSeconds: 60 });
  if (blocked) return blocked;

  const { advisor, error: authError } = await requireAdvisor();
  if (authError) return authError;

  const supabase = createAdminClient();
  return handleApiError("advisor-fund-mapping-post", async () => {
    const { categoria, custodian_type, preferred_fund_id } = await request.json();

    if (!categoria || !custodian_type || !preferred_fund_id) {
      return NextResponse.json(
        { error: "categoria, custodian_type y preferred_fund_id son requeridos" },
        { status: 400 }
      );
    }

    // Verify the preferred_fund belongs to this advisor
    const { data: fund } = await supabase
      .from("advisor_preferred_funds")
      .select("id")
      .eq("id", preferred_fund_id)
      .eq("advisor_id", advisor!.id)
      .single();

    if (!fund) {
      return NextResponse.json({ error: "Fondo no encontrado" }, { status: 404 });
    }

    const { data, error } = await supabase
      .from("model_fund_mapping")
      .upsert({
        advisor_id: advisor!.id,
        categoria,
        custodian_type,
        preferred_fund_id,
      }, { onConflict: "advisor_id,categoria,custodian_type" })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, mapping: data });

  });
}

// DELETE — remove a mapping
export async function DELETE(request: NextRequest) {
  const blocked = await applyRateLimit(request, "fund-mapping-delete", { limit: 10, windowSeconds: 60 });
  if (blocked) return blocked;

  const { advisor, error: authError } = await requireAdvisor();
  if (authError) return authError;

  const supabase = createAdminClient();
  return handleApiError("advisor-fund-mapping-delete", async () => {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });

    const { error } = await supabase
      .from("model_fund_mapping")
      .delete()
      .eq("id", id)
      .eq("advisor_id", advisor!.id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });

  });
}
