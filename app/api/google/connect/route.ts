// app/api/google/connect/route.ts
// Inicia el flujo OAuth para conectar Google Calendar

import { NextResponse } from "next/server";
import { requireAdvisor } from "@/lib/auth/api-auth";
import { isGoogleCalendarConfigured, getGoogleAuthUrl } from "@/lib/google/calendar-client";

export async function GET() {
  // Verificar autenticación
  const { advisor, error: authError } = await requireAdvisor();
  if (authError) return authError;

  // Verificar si Google Calendar está configurado
  if (!isGoogleCalendarConfigured()) {
    return NextResponse.json(
      {
        success: false,
        error: "Google Calendar no está configurado",
        message: "Contacte al administrador para configurar las credenciales de Google",
      },
      { status: 503 }
    );
  }

  // Generar URL de autorización
  const authUrl = getGoogleAuthUrl(advisor!.id);

  return NextResponse.json({
    success: true,
    authUrl,
  });
}
