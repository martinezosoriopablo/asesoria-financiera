// POST /api/cmf/auto-sync — Download CMF cartola automatically via 2captcha + import
// GET  /api/cmf/auto-sync — Status of last sync + check if today's data exists

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, createAdminClient } from "@/lib/auth/api-auth";
import { applyRateLimit } from "@/lib/rate-limit";
import { downloadCMFCartola } from "@/lib/cmf-auto";
import { importCMFRows, parseCMFContent } from "@/lib/cmf-import";

export const maxDuration = 300; // 5 min — captcha solving + download + import
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const blocked = await applyRateLimit(request, "cmf-auto-sync", { limit: 3, windowSeconds: 300 });
  if (blocked) return blocked;

  // Auth: admin via UI or CRON_SECRET via cron
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  const isCron = cronSecret && authHeader === `Bearer ${cronSecret}`;

  if (!isCron) {
    const { error: authError } = await requireAdmin();
    if (authError) return authError;
  }

  if (!process.env.TWOCAPTCHA_API_KEY) {
    return NextResponse.json(
      { success: false, error: "TWOCAPTCHA_API_KEY no configurada en el servidor" },
      { status: 500 }
    );
  }

  try {
    // Parse request body for date range
    let inicio: string;
    let termino: string;
    let run = "";

    try {
      const body = await request.json();
      inicio = body.inicio || "";
      termino = body.termino || "";
      run = body.run || "";
    } catch {
      inicio = "";
      termino = "";
    }

    // Default: yesterday
    if (!inicio || !termino) {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const dd = String(yesterday.getDate()).padStart(2, "0");
      const mm = String(yesterday.getMonth() + 1).padStart(2, "0");
      const yyyy = yesterday.getFullYear();
      const formatted = `${dd}/${mm}/${yyyy}`;
      inicio = inicio || formatted;
      termino = termino || formatted;
    }

    // Step 1: Download
    const downloadResult = await downloadCMFCartola({ inicio, termino, run });

    if (!downloadResult.success || !downloadResult.content) {
      return NextResponse.json({
        success: false,
        error: downloadResult.error || "Descarga falló",
        captchaSolveMs: downloadResult.captchaSolveMs,
      }, { status: 502 });
    }

    // Step 2: Parse
    const rows = parseCMFContent(downloadResult.content);
    if (rows.length === 0) {
      return NextResponse.json({
        success: false,
        error: "Archivo descargado pero sin registros válidos",
        captchaSolveMs: downloadResult.captchaSolveMs,
      }, { status: 422 });
    }

    // Step 3: Import
    const supabase = createAdminClient();
    const importResult = await importCMFRows(supabase, rows);

    const fondos = new Set(rows.map(r => `${r.runFm}-${r.serie}`)).size;

    return NextResponse.json({
      success: true,
      rango: { inicio, termino },
      registros: rows.length,
      fondos,
      captchaSolveMs: downloadResult.captchaSolveMs,
      attempt: downloadResult.attempt,
      import: importResult,
    });
  } catch (error) {
    console.error("CMF auto-sync error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Error en auto-sync CMF" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  // If called by Vercel Cron (Bearer CRON_SECRET), trigger auto-sync
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    // Delegate to POST handler logic
    return POST(request);
  }

  const blocked = await applyRateLimit(request, "cmf-auto-status", { limit: 30, windowSeconds: 60 });
  if (blocked) return blocked;

  const { error: authError } = await requireAdmin();
  if (authError) return authError;

  const supabase = createAdminClient();

  try {
    // Latest CMF import date
    const { data: latest } = await supabase
      .from("fund_cuota_history")
      .select("fecha, created_at")
      .eq("source", "cmf_cartola")
      .order("fecha", { ascending: false })
      .limit(1)
      .single();

    // Total fondos
    const { count: totalFondos } = await supabase
      .from("fondos_mutuos")
      .select("*", { count: "exact", head: true });

    // Today's prices
    const today = new Date().toISOString().split("T")[0];
    const { count: todayPrices } = await supabase
      .from("fondos_rentabilidades_diarias")
      .select("*", { count: "exact", head: true })
      .eq("fecha", today);

    // Yesterday's prices (more relevant — today may not be available yet)
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    const { count: yesterdayPrices } = await supabase
      .from("fondos_rentabilidades_diarias")
      .select("*", { count: "exact", head: true })
      .eq("fecha", yesterday);

    const has2captcha = !!process.env.TWOCAPTCHA_API_KEY;

    return NextResponse.json({
      success: true,
      latestDate: latest?.fecha || null,
      latestSyncAt: latest?.created_at || null,
      totalFondos: totalFondos || 0,
      todayPrices: todayPrices || 0,
      yesterdayPrices: yesterdayPrices || 0,
      autoSyncAvailable: has2captcha,
    });
  } catch (error) {
    console.error("CMF auto-sync status error:", error);
    return NextResponse.json(
      { success: false, error: "Error consultando estado" },
      { status: 500 }
    );
  }
}

// parseCMFContent is now imported from @/lib/cmf-import
