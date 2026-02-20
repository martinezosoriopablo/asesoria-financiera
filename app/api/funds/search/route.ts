// app/api/funds/search/route.ts

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function GET(request: NextRequest) {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q") || "";

    if (query.length < 2) {
      return NextResponse.json({ success: true, funds: [] });
    }

    // Buscar en tabla funds (incluye chilenos y externos/importados)
    const { data, error } = await supabase
      .from("funds")
      .select("*")
      .eq("is_active", true)
      .or(
        `name.ilike.%${query}%,provider.ilike.%${query}%,symbol.ilike.%${query}%,isin.ilike.%${query}%`
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
  } catch (error: any) {
    console.error("Error buscando fondos:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Error al buscar fondos",
      },
      { status: 500 }
    );
  }
}
