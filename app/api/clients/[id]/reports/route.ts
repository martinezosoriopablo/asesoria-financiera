// app/api/clients/[id]/reports/route.ts
// GET: list reports for a client
// POST: generate and send a new report

import { NextRequest, NextResponse } from "next/server";
import { requireAdvisor, createAdminClient, getSubordinateAdvisorIds } from "@/lib/auth/api-auth";
import { applyRateLimit } from "@/lib/rate-limit";

interface RouteContext {
  params: Promise<{ id: string }>;
}

async function verifyClientAccess(supabase: ReturnType<typeof createAdminClient>, clientId: string, advisor: { id: string; rol: string }) {
  const { data: client } = await supabase
    .from("clients")
    .select("id, asesor_id")
    .eq("id", clientId)
    .single();

  if (!client) return false;
  if (client.asesor_id && client.asesor_id !== advisor.id) {
    if (advisor.rol === "admin") {
      const allowedIds = await getSubordinateAdvisorIds(advisor.id);
      return allowedIds.includes(client.asesor_id);
    }
    return false;
  }
  return true;
}

// GET - List reports
export async function GET(request: NextRequest, context: RouteContext) {
  const blocked = await applyRateLimit(request, "client-reports-get", { limit: 30, windowSeconds: 60 });
  if (blocked) return blocked;

  const { advisor, error: authError } = await requireAdvisor();
  if (authError) return authError;

  const supabase = createAdminClient();
  const { id: clientId } = await context.params;

  if (!(await verifyClientAccess(supabase, clientId, advisor!))) {
    return NextResponse.json({ success: false, error: "No autorizado" }, { status: 403 });
  }

  const { data: reports, error } = await supabase
    .from("client_reports")
    .select("*")
    .eq("client_id", clientId)
    .order("report_date", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, reports: reports || [] });
}

// POST - Generate a new report
export async function POST(request: NextRequest, context: RouteContext) {
  const blocked = await applyRateLimit(request, "client-reports-generate", { limit: 5, windowSeconds: 60 });
  if (blocked) return blocked;

  const { advisor, error: authError } = await requireAdvisor();
  if (authError) return authError;

  const supabase = createAdminClient();
  const { id: clientId } = await context.params;

  if (!(await verifyClientAccess(supabase, clientId, advisor!))) {
    return NextResponse.json({ success: false, error: "No autorizado" }, { status: 403 });
  }

  try {
    // 1. Get client info
    const { data: client } = await supabase
      .from("clients")
      .select("id, nombre, apellido, perfil_riesgo, puntaje_riesgo, cartera_recomendada")
      .eq("id", clientId)
      .single();

    if (!client) {
      return NextResponse.json({ success: false, error: "Cliente no encontrado" }, { status: 404 });
    }

    // 2. Get report config
    const { data: config } = await supabase
      .from("client_report_config")
      .select("*")
      .eq("client_id", clientId)
      .maybeSingle();

    // 3. Get latest snapshot
    const { data: latestSnapshot } = await supabase
      .from("portfolio_snapshots")
      .select("*")
      .eq("client_id", clientId)
      .order("snapshot_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    // 4. Get previous snapshot for comparison
    let prevSnapshot = null;
    if (latestSnapshot) {
      const { data: prev } = await supabase
        .from("portfolio_snapshots")
        .select("*")
        .eq("client_id", clientId)
        .lt("snapshot_date", latestSnapshot.snapshot_date)
        .in("source", ["statement", "manual", "excel"])
        .order("snapshot_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      prevSnapshot = prev;
    }

    // 5. Get comité reports
    const comiteTypes: string[] = [];
    const sendAll = !config; // If no config, include all
    if (sendAll || config?.send_macro) comiteTypes.push("macro");
    if (sendAll || config?.send_rv) comiteTypes.push("rv");
    if (sendAll || config?.send_rf) comiteTypes.push("rf");
    if (sendAll || config?.send_asset_allocation) comiteTypes.push("asset_allocation");

    const { data: comiteReports } = await supabase
      .from("comite_reports")
      .select("type, title, content, report_date")
      .in("type", comiteTypes.length > 0 ? comiteTypes : ["macro", "rv", "rf", "asset_allocation"]);

    // 6. Build snapshot summary
    const snapshotSummary = latestSnapshot ? {
      date: latestSnapshot.snapshot_date,
      total_value: latestSnapshot.total_value,
      equity_percent: latestSnapshot.equity_percent,
      fixed_income_percent: latestSnapshot.fixed_income_percent,
      alternatives_percent: latestSnapshot.alternatives_percent,
      cash_percent: latestSnapshot.cash_percent,
      equity_value: latestSnapshot.equity_value,
      fixed_income_value: latestSnapshot.fixed_income_value,
      alternatives_value: latestSnapshot.alternatives_value,
      cash_value: latestSnapshot.cash_value,
      holdings: latestSnapshot.holdings,
      twr_cumulative: latestSnapshot.twr_cumulative,
      prev_value: prevSnapshot?.total_value,
      prev_date: prevSnapshot?.snapshot_date,
    } : null;

    // 7. Generate AI market commentary
    let marketCommentary = "";
    const shouldGenerateCommentary = config?.send_portfolio_report !== false;

    if (shouldGenerateCommentary && snapshotSummary && comiteReports && comiteReports.length > 0) {
      // Strip HTML tags from comité reports for the prompt
      const stripHtml = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

      const comiteContext = comiteReports
        .map(r => `### ${r.title || r.type} (${r.report_date || "reciente"})\n${stripHtml(r.content).slice(0, 2000)}`)
        .join("\n\n");

      const holdingsList = Array.isArray(snapshotSummary.holdings)
        ? snapshotSummary.holdings
            .map((h: { fundName?: string; assetClass?: string; marketValue?: number }) =>
              `- ${h.fundName} (${h.assetClass || "N/A"}): $${(h.marketValue || 0).toLocaleString()}`
            )
            .join("\n")
        : "No hay detalle de posiciones";

      const prompt = `Eres un asesor financiero redactando un reporte personalizado para tu cliente.

CLIENTE:
- Nombre: ${client.nombre} ${client.apellido}
- Perfil de riesgo: ${client.perfil_riesgo || "No definido"} (${client.puntaje_riesgo || 0}/100)
- Valor portafolio: $${snapshotSummary.total_value.toLocaleString()} CLP
- Composición: RV ${snapshotSummary.equity_percent}%, RF ${snapshotSummary.fixed_income_percent}%, Alt ${snapshotSummary.alternatives_percent}%, Cash ${snapshotSummary.cash_percent}%
${snapshotSummary.prev_value ? `- Valor anterior (${snapshotSummary.prev_date}): $${snapshotSummary.prev_value.toLocaleString()} CLP` : ""}

POSICIONES:
${holdingsList}

CONTEXTO DE MERCADO (reportes del comité):
${comiteContext}

INSTRUCCIONES:
1. Escribe un comentario de mercado personalizado de 3-4 párrafos
2. Explica qué pasó en el mercado relevante para SU cartera específica
3. Menciona instrumentos específicos que tiene el cliente si hay noticias relevantes
4. Usa tono profesional pero cercano, tutéalo
5. No des recomendaciones de compra/venta específicas
6. Termina con una nota de confianza y disponibilidad del asesor
7. Escribe SOLO el comentario, sin títulos ni encabezados
8. Idioma: español chileno`;

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": process.env.ANTHROPIC_API_KEY || "",
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1500,
          messages: [{ role: "user", content: prompt }],
        }),
      });

      const claudeResponse = await response.json();
      marketCommentary = claudeResponse.content?.[0]?.text || "";
    }

    // 8. Build comite reports included array
    const comiteIncluded = (comiteReports || []).map(r => ({
      type: r.type,
      title: r.title,
      report_date: r.report_date,
    }));

    // 9. Save report
    const { data: report, error: insertError } = await supabase
      .from("client_reports")
      .insert({
        client_id: clientId,
        report_date: new Date().toISOString().split("T")[0],
        report_type: "portfolio_update",
        snapshot_summary: snapshotSummary,
        market_commentary: marketCommentary,
        comite_reports_included: comiteIncluded,
        sent_via: "portal",
      })
      .select()
      .single();

    if (insertError) {
      return NextResponse.json({ success: false, error: insertError.message }, { status: 500 });
    }

    // 10. Update last_sent_at in config
    if (config) {
      await supabase
        .from("client_report_config")
        .update({ last_sent_at: new Date().toISOString() })
        .eq("client_id", clientId);
    }

    return NextResponse.json({ success: true, report });
  } catch (error) {
    console.error("Error generating report:", error);
    const msg = error instanceof Error ? error.message : "Error interno";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
