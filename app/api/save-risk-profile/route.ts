import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

export const dynamic = "force-dynamic";

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(req: NextRequest) {
  try {
    const { email, scores, responses, retirementData, projection } = await req.json();

    if (!email || !scores) {
      return NextResponse.json({ error: "Datos incompletos" }, { status: 400 });
    }

    const supabase = getServiceClient();

    // Find or create client
    const { data: existingClient } = await supabase
      .from("clients")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    let clientId: string;

    if (existingClient) {
      clientId = existingClient.id;
    } else {
      const { data: newClient, error: newClientError } = await supabase
        .from("clients")
        .insert({ email, full_name: email })
        .select("id")
        .single();

      if (newClientError || !newClient) {
        console.error("Error creating client:", newClientError);
        return NextResponse.json({ error: "Error creando el cliente" }, { status: 500 });
      }
      clientId = newClient.id;
    }

    // Build extended responses
    const extendedResponses = {
      ...responses,
      goal_type: responses["goal_1_objetivo"] ?? null,
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

    // Notify advisor by email
    try {
      const resend = new Resend(process.env.RESEND_API_KEY);

      // Find the advisor linked to this client
      const { data: client } = await supabase
        .from("clients")
        .select("asesor_id, full_name")
        .eq("id", clientId)
        .single();

      let advisorEmail: string | null = null;

      if (client?.asesor_id) {
        const { data: advisor } = await supabase
          .from("advisors")
          .select("email")
          .eq("id", client.asesor_id)
          .single();
        advisorEmail = advisor?.email || null;
      }

      // Fallback: get first advisor if no specific one assigned
      if (!advisorEmail) {
        const { data: firstAdvisor } = await supabase
          .from("advisors")
          .select("email")
          .limit(1)
          .single();
        advisorEmail = firstAdvisor?.email || null;
      }

      if (advisorEmail) {
        const clientName = client?.full_name || email;
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://asesoria-financiera.vercel.app";

        await resend.emails.send({
          from: "Asesoría Financiera <send@greybark.com>",
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
        console.log("Advisor notification sent to:", advisorEmail);
      }
    } catch (notifyError) {
      // Don't fail the request if notification fails
      console.error("Error sending advisor notification:", notifyError);
    }

    return NextResponse.json({ success: true, clientId });
  } catch (err) {
    console.error("Save risk profile error:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
