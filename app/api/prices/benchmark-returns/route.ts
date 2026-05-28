// app/api/prices/benchmark-returns/route.ts

import { NextRequest } from "next/server";
import { requireAdvisor } from "@/lib/auth/api-auth";
import { successResponse, errorResponse } from "@/lib/api-response";
import { handleApiError } from "@/lib/api-response";
import {
  resolveSource,
  getStoredPrices,
  fetchPriceRange,
  storeInternationalPrices,
} from "@/lib/prices/price-service";
import type { BenchmarkComponent, DailyPrice } from "@/lib/prices/types";

async function getPricesForTicker(
  ticker: string,
  fromDate: string,
  toDate: string
): Promise<DailyPrice[]> {
  if (ticker === "UF") {
    // UF handled via spread calculation, no price series needed
    return [];
  }

  const resolution = resolveSource({
    fundName: ticker,
    securityId: ticker,
    marketValue: 0,
    market: "US",
  });

  // Try stored first
  let prices = await getStoredPrices(ticker, fromDate, toDate);
  if (prices.length === 0) {
    const fetched = await fetchPriceRange(resolution, fromDate, toDate);
    if (fetched.length > 0) {
      await storeInternationalPrices(ticker, fetched, resolution.currency, resolution.source);
      prices = fetched;
    }
  }
  return prices;
}

function findClosestPrice(prices: DailyPrice[], targetDate: string): number | null {
  let best: DailyPrice | null = null;
  for (const p of prices) {
    if (p.date <= targetDate) {
      best = p;
    } else {
      break;
    }
  }
  if (!best) return null;
  const diff =
    (new Date(targetDate).getTime() - new Date(best.date).getTime()) /
    (1000 * 60 * 60 * 24);
  return diff <= 7 ? best.price : null;
}

/**
 * Compute monthly returns for a benchmark config.
 * POST body: { benchmark, fromDate, toDate }
 * Returns: { returns: Record<YYYY-MM, number>, label: string }
 */
export async function POST(request: NextRequest) {
  return handleApiError("benchmark-returns", async () => {
    const { error } = await requireAdvisor();
    if (error) return error;

    const { benchmark, fromDate, toDate } = (await request.json()) as {
      benchmark: BenchmarkComponent[];
      fromDate: string;
      toDate: string;
    };

    if (!benchmark || !fromDate || !toDate) {
      return errorResponse("benchmark, fromDate y toDate son requeridos", 400);
    }

    // Build label
    const label = benchmark
      .map((b) => {
        if (b.spread) return `${b.ticker} +${b.spread}%`;
        return `${(b.weight * 100).toFixed(0)}% ${b.ticker}`;
      })
      .join(" / ");

    // Collect month-end boundaries
    const start = new Date(fromDate);
    const end = new Date(toDate);
    const monthEnds: string[] = [];
    const cursor = new Date(start.getFullYear(), start.getMonth() + 1, 0);
    while (cursor <= end) {
      monthEnds.push(cursor.toISOString().split("T")[0]);
      const nextMonth = cursor.getMonth() + 1;
      cursor.setMonth(nextMonth);
      cursor.setDate(
        new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate()
      );
    }

    const monthlyReturns: Record<string, number> = {};

    for (const comp of benchmark) {
      if (comp.ticker === "UF" && comp.spread != null) {
        // UF + spread: monthly return = spread / 12
        const monthlyReturn = comp.spread / 12;
        for (let i = 1; i < monthEnds.length; i++) {
          const key = monthEnds[i].substring(0, 7);
          monthlyReturns[key] =
            (monthlyReturns[key] || 0) + comp.weight * monthlyReturn;
        }
        continue;
      }

      // Market-based component
      const prices = await getPricesForTicker(comp.ticker, fromDate, toDate);
      if (prices.length === 0) continue;

      for (let i = 1; i < monthEnds.length; i++) {
        const prevEnd = monthEnds[i - 1];
        const currEnd = monthEnds[i];
        const key = currEnd.substring(0, 7);

        const prevPrice = findClosestPrice(prices, prevEnd);
        const currPrice = findClosestPrice(prices, currEnd);

        if (prevPrice && currPrice && prevPrice > 0) {
          const ret = ((currPrice - prevPrice) / prevPrice) * 100;
          monthlyReturns[key] =
            (monthlyReturns[key] || 0) + comp.weight * ret;
        }
      }
    }

    return successResponse({ returns: monthlyReturns, label });
  });
}
