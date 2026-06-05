// app/api/google/disconnect/route.ts
// Desconecta Google Calendar del advisor

import { NextRequest, NextResponse } from "next/server";
import { requireAdvisor } from "@/lib/auth/api-auth";
import { revokeGoogleAccess } from "@/lib/google/calendar-client";
import { applyRateLimit } from "@/lib/rate-limit";
import { handleApiError } from "@/lib/api-response";

export async function POST(request: NextRequest) {
  const blocked = await applyRateLimit(request, "google-disconnect", { limit: 10, windowSeconds: 60 });
  if (blocked) return blocked;

  // Verificar autenticación
  const { advisor, error: authError } = await requireAdvisor();
  if (authError) return authError;

  return handleApiError("google-disconnect-post", async () => {
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
  });
}
