// app/api/comite/model-portfolios/history/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAdvisor, createAdminClient } from "@/lib/auth/api-auth";
import { applyRateLimit } from "@/lib/rate-limit";

export async function GET(request: NextRequest) {
  const blocked = await applyRateLimit(request, "model-portfolios-history", { limit: 20, windowSeconds: 60 });
  if (blocked) return blocked;

  const { error: authError } = await requireAdvisor();
  if (authError) return authError;

  const supabase = createAdminClient();

  // Get distinct report_dates with count of profiles
  const { data, error } = await supabase
    .from("model_portfolios")
    .select("report_date, version, perfil, created_at")
    .order("report_date", { ascending: false });

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  // Group by report_date
  const grouped = new Map<string, { report_date: string; perfiles: string[]; created_at: string }>();
  for (const row of data || []) {
    const existing = grouped.get(row.report_date);
    if (existing) {
      existing.perfiles.push(row.perfil);
    } else {
      grouped.set(row.report_date, {
        report_date: row.report_date,
        perfiles: [row.perfil],
        created_at: row.created_at,
      });
    }
  }

  return NextResponse.json({
    success: true,
    history: Array.from(grouped.values()),
  });
}
