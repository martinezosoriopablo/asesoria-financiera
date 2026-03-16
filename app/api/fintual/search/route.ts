// app/api/fintual/search/route.ts
// Búsqueda de fondos mutuos en el catálogo de Fintual

import { NextRequest, NextResponse } from "next/server";
import { requireAdvisor, createAdminClient } from "@/lib/auth/api-auth";
import { sanitizeSearchInput } from "@/lib/sanitize";
import { applyRateLimit } from "@/lib/rate-limit";

export async function GET(request: NextRequest) {
  const blocked = applyRateLimit(request, "fintual-search", { limit: 30, windowSeconds: 60 });
  if (blocked) return blocked;

  const { error: authError } = await requireAdvisor();
  if (authError) return authError;

  const supabase = createAdminClient();

  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q") || "";
    const provider = searchParams.get("provider");
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);

    let dbQuery = supabase
      .from("fintual_funds")
      .select("*")
      .order("fund_name", { ascending: true })
      .limit(limit);

    // Filtrar por búsqueda de texto
    if (query) {
      const sanitized = sanitizeSearchInput(query);
      dbQuery = dbQuery.or(
        `fund_name.ilike.%${sanitized}%,provider_name.ilike.%${sanitized}%,run.ilike.%${sanitized}%,symbol.ilike.%${sanitized}%`
      );
    }

    // Filtrar por proveedor
    if (provider) {
      const sanitizedProvider = sanitizeSearchInput(provider);
      dbQuery = dbQuery.ilike("provider_name", `%${sanitizedProvider}%`);
    }

    const { data: funds, error } = await dbQuery;

    if (error) {
      console.error("Error searching funds:", error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: funds || [],
      count: funds?.length || 0,
    });
  } catch (error) {
    console.error("Error in fund search:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Error desconocido",
      },
      { status: 500 }
    );
  }
}
