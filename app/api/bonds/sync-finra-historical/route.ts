// app/api/bonds/sync-finra-historical/route.ts
// Fetches historical trade data from FINRA public API (no auth needed)
// and upserts daily volume-weighted average prices into bond_prices.
// Also saves bond reference data (issuer, coupon, maturity) into bond_catalog.
//
// Unlike the watchlist scraper, this does NOT need Playwright or FINRA
// credentials — it uses the public DynRep API with a self-matching XSRF token.
//
// POST body: { cusips: string[], days?: number }
// If cusips is empty, discovers CUSIPs from portfolio_snapshots + bond_prices.

import { NextRequest, NextResponse } from "next/server";
import { requireAdvisor, createAdminClient } from "@/lib/auth/api-auth";
import { fetchHistoricalPrices } from "@/lib/finra/historical";
import { handleApiError } from "@/lib/api-response";

// CUSIP format: 9 alphanumeric chars (letters + digits)
const CUSIP_RE = /^[A-Z0-9]{9}$/i;

export async function POST(request: NextRequest) {
  const { error: authError } = await requireAdvisor();
  if (authError) return authError;

  return handleApiError("bonds-sync-finra-historical-post", async () => {
    const supabase = createAdminClient();

    const body = await request.json();
    let cusips: string[] = body.cusips || [];
    const days: number = body.days || 90;

    // If no CUSIPs provided, discover from bond_prices + portfolio snapshots
    if (cusips.length === 0) {
      const allCusips = new Set<string>();

      // Source 1: existing bond_prices
      const { data: existing } = await supabase
        .from("bond_prices")
        .select("cusip")
        .order("cusip");
      for (const r of existing || []) allCusips.add(r.cusip);

      // Source 2: bond CUSIPs from portfolio snapshots (cartolas)
      const { data: snapshots } = await supabase
        .from("portfolio_snapshots")
        .select("holdings")
        .in("source", ["statement", "manual", "excel"])
        .order("created_at", { ascending: false })
        .limit(200);

      for (const snap of snapshots || []) {
        const holdings = snap.holdings as Array<Record<string, unknown>> | null;
        if (!Array.isArray(holdings)) continue;
        for (const h of holdings) {
          const secId = String(h.securityId || "").trim();
          if (secId && CUSIP_RE.test(secId)) {
            allCusips.add(secId);
          }
        }
      }

      cusips = Array.from(allCusips);
    }

    if (cusips.length === 0) {
      return NextResponse.json(
        { success: false, error: "No se encontraron CUSIPs en cartolas ni en bond_prices." },
        { status: 400 }
      );
    }

    // Fetch historical data from FINRA public API
    const results = await fetchHistoricalPrices(cusips, days);

    // Upsert into bond_prices + bond_catalog
    let totalInserted = 0;
    let totalErrors = 0;
    let catalogUpdated = 0;
    const summary: Array<{ cusip: string; issuer?: string; days: number; error?: string }> = [];

    for (const result of results) {
      // Always save to bond_catalog if we got security info (even if no trades)
      if (result.issuer && result.symbol) {
        const catalogRow: Record<string, unknown> = {
          cusip: result.cusip,
          issuer: result.issuer,
          finra_symbol: result.symbol,
          source: "finra",
          updated_at: new Date().toISOString(),
        };
        if (result.couponRate) catalogRow.coupon_rate = result.couponRate;
        if (result.maturityDate) catalogRow.maturity_date = result.maturityDate;

        const { error: catError } = await supabase
          .from("bond_catalog")
          .upsert(catalogRow, { onConflict: "cusip" });

        if (!catError) catalogUpdated++;
      }

      if (!result.success || result.prices.length === 0) {
        summary.push({
          cusip: result.cusip,
          issuer: result.issuer,
          days: 0,
          error: result.error || "Sin datos de trades",
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
      catalogUpdated,
      errors: totalErrors,
      summary,
    });
  });
}
