// app/api/portfolio/xray-report/route.ts
// Generates a professional radiografia report using Claude based on xray data

import { NextRequest, NextResponse } from "next/server";
import { requireAdvisor, createAdminClient } from "@/lib/auth/api-auth";
import { applyRateLimit } from "@/lib/rate-limit";
import { trackAIUsage } from "@/lib/ai-usage";
import { handleApiError } from "@/lib/api-response";

export const maxDuration = 60;

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

  const { advisor, error: authError } = await requireAdvisor();
  if (authError) return authError;

  // Fetch advisor's preferred AI model
  const supabase = createAdminClient();
  const { data: advisorProfile } = await supabase
    .from("advisors")
    .select("preferred_ai_model")
    .eq("id", advisor!.id)
    .single();

  const model = advisorProfile?.preferred_ai_model || "claude-sonnet-4-20250514";

  return handleApiError("xray-report-post", async () => {
    const { xrayData, clientName, advisoryFee, customContext, ufValue, usdValue, cartolaDate, currentValue, currentValueDate, modelData } = await request.json() as {
      xrayData: XrayData;
      clientName?: string;
      advisoryFee?: number;
      customContext?: string;
      ufValue?: number;
      usdValue?: number;
      cartolaDate?: string;
      currentValue?: number;
      currentValueDate?: string;
      modelData?: {
        perfil: string;
        reportDate: string;
        notaComite: string | null;
        deviations: Array<{
          categoria: string;
          targetWeight: number;
          actualWeight: number;
          deviation: number;
          estado: string;
          etfRef: string | null;
          tesis: string | null;
          mappedFund: { fundName: string | null; ticker: string | null } | null;
        }>;
        custodian: { name: string; type: string; commissionPct: number } | null;
      };
    };
    const fee = advisoryFee || 1.0;

    if (!xrayData || !xrayData.holdings) {
      return NextResponse.json({ success: false, error: "xrayData is required" }, { status: 400 });
    }

    // === Build structured data for the prompt ===

    const allocationSummary = [
      xrayData.allocation.rentaVariable.percent > 0 && `Renta Variable: ${xrayData.allocation.rentaVariable.percent.toFixed(1)}%`,
      xrayData.allocation.rentaFija.percent > 0 && `Renta Fija: ${xrayData.allocation.rentaFija.percent.toFixed(1)}%`,
      xrayData.allocation.balanceado.percent > 0 && `Balanceado: ${xrayData.allocation.balanceado.percent.toFixed(1)}%`,
      xrayData.allocation.alternativos.percent > 0 && `Alternativos: ${xrayData.allocation.alternativos.percent.toFixed(1)}%`,
      xrayData.allocation.otros.percent > 0 && `Otros: ${xrayData.allocation.otros.percent.toFixed(1)}%`,
    ].filter(Boolean).join(", ");

    // Current holdings detail (what the client HAS today)
    const holdingsSummary = xrayData.holdings
      .sort((a, b) => (b.weight || 0) - (a.weight || 0))
      .map(h => {
        const tacStr = h.tac != null ? `TAC ${Number(h.tac).toFixed(2)}%` : "TAC no disponible";
        return `- ${h.fundName} [${h.categoria || "Otros"}]: ${(h.weight || 0).toFixed(1)}% del portafolio, $${(h.marketValue || 0).toLocaleString("es-CL")}, ${tacStr}`;
      })
      .join("\n");

    const expensiveFunds = xrayData.holdings.filter(h => h.tac != null && h.tac > 2);
    const concentratedHoldings = xrayData.holdings.filter(h => (h.weight || 0) > 25);

    // Proposal detail (what we PROPOSE as reference comparison)
    const proposal = (xrayData as { proposal?: { holdings: Array<{ originalFund: string; proposedFund: string; proposedAgf: string; proposedSerie: string; currentTac: number | null; proposedTac: number; currentRent12m: number | null; proposedRent12m: number | null; changed: boolean; weight: number; marketValue: number; tacSavingBps: number }>; currentTacPromedio: number; proposedTacPromedio: number; currentCostoAnual: number; proposedCostoAnual: number; ahorroFondosAnual: number; currentRent12m?: number | null; proposedRent12m?: number | null } }).proposal;

    const feeAnual = Math.round(xrayData.totalValue * fee / 100);
    const costoTotalPropuesto = (proposal?.proposedCostoAnual || 0) + feeAnual;
    const ahorroNeto = (proposal?.currentCostoAnual || 0) - costoTotalPropuesto;

    // Build per-position comparison table
    const positionComparison = proposal ? proposal.holdings
      .sort((a, b) => (b.weight || 0) - (a.weight || 0))
      .map(h => {
        const w = (h.weight || 0).toFixed(1);
        const currentTacStr = h.currentTac != null ? `${Number(h.currentTac).toFixed(2)}%` : "N/D";
        const currentRentStr = h.currentRent12m != null ? `Rent12M: ${Number(h.currentRent12m).toFixed(1)}%` : "";
        if (h.changed) {
          const proposedRentStr = h.proposedRent12m != null ? `, Rent12M: ${Number(h.proposedRent12m).toFixed(1)}%` : "";
          return `- ${(h.originalFund || "").substring(0, 40)} (${w}%, TAC: ${currentTacStr}${currentRentStr ? `, ${currentRentStr}` : ""}) → ${(h.proposedFund || "").substring(0, 40)} [${h.proposedAgf || ""}${h.proposedSerie ? ` serie ${h.proposedSerie}` : ""}] (TAC: ${(h.proposedTac || 0).toFixed(2)}%${proposedRentStr}, ahorro: ${h.tacSavingBps || 0} bps)`;
        }
        return `- ${(h.originalFund || "").substring(0, 40)} (${w}%, TAC: ${currentTacStr}${currentRentStr ? `, ${currentRentStr}` : ""}) → se mantiene`;
      })
      .join("\n") : "";

    // Build model portfolio section for prompt
    let modelSection = "";
    if (modelData && modelData.deviations.length > 0) {
      const perfilLabel = modelData.perfil.replace(/_/g, " ");
      const deviationRows = modelData.deviations
        .map((d) => {
          const fundStr = d.mappedFund
            ? ` -> Fondo recomendado: ${d.mappedFund.fundName || d.mappedFund.ticker || "N/D"}`
            : "";
          return `- ${d.categoria}: Target ${d.targetWeight}%, Actual ${d.actualWeight}%, Desviacion ${d.deviation > 0 ? "+" : ""}${d.deviation}% [${d.estado}]${fundStr}${d.tesis ? `\n  Tesis: ${d.tesis}` : ""}`;
        })
        .join("\n");

      const custodianStr = modelData.custodian
        ? `\nCustodio: ${modelData.custodian.name} (${modelData.custodian.type}), Comision por operacion: ${modelData.custodian.commissionPct}%`
        : "";

      modelSection = `
CARTERA MODELO DEL COMITE (Perfil: ${perfilLabel}, Fecha: ${modelData.reportDate}):
${modelData.notaComite ? `Nota del comite: "${modelData.notaComite}"` : ""}

DESVIACIONES ACTUAL VS MODELO:
${deviationRows}
${custodianStr}

NOTA: Esta es la recomendacion base del comite. Los fondos definitivos se ajustaran segun la situacion particular del cliente.
`;
    }

    const formatSections = modelData ? `FORMATO DEL INFORME (usa exactamente estas secciones con ##):

## Resumen Ejecutivo
(2-3 oraciones. Describe que tiene el cliente hoy, como se compara vs el modelo del comite, y que podemos mejorar)

## Cartera Modelo vs Actual
(Tabla de desviaciones por categoria. Indica cuales estan sobre/subponderadas. Explica la vision del comite.)

## Posiciones del Cliente
(Analiza cada posicion relevante vs lo que recomienda el modelo)

## Analisis de Costos
(Costo actual vs propuesto. Si hay datos de comision del custodio, incluirlos. Cuantifica impacto a 10 anos)

## Propuesta de Ajuste
(Cambios especificos por categoria, con fondo recomendado, tesis del comite, y costo estimado de cada movimiento)

## Consideraciones Tributarias
(Si AGF->AGF misma familia: sin costo tributario. Si hay rescates con ganancia: advertir y sugerir usar simulador tributario. Si custodio es internacional: mencionar declaracion jurada)

## Vision del Comite
(Resumir las tesis relevantes del comite para este perfil de riesgo)

## Proximos Pasos
(3-4 acciones concretas: reunion, confirmar fondos, ejecutar, seguimiento)` :
`FORMATO DEL INFORME (usa exactamente estas secciones con ##):

## Resumen Ejecutivo
(2-3 oraciones. Describe que tiene el cliente hoy, cuanto le cuesta, y que podemos mejorar)

## Posiciones del Cliente
(Analiza cada posicion relevante: que fondo tiene, en que categoria cae, y si su TAC es competitivo o no)

## Analisis de Costos
(Distingue claramente: 1) lo que el cliente PAGA HOY, 2) lo que PAGARIA con la propuesta. Cuantifica el impacto a 10 anos)

## Propuesta de Referencia
(Describe los cambios sugeridos posicion por posicion. Aclara que es una referencia.)

## Observaciones del Asesor
(Deja esta seccion con 2-3 puntos genericos. El asesor completara despues)

## Proximos Pasos
(3-4 acciones concretas sugeridas)`;

    const prompt = `Eres un asesor financiero chileno experto. Genera un informe de radiografía de portafolio.

${customContext ? `NOTAS DEL ASESOR (incorpora este contexto en las secciones que corresponda):
${customContext}

` : ""}PORTAFOLIO DEL CLIENTE${clientName ? ` (${clientName})` : ""}:

${cartolaDate ? `Fecha de la Cartola: ${cartolaDate}` : ""}
Valor a Fecha de Cartola: $${(xrayData.totalValue || 0).toLocaleString("es-CL")}${ufValue ? ` (UF ${(xrayData.totalValue / ufValue).toLocaleString("es-CL", { maximumFractionDigits: 1 })})` : ""}${usdValue ? ` (USD ${(xrayData.totalValue / usdValue).toLocaleString("es-CL", { maximumFractionDigits: 0 })})` : ""}
${currentValue ? `Valor Actual (${currentValueDate || "hoy"}): $${currentValue.toLocaleString("es-CL")}${ufValue ? ` (UF ${(currentValue / ufValue).toLocaleString("es-CL", { maximumFractionDigits: 1 })})` : ""}${usdValue ? ` (USD ${(currentValue / usdValue).toLocaleString("es-CL", { maximumFractionDigits: 0 })})` : ""}` : ""}
${currentValue && xrayData.totalValue ? `Variación desde cartola: ${currentValue >= xrayData.totalValue ? "+" : ""}$${(currentValue - xrayData.totalValue).toLocaleString("es-CL")} (${((currentValue - xrayData.totalValue) / xrayData.totalValue * 100).toFixed(1)}%)` : ""}
Composición Actual: ${allocationSummary}
TAC Promedio Ponderado del Cliente: ${(xrayData.tacPromedioPortfolio || 0).toFixed(2)}%
Costo Anual que Paga el Cliente (fondos): $${(xrayData.costoAnualTotal || 0).toLocaleString("es-CL")}
Costo Proyectado 10 Años: $${(xrayData.costoProyectado10Y || 0).toLocaleString("es-CL")}
Holdings con datos TAC: ${xrayData.holdingsConTac || 0}/${xrayData.holdings.length}
Fondos con TAC > 2%: ${expensiveFunds.length}
Holdings concentrados (>25%): ${concentratedHoldings.length}

POSICIONES ACTUALES DEL CLIENTE:
${holdingsSummary}

${proposal ? `PORTAFOLIO DE REFERENCIA PROPUESTO (comparativo, no definitivo):
Nota: Esta propuesta es una referencia de optimización de costos. Los fondos definitivos se definirán con el cliente.

Costo actual del cliente (fondos): ${(proposal.currentTacPromedio || 0).toFixed(2)}% ($${(proposal.currentCostoAnual || 0).toLocaleString("es-CL")}/año)
Costo propuesto (fondos solamente): ${(proposal.proposedTacPromedio || 0).toFixed(2)}% ($${(proposal.proposedCostoAnual || 0).toLocaleString("es-CL")}/año)
Advisory fee del asesor: ${fee.toFixed(2)}% ($${feeAnual.toLocaleString("es-CL")}/año)
Costo total propuesto (fondos + fee): ${((proposal.proposedTacPromedio || 0) + fee).toFixed(2)}% ($${costoTotalPropuesto.toLocaleString("es-CL")}/año)
${ahorroNeto > 0 ? `Ahorro neto para el cliente: $${ahorroNeto.toLocaleString("es-CL")}/año` : ahorroNeto === 0 ? "Costo equivalente al actual, con asesoría profesional incluida" : `Costo adicional vs actual: $${Math.abs(ahorroNeto).toLocaleString("es-CL")}/año (incluye asesoría profesional)`}
${proposal.currentRent12m != null ? `Rentabilidad 12M ponderada actual: ${Number(proposal.currentRent12m).toFixed(1)}%` : ""}
${proposal.proposedRent12m != null ? `Rentabilidad 12M ponderada propuesta: ${Number(proposal.proposedRent12m).toFixed(1)}%` : ""}

COMPARACIÓN POSICIÓN POR POSICIÓN:
${positionComparison || "Sin cambios propuestos"}` : ""}
${modelSection}
${formatSections}

REGLAS:
- Español chileno profesional
- Sé específico: usa nombres de fondos y cifras concretas
- SIEMPRE distingue entre el valor a fecha de cartola y el valor actual — son datos distintos
- NUNCA confundas los costos actuales del cliente con los propuestos — son datos distintos
- La sección "Propuesta de Referencia" es la propuesta de valor para el cliente
- La sección "Observaciones del Asesor" debe quedar con espacio para que el asesor agregue sus propios comentarios al editar
- Máximo 5-6 líneas por sección
- No inventes datos, no uses emojis`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: model,
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

    // Track AI usage (non-blocking)
    if (data.usage) {
      trackAIUsage({
        advisorId: advisor!.id,
        inputTokens: data.usage.input_tokens,
        outputTokens: data.usage.output_tokens,
        model: model,
      });
    }

    const report = data.content.find((c: { type: string; text?: string }) => c.type === "text")?.text || "";

    return NextResponse.json({ success: true, report });
  });
}
