// app/api/clients/[id]/report-config/route.ts
// GET/PUT report configuration for a client

import { NextRequest, NextResponse } from "next/server";
import { requireAdvisor, createAdminClient, getSubordinateAdvisorIds } from "@/lib/auth/api-auth";
import { applyRateLimit } from "@/lib/rate-limit";

interface RouteContext {
  params: Promise<{ id: string }>;
}

async function verifyClientAccess(supabase: ReturnType<typeof createAdminClient>, clientId: string, advisor: { id: string; rol: string }) {
  const { data: client } = await supabase
    .from("clients")
    .select("id, asesor_id")
    .eq("id", clientId)
    .single();

  if (!client) return false;

  if (client.asesor_id && client.asesor_id !== advisor.id) {
    if (advisor.rol === "admin") {
      const allowedIds = await getSubordinateAdvisorIds(advisor.id);
      return allowedIds.includes(client.asesor_id);
    }
    return false;
  }
  return true;
}

export async function GET(request: NextRequest, context: RouteContext) {
  const blocked = await applyRateLimit(request, "report-config-get", { limit: 30, windowSeconds: 60 });
  if (blocked) return blocked;

  const { advisor, error: authError } = await requireAdvisor();
  if (authError) return authError;

  const supabase = createAdminClient();
  const { id: clientId } = await context.params;

  if (!(await verifyClientAccess(supabase, clientId, advisor!))) {
    return NextResponse.json({ success: false, error: "No autorizado" }, { status: 403 });
  }

  const { data: config } = await supabase
    .from("client_report_config")
    .select("*")
    .eq("client_id", clientId)
    .maybeSingle();

  return NextResponse.json({
    success: true,
    config: config || {
      client_id: clientId,
      frequency: "none",
      send_daily_report: false,
      send_portfolio_report: true,
      send_macro: false,
      send_rv: false,
      send_rf: false,
      send_asset_allocation: false,
      freq_macro: "none",
      freq_rv: "none",
      freq_rf: "none",
      freq_asset_allocation: "none",
      send_day_of_week: 1,
      send_day_of_month: 1,
    },
  });
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const blocked = await applyRateLimit(request, "report-config-put", { limit: 10, windowSeconds: 60 });
  if (blocked) return blocked;

  const { advisor, user, error: authError } = await requireAdvisor();
  if (authError) return authError;

  const supabase = createAdminClient();
  const { id: clientId } = await context.params;

  if (!(await verifyClientAccess(supabase, clientId, advisor!))) {
    return NextResponse.json({ success: false, error: "No autorizado" }, { status: 403 });
  }

  const body = await request.json();

  const configData = {
    client_id: clientId,
    frequency: body.frequency || "none",
    send_daily_report: body.send_daily_report ?? false,
    send_portfolio_report: body.send_portfolio_report ?? true,
    send_macro: body.send_macro ?? false,
    send_rv: body.send_rv ?? false,
    send_rf: body.send_rf ?? false,
    send_asset_allocation: body.send_asset_allocation ?? false,
    freq_macro: body.freq_macro ?? "none",
    freq_rv: body.freq_rv ?? "none",
    freq_rf: body.freq_rf ?? "none",
    freq_asset_allocation: body.freq_asset_allocation ?? "none",
    send_day_of_week: body.send_day_of_week ?? 1,
    send_day_of_month: body.send_day_of_month ?? 1,
    updated_by: user!.email,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("client_report_config")
    .upsert(configData, { onConflict: "client_id" })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, config: data });
}
