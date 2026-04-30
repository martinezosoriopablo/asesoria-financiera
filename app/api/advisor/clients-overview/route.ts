import { NextRequest, NextResponse } from "next/server";
import { requireAdvisor, createAdminClient, getSubordinateAdvisorIds } from "@/lib/auth/api-auth";
import { applyRateLimit } from "@/lib/rate-limit";

export async function GET(request: NextRequest) {
  const blocked = await applyRateLimit(request, "clients-overview", { limit: 10, windowSeconds: 60 });
  if (blocked) return blocked;

  const { advisor, error } = await requireAdvisor();
  if (error) return error;

  const admin = createAdminClient();

  // Get all clients for this advisor (or subordinates if admin)
  let advisorIds = [advisor!.id];
  if (advisor!.rol === "admin") {
    const subIds = await getSubordinateAdvisorIds(advisor!.id);
    advisorIds = [advisor!.id, ...subIds];
  }

  const { data: clients, error: clientsError } = await admin
    .from("clients")
    .select("id, nombre, apellido, email, perfil_riesgo, puntaje_riesgo, cartera_recomendada, portal_enabled, portal_last_seen, created_at, asesor_id")
    .in("asesor_id", advisorIds)
    .order("nombre", { ascending: true });

  if (clientsError) {
    return NextResponse.json({ success: false, error: clientsError.message }, { status: 500 });
  }

  if (!clients || clients.length === 0) {
    return NextResponse.json({ success: true, clients: [] });
  }

  const clientIds = clients.map(c => c.id);

  // Batch fetch: latest snapshots for all clients
  // We need the latest snapshot per client - use a different approach
  const { data: allSnapshots } = await admin
    .from("portfolio_snapshots")
    .select("client_id, snapshot_date, total_value, cumulative_return, equity_percent, fixed_income_percent, alternatives_percent, cash_percent")
    .in("client_id", clientIds)
    .order("snapshot_date", { ascending: false });

  // Group by client, take latest
  const latestSnapshots = new Map();
  for (const snap of (allSnapshots || [])) {
    if (!latestSnapshots.has(snap.client_id)) {
      latestSnapshots.set(snap.client_id, snap);
    }
  }

  // Batch fetch: latest interactions (last contact)
  const { data: allInteractions } = await admin
    .from("client_interactions")
    .select("client_id, fecha, tipo")
    .in("client_id", clientIds)
    .order("fecha", { ascending: false });

  const latestInteraction = new Map();
  for (const inter of (allInteractions || [])) {
    if (!latestInteraction.has(inter.client_id)) {
      latestInteraction.set(inter.client_id, inter);
    }
  }

  // Batch fetch: latest messages
  const { data: allMessages } = await admin
    .from("messages")
    .select("client_id, sent_at")
    .in("client_id", clientIds)
    .order("sent_at", { ascending: false });

  const latestMessage = new Map();
  for (const msg of (allMessages || [])) {
    if (!latestMessage.has(msg.client_id)) {
      latestMessage.set(msg.client_id, msg);
    }
  }

  // Batch fetch: report configs
  const { data: reportConfigs } = await admin
    .from("client_report_config")
    .select("client_id, frequency, last_sent_at")
    .in("client_id", clientIds);

  const reportConfigMap = new Map();
  for (const rc of (reportConfigs || [])) {
    reportConfigMap.set(rc.client_id, rc);
  }

  // Batch fetch: latest reports sent
  const { data: allReports } = await admin
    .from("client_reports")
    .select("client_id, report_date, created_at")
    .in("client_id", clientIds)
    .order("created_at", { ascending: false });

  const latestReport = new Map();
  for (const rep of (allReports || [])) {
    if (!latestReport.has(rep.client_id)) {
      latestReport.set(rep.client_id, rep);
    }
  }

  // Build enriched client list
  const enrichedClients = clients.map(client => {
    const snap = latestSnapshots.get(client.id);
    const interaction = latestInteraction.get(client.id);
    const message = latestMessage.get(client.id);
    const reportConfig = reportConfigMap.get(client.id);
    const report = latestReport.get(client.id);

    // Calculate drift if both snapshot and recommendation exist
    let drift = null;
    const rec = client.cartera_recomendada as any;
    if (snap && rec) {
      // rec may have equity_percent or cartera array
      const recEquity = rec.equity_percent ?? (rec.cartera || [])
        .filter((p: any) => p.clase === "Renta Variable")
        .reduce((s: number, p: any) => s + p.porcentaje, 0);
      const recFI = rec.fixed_income_percent ?? (rec.cartera || [])
        .filter((p: any) => p.clase === "Renta Fija")
        .reduce((s: number, p: any) => s + p.porcentaje, 0);

      const actualEquity = snap.equity_percent || 0;
      const actualFI = snap.fixed_income_percent || 0;

      drift = (Math.abs(actualEquity - recEquity) + Math.abs(actualFI - recFI)) / 2;
    }

    // Last contact = most recent of interaction or message
    const interactionDate = interaction?.fecha ? new Date(interaction.fecha).getTime() : 0;
    const messageDate = message?.sent_at ? new Date(message.sent_at).getTime() : 0;
    const lastContactDate = Math.max(interactionDate, messageDate);
    const daysSinceContact = lastContactDate > 0
      ? Math.round((Date.now() - lastContactDate) / (1000 * 60 * 60 * 24))
      : null;

    return {
      id: client.id,
      nombre: client.nombre,
      apellido: client.apellido,
      email: client.email,
      perfilRiesgo: client.perfil_riesgo || null,
      puntajeRiesgo: client.puntaje_riesgo || null,
      portalEnabled: client.portal_enabled || false,
      portalLastSeen: client.portal_last_seen || null,
      createdAt: client.created_at,
      // Portfolio
      totalValue: snap?.total_value || null,
      cumulativeReturn: snap?.cumulative_return || null,
      lastSnapshotDate: snap?.snapshot_date || null,
      equityPercent: snap?.equity_percent || null,
      fixedIncomePercent: snap?.fixed_income_percent || null,
      // Recommendation
      hasRecommendation: !!(rec?.cartera?.length > 0),
      drift,
      // Contact
      lastContactDate: lastContactDate > 0 ? new Date(lastContactDate).toISOString().split("T")[0] : null,
      daysSinceContact,
      lastContactType: interaction?.tipo || (messageDate > interactionDate ? "message" : null),
      // Reports
      reportFrequency: reportConfig?.frequency || null,
      lastReportDate: report?.report_date || reportConfig?.last_sent_at || null,
      receivingReports: !!reportConfig,
    };
  });

  return NextResponse.json({ success: true, clients: enrichedClients });
}
