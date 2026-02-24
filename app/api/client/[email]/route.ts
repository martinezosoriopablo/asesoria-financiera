import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ email: string }> }
) {
  try {
    const { email } = await params;

    if (!email || email.trim() === "") {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Buscar el cliente por email
    const { data: client, error: clientError } = await supabase
      .from("clients")
      .select("id, email, nombre, apellido")
      .eq("email", email)
      .single();

    if (clientError || !client) {
      return NextResponse.json(
        { error: "Client not found", details: clientError?.message },
        { status: 404 }
      );
    }

    // Buscar el perfil de riesgo más reciente del cliente
    const { data: riskProfiles, error: profileError } = await supabase
      .from("risk_profiles")
      .select("*")
      .eq("client_id", client.id)
      .order("created_at", { ascending: false })
      .limit(1);

    if (profileError || !riskProfiles || riskProfiles.length === 0) {
      return NextResponse.json(
        { error: "Risk profile not found for this client", details: profileError?.message },
        { status: 404 }
      );
    }

    const riskProfile = riskProfiles[0];

    const profile = {
      ...client,
      ...riskProfile,
    };

    return NextResponse.json({ profile }, { status: 200 });

  } catch (error) {
    console.error("API error:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
