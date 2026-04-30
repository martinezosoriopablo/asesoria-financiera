// GET /api/fondos-inversion/ficha?rut=7184 — Get ficha data for a Fondo de Inversión

import { NextRequest, NextResponse } from "next/server";
import { requireAdvisor, createAdminClient } from "@/lib/auth/api-auth";
import { applyRateLimit } from "@/lib/rate-limit";

export async function GET(request: NextRequest) {
  const blocked = await applyRateLimit(request, "fi-ficha-get", { limit: 30, windowSeconds: 60 });
  if (blocked) return blocked;

  const { error: authError } = await requireAdvisor();
  if (authError) return authError;

  const supabase = createAdminClient();
  const rut = request.nextUrl.searchParams.get("rut");

  if (!rut) {
    return NextResponse.json({ success: false, error: "rut requerido" }, { status: 400 });
  }

  // Get any ficha for this FI rut (there may be multiple series, just get the first)
  const { data: ficha } = await supabase
    .from("fi_fichas")
    .select("*")
    .eq("fi_rut", rut)
    .limit(1)
    .single();

  const extracted = ficha?.tac_serie != null ? {
    tac_serie: ficha.tac_serie ? Number(ficha.tac_serie) : null,
    nombre_fondo: ficha.nombre_fondo_pdf,
    serie_detectada: ficha.serie_detectada,
    rentabilidades: {
      rent_1m: ficha.rent_1m ? Number(ficha.rent_1m) : null,
      rent_3m: ficha.rent_3m ? Number(ficha.rent_3m) : null,
      rent_6m: ficha.rent_6m ? Number(ficha.rent_6m) : null,
      rent_12m: ficha.rent_12m ? Number(ficha.rent_12m) : null,
    },
    rescatable: ficha.rescatable,
    plazo_rescate: ficha.plazo_rescate,
    horizonte_inversion: ficha.horizonte_inversion,
    tolerancia_riesgo: ficha.tolerancia_riesgo,
    objetivo: ficha.objetivo,
  } : null;

  return NextResponse.json({
    success: true,
    ficha: ficha || null,
    extracted,
  });
}
