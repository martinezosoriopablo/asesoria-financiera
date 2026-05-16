// app/api/tax/historical-quotes/route.ts
// Returns valor_cuota at specific historical dates (1-5 years ago) for cost estimation

import { NextRequest } from "next/server";
import { requireAdvisor, createAdminClient } from "@/lib/auth/api-auth";
import { handleApiError, successResponse, errorResponse } from "@/lib/api-response";

interface FundInput {
  run: number;
  serie: string;
}

// For each fund, return today's price and prices at 1-5 years ago
interface QuoteResult {
  today: number | null;
  prices: { years: number; price: number | null; date: string }[];
}

export async function POST(req: NextRequest) {
  return handleApiError("tax/historical-quotes", async () => {
    const { error: authError } = await requireAdvisor();
    if (authError) return authError;

    const { funds } = (await req.json()) as { funds: FundInput[] };
    if (!funds || !Array.isArray(funds) || funds.length === 0) {
      return errorResponse("funds array required", 400);
    }

    const supabase = createAdminClient();
    const now = new Date();
    const todayStr = now.toISOString().split("T")[0];

    // Build target dates: 1Y ago, 2Y ago, ... 5Y ago
    const targetDates: { years: number; date: string }[] = [];
    for (let y = 1; y <= 5; y++) {
      const d = new Date(now);
      d.setFullYear(d.getFullYear() - y);
      targetDates.push({ years: y, date: d.toISOString().split("T")[0] });
    }

    const results: Record<string, QuoteResult> = {};

    for (const fund of funds) {
      if (!fund.run || !fund.serie) continue;
      const key = `${fund.run}-${fund.serie}`;

      // Resolve fondo_id from fondos_mutuos catalog
      const { data: fm } = await supabase
        .from("fondos_mutuos")
        .select("id")
        .eq("fo_run", fund.run)
        .eq("fm_serie", fund.serie)
        .limit(1)
        .single();

      if (!fm) {
        results[key] = { today: null, prices: targetDates.map(td => ({ ...td, price: null })) };
        continue;
      }

      // Get today's price from fondos_rentabilidades_diarias
      const { data: currentRow } = await supabase
        .from("fondos_rentabilidades_diarias")
        .select("valor_cuota")
        .eq("fondo_id", fm.id)
        .order("fecha", { ascending: false })
        .limit(1)
        .single();

      const todayPrice = currentRow?.valor_cuota ?? null;

      // For each target date, find the closest price within 7-day tolerance
      const prices: QuoteResult["prices"] = [];

      for (const td of targetDates) {
        const fromDate = new Date(td.date);
        fromDate.setDate(fromDate.getDate() - 7);
        const fromStr = fromDate.toISOString().split("T")[0];

        const { data: priceRow } = await supabase
          .from("fondos_rentabilidades_diarias")
          .select("valor_cuota, fecha")
          .eq("fondo_id", fm.id)
          .gte("fecha", fromStr)
          .lte("fecha", td.date)
          .order("fecha", { ascending: false })
          .limit(1)
          .single();

        prices.push({
          years: td.years,
          price: priceRow?.valor_cuota ?? null,
          date: priceRow?.fecha ?? td.date,
        });
      }

      results[key] = { today: todayPrice, prices };
    }

    return successResponse({ quotes: results, asOf: todayStr });
  });
}
