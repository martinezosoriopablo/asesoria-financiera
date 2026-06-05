import { NextRequest, NextResponse } from "next/server";
import { requireClient } from "@/lib/auth/require-client";
import { createAdminClient } from "@/lib/auth/api-auth";
import { applyRateLimit } from "@/lib/rate-limit";
import { handleApiError } from "@/lib/api-response";

const DEFAULT_BENCHMARK = [{ ticker: "UF", weight: 1.0, spread: 2.0 }];

export async function GET(request: NextRequest) {
  const blocked = await applyRateLimit(request, "portal-benchmark-config", { limit: 20, windowSeconds: 60 });
  if (blocked) return blocked;
  const { client, error: authError } = await requireClient();
  if (authError) return authError;
  return handleApiError("portal-benchmark-config-get", async () => {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("clients")
      .select("benchmark_config")
      .eq("id", client!.id)
      .single();

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    const benchmark = data?.benchmark_config || DEFAULT_BENCHMARK;

    return NextResponse.json({ success: true, benchmark });
  });
}
