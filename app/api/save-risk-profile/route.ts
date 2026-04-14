import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createAdminClient } from "@/lib/auth/api-auth";
import { Resend } from "resend";
import { applyRateLimit } from "@/lib/rate-limit";
import { createNotification } from "@/lib/notifications";

export const dynamic = "force-dynamic";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface ValidScores {
  capacity: number;
  tolerance: number;
  perception: number;
  composure: number;
  global: number;
  profileLabel: string;
}

const EXPECTED_SCORE_KEYS = ["capacity", "tolerance", "perception", "composure", "global", "profileLabel"];

function isValidScores(scores: unknown): scores is ValidScores {
  if (!scores || typeof scores !== "object" || Array.isArray(scores)) return false;
  const s = scores as Record<string, unknown>;
  for (const key of EXPECTED_SCORE_KEYS) {
    if (!(key in s)) return false;
  }
  // Numeric scores must be finite numbers
  for (const key of ["capacity", "tolerance", "perception", "composure", "global"]) {
    if (typeof s[key] !== "number" || !Number.isFinite(s[key] as number)) return false;
  }
  if (typeof s.profileLabel !== "string" || s.profileLabel.length === 0 || s.profileLabel.length > 100) return false;
  return true;
}

export async function POST(req: NextRequest) {
  const blocked = await applyRateLimit(req, "save-risk-profile", { limit: 3, windowSeconds: 60 });
  if (blocked) return blocked;

  try {
    // --- Origin validation ---
    const allowedOrigin = (process.env.NEXT_PUBLIC_APP_URL || "https://asesoria-financiera.vercel.app").replace(/\/$/, "");
    const origin = req.headers.get("origin");
    const referer = req.headers.get("referer");
    if (!origin && !referer) {
      return NextResponse.json({ error: "Solicitud no autorizada" }, { status: 403 });
    }
    const requestOrigin = origin || (referer ? new URL(referer).origin : null);
    if (requestOrigin && requestOrigin !== allowedOrigin) {
      const host = req.headers.get("host") || "";
      const isSameHost = requestOrigin.includes(host) && host.length > 0;
      const isDev = requestOrigin.includes("localhost") || process.env.NODE_ENV === "development";
      if (!isSameHost && !isDev) {
        return NextResponse.json({ error: "Origen no autorizado" }, { status: 403 });
      }
    }

    const body = await req.json();
    const { email, scores, responses, retirementData, projection, advisorEmail: advisorEmailFromClient, token } = body;

    // --- Input validation ---
    if (!email || typeof email !== "string" || !EMAIL_REGEX.test(email)) {
      return NextResponse.json({ error: "Email inválido" }, { status: 400 });
    }

    if (!isValidScores(scores)) {
      return NextResponse.json({ error: "Datos de puntaje incompletos o inválidos" }, { status: 400 });
    }

    if (advisorEmailFromClient && (typeof advisorEmailFromClient !== "string" || !EMAIL_REGEX.test(advisorEmailFromClient))) {
      return NextResponse.json({ error: "Email de asesor inválido" }, { status: 400 });
    }

    if (responses && typeof responses !== "object") {
      return NextResponse.json({ error: "Respuestas inválidas" }, { status: 400 });
    }

    // --- HMAC token verification ---
    const hmacSecret = process.env.HMAC_SECRET || process.env.CRON_SECRET;
    if (!hmacSecret) {
      return NextResponse.json({ error: "Configuración de servidor incompleta" }, { status: 500 });
    }
    const tokenPayload = advisorEmailFromClient ? `${email}:${advisorEmailFromClient}` : email;
    const expectedToken = crypto.createHmac("sha256", hmacSecret).update(tokenPayload).digest("hex");
    if (!token || typeof token !== "string" || !crypto.timingSafeEqual(Buffer.from(token, "hex"), Buffer.from(expectedToken, "hex"))) {
      return NextResponse.json({ error: "Token de verificación inválido" }, { status: 403 });
    }

    const supabase = createAdminClient();

    // --- Validate client exists in DB ---
    const { data: existingClient } = await supabase
      .from("clients")
      .select("id, asesor_id")
      .eq("email", email)
      .maybeSingle();

    if (!existingClient) {
      return NextResponse.json({ error: "Cliente no registrado. Contacta a tu asesor." }, { status: 403 });
    }

    const clientId = existingClient.id;

    // --- Validate advisor exists and is active ---
    let advisorId: string | null = null;
    if (advisorEmailFromClient) {
      const { data: advisor } = await supabase
        .from("advisors")
        .select("id")
        .eq("email", advisorEmailFromClient)
        .single();
      if (!advisor) {
        return NextResponse.json({ error: "Asesor no encontrado" }, { status: 400 });
      }
      advisorId = advisor.id;
    }

    // Assign advisor if provided (takes precedence)
    if (advisorId) {
      await supabase
        .from("clients")
        .update({ asesor_id: advisorId })
        .eq("id", clientId);
    }

    // Build extended responses
    const extendedResponses = {
      ...responses,
      goal_type: responses?.["goal_1_objetivo"] ?? null,
      retirement_data: retirementData
        ? {
            ...retirementData,
            esperanza_vida: projection?.esperanzaVida,
            anios_retiro: projection?.aniosRetiro,
            anios_para_ahorrar: projection?.aniosParaAhorrar,
            capital_estimado: projection?.capitalEstimado,
          }
        : null,
    };

    // Save questionnaire responses
    const { error: respError } = await supabase
      .from("risk_questionnaire_responses")
      .insert({
        client_id: clientId,
        responses: extendedResponses,
        capacity_score: Math.round(scores.capacity),
        tolerance_score: Math.round(scores.tolerance),
        perception_score: Math.round(scores.perception),
        composure_score: Math.round(scores.composure),
        global_score: Math.round(scores.global),
        profile_label: scores.profileLabel,
      });

    if (respError) {
      console.error("Error saving responses:", respError);
      return NextResponse.json({ error: `Error guardando respuestas: ${respError.message}` }, { status: 500 });
    }

    // Save risk profile
    const { error: profileError } = await supabase
      .from("risk_profiles")
      .insert({
        client_id: clientId,
        capacity_score: Math.round(scores.capacity),
        tolerance_score: Math.round(scores.tolerance),
        perception_score: Math.round(scores.perception),
        composure_score: Math.round(scores.composure),
        global_score: Math.round(scores.global),
        profile_label: scores.profileLabel,
      });

    if (profileError) {
      console.error("Error saving profile:", profileError);
      return NextResponse.json({ error: `Error guardando perfil: ${profileError.message}` }, { status: 500 });
    }

    // Update clients table with risk profile for easy querying
    const { error: clientUpdateError } = await supabase
      .from("clients")
      .update({
        perfil_riesgo: scores.profileLabel.toLowerCase().replace(/ /g, "_"),
        puntaje_riesgo: Math.round(scores.global),
        status: "activo",
      })
      .eq("id", clientId);

    if (clientUpdateError) {
      console.error("Error updating client profile:", clientUpdateError);
      // No retornamos error aquí porque el perfil ya se guardó correctamente
    }

    // Notify advisor by email
    try {
      const resend = new Resend(process.env.RESEND_API_KEY);

      // Find the advisor linked to this client
      const { data: client } = await supabase
        .from("clients")
        .select("asesor_id, nombre, apellido")
        .eq("id", clientId)
        .single();

      // Priority: 1) advisor from questionnaire link, 2) assigned advisor, 3) first advisor
      let advisorEmail: string | null = advisorEmailFromClient || null;

      if (!advisorEmail && client?.asesor_id) {
        const { data: advisor } = await supabase
          .from("advisors")
          .select("email")
          .eq("id", client.asesor_id)
          .single();
        advisorEmail = advisor?.email || null;
      }

      if (!advisorEmail) {
        const { data: firstAdvisor } = await supabase
          .from("advisors")
          .select("email")
          .limit(1)
          .single();
        advisorEmail = firstAdvisor?.email || null;
      }

      if (advisorEmail) {
        const clientName = client?.nombre ? `${client.nombre} ${client.apellido || ""}`.trim() : email;
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://asesoria-financiera.vercel.app";

        const { data: emailResult, error: emailError } = await resend.emails.send({
          from: "Asesoría Financiera <pmartinez@greybark.com>",
          to: advisorEmail,
          subject: `Cuestionario completado: ${clientName} — Perfil ${scores.profileLabel}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
              <h2 style="color: #1e293b;">Nuevo cuestionario completado</h2>
              <p style="color: #475569; font-size: 16px; line-height: 1.6;">
                El cliente <strong>${clientName}</strong> (${email}) ha completado su cuestionario de perfil de inversor.
              </p>
              <div style="background-color: #f1f5f9; border-radius: 12px; padding: 20px; margin: 24px 0;">
                <h3 style="color: #334155; margin-top: 0;">Resultado</h3>
                <p style="font-size: 24px; font-weight: bold; color: #2563eb; margin: 8px 0;">
                  ${scores.profileLabel} (${Math.round(scores.global)}/100)
                </p>
                <table style="width: 100%; font-size: 14px; color: #475569;">
                  <tr><td style="padding: 4px 0;">Capacidad</td><td style="text-align: right; font-weight: 600;">${Math.round(scores.capacity)}/100</td></tr>
                  <tr><td style="padding: 4px 0;">Tolerancia</td><td style="text-align: right; font-weight: 600;">${Math.round(scores.tolerance)}/100</td></tr>
                  <tr><td style="padding: 4px 0;">Percepción</td><td style="text-align: right; font-weight: 600;">${Math.round(scores.perception)}/100</td></tr>
                  <tr><td style="padding: 4px 0;">Comportamiento</td><td style="text-align: right; font-weight: 600;">${Math.round(scores.composure)}/100</td></tr>
                </table>
              </div>
              <div style="text-align: center; margin: 32px 0;">
                <a href="${appUrl}/clients"
                   style="background-color: #2563eb; color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px; display: inline-block;">
                  Ver clientes
                </a>
              </div>
            </div>
          `,
        });
        if (emailError) {
          console.error("Resend error:", JSON.stringify(emailError));
        }
      }
    } catch (notifyError) {
      console.error("Error sending advisor notification:", notifyError);
    }

    // In-app notification for advisor
    try {
      const advisorIdForNotif = advisorId || existingClient.asesor_id;
      if (advisorIdForNotif) {
        const { data: clientData } = await supabase
          .from("clients")
          .select("nombre, apellido")
          .eq("id", clientId)
          .single();
        const name = clientData
          ? `${clientData.nombre} ${clientData.apellido || ""}`.trim()
          : email;

        await createNotification(supabase, {
          advisorId: advisorIdForNotif,
          clientId,
          type: "questionnaire_completed",
          title: "Cuestionario de riesgo completado",
          body: `${name} — Perfil ${scores.profileLabel} (${Math.round(scores.global)}/100)`,
          link: `/clients?id=${clientId}`,
        });
      }
    } catch (notifError) {
      console.error("Error creating in-app notification:", notifError);
    }

    return NextResponse.json({ success: true, clientId });
  } catch (error) {
    console.error("Save risk profile error:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
