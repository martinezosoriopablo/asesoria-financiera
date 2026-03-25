// app/api/google/callback/route.ts
// Callback de OAuth para Google Calendar

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/auth/api-auth";
import { exchangeCodeForTokens } from "@/lib/google/calendar-client";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://asesoria-financiera.vercel.app";

  // Manejar error de autorización
  if (error) {
    console.error("Error en OAuth de Google:", error);
    const response = NextResponse.redirect(
      `${appUrl}/advisor?google_error=${encodeURIComponent("Acceso denegado a Google Calendar")}`
    );
    response.cookies.delete("google_oauth_state");
    return response;
  }

  // Verificar que tenemos código y state
  if (!code || !state) {
    const response = NextResponse.redirect(
      `${appUrl}/advisor?google_error=${encodeURIComponent("Parámetros de autorización inválidos")}`
    );
    response.cookies.delete("google_oauth_state");
    return response;
  }

  // Validate CSRF state against cookie
  const oauthStateCookie = request.cookies.get("google_oauth_state")?.value;
  if (!oauthStateCookie) {
    console.error("OAuth state cookie missing — possible CSRF attack");
    return new NextResponse("Forbidden", { status: 403 });
  }

  let storedState: string;
  let advisorId: string;
  try {
    const parsed = JSON.parse(oauthStateCookie);
    storedState = parsed.state;
    advisorId = parsed.advisorId;
  } catch {
    console.error("Malformed OAuth state cookie");
    return new NextResponse("Forbidden", { status: 403 });
  }

  if (!storedState || !advisorId || state !== storedState) {
    console.error("OAuth state mismatch — possible CSRF attack");
    return new NextResponse("Forbidden", { status: 403 });
  }

  try {
    // Intercambiar código por tokens
    const tokens = await exchangeCodeForTokens(code);

    // Guardar tokens en la base de datos
    const supabase = createAdminClient();

    // Verificar que el advisor existe
    const { data: advisor, error: advisorError } = await supabase
      .from("advisors")
      .select("id")
      .eq("id", advisorId)
      .single();

    if (advisorError || !advisor) {
      console.error("Advisor no encontrado:", advisorId);
      const response = NextResponse.redirect(
        `${appUrl}/advisor?google_error=${encodeURIComponent("Asesor no encontrado")}`
      );
      response.cookies.delete("google_oauth_state");
      return response;
    }

    // Insertar o actualizar tokens (upsert)
    const { error: upsertError } = await supabase
      .from("advisor_google_tokens")
      .upsert(
        {
          advisor_id: advisorId,
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          token_expiry: tokens.token_expiry.toISOString(),
          sync_enabled: true,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "advisor_id",
        }
      );

    if (upsertError) {
      console.error("Error guardando tokens:", upsertError);
      const response = NextResponse.redirect(
        `${appUrl}/advisor?google_error=${encodeURIComponent("Error guardando autorización")}`
      );
      response.cookies.delete("google_oauth_state");
      return response;
    }

    // Redirigir con éxito, clearing the state cookie
    const response = NextResponse.redirect(
      `${appUrl}/advisor?google_success=true`
    );
    response.cookies.delete("google_oauth_state");
    return response;
  } catch (err) {
    console.error("Error en callback de Google:", err);
    const response = NextResponse.redirect(
      `${appUrl}/advisor?google_error=${encodeURIComponent("Error conectando con Google Calendar")}`
    );
    response.cookies.delete("google_oauth_state");
    return response;
  }
}
