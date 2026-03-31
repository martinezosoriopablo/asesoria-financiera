// app/api/portal/reports/route.ts
// Client-facing: list reports and mark as read

import { NextRequest, NextResponse } from "next/server";
import { requireClient } from "@/lib/auth/require-client";
import { createAdminClient } from "@/lib/auth/api-auth";

export async function GET() {
  const { client, error } = await requireClient();
  if (error) return error;

  const admin = createAdminClient();

  const { data: reports, error: dbError } = await admin
    .from("client_reports")
    .select("id, report_date, report_type, snapshot_summary, market_commentary, comite_reports_included, read_at, created_at")
    .eq("client_id", client!.id)
    .order("report_date", { ascending: false })
    .limit(50);

  if (dbError) {
    return NextResponse.json({ error: "Error cargando reportes" }, { status: 500 });
  }

  // Count unread
  const { count: unreadCount } = await admin
    .from("client_reports")
    .select("id", { count: "exact", head: true })
    .eq("client_id", client!.id)
    .is("read_at", null);

  // Mark all as read when client views reports page
  if (reports && reports.length > 0) {
    const unreadIds = reports.filter(r => !r.read_at).map(r => r.id);
    if (unreadIds.length > 0) {
      await admin
        .from("client_reports")
        .update({ read_at: new Date().toISOString() })
        .eq("client_id", client!.id)
        .in("id", unreadIds);
    }
  }

  return NextResponse.json({
    reports: reports || [],
    unreadCount: unreadCount || 0,
  });
}

