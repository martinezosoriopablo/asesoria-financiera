import { NextRequest } from "next/server";
import { requireAdvisor, createAdminClient } from "@/lib/auth/api-auth";
import { applyRateLimit } from "@/lib/rate-limit";
import { successResponse, errorResponse, handleApiError } from "@/lib/api-response";
import { trackAIUsage } from "@/lib/ai-usage";

export async function POST(request: NextRequest) {
  const blocked = await applyRateLimit(request, "radiografia-narrative", { limit: 5 });
  if (blocked) return blocked;

  const { advisor, error: authError } = await requireAdvisor();
  if (authError) return authError;

  return handleApiError("radiografia-narrative", async () => {
    const body = await request.json();
    const {
      allocation,
      observations,
      sectorBreakdown,
      totalValueCLP,
      perfilCliente,
      perfilModelo,
      notaComite,
      clientName,
    } = body as {
      allocation: Record<string, { actual: number; target: number; delta: number }>;
      observations: Array<{ severity: string; text: string }>;
      sectorBreakdown: Array<{ sector: string; actualPct: number; sleevePct: number | null; deltaPp: number }>;
      totalValueCLP: number;
      perfilCliente: string;
      perfilModelo: string;
      notaComite: string | null;
      clientName: string;
    };

    if (!allocation || !observations) {
      return errorResponse("Datos de portafolio requeridos", 400);
    }

    const supabase = createAdminClient();
    const { data: advisorRow } = await supabase
      .from("advisors")
      .select("preferred_ai_model")
      .eq("id", advisor!.id)
      .single();

    const model = advisorRow?.preferred_ai_model || "claude-sonnet-4-20250514";

    const ROLE_LABELS: Record<string, string> = {
      rv: "Renta Variable",
      rf: "Renta Fija",
      alt: "Alternativos",
      cash: "Caja",
    };

    const allocSummary = Object.entries(allocation)
      .map(([role, a]) => `- ${ROLE_LABELS[role] || role}: ${a.actual.toFixed(1)}% actual vs ${a.target.toFixed(1)}% modelo (${a.delta > 0 ? "+" : ""}${a.delta.toFixed(1)}pp)`)
      .join("\n");

    const obsSummary = observations.map((o) => `- [${o.severity.toUpperCase()}] ${o.text}`).join("\n");

    const sectorSummary = sectorBreakdown
      .filter((s) => Math.abs(s.deltaPp) > 2)
      .map((s) => `- ${s.sector}: ${s.actualPct.toFixed(1)}% actual${s.sleevePct != null ? ` vs ${s.sleevePct.toFixed(1)}% sleeve` : ""} (${s.deltaPp > 0 ? "+" : ""}${s.deltaPp.toFixed(1)}pp)`)
      .join("\n");

    const totalUSD = Math.round(totalValueCLP / 950);
    const prompt = `Eres un asesor financiero senior chileno redactando un diagnostico de cartera para tu cliente ${clientName}.

Datos del portafolio:
- Valor total: ~USD ${totalUSD.toLocaleString()} (CLP ${Math.round(totalValueCLP / 1e6).toLocaleString()}M)
- Perfil de riesgo del cliente: ${perfilCliente}
- Modelo asignado: ${perfilModelo}

Asignacion de activos:
${allocSummary}

Observaciones clave:
${obsSummary}

${sectorSummary ? `Desglose sectorial (desviaciones relevantes):\n${sectorSummary}` : ""}

${notaComite ? `Contexto del ultimo comite de inversiones:\n${notaComite}` : ""}

Redacta un diagnostico profesional de 2-3 parrafos cortos. Tono: directo, profesional, sin ser alarmista. Menciona riesgos concretos y oportunidades. No uses bullet points ni listas — escribe en prosa. No uses acentos. Tutea al cliente.`;

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return errorResponse("API key no configurada", 500);
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Claude API error:", errText);
      return errorResponse("Error al generar analisis", 500);
    }

    const result = await response.json();
    const narrative = result.content?.[0]?.text || "";
    const inputTokens = result.usage?.input_tokens || 0;
    const outputTokens = result.usage?.output_tokens || 0;

    trackAIUsage({
      advisorId: advisor!.id,
      inputTokens,
      outputTokens,
      model,
    }).catch(() => {});

    return successResponse({
      narrative,
      model,
      tokensUsed: inputTokens + outputTokens,
    });
  });
}
