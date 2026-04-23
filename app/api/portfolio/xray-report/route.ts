// app/api/portfolio/xray-report/route.ts
// Generates a professional radiografia report using Claude based on xray data

import { NextRequest, NextResponse } from "next/server";
import { requireAdvisor } from "@/lib/auth/api-auth";
import { applyRateLimit } from "@/lib/rate-limit";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";

interface XrayData {
  totalValue: number;
  allocation: {
    rentaVariable: { value: number; percent: number };
    rentaFija: { value: number; percent: number };
    balanceado: { value: number; percent: number };
    alternativos: { value: number; percent: number };
    otros: { value: number; percent: number };
  };
  tacPromedioPortfolio: number;
  costoAnualTotal: number;
  costoProyectado10Y: number;
  ahorroAnualPotencial: number;
  ahorroPotencial10Y: number;
  holdings: Array<{
    fundName: string;
    marketValue: number;
    weight: number;
    categoria: string;
    tac: number | null;
    matched: boolean;
    matchedFund: string | null;
    matchedAgf: string | null;
    cheaperAlternatives: Array<{
      nombre_fondo: string;
      nombre_agf: string;
      tac_sintetica: number;
      rent_12m: number | null;
    }>;
    potentialSavingAnnual: number | null;
  }>;
  holdingsConTac: number;
  holdingsSinTac: number;
  holdingsConAlternativa: number;
}

export async function POST(request: NextRequest) {
  const blocked = await applyRateLimit(request, "xray-report", { limit: 3, windowSeconds: 60 });
  if (blocked) return blocked;

  const { error: authError } = await requireAdvisor();
  if (authError) return authError;

  try {
    const { xrayData, clientName } = await request.json() as {
      xrayData: XrayData;
      clientName?: string;
    };

    if (!xrayData || !xrayData.holdings) {
      return NextResponse.json({ success: false, error: "xrayData is required" }, { status: 400 });
    }

    // Build a data summary for the prompt
    const allocationSummary = [
      xrayData.allocation.rentaVariable.percent > 0 && `Renta Variable: ${xrayData.allocation.rentaVariable.percent.toFixed(1)}%`,
      xrayData.allocation.rentaFija.percent > 0 && `Renta Fija: ${xrayData.allocation.rentaFija.percent.toFixed(1)}%`,
      xrayData.allocation.balanceado.percent > 0 && `Balanceado: ${xrayData.allocation.balanceado.percent.toFixed(1)}%`,
      xrayData.allocation.alternativos.percent > 0 && `Alternativos: ${xrayData.allocation.alternativos.percent.toFixed(1)}%`,
      xrayData.allocation.otros.percent > 0 && `Otros: ${xrayData.allocation.otros.percent.toFixed(1)}%`,
    ].filter(Boolean).join(", ");

    const holdingsSummary = xrayData.holdings
      .sort((a, b) => b.weight - a.weight)
      .map(h => {
        const tacStr = h.tac !== null ? `TAC ${h.tac.toFixed(2)}%` : "TAC desconocido";
        const altStr = h.cheaperAlternatives.length > 0
          ? `(hay ${h.cheaperAlternatives.length} alternativa(s) más barata(s), ahorro ~$${(h.potentialSavingAnnual || 0).toLocaleString("es-CL")}/año)`
          : "";
        return `- ${h.fundName} [${h.categoria}]: ${h.weight.toFixed(1)}% del portafolio, $${h.marketValue.toLocaleString("es-CL")}, ${tacStr} ${altStr}`;
      })
      .join("\n");

    // Count expensive funds
    const expensiveFunds = xrayData.holdings.filter(h => h.tac !== null && h.tac > 2);
    const concentratedHoldings = xrayData.holdings.filter(h => h.weight > 25);

    const prompt = `Eres un asesor financiero chileno experto. Genera un informe profesional de radiografía de portafolio basado en los siguientes datos.

DATOS DEL PORTAFOLIO${clientName ? ` — Cliente: ${clientName}` : ""}:

Valor Total: $${xrayData.totalValue.toLocaleString("es-CL")}
Composición: ${allocationSummary}
TAC Promedio Ponderado: ${xrayData.tacPromedioPortfolio.toFixed(2)}%
Costo Anual Total: $${xrayData.costoAnualTotal.toLocaleString("es-CL")}
Costo Proyectado 10 años: $${xrayData.costoProyectado10Y.toLocaleString("es-CL")}
Ahorro Potencial Anual: $${xrayData.ahorroAnualPotencial.toLocaleString("es-CL")}
Holdings con datos TAC: ${xrayData.holdingsConTac}/${xrayData.holdings.length}
Holdings con alternativa más barata: ${xrayData.holdingsConAlternativa}
Fondos con TAC > 2%: ${expensiveFunds.length}
Holdings concentrados (>25%): ${concentratedHoldings.length}

DETALLE DE HOLDINGS:
${holdingsSummary}

FORMATO DEL INFORME (usa exactamente estas secciones con ##):

## Resumen Ejecutivo
(2-3 oraciones describiendo el portafolio del cliente de forma concisa y profesional)

## Composición y Diversificación
(Análisis de la distribución por clase de activo. ¿Está bien diversificado? ¿Hay concentración excesiva en algún holding o clase?)

## Análisis de Costos
(TAC promedio del portafolio, comparación con el mercado, fondos más caros, impacto de costos a 10 años)

## Observaciones
(Puntos críticos a destacar: fondos muy caros, concentración, falta de diversificación, oportunidades)

## Recomendaciones
(3-5 recomendaciones concretas y accionables basadas en los datos)

REGLAS:
- Escribe en español chileno profesional (no coloquial)
- Sé específico: menciona nombres de fondos cuando sea relevante
- Enfócate en datos concretos, no generalidades
- No uses emojis
- No inventes datos que no están en la información proporcionada
- Sé directo y conciso, cada sección máximo 4-5 líneas
- Las recomendaciones deben ser concretas (ej: "Evaluar reemplazar X por una alternativa con menor TAC")`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2048,
        messages: [
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error("Claude API error:", errorData);
      throw new Error("Error al generar informe con Claude");
    }

    const data = await response.json();
    const report = data.content.find((c: { type: string; text?: string }) => c.type === "text")?.text || "";

    return NextResponse.json({ success: true, report });
  } catch (error) {
    console.error("Error generating xray report:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Error al generar informe" },
      { status: 500 }
    );
  }
}
