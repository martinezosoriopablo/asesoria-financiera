// lib/cmf-fichas.ts
// Shared helpers for scraping fichas (folletos) from CMF
// Used by both fondos mutuos and fondos de inversión sync routes

type EntityType = "RGFMU" | "FIRES";

/**
 * Discover rutAdmin and available series for a fund from CMF folleto page.
 * RGFMU = Fondos Mutuos, FIRES = Fondos de Inversión
 */
export async function discoverFromCmfPage(
  rut: string | number,
  tipoEntidad: EntityType
): Promise<{ rutAdmin: string; series: string[] } | null> {
  const url = `https://www.cmfchile.cl/institucional/mercados/entidad.php?mercado=V&rut=${rut}&tipoentidad=${tipoEntidad}&vig=VI&control=svs&pestania=68`;
  const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
  const html = await res.text();

  if (tipoEntidad === "FIRES") {
    // FI regex: verFolleto('id','serie','rutAdmin')
    const matches = [...html.matchAll(/verFolleto\('(\d+)','([^']+)','(\d+)'\)/g)];
    if (matches.length === 0) return null;
    const rutAdmin = matches[0][3];
    const series = [...new Set(matches.map(m => m[2]))];
    return { rutAdmin, series };
  } else {
    // FM regex: verFolleto('id','serie','rutAdmin') — different capture groups
    const matches = [...html.matchAll(/verFolleto\('\d+','([^']+)','(\d+)'\)/g)];
    if (matches.length === 0) return null;
    const rutAdmin = matches[0][2];
    const series = [...new Set(matches.map(m => m[1]))];
    return { rutAdmin, series };
  }
}

/**
 * Get PDF URL from CMF for a specific fund+serie.
 * Works for both FM and FI — same endpoint.
 */
export async function getPdfUrl(
  fundRut: string | number,
  serie: string,
  rutAdmin: string
): Promise<string | null> {
  const res = await fetch("https://www.cmfchile.cl/institucional/inc/ver_folleto_fm.php", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "X-Requested-With": "XMLHttpRequest",
    },
    body: `runFondo=${fundRut}&serie=${encodeURIComponent(serie)}&rutAdmin=${rutAdmin}`,
    signal: AbortSignal.timeout(30000),
  });
  const text = await res.text();
  if (text === "ERROR" || text.includes("DOCTYPE")) return null;
  return text.trim();
}

/**
 * Download a PDF from CMF given a relative path.
 */
export async function downloadPdf(pdfPath: string): Promise<ArrayBuffer | null> {
  const url = `https://www.cmfchile.cl${pdfPath}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) return null;
  return res.arrayBuffer();
}
