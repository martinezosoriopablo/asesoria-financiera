import { NextRequest, NextResponse } from "next/server";
import { requireAdvisor } from "@/lib/auth/api-auth";
import { lookupSymbol, makeHeaders } from "@/lib/finra/historical";
import { handleApiError } from "@/lib/api-response";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ cusip: string }> }
) {
  const { error: authError } = await requireAdvisor();
  if (authError) return authError;

  const { cusip } = await params;
  if (!cusip || cusip.length < 6) {
    return NextResponse.json({ success: false, error: "Invalid CUSIP" }, { status: 400 });
  }

  return handleApiError("bonds-lookup-get", async () => {
    const headers = makeHeaders();
    const bond = await lookupSymbol(cusip, headers);

    if (!bond) {
      return NextResponse.json({ success: false, error: "Bond not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      bond: {
        cusip: bond.cusip,
        issuer: bond.issuerName,
        couponRate: bond.couponRate,
        maturityDate: bond.maturityDate,
      },
    });
  });
}
