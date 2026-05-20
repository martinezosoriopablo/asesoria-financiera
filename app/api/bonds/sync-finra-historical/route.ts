// app/api/bonds/sync-finra-historical/route.ts
// Fetches historical trade data from FINRA public API (no auth needed)
// and upserts daily volume-weighted average prices into bond_prices.
//
// Unlike the watchlist scraper, this does NOT need Playwright or FINRA
// credentials — it uses the public DynRep API with a self-matching XSRF token.
//
// POST body: { cusips: string[], days?: number }
// If cusips is empty, fetches all distinct CUSIPs from bond_prices table.

import { NextRequest, NextResponse } from "next/server";
import { requireAdvisor, createAdminClient } from "@/lib/auth/api-auth";
import { fetchHistoricalPrices } from "@/lib/finra/historical";

export async function POST(request: NextRequest) {
  const { error: authError } = await requireAdvisor();
  if (authError) return authError;

  const supabase = createAdminClient();

  try {
    const body = await request.json();
    let cusips: string[] = body.cusips || [];
    const days: number = body.days || 90;

    // If no CUSIPs provided, use all known from bond_prices
    if (cusips.length === 0) {
      const { data: existing } = await supabase
        .from("bond_prices")
        .select("cusip")
        .order("cusip");

      const unique = new Set((existing || []).map((r) => r.cusip));
      cusips = Array.from(unique);
    }

    if (cusips.length === 0) {
      return NextResponse.json(
        { success: false, error: "No hay CUSIPs para consultar. Ejecuta el sync de watchlist primero." },
        { status: 400 }
      );
    }

    // Fetch historical data from FINRA public API
    const results = await fetchHistoricalPrices(cusips, days);

    // Upsert into bond_prices
    let totalInserted = 0;
    let totalErrors = 0;
    const summary: Array<{ cusip: string; issuer?: string; days: number; error?: string }> = [];

    for (const result of results) {
      if (!result.success || result.prices.length === 0) {
        summary.push({
          cusip: result.cusip,
          days: 0,
          error: result.error || "Sin datos",
        });
        continue;
      }

      // Batch upsert — one row per daily price
      const rows = result.prices.map((p) => ({
        cusip: p.cusip,
        issuer: p.issuer,
        price_date: p.date,
        last_price: p.price,
        yield_to_maturity: p.yield,
        volume: p.totalVolume,
        source: "finra",
        raw_data: { tradeCount: p.tradeCount, totalVolume: p.totalVolume },
        fetched_at: new Date().toISOString(),
      }));

      const { error: upsertError } = await supabase
        .from("bond_prices")
        .upsert(rows, { onConflict: "cusip,price_date,source" });

      if (upsertError) {
        totalErrors++;
        summary.push({
          cusip: result.cusip,
          issuer: result.issuer,
          days: 0,
          error: upsertError.message,
        });
      } else {
        totalInserted += rows.length;
        summary.push({
          cusip: result.cusip,
          issuer: result.issuer,
          days: rows.length,
        });
      }
    }

    return NextResponse.json({
      success: true,
      cusipsQueried: cusips.length,
      totalDaysInserted: totalInserted,
      errors: totalErrors,
      summary,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error en sync histórico FINRA";
    console.error("[FINRA historical] Error:", err);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
