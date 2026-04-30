// POST /api/portfolio/backfill-cmf
// Después de guardar snapshot, descarga precios históricos de CMF para los fondos del portafolio.
// Un solo captcha = todos los fondos × todo el rango de fechas.
// Se ejecuta en background desde el frontend — no bloquea al usuario.

import { NextRequest, NextResponse } from "next/server";
import { requireAdvisor, createAdminClient } from "@/lib/auth/api-auth";
import { applyRateLimit } from "@/lib/rate-limit";
import { downloadCMFCartola } from "@/lib/cmf-auto";
import { importCMFRows, parseCMFContent } from "@/lib/cmf-import";

export const maxDuration = 300; // 5 min — captcha + download puede tomar tiempo

interface BackfillRequest {
  runs: number[];         // RUNs de los fondos a buscar
  snapshotDate?: string;  // Fecha de la cartola (YYYY-MM-DD)
}

export async function POST(req: NextRequest) {
  const blocked = await applyRateLimit(req, "backfill-cmf", { limit: 3, windowSeconds: 300 });
  if (blocked) return blocked;

  const { error: authError } = await requireAdvisor();
  if (authError) return authError;

  if (!process.env.TWOCAPTCHA_API_KEY) {
    return NextResponse.json(
      { success: false, error: "TWOCAPTCHA_API_KEY no configurada" },
      { status: 500 }
    );
  }

  const { runs, snapshotDate } = (await req.json()) as BackfillRequest;

  if (!runs || runs.length === 0) {
    return NextResponse.json({ success: false, error: "runs requeridos" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Determinar rango de fechas: desde lo más antiguo posible hasta hoy
  // CMF tiene datos desde ~2002. Intentamos 3 años primero, si falla bajamos.
  const today = new Date();
  const termino = formatDDMMYYYY(today);

  // Revisar qué datos ya tenemos para no bajar de más
  const fondoIds: string[] = [];
  for (const run of runs) {
    const { data } = await supabase
      .from("fondos_mutuos")
      .select("id")
      .eq("fo_run", run)
      .limit(10);
    if (data) fondoIds.push(...data.map((d: { id: string }) => d.id));
  }

  // Buscar la fecha más antigua que ya tenemos
  let oldestExisting: string | null = null;
  if (fondoIds.length > 0) {
    const { data: oldest } = await supabase
      .from("fondos_rentabilidades_diarias")
      .select("fecha")
      .in("fondo_id", fondoIds)
      .order("fecha", { ascending: true })
      .limit(1)
      .maybeSingle();
    oldestExisting = oldest?.fecha || null;
  }

  // Calcular fecha inicio: 3 años atrás o hasta donde no tengamos datos
  const threeYearsAgo = new Date(today);
  threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3);

  // Si ya tenemos datos antiguos, solo llenar desde la fecha más antigua hacia atrás no vale la pena
  // Mejor descargar todo el rango y dejar que el upsert maneje duplicados
  const inicio = formatDDMMYYYY(threeYearsAgo);

  console.log(`[backfill-cmf] Descargando CMF: ${inicio} → ${termino} para ${runs.length} fondos (RUNs: ${runs.join(", ")})`);
  console.log(`[backfill-cmf] Datos existentes desde: ${oldestExisting || "ninguno"}`);

  // Estrategia: intentar el rango completo primero.
  // Si CMF lo rechaza por ser muy grande, partir en chunks de 1 año.
  const ranges = buildDateRanges(threeYearsAgo, today);

  let totalRegistros = 0;
  let totalImported = 0;
  let totalErrors = 0;
  const rangeResults: Array<{ range: string; registros: number; imported: number; error?: string }> = [];

  for (const range of ranges) {
    try {
      console.log(`[backfill-cmf] Descargando rango: ${range.inicio} → ${range.termino}`);

      const downloadResult = await downloadCMFCartola({
        inicio: range.inicio,
        termino: range.termino,
        maxRetries: 2,
      });

      if (!downloadResult.success || !downloadResult.content) {
        console.warn(`[backfill-cmf] Rango ${range.inicio}-${range.termino} falló: ${downloadResult.error}`);
        rangeResults.push({
          range: `${range.inicio}-${range.termino}`,
          registros: 0,
          imported: 0,
          error: downloadResult.error,
        });
        // Si CMF dice "Sin información", el rango puede ser inválido — seguimos con el siguiente
        if (downloadResult.error?.includes("Sin informaci")) continue;
        totalErrors++;
        continue;
      }

      // Parsear y filtrar solo los fondos que nos interesan
      // RUNs de CMF vienen como string "9226-6", fo_run en BD es número 9226
      const allRows = parseCMFContent(downloadResult.content);
      const runSet = new Set(runs.map(String));
      const relevantRows = allRows.filter((r) => {
        const numericRun = r.runFm.replace(/\./g, "").replace(/-.*$/, "");
        return runSet.has(numericRun);
      });

      console.log(`[backfill-cmf] Rango ${range.inicio}-${range.termino}: ${allRows.length} total, ${relevantRows.length} relevantes`);

      if (relevantRows.length > 0) {
        const importResult = await importCMFRows(supabase, relevantRows);
        totalImported += importResult.dailyPricesUpserted;
        rangeResults.push({
          range: `${range.inicio}-${range.termino}`,
          registros: relevantRows.length,
          imported: importResult.dailyPricesUpserted,
        });
      } else {
        // Aun así importar todo — otros fondos también se benefician
        const importResult = await importCMFRows(supabase, allRows);
        totalImported += importResult.dailyPricesUpserted;
        rangeResults.push({
          range: `${range.inicio}-${range.termino}`,
          registros: allRows.length,
          imported: importResult.dailyPricesUpserted,
        });
      }

      totalRegistros += allRows.length;
    } catch (err) {
      console.error(`[backfill-cmf] Error en rango ${range.inicio}-${range.termino}:`, err);
      rangeResults.push({
        range: `${range.inicio}-${range.termino}`,
        registros: 0,
        imported: 0,
        error: err instanceof Error ? err.message : "Error desconocido",
      });
      totalErrors++;
    }
  }

  return NextResponse.json({
    success: totalErrors === 0 || totalImported > 0,
    totalRegistros,
    totalImported,
    totalErrors,
    ranges: rangeResults,
    fondosRequested: runs.length,
    oldestExisting,
  });
}

// Partir rango en chunks de 1 año para evitar que CMF rechace rangos muy grandes
function buildDateRanges(from: Date, to: Date): Array<{ inicio: string; termino: string }> {
  const ranges: Array<{ inicio: string; termino: string }> = [];
  const current = new Date(from);

  while (current < to) {
    const chunkEnd = new Date(current);
    chunkEnd.setFullYear(chunkEnd.getFullYear() + 1);
    if (chunkEnd > to) chunkEnd.setTime(to.getTime());

    ranges.push({
      inicio: formatDDMMYYYY(current),
      termino: formatDDMMYYYY(chunkEnd),
    });

    // Avanzar al día siguiente del chunk para no solapar
    current.setTime(chunkEnd.getTime());
    current.setDate(current.getDate() + 1);
  }

  return ranges;
}

function formatDDMMYYYY(date: Date): string {
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = date.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}
