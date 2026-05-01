// app/api/cron/send-reports/route.ts
// Cron job: generates and sends reports by email based on client_report_config frequency
// Schedule: daily at 8am — checks frequency per client

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/auth/api-auth";
import { Resend } from "resend";
import { createNotification } from "@/lib/notifications";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

function shouldSendToday(frequency: string, lastSentAt: string | null, sendDayOfWeek: number, sendDayOfMonth: number): boolean {
  if (frequency === "none") return false;

  const now = new Date();
  const today = now.getDay(); // 0=Sun, 1=Mon, ...
  const dayOfMonth = now.getDate();

  // Check if today is the configured send day
  if (frequency === "weekly" && today !== sendDayOfWeek) return false;
  if (frequency === "monthly" && dayOfMonth !== sendDayOfMonth) return false;

  if (!lastSentAt) return true; // never sent → send now

  const last = new Date(lastSentAt);
  const diffMs = now.getTime() - last.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  switch (frequency) {
    case "weekly":
      return diffDays >= 6; // at least 6 days since last send (allows for slight timing drift)
    case "monthly":
      return diffDays >= 27; // at least 27 days since last send
    default:
      return false;
  }
}

export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  // Get all configs where frequency != 'none'
  const { data: configs, error: configError } = await supabase
    .from("client_report_config")
    .select("client_id, frequency, last_sent_at, send_portfolio_report, send_macro, send_rv, send_rf, send_asset_allocation, send_day_of_week, send_day_of_month")
    .neq("frequency", "none");

  if (configError || !configs) {
    return NextResponse.json({ error: "Error fetching configs" }, { status: 500 });
  }

  const results: Array<{ clientId: string; status: string }> = [];

  for (const config of configs) {
    if (!shouldSendToday(config.frequency, config.last_sent_at, config.send_day_of_week ?? 1, config.send_day_of_month ?? 1)) {
      results.push({ clientId: config.client_id, status: "skipped" });
      continue;
    }

    try {
      // Get client info
      const { data: client } = await supabase
        .from("clients")
        .select("id, nombre, apellido, email, asesor_id, perfil_riesgo, puntaje_riesgo")
        .eq("id", config.client_id)
        .single();

      if (!client || !client.email || !client.asesor_id) {
        results.push({ clientId: config.client_id, status: "no_client_or_advisor" });
        continue;
      }

      // Get advisor info
      const { data: advisor } = await supabase
        .from("advisors")
        .select("id, nombre, apellido, email, company_name")
        .eq("id", client.asesor_id)
        .single();

      if (!advisor) {
        results.push({ clientId: config.client_id, status: "no_advisor" });
        continue;
      }

      // Get latest snapshot
      const { data: latestSnapshot } = await supabase
        .from("portfolio_snapshots")
        .select("*")
        .eq("client_id", client.id)
        .order("snapshot_date", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!latestSnapshot) {
        results.push({ clientId: config.client_id, status: "no_snapshot" });
        continue;
      }

      // Get previous snapshot
      const { data: prevSnapshot } = await supabase
        .from("portfolio_snapshots")
        .select("total_value, snapshot_date")
        .eq("client_id", client.id)
        .lt("snapshot_date", latestSnapshot.snapshot_date)
        .order("snapshot_date", { ascending: false })
        .limit(1)
        .maybeSingle();

      // Build snapshot summary
      const snapshotSummary = {
        date: latestSnapshot.snapshot_date,
        total_value: latestSnapshot.total_value,
        equity_percent: latestSnapshot.equity_percent,
        fixed_income_percent: latestSnapshot.fixed_income_percent,
        alternatives_percent: latestSnapshot.alternatives_percent,
        cash_percent: latestSnapshot.cash_percent,
        equity_value: latestSnapshot.equity_value,
        fixed_income_value: latestSnapshot.fixed_income_value,
        alternatives_value: latestSnapshot.alternatives_value,
        cash_value: latestSnapshot.cash_value,
        holdings: latestSnapshot.holdings,
        cumulative_return: latestSnapshot.cumulative_return,
        prev_value: prevSnapshot?.total_value || null,
        prev_date: prevSnapshot?.snapshot_date || null,
      };

      // Get comité reports for context
      const comiteTypes: string[] = [];
      if (config.send_macro) comiteTypes.push("macro");
      if (config.send_rv) comiteTypes.push("rv");
      if (config.send_rf) comiteTypes.push("rf");
      if (config.send_asset_allocation) comiteTypes.push("asset_allocation");

      const { data: comiteReports } = await supabase
        .from("comite_reports")
        .select("type, title, report_date")
        .in("type", comiteTypes.length > 0 ? comiteTypes : ["macro"]);

      const comiteIncluded = (comiteReports || []).map(r => ({
        type: r.type,
        title: r.title,
        report_date: r.report_date,
      }));

      // Save report
      const { data: report, error: insertError } = await supabase
        .from("client_reports")
        .insert({
          client_id: client.id,
          report_date: new Date().toISOString().split("T")[0],
          report_type: "portfolio_update",
          snapshot_summary: snapshotSummary,
          market_commentary: null, // AI commentary skipped in cron for cost control
          comite_reports_included: comiteIncluded,
          sent_via: "email",
        })
        .select("id")
        .single();

      if (insertError) {
        results.push({ clientId: config.client_id, status: `error: ${insertError.message}` });
        continue;
      }

      // Send email
      const resend = new Resend(process.env.RESEND_API_KEY);
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://asesoria-financiera.vercel.app";
      const clientName = `${client.nombre} ${client.apellido || ""}`.trim();
      const valueChange = prevSnapshot
        ? snapshotSummary.total_value - prevSnapshot.total_value
        : null;
      const formatCLP = (n: number) =>
        new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", minimumFractionDigits: 0 }).format(n);

      await resend.emails.send({
        from: `${advisor.company_name || "Asesoría Financiera"} <pmartinez@greybark.com>`,
        to: client.email,
        subject: `Reporte de portafolio — ${new Date().toLocaleDateString("es-CL", { day: "numeric", month: "long" })}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #1e293b;">Hola ${client.nombre},</h2>
            <p style="color: #475569; font-size: 15px; line-height: 1.6;">
              Aquí tienes un resumen de tu portafolio al ${new Date(snapshotSummary.date + "T12:00:00").toLocaleDateString("es-CL", { day: "numeric", month: "long", year: "numeric" })}.
            </p>

            <div style="background-color: #f1f5f9; border-radius: 12px; padding: 20px; margin: 24px 0;">
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 8px 0; color: #475569; font-size: 14px;">Valor Total</td>
                  <td style="padding: 8px 0; text-align: right; font-size: 20px; font-weight: bold; color: #1e293b;">${formatCLP(snapshotSummary.total_value)}</td>
                </tr>
                ${valueChange !== null ? `
                <tr>
                  <td style="padding: 8px 0; color: #475569; font-size: 14px;">Cambio</td>
                  <td style="padding: 8px 0; text-align: right; font-size: 14px; font-weight: 600; color: ${valueChange >= 0 ? "#16a34a" : "#dc2626"};">
                    ${valueChange >= 0 ? "+" : ""}${formatCLP(valueChange)}
                  </td>
                </tr>
                ` : ""}
                <tr><td colspan="2" style="padding: 12px 0 4px; border-top: 1px solid #e2e8f0;"></td></tr>
                <tr>
                  <td style="padding: 4px 0; color: #475569; font-size: 13px;">Renta Variable</td>
                  <td style="padding: 4px 0; text-align: right; font-size: 13px; color: #1e293b;">${snapshotSummary.equity_percent.toFixed(1)}%</td>
                </tr>
                <tr>
                  <td style="padding: 4px 0; color: #475569; font-size: 13px;">Renta Fija</td>
                  <td style="padding: 4px 0; text-align: right; font-size: 13px; color: #1e293b;">${snapshotSummary.fixed_income_percent.toFixed(1)}%</td>
                </tr>
                <tr>
                  <td style="padding: 4px 0; color: #475569; font-size: 13px;">Alternativos</td>
                  <td style="padding: 4px 0; text-align: right; font-size: 13px; color: #1e293b;">${snapshotSummary.alternatives_percent.toFixed(1)}%</td>
                </tr>
                <tr>
                  <td style="padding: 4px 0; color: #475569; font-size: 13px;">Caja</td>
                  <td style="padding: 4px 0; text-align: right; font-size: 13px; color: #1e293b;">${snapshotSummary.cash_percent.toFixed(1)}%</td>
                </tr>
              </table>
            </div>

            <div style="text-align: center; margin: 32px 0;">
              <a href="${appUrl}/portal/reportes"
                 style="background-color: #1e293b; color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 15px; display: inline-block;">
                Ver reporte completo
              </a>
            </div>

            <p style="color: #94a3b8; font-size: 12px; text-align: center; margin-top: 24px;">
              ${advisor.nombre} ${advisor.apellido} — ${advisor.company_name || "Asesoría Financiera"}
            </p>
          </div>
        `,
      });

      // Update last_sent_at
      await supabase
        .from("client_report_config")
        .update({ last_sent_at: new Date().toISOString() })
        .eq("client_id", client.id);

      // Notify advisor that report was sent
      await createNotification(supabase, {
        advisorId: advisor.id,
        clientId: client.id,
        type: "report_ready",
        title: "Reporte enviado por email",
        body: `Reporte de portafolio enviado a ${clientName}`,
        link: `/clients?id=${client.id}`,
      });

      results.push({ clientId: config.client_id, status: "sent" });
    } catch (err) {
      console.error(`Error processing report for ${config.client_id}:`, err);
      results.push({ clientId: config.client_id, status: "error" });
    }
  }

  const sent = results.filter(r => r.status === "sent").length;
  const skipped = results.filter(r => r.status === "skipped").length;

  return NextResponse.json({
    success: true,
    summary: { total: results.length, sent, skipped, errors: results.length - sent - skipped },
    results,
  });
}
