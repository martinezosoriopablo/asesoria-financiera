import { NextRequest } from "next/server";
import { requireAdvisor, createAdminClient } from "@/lib/auth/api-auth";
import { applyRateLimit } from "@/lib/rate-limit";
import { successResponse, errorResponse, handleApiError } from "@/lib/api-response";
import { buildRadiografiaHTML, type RadiografiaEmailData } from "@/lib/radiografia-email";
import { Resend } from "resend";

export async function POST(request: NextRequest) {
  const blocked = await applyRateLimit(request, "radiografia-send-email", { limit: 5 });
  if (blocked) return blocked;

  const { advisor, error: authError } = await requireAdvisor();
  if (authError) return authError;

  return handleApiError("radiografia-send-email", async () => {
    const body = await request.json();
    const { clientId, recipientEmail, radiografiaData } = body as {
      clientId: string;
      recipientEmail: string;
      radiografiaData: RadiografiaEmailData;
    };

    if (!clientId || !recipientEmail || !radiografiaData) {
      return errorResponse("Datos requeridos: clientId, recipientEmail, radiografiaData", 400);
    }

    // Validate email format
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
      return errorResponse("Email invalido", 400);
    }

    // Validate client belongs to advisor
    const supabase = createAdminClient();
    const { data: client } = await supabase
      .from("clients")
      .select("id, nombre")
      .eq("id", clientId)
      .eq("asesor_id", advisor!.id)
      .single();

    if (!client) {
      return errorResponse("Cliente no encontrado", 404);
    }

    // Build HTML
    const html = buildRadiografiaHTML(radiografiaData);

    // Send via Resend
    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) {
      return errorResponse("Email service no configurado", 500);
    }

    const resend = new Resend(resendKey);
    const senderEmail = process.env.SENDER_EMAIL || "noreply@greybark.cl";

    const { data: emailResult, error: emailError } = await resend.emails.send({
      from: `Greybark Advisors <${senderEmail}>`,
      to: recipientEmail,
      subject: `Radiografia de Cartera — ${radiografiaData.clientName} — ${radiografiaData.reportDate}`,
      html,
    });

    if (emailError) {
      console.error("Resend error:", emailError);
      return errorResponse("Error al enviar email", 500);
    }

    return successResponse({
      messageId: emailResult?.id || "sent",
    });
  });
}
