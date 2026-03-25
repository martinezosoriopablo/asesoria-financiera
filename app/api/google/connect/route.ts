// app/api/google/connect/route.ts
// Inicia el flujo OAuth para conectar Google Calendar

import { NextRequest, NextResponse } from "next/server";
import { requireAdvisor } from "@/lib/auth/api-auth";
import { isGoogleCalendarConfigured, getGoogleAuthUrl } from "@/lib/google/calendar-client";
import { applyRateLimit } from "@/lib/rate-limit";

export async function GET(request: NextRequest) {
  const blocked = applyRateLimit(request, "google-connect", { limit: 30, windowSeconds: 60 });
  if (blocked) return blocked;

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

  // Generate CSRF state token and store advisor_id in cookie
  const csrfState = crypto.randomUUID();
  const authUrl = getGoogleAuthUrl(csrfState);

  const response = NextResponse.json({
    success: true,
    authUrl,
  });

  // Store CSRF state + advisor_id in an httpOnly cookie for validation in callback
  response.cookies.set("google_oauth_state", JSON.stringify({
    state: csrfState,
    advisorId: advisor!.id,
  }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/google/callback",
    maxAge: 600, // 10 minutes — enough time to complete the OAuth flow
  });

  return response;
}
