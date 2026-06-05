import { NextResponse } from "next/server";
import { requireClient } from "@/lib/auth/require-client";
import { createAdminClient } from "@/lib/auth/api-auth";
import { handleApiError } from "@/lib/api-response";

export async function GET() {
  const { client, error } = await requireClient();
  if (error) return error;

  const admin = createAdminClient();

  return handleApiError("portal-risk-profile-get", async () => {
    const { data: riskProfile, error: rpError } = await admin
      .from("risk_profiles")
      .select("*")
      .eq("client_id", client!.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (rpError || !riskProfile) {
      return NextResponse.json({ riskProfile: null });
    }

    return NextResponse.json({ riskProfile });
  });
}
