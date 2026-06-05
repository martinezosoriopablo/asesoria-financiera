import { NextRequest } from "next/server";
import { requireAdvisor, createAdminClient } from "@/lib/auth/api-auth";
import { applyRateLimit } from "@/lib/rate-limit";
import { successResponse, errorResponse, handleApiError } from "@/lib/api-response";
import { trackAIUsage } from "@/lib/ai-usage";

export const maxDuration = 60;

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
      instrumentBreakdown,
      totalValueCLP,
      perfilCliente,
      perfilModelo,
      notaComite,
      clientName,
    } = body as {
      allocation: Record<string, { actual: number; target: number; delta: number }>;
      observations: Array<{ severity: string; text: string }>;
      sectorBreakdown: Array<{ sector: string; actualPct: number; sleevePct: number | null; deltaPp: number }>;
      instrumentBreakdown?: {
        stocks: Array<{ ticker: string; name: string; sector: string; weightPct: number; marketValueUSD: number }>;
        funds: Array<{ fundName: string; weightPct: number; categoryLabel?: string }>;
        bonds: Array<{ name: string; couponRate: number; maturityDate: string; weightPct: number; marketValueUSD: number }>;
        etfs: Array<{ ticker: string; name: string; weightPct: number; categoryLabel?: string }>;
        cash: Array<{ name: string; weightPct: number }>;
      };
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

    // Build instrument detail summaries
    let topPositionsSummary = "";
    let sectorDiversificationSummary = "";
    let instrumentMixSummary = "";

    if (instrumentBreakdown) {
      const ib = instrumentBreakdown;

      // Top 10 positions across all types
      const allPositions = [
        ...ib.stocks.map((s) => ({ name: `${s.ticker} (${s.name})`, type: "Accion", weight: s.weightPct, sector: s.sector })),
        ...ib.funds.map((f) => ({ name: f.fundName, type: "Fondo", weight: f.weightPct, sector: f.categoryLabel || "" })),
        ...ib.bonds.map((b) => ({ name: b.name, type: "Bono", weight: b.weightPct, sector: "" })),
        ...ib.etfs.map((e) => ({ name: `${e.ticker} (${e.name})`, type: "ETF", weight: e.weightPct, sector: e.categoryLabel || "" })),
        ...ib.cash.map((c) => ({ name: c.name, type: "Caja", weight: c.weightPct, sector: "" })),
      ].sort((a, b) => b.weight - a.weight);

      const top10 = allPositions.slice(0, 10);
      topPositionsSummary = top10
        .map((p) => `- ${p.name} [${p.type}]: ${p.weight.toFixed(1)}%`)
        .join("\n");

      const top3Weight = top10.slice(0, 3).reduce((s, p) => s + p.weight, 0);
      const top5Weight = top10.slice(0, 5).reduce((s, p) => s + p.weight, 0);

      // Sector concentration (stocks only)
      if (ib.stocks.length > 0) {
        const bySector = new Map<string, number>();
        for (const s of ib.stocks) {
          const sec = s.sector || "Sin clasificar";
          bySector.set(sec, (bySector.get(sec) || 0) + s.weightPct);
        }
        const sortedSectors = [...bySector.entries()].sort((a, b) => b[1] - a[1]);
        sectorDiversificationSummary = sortedSectors
          .map(([sec, pct]) => `- ${sec}: ${pct.toFixed(1)}% (${ib.stocks.filter((s) => (s.sector || "Sin clasificar") === sec).length} posiciones)`)
          .join("\n");
        const uniqueSectors = sortedSectors.length;
        sectorDiversificationSummary = `${uniqueSectors} sectores representados.\n${sectorDiversificationSummary}`;
      }

      // Instrument mix summary
      const counts = {
        acciones: ib.stocks.length,
        fondos: ib.funds.length,
        bonos: ib.bonds.length,
        etfs: ib.etfs.length,
        caja: ib.cash.length,
      };
      instrumentMixSummary = `${counts.acciones} acciones, ${counts.fondos} fondos, ${counts.bonos} bonos, ${counts.etfs} ETFs, ${counts.caja} posiciones en caja. Concentracion: Top 3 = ${top3Weight.toFixed(1)}%, Top 5 = ${top5Weight.toFixed(1)}%.`;
    }

    const totalUSD = Math.round(totalValueCLP / 950);
    const prompt = `Eres un asesor financiero senior chileno redactando un diagnostico de cartera para tu cliente ${clientName}.

Datos del portafolio:
- Valor total: ~USD ${totalUSD.toLocaleString()} (CLP ${Math.round(totalValueCLP / 1e6).toLocaleString()}M)
- Perfil de riesgo del cliente: ${perfilCliente}
- Modelo asignado: ${perfilModelo}
- Composicion: ${instrumentMixSummary || "No disponible"}

Asignacion de activos:
${allocSummary}

Observaciones clave:
${obsSummary}

${topPositionsSummary ? `Principales posiciones (top 10 por peso):\n${topPositionsSummary}` : ""}

${sectorDiversificationSummary ? `Diversificacion sectorial (acciones directas):\n${sectorDiversificationSummary}` : ""}

${sectorSummary ? `Desviaciones sectoriales vs sleeve del comite:\n${sectorSummary}` : ""}

${notaComite ? `Contexto del ultimo comite de inversiones:\n${notaComite}` : ""}

Redacta un diagnostico profesional de 3-4 parrafos. Tono: directo, profesional, sin ser alarmista. El analisis debe cubrir:
1. Situacion general del portafolio vs el modelo (allocation macro)
2. Diversificacion sectorial y concentracion en posiciones individuales — identifica riesgos especificos
3. Oportunidades concretas de mejora y recomendaciones accionables

No uses bullet points ni listas — escribe en prosa. No uses acentos. Tutea al cliente.`;

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
