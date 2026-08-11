// API: GET  /api/client-closings?clientId=...&month=2026-05
//      POST /api/client-closings  — generate or save closing
//      PUT  /api/client-closings  — update content/status
import { NextRequest } from "next/server";
import { requireAdvisor, requireClientAccess, createAdminClient } from "@/lib/auth/api-auth";
import { successResponse, errorResponse } from "@/lib/api-response";
import { handleApiError } from "@/lib/api-response";
import { trackAIUsage } from "@/lib/ai-usage";
import { resolveSource } from "@/lib/prices/price-service";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  return handleApiError("client-closings-get", async () => {
    const clientId = req.nextUrl.searchParams.get("clientId");
    const month = req.nextUrl.searchParams.get("month");

    if (!clientId) return errorResponse("clientId requerido", 400);

    const { error } = await requireClientAccess(clientId);
    if (error) return error;

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
    const { clientId, month, content, currency: reqCurrency } = await req.json();

    if (!clientId || !month) {
      return errorResponse("clientId y month requeridos", 400);
    }

    const sb = createAdminClient();

    // Auth: sesión de asesor, o bypass server-to-server por CRON_SECRET (para el
    // cron de cierre mensual, que llama este endpoint por cliente).
    const cronSecret = process.env.CRON_SECRET;
    const isCron = !!cronSecret && req.headers.get("x-cron-secret") === cronSecret;
    let advisorId: string;
    if (isCron) {
      const { data: c } = await sb.from("clients").select("asesor_id").eq("id", clientId).single();
      if (!c?.asesor_id) return errorResponse("Cliente sin asesor asignado", 400);
      advisorId = c.asesor_id;
    } else {
      const { advisor, error } = await requireClientAccess(clientId);
      if (error) return error;
      advisorId = advisor!.id;
    }

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
            advisor_id: advisorId,
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
    // 1. Get monthly report (cierre_mensual vigente del mes, desde el repositorio unificado)
    const { data: reportRow } = await sb
      .from("vw_reports_vigentes")
      .select("id, title, content_html, period")
      .eq("type", "cierre_mensual")
      .eq("period", month)
      .maybeSingle();
    const report = reportRow
      ? { id: reportRow.id, title: reportRow.title, html_content: reportRow.content_html }
      : null;

    if (!report) {
      return errorResponse(`No hay reporte mensual para ${month}. Súbalo primero.`, 400);
    }

    // 2. Get client info
    const { data: client } = await sb
      .from("clients")
      .select("nombre, apellido, perfil_riesgo, puntaje_riesgo, display_currency")
      .eq("id", clientId)
      .single();

    if (!client) return errorResponse("Cliente no encontrado", 404);

    // Moneda de reporte: la enviada (toggle) o, por defecto, la de consolidación
    // del cliente (display_currency, elegida al subir la cartola). Gobierna TODO el
    // cierre — retornos, valores y la redacción — para que sea consistente.
    const R = String(reqCurrency || client.display_currency || "CLP").toUpperCase();

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
    const fmtPct = (v: number, total: number) => total > 0 ? `${((v / total) * 100).toFixed(1)}%` : "0%";

    // 5. Build composition summary from snapshot class-level values
    let compositionSummary = "Sin datos de composición.";
    if (latestSnap) {
      const tv = latestSnap.total_value || 0;
      const rv = latestSnap.equity_value || 0;
      const rf = latestSnap.fixed_income_value || 0;
      const alt = latestSnap.alternatives_value || 0;
      const cash = latestSnap.cash_value || 0;
      compositionSummary = `Composición (referencia):
- Renta Variable: ${fmtPct(rv, tv)}
- Renta Fija: ${fmtPct(rf, tv)}
- Alternativos: ${fmtPct(alt, tv)}
- Caja: ${fmtPct(cash, tv)}`;
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
      endValueCLP: number | null;
      returnPct: number | null;   // retorno NATIVO (moneda del instrumento)
      currency: string;           // moneda del holding (para re-basar a CLP con FX)
    }
    const holdingReturns: HoldingReturn[] = [];
    // Factores TC_fin/TC_inicio del mes por moneda (crecimiento en CLP de 1 unidad de
    // esa moneda durante el mes). Re-basan retornos entre monedas. CLP = 1 siempre.
    let usdFxFactor = 1;
    let ufFxFactor = 1;
    // Tasas a fin de mes (para convertir valores CLP → moneda de reporte).
    let usdRateEnd = 920;
    let ufRateEnd = 39000;

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

      // Fetch tasa de cambio (inicio y fin de mes) desde BCCH para USD y UF.
      const bcchUser = process.env.BCCH_API_USER;
      const bcchPass = process.env.BCCH_API_PASSWORD;
      const parseVal = (o: { value: unknown }) => { const v = parseFloat(String(o.value).replace(",", ".")); return isFinite(v) && v > 0 ? v : null; };
      const fetchBcchRange = async (series: string): Promise<{ start: number | null; end: number | null }> => {
        if (!bcchUser || !bcchPass) return { start: null, end: null };
        try {
          const url = `https://si3.bcentral.cl/SieteRestWS/SieteRestWS.ashx?user=${bcchUser}&pass=${bcchPass}&firstdate=${priceStartDate}&lastdate=${priceEndDate}&timeseries=${series}&function=GetSeries`;
          const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
          if (!res.ok) return { start: null, end: null };
          const data = await res.json();
          const obs = data?.Series?.Obs;
          if (Array.isArray(obs) && obs.length > 0) {
            return { start: parseVal(obs[0]), end: parseVal(obs[obs.length - 1]) };
          }
        } catch { /* BCCH unavailable */ }
        return { start: null, end: null };
      };

      const [usdRange, ufRange] = await Promise.all([
        fetchBcchRange("F073.TCO.PRE.Z.D"), // dólar observado
        fetchBcchRange("F073.UFF.PRE.Z.D"), // UF
      ]);

      let usdRateEndMonth = usdRange.end;
      let usdRateStartMonth = usdRange.start;
      // Fallback USD: derivar del ratio de un holding USD del snapshot
      if (!usdRateEndMonth) {
        const usdHolding = holdings.find(hh => hh.currency === "USD" && hh.marketValueCLP && hh.marketValue && hh.marketValue > 0);
        if (usdHolding) usdRateEndMonth = usdHolding.marketValueCLP! / usdHolding.marketValue;
      }
      if (!usdRateEndMonth) usdRateEndMonth = 920;
      if (!usdRateStartMonth) usdRateStartMonth = usdRateEndMonth; // sin inicio → sin efecto FX
      usdFxFactor = usdRateStartMonth > 0 ? usdRateEndMonth / usdRateStartMonth : 1;
      usdRateEnd = usdRateEndMonth;

      const ufEnd = ufRange.end ?? ufRateEnd;
      const ufStart = ufRange.start ?? ufEnd;
      ufFxFactor = ufStart > 0 ? ufEnd / ufStart : 1;
      ufRateEnd = ufEnd;

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
            // Real end value = quantity × endPrice.
            // If holding is USD, check if valor_cuota is in USD or CLP:
            // Compare endPrice vs cartolaPrice (native currency). If ratio < 5, same currency → multiply by USD rate.
            // If ratio > 100, CMF published in CLP already → no conversion.
            let endVal = (endPrice && h.quantity) ? h.quantity * endPrice : null;
            if (endVal && h.currency === "USD" && usdRateEndMonth && cartolaPrice && cartolaPrice > 0) {
              const ratio = endPrice / cartolaPrice;
              if (ratio < 5) {
                // valor_cuota is in USD (same scale as cartolaPrice) → convert to CLP
                endVal = endVal * usdRateEndMonth;
              }
              // else: valor_cuota already in CLP, no conversion needed
            }

            holdingReturns.push({
              fundName: h.fundName,
              assetClass: h.assetClass || "?",
              weightCLP: clpValue,
              endValueCLP: endVal,
              returnPct: retPct,
              currency: h.currency || "CLP",
            });
          } else {
            holdingReturns.push({ fundName: h.fundName, assetClass: h.assetClass || "?", weightCLP: clpValue, endValueCLP: null, returnPct: null , currency: h.currency || "CLP" });
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

          // Look up prices from the correct table based on source
          const intlSources = ["yahoo", "alphavantage", "eodhd"];
          if (intlSources.includes(resolution.source)) {
            // ETFs, stocks, UCITS funds → international_prices table
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

            holdingReturns.push({ fundName: h.fundName, assetClass: h.assetClass || "?", weightCLP: clpValue, endValueCLP: retPct !== null ? clpValue * (1 + retPct / 100) : null, returnPct: retPct , currency: h.currency || "CLP" });
          } else if (resolution.source === "finra") {
            // Bonds → bond_prices table (last_price is % of par)
            const cusip = h.securityId || resolution.symbol;

            const getBondPrice = async (date: string) => {
              const minDate = new Date(date);
              minDate.setDate(minDate.getDate() - 7);
              const { data: row } = await sb
                .from("bond_prices")
                .select("last_price")
                .eq("cusip", cusip)
                .gte("price_date", minDate.toISOString().split("T")[0])
                .lte("price_date", date)
                .order("price_date", { ascending: false })
                .limit(1)
                .single();
              return row?.last_price ?? null;
            };

            const [startP, endP] = await Promise.all([
              getBondPrice(priceStartDate),
              getBondPrice(priceEndDate),
            ]);

            const retPct = startP && endP && startP > 0
              ? ((endP - startP) / startP) * 100
              : null;

            holdingReturns.push({ fundName: h.fundName, assetClass: h.assetClass || "?", weightCLP: clpValue, endValueCLP: retPct !== null ? clpValue * (1 + retPct / 100) : null, returnPct: retPct , currency: h.currency || "CLP" });
          } else {
            holdingReturns.push({ fundName: h.fundName, assetClass: h.assetClass || "?", weightCLP: clpValue, endValueCLP: null, returnPct: null , currency: h.currency || "CLP" });
          }
        }
      }
    }

    // Compute weighted portfolio return from real prices
    const totalWeightCLP = holdingReturns.reduce((s, h) => s + h.weightCLP, 0);
    const holdingsWithReturn = holdingReturns.filter(h => h.returnPct !== null);
    // Retorno del holding EN LA MONEDA DE REPORTE R: el nativo re-basado con el FX
    // del mes. En la moneda del instrumento queda nativo; en CLP suma el dólar; en
    // USD/UF ajusta según el movimiento del dólar/UF del mes. Consistente con la
    // regla de moneda del resto del reporte.
    const curFactor = (cur: string): number => {
      const c = (cur || "CLP").toUpperCase();
      return c === "USD" ? usdFxFactor : c === "UF" ? ufFxFactor : 1;
    };
    const returnInR = (h: HoldingReturn): number => {
      const c = (h.currency || "CLP").toUpperCase();
      if (c === R) return h.returnPct!;
      const factor = curFactor(c) / (curFactor(R) || 1);
      return ((1 + h.returnPct! / 100) * factor - 1) * 100;
    };
    // Formatea un valor CLP en la moneda de reporte R.
    const fmtMoney = (clp: number): string => {
      if (R === "USD") { const u = usdRateEnd > 0 ? clp / usdRateEnd : clp; return u >= 1e6 ? `US$${(u / 1e6).toFixed(1)}M` : `US$${Math.round(u / 1e3)}k`; }
      if (R === "UF") { const uf = ufRateEnd > 0 ? clp / ufRateEnd : clp; return `UF ${Math.round(uf).toLocaleString("es-CL")}`; }
      return `$${Math.round(clp / 1e6)}M`;
    };
    let portfolioReturnPct: number | null = null;
    if (holdingsWithReturn.length > 0 && totalWeightCLP > 0) {
      const weightedSum = holdingsWithReturn.reduce((s, h) => s + (returnInR(h) / 100) * h.weightCLP, 0);
      const coveredWeight = holdingsWithReturn.reduce((s, h) => s + h.weightCLP, 0);
      portfolioReturnPct = (weightedSum / coveredWeight) * 100;
    }

    // Build portfolio change text from real returns
    // Total value: use real endValueCLP where available, fallback to weightCLP (snapshot value) for the rest
    const totalEndValueCLP = holdingReturns.reduce((s, h) => s + (h.endValueCLP ?? h.weightCLP), 0);

    let portfolioChange = "";
    if (portfolioReturnPct !== null) {
      const sign = portfolioReturnPct >= 0 ? "+" : "";
      portfolioChange = `Valor del portafolio al cierre de ${month}: ${fmtMoney(totalEndValueCLP)} | Retorno del mes: ${sign}${portfolioReturnPct.toFixed(2)}%`;
    } else if (latestSnap) {
      portfolioChange = `Valor del portafolio: ${fmtMoney(totalEndValueCLP)}`;
    }

    // Per-holding returns detail (en la moneda de reporte R)
    const holdingsChangeList = holdingReturns
      .sort((a, b) => b.weightCLP - a.weightCLP)
      .map(h => {
        const retR = h.returnPct !== null ? returnInR(h) : null;
        const retStr = retR !== null ? `${retR >= 0 ? "+" : ""}${retR.toFixed(1)}%` : "sin datos";
        const valStr = h.endValueCLP ? fmtMoney(h.endValueCLP) : fmtMoney(h.weightCLP);
        return `- ${h.fundName} (${h.assetClass}): ${valStr} | Retorno mes: ${retStr}`;
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

MONEDA DE REPORTE: ${R === "USD" ? "dólares (USD)" : R === "UF" ? "UF" : "pesos chilenos (CLP)"}. Todas las cifras de valor y retorno de arriba ya están expresadas en esta moneda.

REGLAS:
- 3 párrafos cortos en markdown. Sin título.
- Párrafo 1: qué pasó en los mercados relevantes para este cliente.
- Párrafo 2: cómo impactó sus posiciones (menciona instrumentos por nombre, usa las cifras de CAMBIO y DETALLE POR HOLDING).
- Párrafo 3: perspectiva breve para el próximo mes.
- Tutéalo, tono profesional. NO inventes cifras. NO des recomendaciones de compra/venta.
- Las cifras están en ${R === "USD" ? "dólares (USD)" : R === "UF" ? "UF" : "pesos (CLP)"}: refiérete a los valores y retornos en esa moneda; NO las conviertas a otra. ${R === "USD" ? "En dólares el efecto del tipo de cambio ya está descontado (retorno de la inversión)." : R === "CLP" ? "En pesos, el retorno incluye el efecto del tipo de cambio sobre los activos en dólares." : ""}
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
        advisorId: advisorId,
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
          advisor_id: advisorId,
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
    // Auth gate antes de leer nada; la tenencia se verifica tras resolver el client_id del cierre
    const { error: authError } = await requireAdvisor();
    if (authError) return authError;

    const { id, content, status } = await req.json();
    if (!id) return errorResponse("id requerido", 400);

    const sb = createAdminClient();

    // El PUT opera por id de cierre: resolvemos su cliente y verificamos tenencia (evita IDOR)
    const { data: existing } = await sb
      .from("client_monthly_closings")
      .select("client_id")
      .eq("id", id)
      .single();
    if (!existing) return errorResponse("Cierre no encontrado", 404);

    const { error: accessError } = await requireClientAccess(existing.client_id);
    if (accessError) return accessError;

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
