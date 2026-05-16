// app/api/tax/detect-purchase-dates/route.ts
// For holdings with unitCost, find the approximate purchase date by matching
// unitCost to historical valor_cuota, then return UF at that date.

import { NextRequest } from "next/server";
import { requireAdvisor, createAdminClient } from "@/lib/auth/api-auth";
import { handleApiError, successResponse, errorResponse } from "@/lib/api-response";
import { getUF } from "@/lib/bcch";

interface HoldingInput {
  run: number;
  serie: string;
  unitCost: number;
}

export async function POST(req: NextRequest) {
  return handleApiError("tax/detect-purchase-dates", async () => {
    const { error: authError } = await requireAdvisor();
    if (authError) return authError;

    const { holdings } = (await req.json()) as { holdings: HoldingInput[] };
    if (!holdings || !Array.isArray(holdings) || holdings.length === 0) {
      return errorResponse("holdings array required", 400);
    }

    const supabase = createAdminClient();
    const results: Record<string, { date: string; valorCuota: number; ufAtDate: number }> = {};

    for (const h of holdings) {
      if (!h.run || !h.serie || !h.unitCost) continue;
      const key = `${h.run}-${h.serie}`;

      // Resolve fondo_id
      const { data: fm } = await supabase
        .from("fondos_mutuos")
        .select("id")
        .eq("fo_run", h.run)
        .eq("fm_serie", h.serie)
        .limit(1)
        .single();

      if (!fm) continue;

      // Find the closest valor_cuota match (0.3% tolerance)
      const tolerance = h.unitCost * 0.003;
      const { data: matches } = await supabase
        .from("fondos_rentabilidades_diarias")
        .select("fecha, valor_cuota")
        .eq("fondo_id", fm.id)
        .gte("valor_cuota", h.unitCost - tolerance)
        .lte("valor_cuota", h.unitCost + tolerance)
        .order("fecha", { ascending: true })
        .limit(1);

      if (!matches || matches.length === 0) continue;

      const match = matches[0];
      let ufAtDate = 0;
      try {
        ufAtDate = await getUF(match.fecha);
      } catch { /* 0 = unknown */ }

      results[key] = {
        date: match.fecha,
        valorCuota: match.valor_cuota,
        ufAtDate,
      };
    }

    return successResponse({ results });
  });
}
