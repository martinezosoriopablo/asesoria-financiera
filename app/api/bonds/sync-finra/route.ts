// app/api/bonds/sync-finra/route.ts
// Localhost-only API route that scrapes FINRA watchlist for bond prices
// and upserts into bond_prices table.
//
// The scraper uses Playwright to login to FINRA portal and read
// the pre-configured bond watchlist. Bonds must be added to the
// watchlist manually via gateway.finra.org.

import { NextRequest, NextResponse } from "next/server";
import { requireAdvisor, createAdminClient } from "@/lib/auth/api-auth";

export async function POST(request: NextRequest) {
  // Localhost-only guard (same pattern as AAFM sync)
  const host = request.headers.get("host") || "";
  const isLocal = host.startsWith("localhost") || host.startsWith("127.0.0.1");
  if (!isLocal && process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { success: false, error: "Este endpoint solo funciona desde localhost (requiere Playwright)" },
      { status: 403 }
    );
  }

  // Auth check
  const { error: authError } = await requireAdvisor();
  if (authError) return authError;

  const supabase = createAdminClient();

  try {
    // Dynamic import to avoid loading Playwright in Vercel
    const { scrapeBondPrices } = await import("@/lib/finra/scraper");
    const result = await scrapeBondPrices();

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error || "Error en scraper FINRA" },
        { status: 500 }
      );
    }

    // Upsert results into bond_prices
    let updated = 0;
    let errors = 0;
    const errorDetails: Array<{ cusip: string; error: string }> = [];

    for (const bond of result.bonds) {
      if (!bond.lastSalePrice) {
        errors++;
        errorDetails.push({ cusip: bond.cusip, error: "Sin precio" });
        continue;
      }

      const priceDate = bond.lastTradeDate || new Date().toISOString().split("T")[0];

      const { error: upsertError } = await supabase
        .from("bond_prices")
        .upsert({
          cusip: bond.cusip,
          issuer: bond.issuerName,
          price_date: priceDate,
          last_price: bond.lastSalePrice,
          yield_to_maturity: bond.lastSaleYield,
          source: "finra",
          raw_data: bond,
          fetched_at: new Date().toISOString(),
        }, {
          onConflict: "cusip,price_date,source",
        });

      if (upsertError) {
        errors++;
        errorDetails.push({ cusip: bond.cusip, error: upsertError.message });
      } else {
        updated++;
      }
    }

    return NextResponse.json({
      success: true,
      total: result.bonds.length,
      updated,
      errors,
      loginTimeMs: result.loginTimeMs,
      queryTimeMs: result.queryTimeMs,
      errorDetails: errorDetails.length > 0 ? errorDetails : undefined,
      bonds: result.bonds.map(b => ({
        cusip: b.cusip,
        issuer: b.issuerName,
        price: b.lastSalePrice,
        yield: b.lastSaleYield,
        date: b.lastTradeDate,
      })),
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : "Error en sync FINRA";
    console.error("[FINRA sync] Error:", err);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

// GET: return current bond price status
export async function GET(request: NextRequest) {
  const { error: authError } = await requireAdvisor();
  if (authError) return authError;

  const host = request.headers.get("host") || "";
  const isLocal = host.startsWith("localhost") || host.startsWith("127.0.0.1");

  const supabase = createAdminClient();

  const { data: latest } = await supabase
    .from("bond_prices")
    .select("cusip, issuer, price_date, last_price, yield_to_maturity")
    .order("price_date", { ascending: false })
    .limit(50);

  const uniqueCusips = new Set((latest || []).map(r => r.cusip));

  return NextResponse.json({
    success: true,
    configured: !!process.env.FINRA_USER && !!process.env.FINRA_PASSWORD,
    isLocal,
    totalBonds: uniqueCusips.size,
    latestDate: latest?.[0]?.price_date || null,
    prices: latest || [],
  });
}
