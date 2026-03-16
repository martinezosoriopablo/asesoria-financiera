import { NextRequest, NextResponse } from "next/server";
import { requireAdvisor, createAdminClient } from "@/lib/auth/api-auth";
import { applyRateLimit } from "@/lib/rate-limit";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ email: string }> }
) {
  const blocked = applyRateLimit(request, "client-by-email", { limit: 30, windowSeconds: 60 });
  if (blocked) return blocked;

  const { error: authError } = await requireAdvisor();
  if (authError) return authError;

  try {
    const { email } = await params;

    if (!email || email.trim() === "") {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // Buscar el cliente por email
    const { data: client, error: clientError } = await supabase
      .from("clients")
      .select("id, email, nombre, apellido")
      .eq("email", email)
      .single();

    if (clientError || !client) {
      return NextResponse.json(
        { error: "Client not found" },
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
        { error: "Risk profile not found for this client" },
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
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
