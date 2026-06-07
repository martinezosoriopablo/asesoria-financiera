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

    // 3. Get client's snapshots for the month (manual cartola)
    const monthStart = `${month}-01`;
    const nextMonth = new Date(`${month}-01`);
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    const monthEnd = nextMonth.toISOString().split("T")[0];

    // Get the latest cartola before or in this month
    const { data: snaps } = await sb
      .from("portfolio_snapshots")
      .select("snapshot_date, total_value, equity_value, fixed_income_value, alternatives_value, cash_value, holdings, source")
      .eq("client_id", clientId)
      .neq("source", "api-prices")
      .lte("snapshot_date", monthEnd)
      .order("snapshot_date", { ascending: false })
      .limit(2);

    const latestSnap = snaps?.[0];
    const previousSnap = snaps?.[1];

    // 4. Build holdings summary
    let holdingsSummary = "Sin datos de holdings disponibles.";
    if (latestSnap?.holdings && Array.isArray(latestSnap.holdings)) {
      const holdings = latestSnap.holdings as Array<{
        fundName: string;
        securityId?: string;
        marketValue: number;
        marketValueCLP?: number;
        assetClass?: string;
        currency?: string;
        costBasis?: number;
        unitCost?: number;
        marketPrice?: number;
        quantity?: number;
      }>;

      const totalMV = holdings.reduce((s, h) => s + (h.marketValueCLP || h.marketValue || 0), 0);

      holdingsSummary = holdings
        .sort((a, b) => (b.marketValueCLP || b.marketValue || 0) - (a.marketValueCLP || a.marketValue || 0))
        .map((h) => {
          const mv = h.marketValueCLP || h.marketValue || 0;
          const weight = totalMV > 0 ? ((mv / totalMV) * 100).toFixed(1) : "0";
          const cost = h.costBasis || h.unitCost || 0;
          const price = h.marketPrice || 0;
          const retPct = cost > 0 && price > 0 ? (((price - cost) / cost) * 100).toFixed(1) : "n/a";
          return `- ${h.fundName} (${h.securityId || "?"}) | ${h.assetClass || "?"} | Peso: ${weight}% | Retorno: ${retPct}%`;
        })
        .join("\n");
    }

    // 5. Portfolio change
    let portfolioChange = "";
    if (latestSnap && previousSnap) {
      const change = ((latestSnap.total_value - previousSnap.total_value) / previousSnap.total_value * 100).toFixed(2);
      portfolioChange = `Valor portafolio pasó de $${Math.round(previousSnap.total_value / 1e6)}M a $${Math.round(latestSnap.total_value / 1e6)}M (${change}%) entre ${previousSnap.snapshot_date} y ${latestSnap.snapshot_date}.`;
    } else if (latestSnap) {
      portfolioChange = `Valor portafolio actual: $${Math.round(latestSnap.total_value / 1e6)}M al ${latestSnap.snapshot_date}.`;
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

CAMBIO EN PORTAFOLIO:
${portfolioChange}

COMPOSICIÓN DEL PORTAFOLIO (holdings actuales):
${holdingsSummary}

INSTRUCCIONES:
1. Escribe una explicación de resultados de 4-6 párrafos en formato markdown
2. Comienza con un resumen del mes: qué pasó en los mercados relevantes para ESTE cliente
3. Explica cómo los movimientos de mercado impactaron SUS posiciones específicas (menciona nombres de instrumentos que tiene)
4. Identifica los mayores contribuidores positivos y negativos de su portafolio
5. Relaciona los eventos del reporte mensual con el performance de sus instrumentos
6. Cierra con perspectiva para el próximo mes basada en la sección "Lo Que Viene" del reporte
7. Tono profesional pero cercano, tutéalo, español chileno
8. NO des recomendaciones de compra/venta
9. Usa **negritas** para nombres de instrumentos y cifras importantes
10. Escribe SOLO la explicación, sin título (el título lo pone la plataforma)`;

    // 8. Call Claude
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return errorResponse("API key de Anthropic no configurada", 500);
    }

    const model = "claude-sonnet-4-20250514";
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
    const { advisor, error } = await requireAdvisor();
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
