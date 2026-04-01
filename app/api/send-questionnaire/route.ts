import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import crypto from "crypto";
import { requireAdvisor, createAdminClient } from "@/lib/auth/api-auth";
import { applyRateLimit } from "@/lib/rate-limit";
import { escapeHtml } from "@/lib/sanitize";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const blocked = await applyRateLimit(req, "send-questionnaire", { limit: 10, windowSeconds: 60 });
  if (blocked) return blocked;

  const { error: authError } = await requireAdvisor();
  if (authError) return authError;

  const supabase = createAdminClient();

  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { email, clientName, advisorEmail } = await req.json();

    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Email es requerido" }, { status: 400 });
    }

    // Obtener datos del asesor si tenemos su email
    let advisorName = "Tu asesor financiero";
    let companyName = "";
    let logoUrl = "";
    let replyTo = process.env.SENDER_EMAIL || "noreply@example.com";

    if (advisorEmail) {
      const { data: advisor } = await supabase
        .from("advisors")
        .select("nombre, apellido, email, company_name, logo_url")
        .eq("email", advisorEmail)
        .single();

      if (advisor) {
        advisorName = `${advisor.nombre} ${advisor.apellido}`;
        companyName = advisor.company_name || "";
        logoUrl = advisor.logo_url || "";
        replyTo = advisor.email;
      }
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    // Generate HMAC token to authenticate the questionnaire submission
    const hmacSecret = process.env.CRON_SECRET || "fallback";
    const tokenPayload = advisorEmail ? `${email}:${advisorEmail}` : email;
    const token = crypto.createHmac("sha256", hmacSecret).update(tokenPayload).digest("hex");
    const questionnaireLink = `${appUrl}/mi-perfil-inversor?email=${encodeURIComponent(email)}${advisorEmail ? `&advisor=${encodeURIComponent(advisorEmail)}` : ""}&token=${token}`;
    const displayName = clientName || email;

    const fromName = companyName || "Asesoría Financiera";
    const { error } = await resend.emails.send({
      from: `${fromName} <${process.env.SENDER_EMAIL || "noreply@example.com"}>`,
      replyTo: replyTo,
      to: email,
      subject: "Cuestionario de Perfil de Inversor",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          ${logoUrl ? `
          <div style="text-align: center; margin-bottom: 24px;">
            <img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(companyName || 'Logo')}" style="max-height: 60px; max-width: 200px;" />
          </div>
          ` : ""}
          <h2 style="color: #1e293b;">Hola ${escapeHtml(displayName)},</h2>
          <p style="color: #475569; font-size: 16px; line-height: 1.6;">
            <strong>${escapeHtml(advisorName)}</strong>${companyName ? ` de <strong>${escapeHtml(companyName)}</strong>` : ""} te ha enviado un cuestionario para determinar tu perfil de inversor.
            Este cuestionario nos ayudará a entender tu capacidad, tolerancia y comportamiento frente
            al riesgo, para recomendarte una estrategia de inversión alineada con tus objetivos.
          </p>
          <p style="color: #475569; font-size: 16px; line-height: 1.6;">
            Toma aproximadamente 5-10 minutos completarlo.
          </p>
          <div style="text-align: center; margin: 32px 0;">
            <a href="${questionnaireLink}"
               style="background-color: #2563eb; color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px; display: inline-block;">
              Completar cuestionario
            </a>
          </div>
          <p style="color: #94a3b8; font-size: 13px;">
            Si tienes dudas, puedes responder directamente a este correo para contactar a ${escapeHtml(advisorName)}${companyName ? ` (${escapeHtml(companyName)})` : ""}.
          </p>
        </div>
      `,
    });

    if (error) {
      console.error("Resend error:", JSON.stringify(error));
      return NextResponse.json({ error: error.message || "Error enviando email" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Send questionnaire error:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
