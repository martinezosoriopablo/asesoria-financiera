// API: GET  /api/client-closings?clientId=...&month=2026-05
//      POST /api/client-closings  — generate or save closing
//      PUT  /api/client-closings  — update content/status
import { NextRequest } from "next/server";
import { requireAdvisor, createAdminClient } from "@/lib/auth/api-auth";
import { successResponse, errorResponse } from "@/lib/api-response";
import { handleApiError } from "@/lib/api-response";
import { trackAIUsage } from "@/lib/ai-usage";

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
      .select("snapshot_date, total_value, equity_value, fixed_income_value, alternatives_value, cash_value")
      .eq("client_id", clientId)
      .neq("source", "api-prices")
      .lt("snapshot_date", monthStart)
      .order("snapshot_date", { ascending: false })
      .limit(1);

    const latestSnap = currentSnaps?.[0];
    const previousSnap = prevSnaps?.[0];

    // 4. Build composition summary from snapshot class-level values (already in CLP)
    const fmtM = (v: number) => `$${Math.round(v / 1e6)}M`;
    const fmtPct = (v: number, total: number) => total > 0 ? `${((v / total) * 100).toFixed(1)}%` : "0%";

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

    // 5. Build holdings list (names, weights, classes — NO return calc to avoid currency issues)
    let holdingsSummary = "Sin datos de holdings disponibles.";
    if (latestSnap?.holdings && Array.isArray(latestSnap.holdings)) {
      const holdings = latestSnap.holdings as Array<{
        fundName: string;
        securityId?: string;
        marketValue: number;
        marketValueCLP?: number;
        assetClass?: string;
        currency?: string;
      }>;

      const totalMV = holdings.reduce((s, h) => s + (h.marketValueCLP || h.marketValue || 0), 0);

      holdingsSummary = holdings
        .sort((a, b) => (b.marketValueCLP || b.marketValue || 0) - (a.marketValueCLP || a.marketValue || 0))
        .map((h) => {
          const mv = h.marketValueCLP || h.marketValue || 0;
          const weight = totalMV > 0 ? ((mv / totalMV) * 100).toFixed(1) : "0";
          return `- ${h.fundName} | ${h.assetClass || "?"} | ${h.currency || "CLP"} | Peso: ${weight}%`;
        })
        .join("\n");
    }

    // 6. Portfolio and class-level change vs previous month
    let portfolioChange = "";
    if (latestSnap && previousSnap) {
      const totalChg = ((latestSnap.total_value - previousSnap.total_value) / previousSnap.total_value * 100).toFixed(2);
      portfolioChange = `Portafolio: ${fmtM(previousSnap.total_value)} → ${fmtM(latestSnap.total_value)} (${totalChg}%) | ${previousSnap.snapshot_date} → ${latestSnap.snapshot_date}`;

      // Per-class changes
      const classChange = (label: string, prev: number, curr: number) => {
        if (prev <= 0 && curr <= 0) return null;
        const chg = prev > 0 ? ((curr - prev) / prev * 100).toFixed(1) : "nuevo";
        return `  ${label}: ${fmtM(prev)} → ${fmtM(curr)} (${typeof chg === "string" ? chg : chg + "%"})`;
      };
      const changes = [
        classChange("RV", previousSnap.equity_value || 0, latestSnap.equity_value || 0),
        classChange("RF", previousSnap.fixed_income_value || 0, latestSnap.fixed_income_value || 0),
        classChange("Alt", previousSnap.alternatives_value || 0, latestSnap.alternatives_value || 0),
        classChange("Caja", previousSnap.cash_value || 0, latestSnap.cash_value || 0),
      ].filter(Boolean);
      if (changes.length > 0) portfolioChange += "\n" + changes.join("\n");
    } else if (latestSnap) {
      portfolioChange = `Valor portafolio actual: ${fmtM(latestSnap.total_value)} al ${latestSnap.snapshot_date}.`;
    }

    // 6. Strip HTML tags from monthly report for prompt
    const reportText = report.html_content
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 8000); // Limit to ~8K chars

    // 7. Build prompt
    const prompt = `Eres un asesor financiero chileno redactando la explicación de resultados del mes para un cliente.

REPORTE MENSUAL DE MERCADOS (${month}):
${reportText}

CLIENTE: ${client.nombre} ${client.apellido}
PERFIL DE RIESGO: ${client.perfil_riesgo || "No definido"} (puntaje: ${client.puntaje_riesgo || "N/A"})

COMPOSICIÓN ACTUAL DEL PORTAFOLIO:
${compositionSummary}

CAMBIO VS MES ANTERIOR:
${portfolioChange}

HOLDINGS INDIVIDUALES:
${holdingsSummary}

INSTRUCCIONES:
1. Escribe una explicación de resultados de 4-6 párrafos en formato markdown
2. Comienza con un resumen del mes: qué pasó en los mercados relevantes para ESTE cliente
3. Explica cómo los movimientos de mercado impactaron SUS posiciones específicas (menciona nombres de instrumentos que tiene)
4. Usa los datos de COMPOSICIÓN y CAMBIO VS MES ANTERIOR para hablar de la variación por clase de activo (RV, RF, Alt). NO inventes cifras que no estén en los datos.
5. Relaciona los eventos del reporte mensual con el performance de sus instrumentos
6. Cierra con perspectiva para el próximo mes basada en la sección "Lo Que Viene" del reporte
7. Tono profesional pero cercano, tutéalo, español chileno
8. NO des recomendaciones de compra/venta. NO inventes retornos o valores que no aparezcan en los datos.
9. Usa **negritas** para nombres de instrumentos y cifras importantes
10. Escribe SOLO la explicación, sin título (el título lo pone la plataforma)`;

    // 8. Call Claude
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
        max_tokens: 2000,
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

    // 9. Save generated closing
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
