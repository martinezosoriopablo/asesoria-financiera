// app/api/tax/quote-at-date/route.ts
// Returns valor_cuota for a fund at a specific date (7-day tolerance)

import { NextRequest } from "next/server";
import { requireAdvisor, createAdminClient } from "@/lib/auth/api-auth";
import { handleApiError, successResponse, errorResponse } from "@/lib/api-response";
import { getUF } from "@/lib/bcch";

export async function POST(req: NextRequest) {
  return handleApiError("tax/quote-at-date", async () => {
    const { error: authError } = await requireAdvisor();
    if (authError) return authError;

    const { run, serie, date } = (await req.json()) as {
      run: number;
      serie: string;
      date: string; // YYYY-MM-DD
    };

    if (!run || !serie || !date) {
      return errorResponse("run, serie, date required", 400);
    }

    const supabase = createAdminClient();

    // Resolve fondo_id from fondos_mutuos catalog
    const { data: fm } = await supabase
      .from("fondos_mutuos")
      .select("id")
      .eq("fo_run", run)
      .eq("fm_serie", serie)
      .limit(1)
      .single();

    if (!fm) {
      return errorResponse("Fondo no encontrado", 404);
    }

    // Get today's price (most recent)
    const { data: current } = await supabase
      .from("fondos_rentabilidades_diarias")
      .select("valor_cuota")
      .eq("fondo_id", fm.id)
      .order("fecha", { ascending: false })
      .limit(1)
      .single();

    if (!current) {
      return errorResponse("Sin precios para este fondo", 404);
    }

    // Get price at target date (7-day tolerance backward)
    const fromDate = new Date(date);
    fromDate.setDate(fromDate.getDate() - 7);
    const fromStr = fromDate.toISOString().split("T")[0];

    const { data: historical } = await supabase
      .from("fondos_rentabilidades_diarias")
      .select("valor_cuota, fecha")
      .eq("fondo_id", fm.id)
      .gte("fecha", fromStr)
      .lte("fecha", date)
      .order("fecha", { ascending: false })
      .limit(1)
      .single();

    // Fetch UF at the historical date for corrección monetaria
    const actualDate = historical?.fecha ?? date;
    let ufAtDate = 0;
    try { ufAtDate = await getUF(actualDate); } catch { /* 0 = unknown */ }
    let ufToday = 0;
    try { ufToday = await getUF(new Date().toISOString().split("T")[0]); } catch { /* 0 */ }

    return successResponse({
      todayPrice: current.valor_cuota,
      historicalPrice: historical?.valor_cuota ?? null,
      historicalDate: historical?.fecha ?? null,
      ufAtDate,
      ufToday,
    });
  });
}
