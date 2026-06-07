import { NextRequest, NextResponse } from "next/server";
import { requireAuth, createAdminClient } from "@/lib/auth/api-auth";
import { handleApiError } from "@/lib/api-response";

// GET /api/bonds/latest-prices?cusips=ABC123,DEF456
// Returns the most recent price per CUSIP from bond_prices table
export async function GET(request: NextRequest) {
  const { error: authError } = await requireAuth();
  if (authError) return authError;

  return handleApiError("bonds-latest-prices-get", async () => {
    const cusipsParam = request.nextUrl.searchParams.get("cusips") || "";
    const cusips = cusipsParam.split(",").map(c => c.trim()).filter(Boolean);

    if (cusips.length === 0) {
      return NextResponse.json({ success: true, prices: {} });
    }

    const supabase = createAdminClient();

    // Get latest price per CUSIP using distinct on
    const { data, error } = await supabase
      .from("bond_prices")
      .select("cusip, last_price, yield_to_maturity, price_date")
      .in("cusip", cusips)
      .order("cusip")
      .order("price_date", { ascending: false });

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    // Keep only the latest per CUSIP
    const prices: Record<string, { price: number; ytm: number | null; date: string }> = {};
    for (const row of data || []) {
      if (!prices[row.cusip]) {
        prices[row.cusip] = {
          price: Number(row.last_price),
          ytm: row.yield_to_maturity ? Number(row.yield_to_maturity) : null,
          date: row.price_date,
        };
      }
    }

    return NextResponse.json({ success: true, prices });
  });
}
