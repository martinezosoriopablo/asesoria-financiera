// app/api/google/status/route.ts
// Verifica el estado de conexión con Google Calendar

import { NextResponse } from "next/server";
import { requireAdvisor, createAdminClient } from "@/lib/auth/api-auth";
import { isGoogleCalendarConfigured } from "@/lib/google/calendar-client";

export async function GET() {
  // Verificar autenticación
  const { advisor, error: authError } = await requireAdvisor();
  if (authError) return authError;

  const supabase = createAdminClient();

  try {
    // Verificar si Google Calendar está configurado globalmente
    const configured = isGoogleCalendarConfigured();

    if (!configured) {
      return NextResponse.json({
        success: true,
        configured: false,
        connected: false,
        message: "Google Calendar no está configurado en el sistema",
      });
    }

    // Verificar si el advisor tiene tokens guardados
    const { data: tokenData, error } = await supabase
      .from("advisor_google_tokens")
      .select("sync_enabled, created_at, updated_at")
      .eq("advisor_id", advisor!.id)
      .single();

    if (error || !tokenData) {
      return NextResponse.json({
        success: true,
        configured: true,
        connected: false,
        message: "Google Calendar no está conectado",
      });
    }

    return NextResponse.json({
      success: true,
      configured: true,
      connected: true,
      syncEnabled: tokenData.sync_enabled,
      connectedAt: tokenData.created_at,
      lastUpdated: tokenData.updated_at,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error verificando estado";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
