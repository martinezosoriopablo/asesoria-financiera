// app/api/cron/generate-closings/route.ts
// Cron mensual: genera el borrador de "Explicación de Resultados" del mes anterior
// para cada cliente con cartola, saltando los que ya tienen cierre. Deja borradores
// para que el asesor revise/edite/marque final. Usa la moneda de consolidación del
// cliente (display_currency).

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/auth/api-auth";
import { handleApiError } from "@/lib/api-response";

export const maxDuration = 60;

const CAP = 8; // máximo de clientes por corrida (cada uno hace una llamada a la IA ~5-8s)

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return handleApiError("cron-generate-closings", async () => {
    const admin = createAdminClient();

    // Mes objetivo = mes anterior (se genera a comienzos del mes siguiente)
    const now = new Date();
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const month = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`;

    // Debe existir el reporte de mercados del mes (contexto para la narrativa)
    const { data: report } = await admin
      .from("monthly_reports")
      .select("id")
      .eq("month", month)
      .single();
    if (!report) {
      return NextResponse.json({ month, generated: 0, reason: "sin reporte mensual de mercados" });
    }

    // Clientes con asesor
    const { data: clients } = await admin
      .from("clients")
      .select("id, display_currency, asesor_id")
      .not("asesor_id", "is", null);
    if (!clients || clients.length === 0) {
      return NextResponse.json({ month, generated: 0, reason: "sin clientes" });
    }
    const clientIds = clients.map((c) => c.id);

    // Cierres ya existentes para el mes → no regenerar (respeta ediciones/finales)
    const { data: existing } = await admin
      .from("client_monthly_closings")
      .select("client_id")
      .eq("month", month)
      .in("client_id", clientIds);
    const done = new Set((existing || []).map((c) => c.client_id));

    // Clientes con al menos una cartola real (si no, no hay nada que explicar)
    const { data: snaps } = await admin
      .from("portfolio_snapshots")
      .select("client_id")
      .in("client_id", clientIds)
      .in("source", ["manual", "statement", "excel"]);
    const hasCartola = new Set((snaps || []).map((s) => s.client_id));

    const eligible = clients.filter((c) => hasCartola.has(c.id) && !done.has(c.id));

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://asesoria-financiera.vercel.app";
    let generated = 0;
    let failed = 0;

    for (const c of eligible.slice(0, CAP)) {
      try {
        const res = await fetch(`${baseUrl}/api/client-closings`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-cron-secret": cronSecret },
          body: JSON.stringify({ clientId: c.id, month, currency: c.display_currency || "CLP" }),
        });
        if (res.ok) generated++;
        else {
          failed++;
          console.error(`[generate-closings] ${c.id} → HTTP ${res.status}`);
        }
      } catch (e) {
        failed++;
        console.error(`[generate-closings] ${c.id} fallo:`, e);
      }
    }

    return NextResponse.json({
      month,
      eligible: eligible.length,
      generated,
      failed,
      capped: eligible.length > CAP,
      timestamp: new Date().toISOString(),
    });
  });
}
