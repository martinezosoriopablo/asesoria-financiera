// app/api/stock-profiles/route.ts
import { NextRequest } from "next/server";
import { requireAdvisor, createAdminClient } from "@/lib/auth/api-auth";
import { successResponse, errorResponse, handleApiError } from "@/lib/api-response";
import { fetchStockOverviews } from "@/lib/stock-profiles";
import type { StockProfile } from "@/lib/sector-mapping";

const CACHE_DAYS = 30;

export async function GET(req: NextRequest) {
  return handleApiError("stock-profiles", async () => {
    const { error } = await requireAdvisor();
    if (error) return error;

    const tickersParam = req.nextUrl.searchParams.get("tickers");
    if (!tickersParam) return errorResponse("tickers param required", 400);

    const tickers = tickersParam
      .split(",")
      .map((t) => t.trim().toUpperCase())
      .filter(Boolean);
    if (tickers.length === 0) return errorResponse("No tickers provided", 400);
    if (tickers.length > 50) return errorResponse("Max 50 tickers per request", 400);

    const sb = createAdminClient();

    // 1. Check cache
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - CACHE_DAYS);
    const cutoffStr = cutoff.toISOString();

    const { data: cached } = await sb
      .from("stock_profiles")
      .select("ticker, name, sector, industry, market_cap, country, exchange, fetched_at")
      .in("ticker", tickers)
      .gte("fetched_at", cutoffStr);

    const cachedMap = new Map<string, StockProfile>();
    for (const row of cached || []) {
      cachedMap.set(row.ticker, {
        ticker: row.ticker,
        name: row.name || row.ticker,
        sector: row.sector || "",
        industry: row.industry || "",
        marketCap: row.market_cap || 0,
        country: row.country || "",
        exchange: row.exchange || "",
      });
    }

    // 2. Fetch missing from AV
    const missing = tickers.filter((t) => !cachedMap.has(t));
    let fetchedCount = 0;

    if (missing.length > 0) {
      const fetched = await fetchStockOverviews(missing);
      fetchedCount = fetched.size;

      // Store in DB
      const rows = Array.from(fetched.values()).map((p) => ({
        ticker: p.ticker,
        name: p.name,
        sector: p.sector,
        industry: p.industry,
        market_cap: p.marketCap,
        country: p.country,
        exchange: p.exchange,
        fetched_at: new Date().toISOString(),
      }));

      if (rows.length > 0) {
        await sb
          .from("stock_profiles")
          .upsert(rows, { onConflict: "ticker" });
      }

      // Merge into cached
      for (const [ticker, profile] of fetched) {
        cachedMap.set(ticker, profile);
      }
    }

    // 3. Return all profiles
    const profiles = tickers
      .map((t) => cachedMap.get(t))
      .filter((p): p is StockProfile => p != null);

    return successResponse({ profiles, fetchedCount });
  });
}
