// app/api/cron/check-drift/route.ts
// Cron job: check all clients' portfolio drift vs recommendation
// Creates advisor notifications when drift exceeds threshold
// Called daily via Vercel Cron or manually

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/auth/api-auth";

export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // Get all clients with recommendations
  const { data: clients } = await admin
    .from("clients")
    .select("id, nombre, apellido, asesor_id, cartera_recomendada")
    .not("cartera_recomendada", "is", null);

  if (!clients || clients.length === 0) {
    return NextResponse.json({ checked: 0, alerts: 0 });
  }

  // Get advisor drift thresholds
  const advisorIds = [...new Set(clients.map(c => c.asesor_id))];
  const { data: advisors } = await admin
    .from("advisors")
    .select("id, drift_threshold")
    .in("id", advisorIds);

  const thresholdMap = new Map<string, number>();
  for (const a of (advisors || [])) {
    thresholdMap.set(a.id, a.drift_threshold ?? 5);
  }

  // Get latest snapshot per client
  const clientIds = clients.map(c => c.id);
  const { data: snapshots } = await admin
    .from("portfolio_snapshots")
    .select("client_id, snapshot_date, equity_percent, fixed_income_percent")
    .in("client_id", clientIds)
    .order("snapshot_date", { ascending: false });

  const latestSnap = new Map<string, any>();
  for (const s of (snapshots || [])) {
    if (!latestSnap.has(s.client_id)) {
      latestSnap.set(s.client_id, s);
    }
  }

  // Check for existing recent alerts (avoid duplicates within 7 days)
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: recentAlerts } = await admin
    .from("advisor_notifications")
    .select("client_id")
    .eq("type", "rebalance_alert")
    .gte("created_at", weekAgo);

  const recentAlertClientIds = new Set((recentAlerts || []).map(a => a.client_id));

  let alertsCreated = 0;

  for (const client of clients) {
    const snap = latestSnap.get(client.id);
    const rec = client.cartera_recomendada as any;
    if (!snap || !rec) continue;

    // Calculate drift
    const recEquity = rec.equity_percent ?? (rec.cartera || [])
      .filter((p: any) => p.clase === "Renta Variable")
      .reduce((s: number, p: any) => s + p.porcentaje, 0);
    const recFI = rec.fixed_income_percent ?? (rec.cartera || [])
      .filter((p: any) => p.clase === "Renta Fija")
      .reduce((s: number, p: any) => s + p.porcentaje, 0);

    const actualEquity = snap.equity_percent || 0;
    const actualFI = snap.fixed_income_percent || 0;
    const drift = (Math.abs(actualEquity - recEquity) + Math.abs(actualFI - recFI)) / 2;

    const threshold = thresholdMap.get(client.asesor_id) || 5;

    if (drift > threshold && !recentAlertClientIds.has(client.id)) {
      // Create alert
      await admin.from("advisor_notifications").insert({
        advisor_id: client.asesor_id,
        client_id: client.id,
        type: "rebalance_alert",
        title: `Drift alto: ${client.nombre} ${client.apellido}`,
        body: `Drift de ${drift.toFixed(1)}% (umbral: ${threshold}%). RV: ${actualEquity.toFixed(1)}% vs ${recEquity.toFixed(1)}% recom. RF: ${actualFI.toFixed(1)}% vs ${recFI.toFixed(1)}% recom.`,
        link: `/clients/${client.id}?tab=seguimiento`,
      });
      alertsCreated++;
    }
  }

  return NextResponse.json({
    checked: clients.length,
    alerts: alertsCreated,
    timestamp: new Date().toISOString(),
  });
}
