// GET /api/questionnaire-link?email=…&advisor=…
// Devuelve el MISMO link firmado (HMAC) que envía send-questionnaire, pero SIN
// enviar correo. Sirve para que el asesor copie el link y complete el cuestionario
// en vivo (demo) o se lo pase al cliente por otro medio, sin depender de la entrega
// de email. Mismo token → válido en /api/save-risk-profile.
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { requireAdvisor } from "@/lib/auth/api-auth";
import { applyRateLimit } from "@/lib/rate-limit";
import { handleApiError } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const blocked = await applyRateLimit(req, "questionnaire-link", { limit: 30, windowSeconds: 60 });
  if (blocked) return blocked;

  const { error: authError } = await requireAdvisor();
  if (authError) return authError;

  return handleApiError("questionnaire-link-get", async () => {
    const email = req.nextUrl.searchParams.get("email");
    const advisorEmail = req.nextUrl.searchParams.get("advisor");

    if (!email) {
      return NextResponse.json({ error: "Email es requerido" }, { status: 400 });
    }

    const hmacSecret = process.env.HMAC_SECRET || process.env.CRON_SECRET;
    if (!hmacSecret) {
      return NextResponse.json({ error: "Configuración de servidor incompleta" }, { status: 500 });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const tokenPayload = advisorEmail ? `${email}:${advisorEmail}` : email;
    const token = crypto.createHmac("sha256", hmacSecret).update(tokenPayload).digest("hex");
    const link = `${appUrl}/mi-perfil-inversor?email=${encodeURIComponent(email)}${advisorEmail ? `&advisor=${encodeURIComponent(advisorEmail)}` : ""}&token=${token}`;

    return NextResponse.json({ success: true, link });
  });
}
