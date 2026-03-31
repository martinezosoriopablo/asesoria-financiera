import { Resend } from "resend";
import { createAdminClient } from "@/lib/auth/api-auth";

interface DistributionResult {
  sent: number;
  errors: number;
  recipients: string[];
}

export async function distributeDailyReport(reportId: string): Promise<DistributionResult> {
  const supabase = createAdminClient();

  // Fetch the report
  const { data: report, error: reportError } = await supabase
    .from("daily_reports")
    .select("*")
    .eq("id", reportId)
    .single();

  if (reportError || !report) {
    throw new Error(`Report not found: ${reportId}`);
  }

  if (report.distributed) {
    return { sent: 0, errors: 0, recipients: [] };
  }

  // Get all clients with send_daily_report = true, joined with client email
  const { data: configs } = await supabase
    .from("client_report_config")
    .select("client_id")
    .eq("send_daily_report", true);

  if (!configs || configs.length === 0) {
    // Mark as distributed even if no recipients
    await supabase
      .from("daily_reports")
      .update({ distributed: true, distributed_at: new Date().toISOString(), recipients_count: 0 })
      .eq("id", reportId);
    return { sent: 0, errors: 0, recipients: [] };
  }

  const clientIds = configs.map(c => c.client_id);

  const { data: clients } = await supabase
    .from("clients")
    .select("id, nombre, apellido, email")
    .in("id", clientIds)
    .not("email", "is", null);

  if (!clients || clients.length === 0) {
    await supabase
      .from("daily_reports")
      .update({ distributed: true, distributed_at: new Date().toISOString(), recipients_count: 0 })
      .eq("id", reportId);
    return { sent: 0, errors: 0, recipients: [] };
  }

  // Add podcast link to HTML if exists
  let htmlContent = report.html_content;
  if (report.podcast_url) {
    htmlContent += `
      <div style="text-align: center; margin: 32px 0; padding: 20px; background-color: #f8fafc; border-radius: 12px;">
        <p style="color: #475569; font-size: 14px; margin: 0 0 12px 0;">🎧 Escucha el podcast del día</p>
        <a href="${report.podcast_url}"
           style="background-color: #1e293b; color: white; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px; display: inline-block;">
          Reproducir Podcast
        </a>
      </div>
    `;
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  let sent = 0;
  let errors = 0;
  const recipients: string[] = [];

  // Send in batches of 50
  const batchSize = 50;
  for (let i = 0; i < clients.length; i += batchSize) {
    const batch = clients.slice(i, i + batchSize);
    const emails = batch.map(client => ({
      from: `Greybark Advisors <pmartinez@greybark.com>`,
      to: client.email!,
      subject: report.subject,
      html: htmlContent,
    }));

    try {
      if (emails.length === 1) {
        await resend.emails.send(emails[0]);
      } else {
        await resend.batch.send(emails);
      }
      sent += emails.length;
      recipients.push(...batch.map(c => c.email!));
    } catch (err) {
      console.error("Error sending daily report batch:", err);
      errors += emails.length;
    }
  }

  // Mark as distributed
  await supabase
    .from("daily_reports")
    .update({
      distributed: true,
      distributed_at: new Date().toISOString(),
      recipients_count: sent,
    })
    .eq("id", reportId);

  return { sent, errors, recipients };
}
