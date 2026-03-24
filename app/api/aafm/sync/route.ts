// app/api/aafm/sync/route.ts
// Sync daily fund prices from AAFM (Asociación de Fondos Mutuos)
// Downloads the Excel report and updates fintual_funds with current prices

import { NextRequest, NextResponse } from "next/server";
import { requireAdvisor, createAdminClient } from "@/lib/auth/api-auth";
import { applyRateLimit } from "@/lib/rate-limit";
import { fetchAAFMData, parseAAFMExcel, syncAAFMToSupabase } from "@/lib/aafm-sync";

async function fetchAndParse(date: Date) {
  console.log(`[AAFM Sync] Downloading report for ${date.toISOString().split("T")[0]}...`);
  const aafmData = await fetchAAFMData(date);

  if (Array.isArray(aafmData)) {
    console.log(`[AAFM Sync] Got ${aafmData.length} funds from JSON response`);
    return aafmData;
  }

  console.log(`[AAFM Sync] Downloaded ${(aafmData.length / 1024).toFixed(0)} KB Excel`);
  const funds = parseAAFMExcel(aafmData);
  console.log(`[AAFM Sync] Parsed ${funds.length} fund rows from Excel`);
  return funds;
}

export async function POST(request: NextRequest) {
  const blocked = applyRateLimit(request, "aafm-sync", { limit: 3, windowSeconds: 300 });
  if (blocked) return blocked;

  const { error: authError } = await requireAdvisor();
  if (authError) return authError;

  const supabase = createAdminClient();

  try {
    const body = await request.json().catch(() => ({}));
    let date = body.date ? new Date(body.date) : new Date();

    // Try fetching and parsing AAFM data, auto-retry going back up to 3 days
    // (weekends/holidays may have no data, and UTC vs Chile timezone can shift dates)
    let funds = await fetchAndParse(date);
    let usedDate = date;

    if (funds.length === 0 && !body.date) {
      for (let daysBack = 1; daysBack <= 3 && funds.length === 0; daysBack++) {
        const tryDate = new Date();
        tryDate.setDate(tryDate.getDate() - daysBack);
        console.log(`[AAFM Sync] No data, trying ${daysBack} day(s) back...`);
        funds = await fetchAndParse(tryDate);
        if (funds.length > 0) usedDate = tryDate;
      }
    }

    if (funds.length === 0) {
      return NextResponse.json({
        success: false,
        error: "No fund data found in AAFM report",
      });
    }

    // Match and update fintual_funds
    const syncResult = await syncAAFMToSupabase(funds, supabase);
    console.log(`[AAFM Sync] Done: ${syncResult.matched} matched, ${syncResult.updated} updated, ${syncResult.errors} errors`);

    return NextResponse.json({
      success: true,
      date: usedDate.toLocaleDateString("en-CA", { timeZone: "America/Santiago" }),
      fundsInReport: funds.length,
      ...syncResult,
    });
  } catch (error) {
    console.error("[AAFM Sync] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Error syncing AAFM data",
      },
      { status: 500 }
    );
  }
}

// GET: Check last sync status
export async function GET(request: NextRequest) {
  const blocked = applyRateLimit(request, "aafm-status", { limit: 10, windowSeconds: 60 });
  if (blocked) return blocked;

  const { error: authError } = await requireAdvisor();
  if (authError) return authError;

  const supabase = createAdminClient();

  try {
    // Get stats about price freshness
    const { data: stats } = await supabase
      .from("fintual_funds")
      .select("last_price_date")
      .not("last_price", "is", null)
      .order("last_price_date", { ascending: false })
      .limit(1);

    const { count: totalFunds } = await supabase
      .from("fintual_funds")
      .select("id", { count: "exact", head: true });

    const { count: withPrice } = await supabase
      .from("fintual_funds")
      .select("id", { count: "exact", head: true })
      .not("last_price", "is", null);

    const today = new Date().toISOString().split("T")[0];
    const { count: todayPrices } = await supabase
      .from("fintual_funds")
      .select("id", { count: "exact", head: true })
      .eq("last_price_date", today);

    return NextResponse.json({
      success: true,
      totalFunds: totalFunds || 0,
      withPrice: withPrice || 0,
      todayPrices: todayPrices || 0,
      latestPriceDate: stats?.[0]?.last_price_date || null,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Error" },
      { status: 500 }
    );
  }
}
