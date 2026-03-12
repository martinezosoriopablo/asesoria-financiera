// app/api/fintual/search/route.ts
// Búsqueda de fondos mutuos en el catálogo de Fintual

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
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
      dbQuery = dbQuery.or(
        `fund_name.ilike.%${query}%,provider_name.ilike.%${query}%,run.ilike.%${query}%,symbol.ilike.%${query}%`
      );
    }

    // Filtrar por proveedor
    if (provider) {
      dbQuery = dbQuery.ilike("provider_name", `%${provider}%`);
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
