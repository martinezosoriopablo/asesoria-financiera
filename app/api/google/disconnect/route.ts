// app/api/google/disconnect/route.ts
// Desconecta Google Calendar del advisor

import { NextResponse } from "next/server";
import { requireAdvisor } from "@/lib/auth/api-auth";
import { revokeGoogleAccess } from "@/lib/google/calendar-client";

export async function POST() {
  // Verificar autenticación
  const { advisor, error: authError } = await requireAdvisor();
  if (authError) return authError;

  try {
    const success = await revokeGoogleAccess(advisor!.id);

    if (!success) {
      return NextResponse.json(
        { success: false, error: "Error desconectando Google Calendar" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Google Calendar desconectado exitosamente",
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error desconectando";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
