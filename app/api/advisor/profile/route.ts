// app/api/advisor/profile/route.ts

import { NextRequest, NextResponse } from "next/server";
import { requireAdvisor, createAdminClient } from "@/lib/auth/api-auth";
import { applyRateLimit } from "@/lib/rate-limit";

// GET - Obtener perfil del asesor autenticado
export async function GET(request: NextRequest) {
  const blocked = applyRateLimit(request, "advisor-profile", { limit: 30, windowSeconds: 60 });
  if (blocked) return blocked;

  // Verificar autenticación - el email viene del usuario autenticado
  const { advisor, error: authError } = await requireAdvisor();
  if (authError) return authError;

  return NextResponse.json({
    success: true,
    advisor: advisor,
  });
}

// PUT - Actualizar perfil del asesor autenticado
export async function PUT(request: NextRequest) {
  const blocked = applyRateLimit(request, "advisor-profile-put", { limit: 10, windowSeconds: 60 });
  if (blocked) return blocked;

  // Verificar autenticación
  const { advisor, error: authError } = await requireAdvisor();
  if (authError) return authError;

  const supabase = createAdminClient();

  try {
    const body = await request.json();

    // Campos permitidos para actualización (whitelist)
    const allowedFields = ['nombre', 'apellido', 'telefono', 'especialidad', 'bio', 'linkedin_url'];
    const updateData: Record<string, unknown> = {};

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field];
      }
    }

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
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error al actualizar perfil";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
