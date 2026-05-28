// app/api/prices/holding-returns/route.ts

import { NextRequest } from "next/server";
import { requireAdvisor } from "@/lib/auth/api-auth";
import { successResponse, errorResponse } from "@/lib/api-response";
import { handleApiError } from "@/lib/api-response";
import { resolveSource, getPrice } from "@/lib/prices/price-service";
import type { HoldingForPricing } from "@/lib/prices/types";

/**
 * Compute per-holding returns between two dates using price service.
 * POST body: { holdings, startDate, endDate }
 */
export async function POST(request: NextRequest) {
  return handleApiError("holding-returns", async () => {
    const { error } = await requireAdvisor();
    if (error) return error;

    const { holdings, startDate, endDate } = (await request.json()) as {
      holdings: HoldingForPricing[];
      startDate: string;
      endDate: string;
    };

    if (!holdings || !startDate || !endDate) {
      return errorResponse("holdings, startDate y endDate son requeridos", 400);
    }

    const results: Array<{
      fundName: string;
      returnPct: number;
      assetClass?: string;
      startPrice?: number;
      endPrice?: number;
    }> = [];

    for (const h of holdings) {
      const resolution = resolveSource(h);

      // CMF/fintual handled by existing specialized APIs
      if (resolution.source === "cmf" || resolution.source === "fintual") {
        continue;
      }

      if (!resolution.symbol) continue;

      const startPt = await getPrice(resolution.symbol, startDate, resolution);
      const endPt = await getPrice(resolution.symbol, endDate, resolution);

      if (startPt && endPt && startPt.price > 0) {
        results.push({
          fundName: h.fundName,
          returnPct:
            ((endPt.price - startPt.price) / startPt.price) * 100,
          assetClass: h.assetClass,
          startPrice: startPt.price,
          endPrice: endPt.price,
        });
      }
    }

    return successResponse({ returns: results });
  });
}
