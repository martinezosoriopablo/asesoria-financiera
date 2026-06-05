// app/api/dividends/sync/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAdvisor, createAdminClient } from "@/lib/auth/api-auth";
import { fetchDividendHistory } from "@/lib/alphavantage-dividends";
import { handleApiError } from "@/lib/api-response";

const AV_KEY = process.env.ALPHA_VANTAGE_API_KEY || "";
const DELAY_MS = 800; // 75 rpm safe
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function POST(request: NextRequest) {
  const { error: authError } = await requireAdvisor();
  if (authError) return authError;

  if (!AV_KEY) {
    return NextResponse.json(
      { success: false, error: "ALPHA_VANTAGE_API_KEY not configured" },
      { status: 500 }
    );
  }

  return handleApiError("dividends-sync-post", async () => {
    const supabase = createAdminClient();

    const body = await request.json();
    const tickers: string[] = body.tickers || [];

    if (tickers.length === 0) {
      return NextResponse.json(
        { success: false, error: "No tickers provided" },
        { status: 400 }
      );
    }

    let totalInserted = 0;
    const summary: Array<{ ticker: string; events: number; error?: string }> = [];

    for (const ticker of tickers) {
      try {
        const events = await fetchDividendHistory(ticker, AV_KEY);

        if (events.length === 0) {
          summary.push({ ticker, events: 0 });
          await sleep(DELAY_MS);
          continue;
        }

        const rows = events.map((e) => ({
          ticker,
          ex_dividend_date: e.ex_dividend_date,
          payment_date: e.payment_date || null,
          amount: e.amount,
          source: "alphavantage",
          fetched_at: new Date().toISOString(),
        }));

        const { error: upsertError } = await supabase
          .from("dividend_history")
          .upsert(rows, { onConflict: "ticker,ex_dividend_date,source" });

        if (upsertError) {
          summary.push({ ticker, events: 0, error: upsertError.message });
        } else {
          totalInserted += rows.length;
          summary.push({ ticker, events: rows.length });
        }
      } catch (err) {
        summary.push({
          ticker,
          events: 0,
          error: err instanceof Error ? err.message : "Fetch error",
        });
      }

      await sleep(DELAY_MS);
    }

    return NextResponse.json({
      success: true,
      tickersSynced: tickers.length,
      totalEventsInserted: totalInserted,
      summary,
    });
  });
}
