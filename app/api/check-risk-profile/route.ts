import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createAdminClient } from "@/lib/auth/api-auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const email = searchParams.get("email");
  const advisor = searchParams.get("advisor");
  const token = searchParams.get("token");

  if (!email || !advisor || !token) {
    return NextResponse.json({ exists: false });
  }

  // Validate HMAC token (same logic as save-risk-profile)
  const hmacSecret = process.env.HMAC_SECRET || process.env.CRON_SECRET;
  if (!hmacSecret) {
    return NextResponse.json({ exists: false });
  }
  const expectedToken = crypto
    .createHmac("sha256", hmacSecret)
    .update(`${email}:${advisor}`)
    .digest("hex");

  try {
    if (!crypto.timingSafeEqual(Buffer.from(token, "hex"), Buffer.from(expectedToken, "hex"))) {
      return NextResponse.json({ exists: false });
    }
  } catch {
    return NextResponse.json({ exists: false });
  }

  const supabase = createAdminClient();

  // Find client
  const { data: client } = await supabase
    .from("clients")
    .select("id")
    .eq("email", email.toLowerCase())
    .maybeSingle();

  if (!client) {
    return NextResponse.json({ exists: false });
  }

  // Check if risk profile exists
  const { count } = await supabase
    .from("risk_profiles")
    .select("id", { count: "exact", head: true })
    .eq("client_id", client.id);

  return NextResponse.json({ exists: (count || 0) > 0 });
}
