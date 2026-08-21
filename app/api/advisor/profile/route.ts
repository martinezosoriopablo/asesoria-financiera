// app/api/advisor/profile/route.ts

import { NextRequest, NextResponse } from "next/server";
import { requireAdvisor, createAdminClient } from "@/lib/auth/api-auth";
import { applyRateLimit } from "@/lib/rate-limit";
import { handleApiError } from "@/lib/api-response";

// GET - Obtener perfil del asesor autenticado
export async function GET(request: NextRequest) {
  const blocked = await applyRateLimit(request, "advisor-profile", { limit: 30, windowSeconds: 60 });
  if (blocked) return blocked;

  // Verificar autenticación - el email viene del usuario autenticado
  const { advisor, error: authError } = await requireAdvisor();
  if (authError) return authError;

  // requireAdvisor() trae columnas limitadas; sumamos los defaults de cobro
  const supabase = createAdminClient();
  const { data: defaults } = await supabase
    .from("advisors")
    .select("default_cobro_tipo, default_rebate_pct, default_advisory_fee_pct, default_comision_transaccion_pct")
    .eq("id", advisor!.id)
    .single();

  return NextResponse.json({
    success: true,
    advisor: { ...advisor, ...defaults },
  });
}

// PUT - Actualizar perfil del asesor autenticado
export async function PUT(request: NextRequest) {
  const blocked = await applyRateLimit(request, "advisor-profile-put", { limit: 10, windowSeconds: 60 });
  if (blocked) return blocked;

  // Verificar autenticación
  const { advisor, error: authError } = await requireAdvisor();
  if (authError) return authError;

  const supabase = createAdminClient();

  return handleApiError("advisor-profile-put", async () => {
    const body = await request.json();

    // Campos permitidos para actualización (whitelist)
    const allowedFields = ['nombre', 'apellido', 'telefono', 'especialidad', 'bio', 'linkedin_url', 'preferred_ai_model', 'contact_email',
      'default_cobro_tipo', 'default_rebate_pct', 'default_advisory_fee_pct', 'default_comision_transaccion_pct'];
    const updateData: Record<string, unknown> = {};

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field];
      }
    }

    // contact_email vacío se guarda como null (fallback al email de login)
    if (updateData.contact_email === '') {
      updateData.contact_email = null;
    }

    // defaults de cobro: strings vacíos → null
    for (const f of ['default_rebate_pct', 'default_advisory_fee_pct', 'default_comision_transaccion_pct'] as const) {
      if (updateData[f] === '') updateData[f] = null;
    }
    if (updateData.default_cobro_tipo === '') updateData.default_cobro_tipo = null;

    // Actualizar solo el perfil del asesor autenticado
    const { data: updatedAdvisor, error } = await supabase
      .from("advisors")
      .update(updateData)
      .eq("id", advisor!.id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({
      success: true,
      advisor: updatedAdvisor,
    });
  });
}
