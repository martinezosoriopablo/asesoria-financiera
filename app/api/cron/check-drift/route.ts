// app/api/cron/check-drift/route.ts
// Cron job: check all clients' portfolio drift vs recommendation
// Creates advisor notifications when drift exceeds threshold
// Called daily via Vercel Cron or manually

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/auth/api-auth";
import { handleApiError } from "@/lib/api-response";
import { Resend } from "resend";

interface DriftInfo {
  clientName: string;
  clientId: string;
  drift: number;
  threshold: number;
  actualEquity: number;
  recEquity: number;
  actualFI: number;
  recFI: number;
}

// Email al asesor: resumen de clientes desviados del portafolio recomendado.
function buildDriftEmailHTML(advisorName: string, drifts: DriftInfo[], baseUrl: string): string {
  const NAVY = "#05162C", COPPER = "#EB7838", INK = "#EEF3FA", MUTED = "#9DB0CA", LINE = "#E7E4DD";
  const rows = drifts.map(d => `
    <tr style="border-bottom:1px solid ${LINE};">
      <td style="padding:10px 12px;font-size:13px;color:#0B2140;font-weight:600;">${d.clientName}</td>
      <td style="padding:10px 12px;text-align:right;font-family:monospace;font-size:13px;font-weight:700;color:${COPPER};">${d.drift.toFixed(1)}%</td>
      <td style="padding:10px 12px;text-align:right;font-family:monospace;font-size:12px;color:#6E7787;">${d.actualEquity.toFixed(0)}% <span style="color:#a9a49c;">/ ${d.recEquity.toFixed(0)}%</span></td>
      <td style="padding:10px 12px;text-align:right;font-family:monospace;font-size:12px;color:#6E7787;">${d.actualFI.toFixed(0)}% <span style="color:#a9a49c;">/ ${d.recFI.toFixed(0)}%</span></td>
      <td style="padding:10px 12px;text-align:right;"><a href="${baseUrl}/clients/${d.clientId}?tab=seguimiento" style="color:#5AA0E6;font-size:12px;text-decoration:none;">Ver &rarr;</a></td>
    </tr>`).join("");
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"/></head>
  <body style="margin:0;padding:0;background:#F7F6F2;font-family:-apple-system,Segoe UI,Roboto,sans-serif;">
    <div style="max-width:640px;margin:0 auto;background:#fff;">
      <div style="background:${NAVY};color:${INK};padding:22px 28px;">
        <div style="font-size:16px;font-weight:700;letter-spacing:1px;">GLOBAL</div>
        <div style="font-size:16px;font-weight:600;color:${COPPER};margin-top:4px;">Alerta de Rebalanceo</div>
      </div>
      <div style="padding:24px 28px;">
        <p style="font-size:14px;color:#2C3A4E;margin:0 0 16px;">Hola ${advisorName || "asesor"}, ${drifts.length === 1 ? "un cliente se ha desviado" : `${drifts.length} clientes se han desviado`} del portafolio recomendado más allá del umbral. Revisa si corresponde rebalancear:</p>
        <table style="width:100%;border-collapse:collapse;">
          <tr style="border-bottom:2px solid ${LINE};">
            <th style="text-align:left;padding:6px 12px;color:${MUTED};font-size:11px;font-weight:600;">Cliente</th>
            <th style="text-align:right;padding:6px 12px;color:${MUTED};font-size:11px;font-weight:600;">Drift</th>
            <th style="text-align:right;padding:6px 12px;color:${MUTED};font-size:11px;font-weight:600;">RV act/rec</th>
            <th style="text-align:right;padding:6px 12px;color:${MUTED};font-size:11px;font-weight:600;">RF act/rec</th>
            <th style="padding:6px 12px;"></th>
          </tr>
          ${rows}
        </table>
      </div>
      <div style="padding:16px 28px;background:#F7F6F2;border-top:2px solid ${LINE};font-size:11px;color:${MUTED};text-align:center;">
        Global — Alerta automática de seguimiento. Este correo es informativo.
      </div>
    </div>
  </body></html>`;
}

export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return handleApiError("cron-check-drift-get", async () => {
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
    .select("id, drift_threshold, email, nombre")
    .in("id", advisorIds);

  const thresholdMap = new Map<string, number>();
  const advisorInfo = new Map<string, { email: string | null; nombre: string | null }>();
  for (const a of (advisors || [])) {
    thresholdMap.set(a.id, a.drift_threshold ?? 5);
    advisorInfo.set(a.id, { email: a.email ?? null, nombre: a.nombre ?? null });
  }
  // Drifts agrupados por asesor para enviar UN email resumen a cada uno.
  const driftsByAdvisor = new Map<string, DriftInfo[]>();

  // Get latest snapshot per client
  const clientIds = clients.map(c => c.id);
  const { data: snapshots } = await admin
    .from("portfolio_snapshots")
    .select("client_id, snapshot_date, equity_percent, fixed_income_percent")
    .in("client_id", clientIds)
    .order("snapshot_date", { ascending: false });

  const latestSnap = new Map<string, { client_id: string; snapshot_date: string; equity_percent: number | null; fixed_income_percent: number | null }>();
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
    const rec = client.cartera_recomendada as Record<string, unknown> | null;
    if (!snap || !rec) continue;

    // Calculate drift
    const cartera = (rec.cartera || []) as Array<{ clase: string; porcentaje: number }>;
    const recEquity = (rec.equity_percent as number | undefined) ?? cartera
      .filter((p) => p.clase === "Renta Variable")
      .reduce((s: number, p) => s + p.porcentaje, 0);
    const recFI = (rec.fixed_income_percent as number | undefined) ?? cartera
      .filter((p) => p.clase === "Renta Fija")
      .reduce((s: number, p) => s + p.porcentaje, 0);

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

      // Acumular para el email al asesor
      const list = driftsByAdvisor.get(client.asesor_id) || [];
      list.push({
        clientName: `${client.nombre} ${client.apellido || ""}`.trim(),
        clientId: client.id,
        drift, threshold,
        actualEquity, recEquity, actualFI, recFI,
      });
      driftsByAdvisor.set(client.asesor_id, list);
    }
  }

  // Enviar UN email resumen por asesor con clientes desviados (si hay Resend + email)
  let emailsSent = 0;
  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey && driftsByAdvisor.size > 0) {
    const resend = new Resend(resendKey);
    const senderEmail = process.env.SENDER_EMAIL || "noreply@global.cl";
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://asesoria-financiera.vercel.app";
    for (const [advisorId, drifts] of driftsByAdvisor) {
      const info = advisorInfo.get(advisorId);
      if (!info?.email) continue;
      try {
        const html = buildDriftEmailHTML(info.nombre || "", drifts, baseUrl);
        const subject = drifts.length === 1
          ? `Alerta de rebalanceo: ${drifts[0].clientName}`
          : `Alerta de rebalanceo: ${drifts.length} clientes`;
        const { error: emailError } = await resend.emails.send({
          from: `Global <${senderEmail}>`,
          to: info.email,
          subject,
          html,
        });
        if (emailError) console.error("[check-drift] Resend error:", emailError);
        else emailsSent++;
      } catch (e) {
        console.error("[check-drift] email fallo:", e);
      }
    }
  }

    return NextResponse.json({
      checked: clients.length,
      alerts: alertsCreated,
      emailsSent,
      timestamp: new Date().toISOString(),
    });
  });
}
