// app/api/fondos-inversion/sync-fichas/route.ts
// Scrape fichas PDF from CMF for Fondos de Inversión
// Same flow as FM but uses tipoentidad=FIRES and fi_fichas table

import { NextRequest, NextResponse } from "next/server";
import { requireAdvisor, createAdminClient } from "@/lib/auth/api-auth";
import { applyRateLimit } from "@/lib/rate-limit";
import { extractText } from "unpdf";

export const maxDuration = 300;

interface ExtractedFichaData {
  tac_serie: number | null;
  nombre_fondo_pdf: string | null;
  serie_detectada: string | null;
  rent_1m: number | null;
  rent_3m: number | null;
  rent_6m: number | null;
  rent_12m: number | null;
  rescatable: boolean | null;
  plazo_rescate: string | null;
  horizonte_inversion: string | null;
  tolerancia_riesgo: string | null;
  objetivo: string | null;
}

async function extractFromPdf(buffer: ArrayBuffer): Promise<ExtractedFichaData> {
  const result = await extractText(new Uint8Array(buffer));
  const text = (result.text as string[]).join("\n");

  // TAC Serie
  let tac_serie: number | null = null;
  const tacMatch = text.match(/TAC\s+Serie\s+\(?(?:IVA\s+incluido|Exento\s+de\s+IVA)\)?\s+([\d,]+)%/i);
  if (tacMatch) {
    tac_serie = parseFloat(tacMatch[1].replace(",", "."));
  }

  // Rentabilidades
  const parseRent = (label: string): number | null => {
    const re = new RegExp(label + "\\s+(-?[\\d,.]+)%", "i");
    const m = text.match(re);
    if (m) return parseFloat(m[1].replace(",", "."));
    return null;
  };

  // Fund name — FI footer format: "NOMBRE FONDO DE INVERSION | SERIE X"
  let nombre_fondo_pdf: string | null = null;
  let serie_detectada: string | null = null;
  // Try FM format first, then FI footer format
  const headerMatch = text.match(/FONDO\s+(?:MUTUO|DE\s+INVERSI[OÓ]N)\s+([^|]+)\|\s*SERIE\s+(\S+)/i);
  if (headerMatch) {
    nombre_fondo_pdf = headerMatch[1].trim();
    serie_detectada = headerMatch[2].trim();
  }
  if (!nombre_fondo_pdf) {
    // FI footer: "NOMBRE FONDO DE INVERSION | SERIE X"
    const footerMatch = text.match(/([A-ZÁÉÍÓÚÑ\s]+(?:FONDO DE INVERSI[OÓ]N))\s*\|\s*SERIE\s+(\S+)/i);
    if (footerMatch) {
      nombre_fondo_pdf = footerMatch[1].trim();
      serie_detectada = footerMatch[2].trim();
    }
  }

  // Rescatable — FI uses table format: "Fondo es rescatable" then "SI" or "NO" nearby
  let rescatable: boolean | null = null;
  const rescatableMatch = text.match(/Fondo\s+es\s+[Rr]escatable[:\s]*(SI|NO)/i);
  if (rescatableMatch) {
    rescatable = rescatableMatch[1].toUpperCase() === "SI";
  } else {
    // FI table: "Fondo es rescatable" as header, then SI/NO on next line or same region
    const rescIdx = text.search(/Fondo\s+es\s+rescatable/i);
    if (rescIdx >= 0) {
      const after = text.substring(rescIdx, rescIdx + 200);
      const siNo = after.match(/\b(SI|NO)\b/);
      if (siNo) rescatable = siNo[1] === "SI";
    }
  }

  // Plazo rescates — FI has "X días hábiles" pattern in the table
  let plazo_rescate: string | null = null;
  // First try the explicit "Plazo Rescates: value" format (FM style)
  const plazoExplicit = text.match(/Plazo\s+Rescates?:\s*(\d[^\n]*)/i);
  if (plazoExplicit) {
    plazo_rescate = plazoExplicit[1].trim();
  }
  if (!plazo_rescate) {
    // FI: look for "X días hábiles" pattern anywhere
    const diasMatch = text.match(/(\d+\s+días?\s+hábiles?[^.(\n]*)/i);
    if (diasMatch) plazo_rescate = diasMatch[1].trim();
  }

  // Horizonte
  const horizonteMatch = text.match(/((?:Corto|Mediano|Largo)(?:\s+(?:o|y|a)\s+(?:corto|mediano|largo))*\s+plazo)/i);
  const horizonte_inversion = horizonteMatch ? horizonteMatch[1].trim() : null;

  // Tolerancia
  const toleranciaMatch = text.match(/Nivel\s+(alto|medio|bajo|moderado)/i);
  const tolerancia_riesgo = toleranciaMatch ? toleranciaMatch[0].trim() : null;

  // Objetivo
  const objIdx = text.indexOf("Objetivo del Fondo");
  const tolIdx = text.indexOf("Tolerancia al Riesgo");
  const objetivo = objIdx >= 0 && tolIdx > objIdx
    ? text.substring(objIdx + "Objetivo del Fondo".length, tolIdx).replace(/\n/g, " ").trim().substring(0, 500)
    : null;

  return {
    tac_serie,
    nombre_fondo_pdf,
    serie_detectada,
    rent_1m: parseRent("1\\s*Mes"),
    rent_3m: parseRent("3\\s*Meses"),
    rent_6m: parseRent("6\\s*Meses"),
    rent_12m: parseRent("1\\s*Año"),
    rescatable,
    plazo_rescate,
    horizonte_inversion,
    tolerancia_riesgo,
    objetivo,
  };
}

// Discover rutAdmin and available series from CMF page (tipoentidad=FIRES for FI)
async function discoverFromCmfPage(fiRut: string): Promise<{ rutAdmin: string; series: string[] } | null> {
  const url = `https://www.cmfchile.cl/institucional/mercados/entidad.php?mercado=V&rut=${fiRut}&tipoentidad=FIRES&vig=VI&control=svs&pestania=68`;
  const res = await fetch(url);
  const html = await res.text();
  const matches = [...html.matchAll(/verFolleto\('(\d+)','([^']+)','(\d+)'\)/g)];
  if (matches.length === 0) return null;
  const rutAdmin = matches[0][3];
  const series = [...new Set(matches.map(m => m[2]))];
  return { rutAdmin, series };
}

async function getPdfUrl(fiRut: string, serie: string, rutAdmin: string): Promise<string | null> {
  const res = await fetch("https://www.cmfchile.cl/institucional/inc/ver_folleto_fm.php", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "X-Requested-With": "XMLHttpRequest",
    },
    body: `runFondo=${fiRut}&serie=${encodeURIComponent(serie)}&rutAdmin=${rutAdmin}`,
  });
  const text = await res.text();
  if (text === "ERROR" || text.includes("DOCTYPE")) return null;
  return text.trim();
}

async function downloadPdf(pdfPath: string): Promise<ArrayBuffer | null> {
  const url = `https://www.cmfchile.cl${pdfPath}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  return res.arrayBuffer();
}

// POST - Sync fichas for a batch of FI
export async function POST(request: NextRequest) {
  const blocked = await applyRateLimit(request, "sync-fichas-fi", { limit: 3, windowSeconds: 60 });
  if (blocked) return blocked;

  const { user, error: authError } = await requireAdvisor();
  if (authError) return authError;

  const supabase = createAdminClient();
  const body = await request.json();

  const { administradora, fi_ruts, limit: batchLimit = 20 } = body;

  if (!administradora && !fi_ruts) {
    return NextResponse.json({
      success: false,
      error: "Debe especificar administradora o fi_ruts",
    }, { status: 400 });
  }

  // Get fondos to sync
  let fondosToSync: { id: string; rut: string; nombre: string; administradora: string }[] = [];

  if (fi_ruts && Array.isArray(fi_ruts)) {
    const { data } = await supabase
      .from("fondos_inversion")
      .select("id, rut, nombre, administradora")
      .in("rut", fi_ruts)
      .eq("activo", true);
    fondosToSync = data || [];
  } else if (administradora) {
    const { data } = await supabase
      .from("fondos_inversion")
      .select("id, rut, nombre, administradora")
      .ilike("administradora", `%${administradora}%`)
      .eq("activo", true)
      .limit(batchLimit);
    fondosToSync = data || [];
  }

  if (fondosToSync.length === 0) {
    return NextResponse.json({ success: true, message: "No se encontraron fondos", synced: 0 });
  }

  const results: { fi_rut: string; nombre: string; serie: string; status: string }[] = [];
  let synced = 0;
  let errors = 0;

  for (const fondo of fondosToSync) {
    try {
      const cmfData = await discoverFromCmfPage(fondo.rut);
      if (!cmfData) {
        results.push({ fi_rut: fondo.rut, nombre: fondo.nombre, serie: "-", status: "no_folleto_page" });
        errors++;
        continue;
      }

      // Process EVERY serie — each has its own TAC/costs
      for (const serie of cmfData.series) {
        try {
          const pdfUrl = await getPdfUrl(fondo.rut, serie, cmfData.rutAdmin);
          if (!pdfUrl) {
            results.push({ fi_rut: fondo.rut, nombre: fondo.nombre, serie, status: "no_pdf" });
            errors++;
            continue;
          }

          const pdfBuffer = await downloadPdf(pdfUrl);
          if (!pdfBuffer) {
            results.push({ fi_rut: fondo.rut, nombre: fondo.nombre, serie, status: "download_failed" });
            errors++;
            continue;
          }

          const extracted = await extractFromPdf(pdfBuffer);

          const { error: upsertError } = await supabase
            .from("fi_fichas")
            .upsert({
              fi_rut: fondo.rut,
              fi_serie: serie,
              tac_serie: extracted.tac_serie,
              nombre_fondo_pdf: extracted.nombre_fondo_pdf,
              serie_detectada: extracted.serie_detectada,
              rent_1m: extracted.rent_1m,
              rent_3m: extracted.rent_3m,
              rent_6m: extracted.rent_6m,
              rent_12m: extracted.rent_12m,
              rescatable: extracted.rescatable,
              plazo_rescate: extracted.plazo_rescate,
              horizonte_inversion: extracted.horizonte_inversion,
              tolerancia_riesgo: extracted.tolerancia_riesgo,
              objetivo: extracted.objetivo,
              updated_at: new Date().toISOString(),
              updated_by: user!.id,
            }, { onConflict: "fi_rut,fi_serie" });

          if (upsertError) {
            results.push({ fi_rut: fondo.rut, nombre: fondo.nombre, serie, status: `db_error: ${upsertError.message}` });
            errors++;
          } else {
            results.push({ fi_rut: fondo.rut, nombre: fondo.nombre, serie, status: "ok" });
            synced++;
          }

          await new Promise(r => setTimeout(r, 300));
        } catch (err) {
          results.push({ fi_rut: fondo.rut, nombre: fondo.nombre, serie, status: `error: ${err instanceof Error ? err.message : "unknown"}` });
          errors++;
        }
      }
    } catch (err) {
      results.push({ fi_rut: fondo.rut, nombre: fondo.nombre, serie: "-", status: `error: ${err instanceof Error ? err.message : "unknown"}` });
      errors++;
    }
  }

  return NextResponse.json({ success: true, synced, errors, total: fondosToSync.length, results });
}

// GET - Check sync status / list administradoras
export async function GET(request: NextRequest) {
  const blocked = await applyRateLimit(request, "sync-fichas-fi-get", { limit: 10, windowSeconds: 60 });
  if (blocked) return blocked;

  const { error: authError } = await requireAdvisor();
  if (authError) return authError;

  const supabase = createAdminClient();

  // Use SQL RPC for accurate counts with JOIN
  const { data: sqlResult, error: sqlError } = await supabase.rpc("get_fi_fichas_sync_status");

  if (sqlError || !sqlResult) {
    // Fallback: simple count without per-admin breakdown
    const { count: fichasCount } = await supabase
      .from("fi_fichas")
      .select("*", { count: "exact", head: true });

    const { data: fondos } = await supabase
      .from("fondos_inversion")
      .select("administradora")
      .eq("activo", true);

    const adminCounts: Record<string, number> = {};
    fondos?.forEach((f: { administradora: string | null }) => {
      if (f.administradora) adminCounts[f.administradora] = (adminCounts[f.administradora] || 0) + 1;
    });

    const adminList = Object.entries(adminCounts)
      .map(([nombre, count]) => ({ nombre, count, synced: 0 }))
      .sort((a, b) => b.count - a.count);

    return NextResponse.json({
      success: true,
      fichas_synced: fichasCount || 0,
      admin_list: adminList,
      fallback: true,
    });
  }

  const adminList = (sqlResult as { administradora: string; total: number; synced: number }[])
    .map(r => ({
      nombre: r.administradora,
      count: Number(r.total),
      synced: Number(r.synced),
    }))
    .sort((a, b) => b.count - a.count);

  const totalSynced = adminList.reduce((sum, a) => sum + a.synced, 0);

  return NextResponse.json({
    success: true,
    fichas_synced: totalSynced,
    admin_list: adminList,
  });
}
