// app/api/funds/search/route.ts

import { NextRequest, NextResponse } from "next/server";
import { requireAdvisor, createAdminClient } from "@/lib/auth/api-auth";
import { sanitizeSearchInput } from "@/lib/sanitize";
import { applyRateLimit } from "@/lib/rate-limit";

export async function GET(request: NextRequest) {
  const blocked = await applyRateLimit(request, "funds-search", { limit: 30, windowSeconds: 60 });
  if (blocked) return blocked;

  const { error: authError } = await requireAdvisor();
  if (authError) return authError;

  const supabase = createAdminClient();

  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q") || "";

    if (query.length < 2) {
      return NextResponse.json({ success: true, funds: [] });
    }

    const sanitized = sanitizeSearchInput(query);

    // Buscar en tabla funds (incluye chilenos y externos/importados)
    const { data, error } = await supabase
      .from("funds")
      .select("*")
      .eq("is_active", true)
      .or(
        `name.ilike.%${sanitized}%,provider.ilike.%${sanitized}%,symbol.ilike.%${sanitized}%,isin.ilike.%${sanitized}%`
      )
      .order("name")
      .limit(30);

    if (error) throw error;

    return NextResponse.json({
      success: true,
      funds: (data || []).map((f) => ({
        id: f.id,
        name: f.name,
        symbol: f.symbol,
        isin: f.isin,
        provider: f.provider,
        asset_class: f.asset_class,
        type: f.type || "chilean",
        total_expense_ratio: f.total_expense_ratio,
        return_1y: f.return_1y,
        return_3y: f.return_3y,
        return_5y: f.return_5y,
        currency: f.currency,
      })),
    });
  } catch (error: unknown) {
    console.error("Error buscando fondos:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Error al buscar fondos",
      },
      { status: 500 }
    );
  }
}
