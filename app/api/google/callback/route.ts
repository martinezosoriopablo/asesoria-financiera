// app/api/google/callback/route.ts
// Callback de OAuth para Google Calendar

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { exchangeCodeForTokens } from "@/lib/google/calendar-client";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state"); // advisor_id
  const error = searchParams.get("error");

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://asesoria-financiera.vercel.app";

  // Manejar error de autorización
  if (error) {
    console.error("Error en OAuth de Google:", error);
    return NextResponse.redirect(
      `${appUrl}/advisor?google_error=${encodeURIComponent("Acceso denegado a Google Calendar")}`
    );
  }

  // Verificar que tenemos código y state
  if (!code || !state) {
    return NextResponse.redirect(
      `${appUrl}/advisor?google_error=${encodeURIComponent("Parámetros de autorización inválidos")}`
    );
  }

  const advisorId = state;

  try {
    // Intercambiar código por tokens
    const tokens = await exchangeCodeForTokens(code);

    // Guardar tokens en la base de datos
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Verificar que el advisor existe
    const { data: advisor, error: advisorError } = await supabase
      .from("advisors")
      .select("id")
      .eq("id", advisorId)
      .single();

    if (advisorError || !advisor) {
      console.error("Advisor no encontrado:", advisorId);
      return NextResponse.redirect(
        `${appUrl}/advisor?google_error=${encodeURIComponent("Asesor no encontrado")}`
      );
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
      return NextResponse.redirect(
        `${appUrl}/advisor?google_error=${encodeURIComponent("Error guardando autorización")}`
      );
    }

    // Redirigir con éxito
    return NextResponse.redirect(
      `${appUrl}/advisor?google_success=true`
    );
  } catch (err) {
    console.error("Error en callback de Google:", err);
    return NextResponse.redirect(
      `${appUrl}/advisor?google_error=${encodeURIComponent("Error conectando con Google Calendar")}`
    );
  }
}
