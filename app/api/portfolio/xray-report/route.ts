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
    const { xrayData, clientName, advisoryFee } = await request.json() as {
      xrayData: XrayData;
      clientName?: string;
      advisoryFee?: number;
    };
    const fee = advisoryFee || 1.0;

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

    // Build proposal summary
    const proposal = (xrayData as { proposal?: { holdings: Array<{ originalFund: string; proposedFund: string; proposedAgf: string; currentTac: number | null; proposedTac: number; proposedRent12m: number | null; changed: boolean; weight: number; marketValue: number; tacSavingBps: number }>; currentTacPromedio: number; proposedTacPromedio: number; currentCostoAnual: number; proposedCostoAnual: number; ahorroFondosAnual: number } }).proposal;
    const proposalSummary = proposal ? proposal.holdings
      .filter(h => h.changed)
      .sort((a, b) => b.weight - a.weight)
      .map(h => `- ${h.originalFund.substring(0, 40)} (TAC ${(h.currentTac || 0).toFixed(2)}%) → ${h.proposedFund.substring(0, 40)} [${h.proposedAgf}] (TAC ${h.proposedTac.toFixed(2)}%, Rent 12M: ${h.proposedRent12m !== null ? (h.proposedRent12m * 100).toFixed(1) + "%" : "N/D"}, Ahorro: ${h.tacSavingBps} bps)`)
      .join("\n") : "";

    const feeAnual = Math.round(xrayData.totalValue * fee / 100);
    const costoTotalPropuesto = (proposal?.proposedCostoAnual || 0) + feeAnual;
    const ahorroNeto = (proposal?.currentCostoAnual || 0) - costoTotalPropuesto;

    const prompt = `Eres un asesor financiero chileno experto. Genera un informe profesional de radiografía de portafolio basado en los siguientes datos.

DATOS DEL PORTAFOLIO${clientName ? ` — Cliente: ${clientName}` : ""}:

Valor Total: $${xrayData.totalValue.toLocaleString("es-CL")}
Composición: ${allocationSummary}
TAC Promedio Ponderado: ${xrayData.tacPromedioPortfolio.toFixed(2)}%
Costo Anual Total (fondos): $${xrayData.costoAnualTotal.toLocaleString("es-CL")}
Costo Proyectado 10 años: $${xrayData.costoProyectado10Y.toLocaleString("es-CL")}
Holdings con datos TAC: ${xrayData.holdingsConTac}/${xrayData.holdings.length}
Holdings con alternativa más barata: ${xrayData.holdingsConAlternativa}
Fondos con TAC > 2%: ${expensiveFunds.length}
Holdings concentrados (>25%): ${concentratedHoldings.length}

DETALLE DE HOLDINGS:
${holdingsSummary}

${proposal ? `PROPUESTA DE OPTIMIZACIÓN:
TAC Promedio Actual: ${proposal.currentTacPromedio.toFixed(2)}%
TAC Promedio Propuesto (fondos): ${proposal.proposedTacPromedio.toFixed(2)}%
Advisory Fee: ${fee.toFixed(2)}%
Costo Total Propuesto (fondos + advisory fee): ${(proposal.proposedTacPromedio + fee).toFixed(2)}%
Ahorro en fondos: $${proposal.ahorroFondosAnual.toLocaleString("es-CL")}/año
Costo advisory fee: $${feeAnual.toLocaleString("es-CL")}/año
Ahorro neto para el cliente: $${ahorroNeto.toLocaleString("es-CL")}/año

CAMBIOS PROPUESTOS:
${proposalSummary || "Ningún cambio propuesto"}` : ""}

FORMATO DEL INFORME (usa exactamente estas secciones con ##):

## Resumen Ejecutivo
(2-3 oraciones describiendo el portafolio del cliente de forma concisa y profesional)

## Composición y Diversificación
(Análisis de la distribución por clase de activo. ¿Está bien diversificado? ¿Hay concentración excesiva en algún holding o clase?)

## Análisis de Costos
(TAC promedio del portafolio vs mercado. Fondos más caros. Impacto de costos a 10 años en pesos)

## Nuestra Propuesta
(Explica los cambios propuestos: qué fondos se reemplazan, por qué, y el ahorro total. Incluye que INCLUSO con el advisory fee de ${fee.toFixed(1)}%, el costo total es menor${ahorroNeto > 0 ? `, generando un ahorro neto de $${ahorroNeto.toLocaleString("es-CL")} anuales` : ""}. Menciona que los fondos propuestos tienen igual o mejor rendimiento)

## Observaciones
(Puntos críticos: fondos muy caros, concentración, oportunidades fiscales como APV)

## Recomendaciones
(3-5 recomendaciones concretas basadas en los datos)

REGLAS:
- Escribe en español chileno profesional (no coloquial)
- Sé específico: menciona nombres de fondos cuando sea relevante
- Enfócate en datos concretos, no generalidades
- No uses emojis
- No inventes datos que no están en la información proporcionada
- Sé directo y conciso, cada sección máximo 4-5 líneas
- La sección "Nuestra Propuesta" es CLAVE: es la propuesta de valor para el cliente
- Las recomendaciones deben ser concretas (ej: "Reemplazar X por Y, ahorrando Z anuales")`;

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
