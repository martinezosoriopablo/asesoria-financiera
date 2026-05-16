// app/api/tax/quote-at-date/route.ts
// Returns valor_cuota for a fund at a specific date (7-day tolerance)

import { NextRequest } from "next/server";
import { requireAdvisor, createAdminClient } from "@/lib/auth/api-auth";
import { handleApiError, successResponse, errorResponse } from "@/lib/api-response";

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

    // Get today's price
    const { data: current } = await supabase
      .from("fondos_mutuos")
      .select("valor_cuota")
      .eq("fo_run", run)
      .eq("fm_serie", serie)
      .limit(1)
      .single();

    if (!current) {
      return errorResponse("Fondo no encontrado", 404);
    }

    // Get price at target date (7-day tolerance backward)
    const fromDate = new Date(date);
    fromDate.setDate(fromDate.getDate() - 7);
    const fromStr = fromDate.toISOString().split("T")[0];

    const { data: historical } = await supabase
      .from("fondos_mutuos")
      .select("valor_cuota, fecha")
      .eq("fo_run", run)
      .eq("fm_serie", serie)
      .gte("fecha", fromStr)
      .lte("fecha", date)
      .order("fecha", { ascending: false })
      .limit(1)
      .single();

    return successResponse({
      todayPrice: current.valor_cuota,
      historicalPrice: historical?.valor_cuota ?? null,
      historicalDate: historical?.fecha ?? null,
    });
  });
}
