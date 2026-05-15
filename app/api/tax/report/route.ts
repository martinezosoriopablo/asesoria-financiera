// app/api/tax/report/route.ts
import { NextRequest } from "next/server";
import { requireAdvisor, createAdminClient } from "@/lib/auth/api-auth";
import { applyRateLimit } from "@/lib/rate-limit";
import { successResponse, errorResponse, handleApiError } from "@/lib/api-response";
import { trackAIUsage } from "@/lib/ai-usage";
import type { ScenarioResult } from "@/lib/tax/types";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";

export async function POST(request: NextRequest) {
  const blocked = await applyRateLimit(request, "tax-report", { limit: 3, windowSeconds: 60 });
  if (blocked) return blocked;

  const { advisor, error: authError } = await requireAdvisor();
  if (authError) return authError;

  const supabase = createAdminClient();
  const { data: advisorProfile } = await supabase
    .from("advisors")
    .select("preferred_ai_model")
    .eq("id", advisor!.id)
    .single();

  const model = advisorProfile?.preferred_ai_model || "claude-sonnet-4-20250514";

  return handleApiError("tax-report", async () => {
    const { scenarios, selectedScenario, clientName, totalValueUF } = await request.json() as {
      scenarios: ScenarioResult[];
      selectedScenario: string;
      clientName?: string;
      totalValueUF: number;
    };

    if (!scenarios || scenarios.length === 0) {
      return errorResponse("Se requieren escenarios para generar informe", 400);
    }

    const selected = scenarios.find(s => s.nombre.startsWith(selectedScenario)) || scenarios.find(s => s.recomendado);

    const scenarioSummary = scenarios.map(s =>
      `- ${s.nombre}: Impuesto ${s.impuestoTotal_UF.toFixed(0)} UF, Ahorro TAC 10Y ${s.ahorroTAC_10Y_UF.toFixed(0)} UF, Alpha 10Y ${s.alphaReasignacion_10Y_UF.toFixed(0)} UF, Beneficio neto VPN ${s.beneficioNetoVPN_UF.toFixed(0)} UF${s.recomendado ? " (RECOMENDADO)" : ""}`
    ).join("\n");

    const planDetalle = selected ? selected.planAnual.map(y =>
      `Ano ${y.ano}: ${y.fondosAVender.length} ventas, ${y.fondosMLT.length} MLT, impuesto ${y.mitigacion.impuestoNeto_UF.toFixed(0)} UF`
    ).join("\n") : "";

    const prompt = `Eres un asesor financiero chileno experto en planificacion tributaria. Genera un informe profesional de estrategia de cambio de custodia.

CLIENTE${clientName ? ` (${clientName})` : ""}:
Valor total portafolio: ${totalValueUF.toFixed(0)} UF

COMPARACION DE ESCENARIOS:
${scenarioSummary}

ESCENARIO SELECCIONADO: ${selected?.nombre}
PLAN DE ACCION:
${planDetalle}

FORMATO DEL INFORME (usa exactamente estas secciones con ##):

## Resumen Ejecutivo
(2-3 oraciones sobre la situacion actual y la estrategia recomendada)

## Analisis Tributario
(Capa 1 — datos duros basados en ley vigente: regimen de cada posicion, impuesto calculado, exenciones aplicables. Citar articulos de ley.)

## Estrategia Recomendada
(Capa 2 — proyeccion con supuestos: los 3 pilares cuantificados, plan ano a ano, punto de equilibrio)

## Mitigacion Tributaria
(APV/DC recomendado, compensacion de perdidas, exencion Art. 17 N8 si aplica)

## Proximos Pasos
(3-4 acciones concretas)

## Disclaimers
(Rentabilidades son supuestos, no es asesoria tributaria, consultar tributarista, ley vigente a la fecha)

REGLAS:
- Espanol chileno profesional
- Distinguir Capa 1 (ley) de Capa 2 (supuestos del asesor)
- Cifras en UF
- No inventar datos
- Maximo 6 lineas por seccion`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 2048,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error("Claude API error:", errorData);
      throw new Error("Error al generar informe tributario");
    }

    const data = await response.json();

    if (data.usage) {
      trackAIUsage({
        advisorId: advisor!.id,
        inputTokens: data.usage.input_tokens,
        outputTokens: data.usage.output_tokens,
        model,
      });
    }

    const report = data.content.find((c: { type: string; text?: string }) => c.type === "text")?.text || "";

    return successResponse({ report });
  });
}
