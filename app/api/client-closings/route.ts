// API: GET  /api/client-closings?clientId=...&month=2026-05
//      POST /api/client-closings  — generate or save closing
//      PUT  /api/client-closings  — update content/status
import { NextRequest } from "next/server";
import { requireAdvisor, createAdminClient } from "@/lib/auth/api-auth";
import { successResponse, errorResponse } from "@/lib/api-response";
import { handleApiError } from "@/lib/api-response";
import { trackAIUsage } from "@/lib/ai-usage";
import { resolveSource } from "@/lib/prices/price-service";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  return handleApiError("client-closings-get", async () => {
    const { error } = await requireAdvisor();
    if (error) return error;

    const clientId = req.nextUrl.searchParams.get("clientId");
    const month = req.nextUrl.searchParams.get("month");

    if (!clientId) return errorResponse("clientId requerido", 400);

    const sb = createAdminClient();

    if (month) {
      const { data } = await sb
        .from("client_monthly_closings")
        .select("id, client_id, month, content, status, created_at, updated_at")
        .eq("client_id", clientId)
        .eq("month", month)
        .single();

      return successResponse({ closing: data || null });
    }

    // List all closings for client
    const { data } = await sb
      .from("client_monthly_closings")
      .select("id, month, status, updated_at")
      .eq("client_id", clientId)
      .order("month", { ascending: false })
      .limit(12);

    return successResponse({ closings: data || [] });
  });
}

export async function POST(req: NextRequest) {
  return handleApiError("client-closings-generate", async () => {
    const { advisor, error } = await requireAdvisor();
    if (error) return error;

    const { clientId, month, content } = await req.json();

    if (!clientId || !month) {
      return errorResponse("clientId y month requeridos", 400);
    }

    const sb = createAdminClient();

    // If content is provided, just save it (manual write)
    if (content) {
      const { data, error: dbErr } = await sb
        .from("client_monthly_closings")
        .upsert(
          {
            client_id: clientId,
            month,
            content,
            status: "draft",
            advisor_id: advisor!.id,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "client_id,month" }
        )
        .select("id, month, content, status")
        .single();

      if (dbErr) return errorResponse(`Error al guardar: ${dbErr.message}`, 500);
      return successResponse({ closing: data }, 201);
    }

    // Otherwise, generate with AI
    // 1. Get monthly report
    const { data: report } = await sb
      .from("monthly_reports")
      .select("id, title, html_content")
      .eq("month", month)
      .single();

    if (!report) {
      return errorResponse(`No hay reporte mensual para ${month}. Súbalo primero.`, 400);
    }

    // 2. Get client info
    const { data: client } = await sb
      .from("clients")
      .select("nombre, apellido, perfil_riesgo, puntaje_riesgo")
      .eq("id", clientId)
      .single();

    if (!client) return errorResponse("Cliente no encontrado", 404);

    // 3. Get client's snapshots — latest in/before this month + previous one
    const monthStart = `${month}-01`;
    const nextMonth = new Date(`${month}-01`);
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    const monthEnd = nextMonth.toISOString().split("T")[0];

    // Latest snapshot up to month end (current)
    const { data: currentSnaps } = await sb
      .from("portfolio_snapshots")
      .select("snapshot_date, total_value, equity_value, fixed_income_value, alternatives_value, cash_value, holdings, source")
      .eq("client_id", clientId)
      .neq("source", "api-prices")
      .lte("snapshot_date", monthEnd)
      .order("snapshot_date", { ascending: false })
      .limit(1);

    // Previous snapshot (before this month) for comparison
    const { data: prevSnaps } = await sb
      .from("portfolio_snapshots")
      .select("snapshot_date, total_value, equity_value, fixed_income_value, alternatives_value, cash_value, holdings")
      .eq("client_id", clientId)
      .neq("source", "api-prices")
      .lt("snapshot_date", monthStart)
      .order("snapshot_date", { ascending: false })
      .limit(1);

    const latestSnap = currentSnaps?.[0];
    const previousSnap = prevSnaps?.[0];

    // 4. Helpers
    const fmtM = (v: number) => `$${Math.round(v / 1e6)}M`;
    const fmtPct = (v: number, total: number) => total > 0 ? `${((v / total) * 100).toFixed(1)}%` : "0%";

    // 5. Build composition summary from snapshot class-level values
    let compositionSummary = "Sin datos de composición.";
    if (latestSnap) {
      const tv = latestSnap.total_value || 0;
      const rv = latestSnap.equity_value || 0;
      const rf = latestSnap.fixed_income_value || 0;
      const alt = latestSnap.alternatives_value || 0;
      const cash = latestSnap.cash_value || 0;
      compositionSummary = `Valor Total: ${fmtM(tv)}
- Renta Variable: ${fmtM(rv)} (${fmtPct(rv, tv)})
- Renta Fija: ${fmtM(rf)} (${fmtPct(rf, tv)})
- Alternativos: ${fmtM(alt)} (${fmtPct(alt, tv)})
- Caja: ${fmtM(cash)} (${fmtPct(cash, tv)})`;
    }

    // 6. Compute REAL per-holding returns using market prices (valor_cuota)
    // This is the key fix: instead of comparing frozen snapshot values,
    // we look up actual fund prices at month start and end dates.
    const [y, mo] = month.split("-").map(Number);
    const lastDayOfMonth = new Date(y, mo, 0).getDate();
    const priceStartDate = `${month}-01`;
    const priceEndDate = `${month}-${String(lastDayOfMonth).padStart(2, "0")}`;

    interface HoldingReturn {
      fundName: string;
      assetClass: string;
      weightCLP: number;
      returnPct: number | null;
    }
    const holdingReturns: HoldingReturn[] = [];

    if (latestSnap?.holdings && Array.isArray(latestSnap.holdings)) {
      const holdings = latestSnap.holdings as Array<{
        fundName: string;
        securityId?: string;
        serie?: string;
        marketValue: number;
        marketValueCLP?: number;
        marketPrice?: number;
        quantity?: number;
        assetClass?: string;
        currency?: string;
      }>;

      // Look up prices for each holding with a numeric RUN (Chilean funds)
      for (const h of holdings) {
        if (!h.fundName) continue;
        const clpValue = h.marketValueCLP || h.marketValue || 0;
        const run = h.securityId ? parseInt(h.securityId, 10) : NaN;

        if (!isNaN(run) && run > 0) {
          // Chilean fund — look up real prices at start and end of month
          const cartolaPrice = (h.quantity && h.quantity > 0) ? h.marketValue / h.quantity : h.marketPrice || null;

          // Find the fondo_id (with serie resolution)
          let fondoQuery = sb.from("fondos_mutuos").select("id, fm_serie").eq("fo_run", run);
          if (h.serie) fondoQuery = fondoQuery.eq("fm_serie", h.serie);
          const { data: fondos } = await fondoQuery.limit(10);

          if (fondos && fondos.length > 0) {
            let fondoId = fondos[0].id;

            // If multiple series and we have a cartolaPrice, match by closest valor_cuota
            if (fondos.length > 1 && !h.serie && cartolaPrice && cartolaPrice > 0) {
              let bestDiff = Infinity;
              for (const f of fondos) {
                const { data: latest } = await sb
                  .from("fondos_rentabilidades_diarias")
                  .select("valor_cuota")
                  .eq("fondo_id", f.id)
                  .order("fecha", { ascending: false })
                  .limit(1)
                  .single();
                if (latest) {
                  const diff = Math.abs(latest.valor_cuota - cartolaPrice);
                  if (diff < bestDiff) { bestDiff = diff; fondoId = f.id; }
                }
              }
            }

            // Get prices at start and end of month (7-day lookback)
            const getPrice = async (date: string) => {
              const minDate = new Date(date);
              minDate.setDate(minDate.getDate() - 7);
              const { data: row } = await sb
                .from("fondos_rentabilidades_diarias")
                .select("valor_cuota")
                .eq("fondo_id", fondoId)
                .gte("fecha", minDate.toISOString().split("T")[0])
                .lte("fecha", date)
                .order("fecha", { ascending: false })
                .limit(1)
                .single();
              return row?.valor_cuota ?? null;
            };

            const [startPrice, endPrice] = await Promise.all([
              getPrice(priceStartDate),
              getPrice(priceEndDate),
            ]);

            const retPct = startPrice && endPrice && startPrice > 0
              ? ((endPrice - startPrice) / startPrice) * 100
              : null;

            holdingReturns.push({
              fundName: h.fundName,
              assetClass: h.assetClass || "?",
              weightCLP: clpValue,
              returnPct: retPct,
            });
          } else {
            holdingReturns.push({ fundName: h.fundName, assetClass: h.assetClass || "?", weightCLP: clpValue, returnPct: null });
          }
        } else {
          // International holding — resolve ticker via price-service, then look up in international_prices
          const mkt = ((h as { market?: string }).market || null) as "CL" | "INT" | "US" | null;
          const resolution = resolveSource({
            fundName: h.fundName,
            securityId: h.securityId || null,
            market: mkt,
            marketValue: h.marketValue || 0,
          });

          // Only look up sources that store in international_prices
          const intlSources = ["yahoo", "alphavantage", "eodhd"];
          if (intlSources.includes(resolution.source)) {
            const ticker = resolution.symbol;

            const getIntlPrice = async (date: string) => {
              const minDate = new Date(date);
              minDate.setDate(minDate.getDate() - 7);
              const { data: row } = await (sb as any)
                .from("international_prices")
                .select("close_price")
                .eq("ticker", ticker)
                .gte("price_date", minDate.toISOString().split("T")[0])
                .lte("price_date", date)
                .order("price_date", { ascending: false })
                .limit(1)
                .single();
              return row?.close_price ?? null;
            };

            const [startP, endP] = await Promise.all([
              getIntlPrice(priceStartDate),
              getIntlPrice(priceEndDate),
            ]);

            const retPct = startP && endP && startP > 0
              ? ((endP - startP) / startP) * 100
              : null;

            holdingReturns.push({ fundName: h.fundName, assetClass: h.assetClass || "?", weightCLP: clpValue, returnPct: retPct });
          } else {
            holdingReturns.push({ fundName: h.fundName, assetClass: h.assetClass || "?", weightCLP: clpValue, returnPct: null });
          }
        }
      }
    }

    // Compute weighted portfolio return from real prices
    const totalWeightCLP = holdingReturns.reduce((s, h) => s + h.weightCLP, 0);
    const holdingsWithReturn = holdingReturns.filter(h => h.returnPct !== null);
    let portfolioReturnPct: number | null = null;
    if (holdingsWithReturn.length > 0 && totalWeightCLP > 0) {
      const weightedSum = holdingsWithReturn.reduce((s, h) => s + (h.returnPct! / 100) * h.weightCLP, 0);
      const coveredWeight = holdingsWithReturn.reduce((s, h) => s + h.weightCLP, 0);
      portfolioReturnPct = (weightedSum / coveredWeight) * 100;
    }

    // Build portfolio change text from real returns
    let portfolioChange = "";
    if (portfolioReturnPct !== null) {
      const sign = portfolioReturnPct >= 0 ? "+" : "";
      portfolioChange = `Retorno del portafolio en ${month}: ${sign}${portfolioReturnPct.toFixed(2)}% (basado en precios de mercado)`;
    } else if (latestSnap && previousSnap && previousSnap.total_value > 0) {
      const totalChg = ((latestSnap.total_value - previousSnap.total_value) / previousSnap.total_value * 100).toFixed(2);
      portfolioChange = `Portafolio: ${fmtM(previousSnap.total_value)} → ${fmtM(latestSnap.total_value)} (${totalChg}%)`;
    } else if (latestSnap) {
      portfolioChange = `Valor portafolio actual: ${fmtM(latestSnap.total_value)} al ${latestSnap.snapshot_date}.`;
    }

    // Per-holding returns detail
    const holdingsChangeList = holdingReturns
      .sort((a, b) => b.weightCLP - a.weightCLP)
      .map(h => {
        const retStr = h.returnPct !== null ? `${h.returnPct >= 0 ? "+" : ""}${h.returnPct.toFixed(1)}%` : "sin datos";
        return `- ${h.fundName} (${h.assetClass}): ${fmtM(h.weightCLP)} | Retorno mes: ${retStr}`;
      })
      .join("\n");

    // 7. Strip HTML tags from monthly report for prompt
    const reportText = report.html_content
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 8000);

    // 8. Build prompt — concise (3 short paragraphs)
    const prompt = `Eres un asesor financiero chileno. Redacta la explicación de resultados del mes para un cliente. Sé conciso: máximo 3 párrafos cortos.

REPORTE DE MERCADOS (${month}):
${reportText}

CLIENTE: ${client.nombre} ${client.apellido} | Perfil: ${client.perfil_riesgo || "No definido"}

PORTAFOLIO:
${compositionSummary}

VARIACIÓN DEL MES (precios de mercado reales):
${portfolioChange}

DETALLE POR HOLDING:
${holdingsChangeList || "Sin datos de holdings."}

REGLAS:
- 3 párrafos cortos en markdown. Sin título.
- Párrafo 1: qué pasó en los mercados relevantes para este cliente.
- Párrafo 2: cómo impactó sus posiciones (menciona instrumentos por nombre, usa las cifras de CAMBIO y DETALLE POR HOLDING).
- Párrafo 3: perspectiva breve para el próximo mes.
- Tutéalo, tono profesional. NO inventes cifras. NO des recomendaciones de compra/venta.
- Usa **negritas** para instrumentos y cifras clave.`;

    // 9. Call Claude
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return errorResponse("API key de Anthropic no configurada", 500);
    }

    const model = "claude-sonnet-4-6";
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 800,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error("Claude API error:", response.status, errBody);
      return errorResponse("Error al generar con IA", 500);
    }

    const claudeResponse = await response.json();
    const generatedContent = claudeResponse.content?.[0]?.text || "";

    // Track usage
    if (claudeResponse.usage) {
      trackAIUsage({
        advisorId: advisor!.id,
        inputTokens: claudeResponse.usage.input_tokens,
        outputTokens: claudeResponse.usage.output_tokens,
        model,
      });
    }

    // 10. Save generated closing
    const { data, error: dbErr } = await sb
      .from("client_monthly_closings")
      .upsert(
        {
          client_id: clientId,
          month,
          content: generatedContent,
          status: "draft",
          monthly_report_id: report.id,
          advisor_id: advisor!.id,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "client_id,month" }
      )
      .select("id, month, content, status")
      .single();

    if (dbErr) return errorResponse(`Error al guardar: ${dbErr.message}`, 500);
    return successResponse({ closing: data }, 201);
  });
}

export async function PUT(req: NextRequest) {
  return handleApiError("client-closings-update", async () => {
    const { error } = await requireAdvisor();
    if (error) return error;

    const { id, content, status } = await req.json();
    if (!id) return errorResponse("id requerido", 400);

    const sb = createAdminClient();
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (content !== undefined) updates.content = content;
    if (status) updates.status = status;

    const { data, error: dbErr } = await sb
      .from("client_monthly_closings")
      .update(updates)
      .eq("id", id)
      .select("id, month, content, status")
      .single();

    if (dbErr) return errorResponse(`Error al actualizar: ${dbErr.message}`, 500);
    return successResponse({ closing: data });
  });
}
