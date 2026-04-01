// app/api/portfolio/fill-prices/coverage/route.ts
// GET: Check which holdings have price sources and which are "frozen"
// Lightweight endpoint — does NOT fetch or fill prices, just checks sources

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/auth/api-auth";
import { applyRateLimit } from "@/lib/rate-limit";

export async function GET(request: NextRequest) {
  const blocked = await applyRateLimit(request, "fill-coverage", { limit: 20, windowSeconds: 60 });
  if (blocked) return blocked;

  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get("clientId");
    if (!clientId) {
      return NextResponse.json({ success: false, error: "clientId requerido" }, { status: 400 });
    }

    // Get the latest CARTOLA snapshot (source = statement/manual/excel — these have securityIds)
    // NOT api-prices snapshots, which may have lost the securityId field
    const { data: latestCartola } = await supabase
      .from("portfolio_snapshots")
      .select("holdings, total_value, snapshot_date")
      .eq("client_id", clientId)
      .not("holdings", "is", null)
      .in("source", ["statement", "manual", "excel"])
      .order("snapshot_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!latestCartola?.holdings || !Array.isArray(latestCartola.holdings)) {
      return NextResponse.json({ success: true, coverage: null });
    }

    // Load known price sources
    // Fetch manual prices with last date per security (use admin to bypass RLS)
    const admin = createAdminClient();
    const [yahooMapRes, manualPricesRes, fintualRes] = await Promise.all([
      supabase.from("security_yahoo_map").select("security_id"),
      admin.from("manual_prices").select("security_id, price_date").order("price_date", { ascending: false }),
      supabase.from("fintual_funds").select("fintual_id, run, symbol"),
    ]);

    const yahooIds = new Set((yahooMapRes.data || []).map(r => r.security_id));
    // Build map: security_id → latest price_date
    const manualLastDate = new Map<string, string>();
    for (const r of (manualPricesRes.data || [])) {
      if (!manualLastDate.has(r.security_id)) {
        manualLastDate.set(r.security_id, r.price_date);
      }
    }
    const manualIds = new Set(manualLastDate.keys());
    const fintualIds = new Set((fintualRes.data || []).map(r => r.fintual_id));
    const fintualRuns = new Set((fintualRes.data || []).filter(r => r.run).map(r => r.run));

    const totalValue = latestCartola.total_value || 0;
    let frozenValue = 0;
    const unpricedHoldings: Array<{ name: string; securityId?: string; weight: number }> = [];
    const manualHoldings: Array<{ name: string; securityId: string; weight: number; lastDate: string }> = [];
    let withPrices = 0;

    for (const h of latestCartola.holdings as Array<{ fundName: string; securityId?: string; marketValue?: number; fintual_id?: string }>) {
      const sid = h.securityId?.trim() || "";
      const hValue = h.marketValue || 0;

      // Check if this holding uses manual prices
      const isManual = manualIds.has(sid);

      // Check if any source covers this holding
      const hasSource =
        isManual ||
        yahooIds.has(sid) ||
        (h.fintual_id && fintualIds.has(h.fintual_id)) ||
        (/^\d{3,10}$/.test(sid) && (fintualIds.has(sid) || fintualRuns.has(sid))) ||
        /^[A-Z]{1,5}$/.test(sid); // US stock ticker

      if (hasSource) {
        withPrices++;
        if (isManual) {
          manualHoldings.push({
            name: h.fundName,
            securityId: sid,
            weight: totalValue > 0 ? Math.round((hValue / totalValue) * 10000) / 100 : 0,
            lastDate: manualLastDate.get(sid) || "",
          });
        }
      } else {
        frozenValue += hValue;
        unpricedHoldings.push({
          name: h.fundName,
          securityId: h.securityId,
          weight: totalValue > 0 ? Math.round((hValue / totalValue) * 10000) / 100 : 0,
        });
      }
    }

    return NextResponse.json({
      success: true,
      coverage: {
        totalHoldings: latestCartola.holdings.length,
        withPrices,
        frozenPercent: totalValue > 0 ? Math.round((frozenValue / totalValue) * 10000) / 100 : 0,
        unpricedHoldings,
        manualHoldings,
        snapshotDate: latestCartola.snapshot_date,
      },
    });
  } catch (error: unknown) {
    console.error("Error in coverage:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Error interno" },
      { status: 500 }
    );
  }
}
