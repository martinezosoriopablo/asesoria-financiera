// app/api/prices/backfill/route.ts

import { NextRequest } from "next/server";
import { requireAdvisor, createAdminClient } from "@/lib/auth/api-auth";
import { successResponse, errorResponse } from "@/lib/api-response";
import { handleApiError } from "@/lib/api-response";
import { applyRateLimit } from "@/lib/rate-limit";
import { resolveSource, backfillSymbol } from "@/lib/prices/price-service";
import type { HoldingForPricing } from "@/lib/prices/types";

export async function POST(request: NextRequest) {
  return handleApiError("prices-backfill", async () => {
    const rateLimitError = await applyRateLimit(request, "prices-backfill", { limit: 10 });
    if (rateLimitError) return rateLimitError;

    const { error } = await requireAdvisor();
    if (error) return error;

    const body = await request.json();
    const { clientId } = body;
    if (!clientId) return errorResponse("clientId es requerido", 400);

    const supabase = createAdminClient();

    // Get cartola snapshots for this client
    const { data: snapshots } = await supabase
      .from("portfolio_snapshots")
      .select("snapshot_date, holdings")
      .eq("client_id", clientId)
      .in("source", ["statement", "manual", "excel"])
      .order("snapshot_date", { ascending: true })
      .limit(10);

    if (!snapshots || snapshots.length === 0) {
      return errorResponse("No hay cartolas para este cliente", 404);
    }

    const firstCartolaDate = snapshots[0].snapshot_date;
    const latestSnap = snapshots[snapshots.length - 1];
    const holdings = (latestSnap.holdings || []) as HoldingForPricing[];

    const results: Array<{ symbol: string; source: string; count: number }> = [];
    const seen = new Set<string>();

    for (const h of holdings) {
      const resolution = resolveSource(h);

      // Skip sources handled by existing specialized code
      if (
        resolution.source === "cmf" ||
        resolution.source === "fintual" ||
        resolution.source === "finra" ||
        resolution.source === "bcch"
      ) {
        continue;
      }

      if (!resolution.symbol || seen.has(resolution.symbol)) continue;
      seen.add(resolution.symbol);

      const count = await backfillSymbol(resolution.symbol, firstCartolaDate, resolution);
      results.push({
        symbol: resolution.symbol,
        source: resolution.source,
        count,
      });
    }

    return successResponse({
      backfilled: results.length,
      details: results,
      fromDate: firstCartolaDate,
    });
  });
}
