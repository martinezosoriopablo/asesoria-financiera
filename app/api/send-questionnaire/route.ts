import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { email, clientName, advisorEmail } = await req.json();

    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Email es requerido" }, { status: 400 });
    }

    // Obtener datos del asesor si tenemos su email
    let advisorName = "Tu asesor financiero";
    let companyName = "";
    let replyTo = "pmartinez@greybark.com";

    if (advisorEmail) {
      const { data: advisor } = await supabase
        .from("advisors")
        .select("nombre, apellido, email, company_name")
        .eq("email", advisorEmail)
        .single();

      if (advisor) {
        advisorName = `${advisor.nombre} ${advisor.apellido}`;
        companyName = advisor.company_name || "";
        replyTo = advisor.email;
      }
    }

    const appUrl = "https://asesoria-financiera.vercel.app";
    const questionnaireLink = `${appUrl}/mi-perfil-inversor?email=${encodeURIComponent(email)}${advisorEmail ? `&advisor=${encodeURIComponent(advisorEmail)}` : ""}`;
    const displayName = clientName || email;

    const fromName = companyName || "Asesoría Financiera";
    const { error } = await resend.emails.send({
      from: `${fromName} <pmartinez@greybark.com>`,
      replyTo: replyTo,
      to: email,
      subject: "Cuestionario de Perfil de Inversor",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #1e293b;">Hola ${displayName},</h2>
          <p style="color: #475569; font-size: 16px; line-height: 1.6;">
            <strong>${advisorName}</strong>${companyName ? ` de <strong>${companyName}</strong>` : ""} te ha enviado un cuestionario para determinar tu perfil de inversor.
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
            Si tienes dudas, puedes responder directamente a este correo para contactar a ${advisorName}${companyName ? ` (${companyName})` : ""}.
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
