// app/api/cron/sync-bond-prices/route.ts
// Cron wrapper for FINRA bond price sync.
// Discovers CUSIPs automatically and fetches last 30 days of prices.

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/auth/api-auth";
import { handleApiError } from "@/lib/api-response";
import { fetchHistoricalPrices } from "@/lib/finra/historical";

const CUSIP_RE = /^[A-Z0-9]{9}$/i;

export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return handleApiError("cron-sync-bond-prices", async () => {
    const supabase = createAdminClient();

    // Discover CUSIPs from bond_prices + portfolio snapshots
    const allCusips = new Set<string>();

    const { data: existing } = await supabase
      .from("bond_prices")
      .select("cusip")
      .order("cusip");
    for (const r of existing || []) allCusips.add(r.cusip);

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

    const cusips = Array.from(allCusips);
    if (cusips.length === 0) {
      return NextResponse.json({ success: true, message: "No CUSIPs found", cusips: 0 });
    }

    // Fetch last 30 days (cron runs daily, 30 gives buffer)
    const results = await fetchHistoricalPrices(cusips, 30);

    let totalInserted = 0;
    let catalogUpdated = 0;

    for (const result of results) {
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

      if (!result.success || result.prices.length === 0) continue;

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

      if (!upsertError) totalInserted += rows.length;
    }

    return NextResponse.json({
      success: true,
      cusips: cusips.length,
      totalDaysInserted: totalInserted,
      catalogUpdated,
    });
  });
}
