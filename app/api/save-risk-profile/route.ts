import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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

    return NextResponse.json({ success: true, clientId });
  } catch (err) {
    console.error("Save risk profile error:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
