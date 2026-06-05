import { NextRequest, NextResponse } from "next/server";
import { requireClient } from "@/lib/auth/require-client";
import { createAdminClient } from "@/lib/auth/api-auth";
import { applyRateLimit } from "@/lib/rate-limit";
import { handleApiError } from "@/lib/api-response";

export async function GET(request: NextRequest) {
  const blocked = await applyRateLimit(request, "portal-servicios", { limit: 20, windowSeconds: 60 });
  if (blocked) return blocked;
  const { client, error: authError } = await requireClient();
  if (authError) return authError;
  return handleApiError("portal-servicios-get", async () => {
    const supabase = createAdminClient();

    // Load servicios_adicionales and asesor_id
    const { data: clientData, error: clientError } = await supabase
      .from("clients")
      .select("servicios_adicionales, asesor_id")
      .eq("id", client!.id)
      .single();

    if (clientError || !clientData) {
      return NextResponse.json(
        { success: false, error: "Cliente no encontrado" },
        { status: 404 }
      );
    }

    const servicios = clientData.servicios_adicionales || null;

    // Load advisor info
    let advisor = null;
    if (clientData.asesor_id) {
      const { data: advisorData } = await supabase
        .from("advisors")
        .select("id, nombre, apellido, empresa")
        .eq("id", clientData.asesor_id)
        .single();

      if (advisorData) {
        advisor = advisorData;
      }
    }

    return NextResponse.json({ success: true, servicios, advisor });
  });
}
