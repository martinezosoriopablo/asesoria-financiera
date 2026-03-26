// lib/aafm-sync.ts
// Downloads daily fund data from AAFM (Asociación de Fondos Mutuos)
// and updates fintual_funds table with current prices

import * as XLSX from "xlsx";

// Conditional debug logging — silent in production
const DEBUG = process.env.NODE_ENV === "development";
function debugLog(...args: unknown[]) { if (DEBUG) console.log("[AAFM]", ...args); }

// AAFM export endpoint — accepts filter parameters directly
const AAFM_BASE = "https://estadisticas2.aafm.cl";
const AAFM_EXPORT_URL = `${AAFM_BASE}/Rentabilities/ExportRentabilitiesCompleteList`;

interface AAFMFundRow {
  administradora: string;
  run: string;
  fondo: string;
  serie: string;
  moneda: string;
  categoria: string;
  valorCuota: number;       // Valor cuota en pesos chilenos
  valorCuotaOrig?: number;  // Valor cuota en moneda original (USD for dollar funds)
  fecha: string;
  patrimonio?: number;
  participes?: number;
  rent1d?: number;
  rent7d?: number;
  rent30d?: number;
  rent90d?: number; // 3 months
  rentYTD?: number;
  rent1y?: number;
}

// Get date string in Chilean time (YYYY-MM-DD)
function toChileDateStr(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: "America/Santiago" }); // en-CA gives YYYY-MM-DD
}

export async function fetchAAFMData(date?: Date): Promise<Buffer | AAFMFundRow[]> {
  const d = date || new Date();
  const dateStr = toChileDateStr(d);

  const body = new URLSearchParams({
    FilterPeriodOneDay: "True",
    FilterPeriodSevenDays: "True",
    FilterPeriodThirtyDays: "True",
    FilterPeriodThreeMonths: "True",
    FilterPeriodYear: "True",
    FilterPeriodYTD: "True",
    FilterRentNomSelected: "True",
    FilterRentRealSelected: "False",
    DateToConsult: dateStr,
    ListAdministrators: "0",        // All administrators
    ListCategoriesAafm: "0",        // All categories
    InversionType: "A",             // All types (Nacional + Internacional)
    Apv: "3",                       // All (APV + non-APV)
    InputSearch: "NO INDICADO,NO INDICADO,NO INDICADO,NO INDICADO,NO INDICADO,NO INDICADO,NO INDICADO",
  });

  debugLog(`Requesting export for ${dateStr}...`);

  const response = await fetch(AAFM_EXPORT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "Accept": "application/json, text/javascript, */*; q=0.01",
      "X-Requested-With": "XMLHttpRequest",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36",
      "Origin": AAFM_BASE,
      "Referer": `${AAFM_BASE}/Rentabilities`,
    },
    body: body.toString(),
  });

  if (!response.ok) {
    throw new Error(`AAFM request failed: ${response.status} ${response.statusText}`);
  }

  const contentType = response.headers.get("content-type") || "";
  const arrayBuffer = await response.arrayBuffer();
  const buf = Buffer.from(arrayBuffer);
  const text = buf.toString("utf8").trim();

  debugLog(`Response: ${(buf.length / 1024).toFixed(0)} KB, Content-Type: ${contentType}`);

  // Response is JSON with FileContents byte array (ASP.NET FileContentResult)
  if (text.startsWith("{") || text.startsWith("[")) {
    const json = JSON.parse(text);

    if (json.FileContents) {
      let excelBuffer: Buffer;
      if (Array.isArray(json.FileContents)) {
        excelBuffer = Buffer.from(json.FileContents);
      } else {
        excelBuffer = Buffer.from(json.FileContents, "base64");
      }
      debugLog(`Excel: ${(excelBuffer.length / 1024).toFixed(0)} KB`);
      return excelBuffer;
    }

    return parseAAFMJson(json, dateStr);
  }

  return buf;
}

// Parse JSON response from AAFM (the actual format returned by the API)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseAAFMJson(json: any, dateStr: string): AAFMFundRow[] {
  // The JSON could be: { Data: [...] }, [...], or { items: [...] }
  let items: unknown[];

  if (Array.isArray(json)) {
    items = json;
  } else if (json.Data && Array.isArray(json.Data)) {
    items = json.Data;
  } else if (json.data && Array.isArray(json.data)) {
    items = json.data;
  } else if (json.items && Array.isArray(json.items)) {
    items = json.items;
  } else {
    // Log the structure to understand it
    const keys = Object.keys(json);
    debugLog("JSON top-level keys:", keys);
    for (const key of keys.slice(0, 5)) {
      const val = json[key];
      debugLog(`${key}: ${typeof val} ${Array.isArray(val) ? `(array of ${val.length})` : typeof val === "object" ? JSON.stringify(val).substring(0, 200) : String(val).substring(0, 100)}`);
    }
    throw new Error(`AAFM JSON: unknown structure. Keys: ${keys.join(", ")}`);
  }

  debugLog(`JSON found ${items.length} items`);
  if (items.length > 0) {
    debugLog("Sample item:", JSON.stringify(items[0]).substring(0, 500));
  }

  const results: AAFMFundRow[] = [];

  for (const item of items) {
    const row = item as Record<string, unknown>;

    // Try common field name patterns (Spanish and English)
    const fondo = String(
      row.NombreFondo || row.Fondo || row.FundName || row.nombre_fondo || row.Name || ""
    ).trim();
    if (!fondo) continue;

    const valorCuota = toNum(
      row.ValorCuota || row.Valor || row.NavValue || row.valor_cuota || row.Price || row.Nav || 0
    );
    if (valorCuota <= 0) continue;

    results.push({
      administradora: String(row.Administradora || row.Admin || row.NombreAdministradora || row.AGF || "").trim(),
      run: String(row.Run || row.RUN || row.RunFondo || row.fo_run || "").trim(),
      fondo,
      serie: String(row.Serie || row.SerieName || row.fm_serie || "").trim(),
      moneda: String(row.Moneda || row.Currency || row.MonedaFuncional || "CLP").trim(),
      categoria: String(row.Categoria || row.CategoriaAafm || row.Category || "").trim(),
      valorCuota,
      valorCuotaOrig: toNum(row.ValorCuotaOrig || row.ValorCuotaMonedaOriginal || row.valor_cuota_orig || 0) || undefined,
      fecha: dateStr,
      patrimonio: toNum(row.Patrimonio || row.PatrimonioMM || 0) || undefined,
      participes: toNum(row.Participes || row.NumeroParticipes || 0) || undefined,
      rent1d: toNum(row.Rent1D || row.RentabilidadDiaria || row.Rent1Dia || 0) || undefined,
      rent7d: toNum(row.Rent7D || row.Rentabilidad7Dias || row.Rent7Dias || 0) || undefined,
      rent30d: toNum(row.Rent30D || row.Rentabilidad30Dias || row.Rent30Dias || row.Rent1Mes || 0) || undefined,
      rent90d: toNum(row.Rent90D || row.Rentabilidad3Meses || row.Rent3Meses || 0) || undefined,
      rentYTD: toNum(row.RentYTD || row.RentabilidadYTD || 0) || undefined,
      rent1y: toNum(row.Rent365D || row.Rentabilidad12Meses || row.Rent1Anio || 0) || undefined,
    });
  }

  return results;
}

function toNum(val: unknown): number {
  if (val === null || val === undefined || val === "") return 0;
  if (typeof val === "number") return val;
  const str = String(val).replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  const num = parseFloat(str);
  return isNaN(num) ? 0 : num;
}

export function parseAAFMExcel(buffer: Buffer): AAFMFundRow[] {
  const workbook = XLSX.read(buffer, { type: "buffer" });

  debugLog("Sheet names:", workbook.SheetNames);

  // Prefer "Rentabilidades" sheet, fall back to first sheet
  const sheetName = workbook.SheetNames.find((s) => s.toLowerCase().includes("rentabilidades")) || workbook.SheetNames[0];
  debugLog("Using sheet:", sheetName);
  const sheet = workbook.Sheets[sheetName];

  // Get raw rows as arrays to handle varying column names
  let rawRows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  debugLog(`Sheet "${sheetName}" has ${rawRows.length} rows`);

  // If this sheet has too few rows, try other sheets
  if (rawRows.length < 8) {
    for (const altName of workbook.SheetNames) {
      if (altName === sheetName) continue;
      const altSheet = workbook.Sheets[altName];
      const altRows: unknown[][] = XLSX.utils.sheet_to_json(altSheet, { header: 1 });
      debugLog(`Trying sheet "${altName}": ${altRows.length} rows`);
      if (altRows.length > rawRows.length) {
        rawRows = altRows;
        debugLog(`Switched to sheet "${altName}" with ${rawRows.length} rows`);
        break;
      }
    }
  }

  if (rawRows.length < 8) {
    console.warn(`[AAFM Parse] Excel has too few rows (${rawRows.length}) — no data for this date`);
    return [];
  }

  // Find header row — might not be row 0 (AAFM has title rows: empty, date, "RENTABILIDADES", then headers)
  // Search first 15 rows for one that has "Fondo" and "Serie" as cell values
  let headerRowIdx = -1;
  for (let r = 0; r < Math.min(rawRows.length, 15); r++) {
    const row = rawRows[r] as unknown[];
    if (!row || row.length < 5) continue;
    const rowStr = row.map((c) => String(c ?? "").toLowerCase()).join("|");
    if (rowStr.includes("fondo") && (rowStr.includes("serie") || rowStr.includes("cuota") || rowStr.includes("administradora"))) {
      headerRowIdx = r;
      break;
    }
  }

  if (headerRowIdx === -1) {
    for (let r = 0; r < Math.min(rawRows.length, 15); r++) {
      debugLog(`Row ${r}: ${JSON.stringify(rawRows[r])}`);
    }
    console.warn("[AAFM Parse] Cannot find header row in AAFM Excel");
    return [];
  }

  debugLog(`Using row ${headerRowIdx} as header`);

  const headers = (rawRows[headerRowIdx] as unknown[]).map((h) =>
    String(h ?? "").toLowerCase().trim()
  );

  debugLog("Headers:", headers.join(" | "));

  // Map column indices by matching known patterns from AAFM Excel
  // Actual headers: Administradora | Run | Fondo | Serie | Categoría CMF | Categoría AFM |
  //   Valor cuota (Peso Chileno) | Valor cuota (Moneda Original) | APV |
  //   Diaria Nominal (%) | 7 Días Nominal (%) | 30 Días Nominal (%) |
  //   3 Meses Nominal (%) | 12 Meses Nominal | YTD Nominal (%) | Moneda Original
  const colMap = {
    administradora: findCol(headers, ["administradora", "admin", "agf"]),
    run: findCol(headers, ["run", "rut"]),
    fondo: findCol(headers, ["fondo", "nombre fondo", "fund"]),
    serie: findCol(headers, ["serie", "series"]),
    moneda: findColExact(headers, ["moneda original", "currency"]),
    categoria: findCol(headers, ["categoría afm", "categoría cmf", "categoría", "categoria"]),
    valorCuota: findCol(headers, ["valor cuota (peso", "valor cuota", "cuota", "nav"]),
    valorCuotaOrig: findColExact(headers, ["valor cuota (moneda original)", "valor cuota (moneda"]),
    patrimonio: findCol(headers, ["patrimonio", "patrimony", "aum"]),
    participes: findCol(headers, ["partícipes", "participes", "shareholders"]),
    rent1d: findCol(headers, ["diaria nominal", "1 día", "1 dia", "diaria"]),
    rent7d: findCol(headers, ["7 días nominal", "7 días", "7 dias", "7d"]),
    rent30d: findCol(headers, ["30 días nominal", "30 días", "30 dias", "30d"]),
    rent90d: findCol(headers, ["3 meses nominal", "3 meses", "90 días"]),
    rentYTD: findCol(headers, ["ytd nominal", "ytd"]),
    rent1y: findCol(headers, ["12 meses nominal", "12 meses", "1 año", "365"]),
  };

  debugLog("Column mapping:", JSON.stringify(colMap));

  if (colMap.fondo === -1) {
    // Try second row as header
    throw new Error(`Cannot find 'fondo' column. Headers found: ${headers.join(", ")}`);
  }

  const results: AAFMFundRow[] = [];
  // Extract date from row 4 (AAFM puts "fecha: DD-MM-YYYY" in early rows)
  let dateFromExcel = new Date().toISOString().split("T")[0];
  for (let r = 0; r < Math.min(headerRowIdx, 10); r++) {
    const row = rawRows[r];
    if (!row) continue;
    for (const cell of row as unknown[]) {
      const cellStr = String(cell ?? "");
      const dateMatch = cellStr.match(/fecha:\s*(\d{2})-(\d{2})-(\d{4})/i);
      if (dateMatch) {
        dateFromExcel = `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`;
        break;
      }
    }
  }

  for (let i = headerRowIdx + 1; i < rawRows.length; i++) {
    const row = rawRows[i] as unknown[];
    if (!row || row.length < 3) continue;

    const fondo = String(row[colMap.fondo] || "").trim();
    if (!fondo) continue;

    const valorCuota = colMap.valorCuota >= 0 ? parseNumber(row[colMap.valorCuota]) : 0;
    if (valorCuota <= 0) continue; // Skip funds without a valid price

    results.push({
      administradora: colMap.administradora >= 0 ? String(row[colMap.administradora] || "").trim() : "",
      run: colMap.run >= 0 ? String(row[colMap.run] || "").trim() : "",
      fondo,
      serie: colMap.serie >= 0 ? String(row[colMap.serie] || "").trim() : "",
      moneda: colMap.moneda >= 0 ? String(row[colMap.moneda] || "CLP").trim() : "CLP",
      categoria: colMap.categoria >= 0 ? String(row[colMap.categoria] || "").trim() : "",
      valorCuota,
      valorCuotaOrig: colMap.valorCuotaOrig >= 0 ? parseNumber(row[colMap.valorCuotaOrig]) : undefined,
      fecha: dateFromExcel,
      patrimonio: colMap.patrimonio >= 0 ? parseNumber(row[colMap.patrimonio]) : undefined,
      participes: colMap.participes >= 0 ? parseNumber(row[colMap.participes]) : undefined,
      rent1d: colMap.rent1d >= 0 ? parseNumber(row[colMap.rent1d]) : undefined,
      rent7d: colMap.rent7d >= 0 ? parseNumber(row[colMap.rent7d]) : undefined,
      rent30d: colMap.rent30d >= 0 ? parseNumber(row[colMap.rent30d]) : undefined,
      rent90d: colMap.rent90d >= 0 ? parseNumber(row[colMap.rent90d]) : undefined,
      rentYTD: colMap.rentYTD >= 0 ? parseNumber(row[colMap.rentYTD]) : undefined,
      rent1y: colMap.rent1y >= 0 ? parseNumber(row[colMap.rent1y]) : undefined,
    });
  }

  return results;
}

function findCol(headers: string[], patterns: string[]): number {
  for (const pattern of patterns) {
    const idx = headers.findIndex((h) => h && h.includes(pattern));
    if (idx >= 0) return idx;
  }
  return -1;
}

// Match headers that start with the pattern (for disambiguation)
function findColExact(headers: string[], patterns: string[]): number {
  for (const pattern of patterns) {
    const idx = headers.findIndex((h) => h && h.trim() === pattern);
    if (idx >= 0) return idx;
  }
  // Fallback to startsWith
  for (const pattern of patterns) {
    const idx = headers.findIndex((h) => h && h.startsWith(pattern));
    if (idx >= 0) return idx;
  }
  return findCol(headers, patterns);
}

function parseNumber(value: unknown): number {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number") return value;
  // Try as-is first (already a number string like "60684.937")
  const direct = parseFloat(String(value));
  if (!isNaN(direct)) return direct;
  // Handle Chilean format: 1.234,56 → 1234.56
  const str = String(value).replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  const num = parseFloat(str);
  return isNaN(num) ? 0 : num;
}

// Match AAFM fund rows to fintual_funds records and update prices
export interface SyncResult {
  total: number;
  matched: number;
  updated: number;
  errors: number;
  fondosMutuosUpdated: number;
  historyRecords: number;
  sample: Array<{ fondo: string; serie: string; run: string; valorCuota: number; matched: boolean }>;
}

export async function syncAAFMToSupabase(
  funds: AAFMFundRow[],
  supabase: { from: (table: string) => unknown } // SupabaseClient type
): Promise<SyncResult> {
  const result: SyncResult = { total: funds.length, matched: 0, updated: 0, errors: 0, fondosMutuosUpdated: 0, historyRecords: 0, sample: [] };

  // Group by clean RUN (no check digit) for batch matching
  const byRun = new Map<string, AAFMFundRow[]>();
  for (const f of funds) {
    const cleanRun = f.run.replace(/-[\dK]$/i, "").trim(); // "9226-6" → "9226"
    if (cleanRun) {
      if (!byRun.has(cleanRun)) byRun.set(cleanRun, []);
      byRun.get(cleanRun)!.push(f);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;

  // Process RUN batches in PARALLEL (was sequential before)
  const runs = Array.from(byRun.keys());
  const BATCH = 50;
  const CONCURRENT = 5; // Max concurrent Supabase queries

  // Collect all price updates to batch at the end
  const pendingUpdates: Array<{ id: string; last_price: number; last_price_date: string; currency?: string }> = [];

  const batches: string[][] = [];
  for (let i = 0; i < runs.length; i += BATCH) {
    batches.push(runs.slice(i, i + BATCH));
  }

  // Process batches with limited concurrency
  for (let i = 0; i < batches.length; i += CONCURRENT) {
    const concurrentBatches = batches.slice(i, i + CONCURRENT);
    const promises = concurrentBatches.map(async (batchRuns) => {
      // Build all RUN variants: "9226", "9226-0" through "9226-9", "9226-K"
      const allRunVariants = batchRuns.flatMap((r: string) => [
        r,
        ...[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, "K"].map((d) => `${r}-${d}`),
      ]);

      const { data: fintualRecords, error } = await sb
        .from("fintual_funds")
        .select("id, fintual_id, run, fund_name, serie_name, symbol, last_price_date")
        .in("run", allRunVariants)
        .limit(1000);

      if (error) {
        console.error("Supabase query error:", error);
        result.errors += batchRuns.length;
        return;
      }

      if (fintualRecords && fintualRecords.length > 0) {
        collectMatchedUpdates(fintualRecords, byRun, result, pendingUpdates);
      }
    });
    await Promise.all(promises);
  }

  // Batch UPDATE fintual_funds prices — limited concurrency to avoid rate limits
  if (pendingUpdates.length > 0) {
    const UPDATE_CONCURRENT = 20; // Max simultaneous Supabase update calls
    for (let i = 0; i < pendingUpdates.length; i += UPDATE_CONCURRENT) {
      const batch = pendingUpdates.slice(i, i + UPDATE_CONCURRENT);
      const results = await Promise.all(
        batch.map((u) => {
          const updateData: Record<string, unknown> = { last_price: u.last_price, last_price_date: u.last_price_date };
          if (u.currency) updateData.currency = u.currency;
          return sb.from("fintual_funds").update(updateData).eq("id", u.id);
        })
      );
      for (const r of results) {
        if (r.error) result.errors++;
        else result.updated++;
      }
    }
  }

  // Also sync rentabilities to fondos_mutuos ecosystem (Market Dashboard)
  const fmResult = await syncAAFMToFondosMutuos(funds, sb);
  result.fondosMutuosUpdated = fmResult.updated;
  result.historyRecords = fmResult.historyRecords;

  // Take a sample of first 10
  const sampleFunds = funds.slice(0, 10);
  for (const f of sampleFunds) {
    result.sample.push({
      fondo: f.fondo,
      serie: f.serie,
      run: f.run,
      valorCuota: f.valorCuota,
      matched: result.matched > 0,
    });
  }

  return result;
}

// Serie code mapping (shared between matching functions)
const SERIE_VARIANTS: Record<string, string[]> = {
  "BANCA PRIVADA": ["BPRIV", "BP"],
  "BPRIVADA": ["BPRIV", "BP"],
  "B. PRIVADA": ["BPRIV", "BP"],
  "ALTO PATRIMONIO": ["ALPAT", "AP"],
  "A. PATRIMONIO": ["ALPAT", "AP"],
  "INSTITUCIONAL": ["INSTI", "I"],
  "INVERSIONISTA": ["INVER"],
  "COLABORADOR": ["COLAB"],
  "CLASICA": ["CLASI", "C"],
  "CLÁSICA": ["CLASI", "C"],
};

function matchFondoId(fondosMap: Map<string, string>, cleanRun: string, serieUpper: string): string | undefined {
  let fondoId = fondosMap.get(`${cleanRun}-${serieUpper}`);
  if (!fondoId) {
    const variants = SERIE_VARIANTS[serieUpper] || [];
    for (const v of variants) {
      fondoId = fondosMap.get(`${cleanRun}-${v}`);
      if (fondoId) break;
    }
  }
  return fondoId;
}

// Sync AAFM rentabilities to fondos_rentabilidades_agregadas (feeds Market Dashboard)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function syncAAFMToFondosMutuos(funds: AAFMFundRow[], sb: any): Promise<{ updated: number; historyRecords: number }> {
  // 1. Load all fondos_mutuos into a map — parallel pages for speed
  const fondosMap = new Map<string, string>();

  // First page to get count estimate
  const { data: firstPage, error: firstErr } = await sb
    .from("fondos_mutuos")
    .select("id, fo_run, fm_serie")
    .range(0, 999);

  if (firstErr || !firstPage) {
    console.error("[AAFM→FM] Failed to load fondos_mutuos:", firstErr?.message);
    return { updated: 0, historyRecords: 0 };
  }

  for (const f of firstPage) {
    fondosMap.set(`${f.fo_run}-${(f.fm_serie || "").toUpperCase()}`, f.id);
  }

  // If first page was full, fetch remaining pages in parallel
  if (firstPage.length === 1000) {
    const pagePromises: Promise<void>[] = [];
    for (let page = 1; page < 10; page++) {
      const p = page;
      pagePromises.push(
        (async () => {
          const { data } = await sb
            .from("fondos_mutuos")
            .select("id, fo_run, fm_serie")
            .range(p * 1000, (p + 1) * 1000 - 1);
          if (data) {
            for (const f of data) {
              fondosMap.set(`${f.fo_run}-${(f.fm_serie || "").toUpperCase()}`, f.id);
            }
          }
        })()
      );
    }
    await Promise.all(pagePromises);
  }

  debugLog(`[FM] Loaded ${fondosMap.size} fondos_mutuos records`);

  // 2. Single pass: match AAFM funds and build BOTH agregadas + daily price records
  const fecha = funds[0]?.fecha || new Date().toISOString().split("T")[0];
  const registros: Array<Record<string, unknown>> = [];
  const dailyPrices: Array<Record<string, unknown>> = [];

  for (const f of funds) {
    const cleanRun = f.run.replace(/-[\dK]$/i, "").trim();
    if (!cleanRun) continue;

    const serieUpper = f.serie.toUpperCase().trim();
    const fondoId = matchFondoId(fondosMap, cleanRun, serieUpper);
    if (!fondoId) continue;

    registros.push({
      fondo_id: fondoId,
      fecha_calculo: fecha,
      rent_7d: f.rent7d ?? null,
      rent_30d: f.rent30d ?? null,
      rent_90d: f.rent90d ?? null,
      rent_180d: null,
      rent_365d: f.rent1y ?? null,
      rent_ytd: f.rentYTD ?? null,
      rent_3y: null,
      rent_5y: null,
      rent_desde_inicio: null,
      volatilidad_30d: null,
      volatilidad_365d: null,
      sharpe_365d: null,
      sortino_365d: null,
      max_drawdown_365d: null,
      patrimonio_mm: null,
      num_partícipes: null,
      fuente: "aafm",
    });

    if (f.valorCuota > 0) {
      dailyPrices.push({
        fondo_id: fondoId,
        fecha: fecha,
        valor_cuota: f.valorCuota,
        rent_diaria: f.rent1d ?? null,
      });
    }
  }

  debugLog(`[FM] Matched ${registros.length} funds to fondos_mutuos`);

  if (registros.length === 0) return { updated: 0, historyRecords: 0 };

  // 3. Upsert BOTH tables in parallel (atomic per-row, no delete+insert race)
  const BATCH = 500;

  const upsertAgregadas = async () => {
    let upserted = 0;
    const promises: Promise<void>[] = [];
    for (let i = 0; i < registros.length; i += BATCH) {
      const batch = registros.slice(i, i + BATCH);
      promises.push(
        (async () => {
          const { error } = await sb
            .from("fondos_rentabilidades_agregadas")
            .upsert(batch, { onConflict: "fondo_id,fecha_calculo,fuente" });
          if (error) console.error(`[AAFM→FM] Batch upsert error:`, error.message);
          else upserted += batch.length;
        })()
      );
    }
    await Promise.all(promises);
    debugLog(`[FM] Upserted ${upserted} rentabilidades_agregadas records`);
    return upserted;
  };

  const upsertDailyPrices = async () => {
    if (dailyPrices.length === 0) return;
    let dailyUpserted = 0;
    const promises: Promise<void>[] = [];
    for (let i = 0; i < dailyPrices.length; i += BATCH) {
      const batch = dailyPrices.slice(i, i + BATCH);
      promises.push(
        (async () => {
          const { error } = await sb
            .from("fondos_rentabilidades_diarias")
            .upsert(batch, { onConflict: "fondo_id,fecha" });
          if (error) console.error(`[AAFM→FM] Daily prices upsert error:`, error.message);
          else dailyUpserted += batch.length;
        })()
      );
    }
    await Promise.all(promises);
    debugLog(`[FM] Upserted ${dailyUpserted} daily prices (valor_cuota)`);
  };

  // Build derived historical cuota values from rentabilities
  const derivedHistory: Array<Record<string, unknown>> = [];

  for (const f of funds) {
    const cleanRun = f.run.replace(/-[\dK]$/i, "").trim();
    if (!cleanRun || f.valorCuota <= 0) continue;

    const serieUpper = f.serie.toUpperCase().trim();
    const fondoId = matchFondoId(fondosMap, cleanRun, serieUpper);
    if (!fondoId) continue;

    const today = f.fecha;
    const cuota = f.valorCuota;
    const cuotaOrig = f.valorCuotaOrig;
    const isUSD = f.moneda && !/peso|clp/i.test(f.moneda);
    const moneda = isUSD ? "USD" : "CLP";

    // Direct: today's value
    derivedHistory.push({
      fondo_id: fondoId,
      fecha: today,
      valor_cuota: cuota,
      valor_cuota_orig: cuotaOrig || null,
      moneda,
      source: "aafm_direct",
    });

    // Derived from rentabilities: cuota_pasada = cuota_hoy / (1 + rent/100)
    const derivations = [
      { rent: f.rent7d, days: 7, source: "aafm_derived_7d" },
      { rent: f.rent30d, days: 30, source: "aafm_derived_30d" },
      { rent: f.rent90d, days: 90, source: "aafm_derived_90d" },
      { rent: f.rent1y, days: 365, source: "aafm_derived_365d" },
    ];

    for (const d of derivations) {
      if (d.rent != null && d.rent !== 0) {
        const pastCuota = cuota / (1 + d.rent / 100);
        const pastDate = new Date(today);
        pastDate.setDate(pastDate.getDate() - d.days);
        const pastDateStr = pastDate.toISOString().split("T")[0];

        derivedHistory.push({
          fondo_id: fondoId,
          fecha: pastDateStr,
          valor_cuota: Math.round(pastCuota * 10000) / 10000,
          valor_cuota_orig: cuotaOrig && d.rent !== 0 ? Math.round((cuotaOrig / (1 + d.rent / 100)) * 10000) / 10000 : null,
          moneda,
          source: d.source,
        });
      }
    }

    // YTD: derive Dec 31 of previous year
    if (f.rentYTD != null && f.rentYTD !== 0) {
      const year = new Date(today).getFullYear();
      const dec31 = `${year - 1}-12-31`;
      const pastCuota = cuota / (1 + f.rentYTD / 100);

      derivedHistory.push({
        fondo_id: fondoId,
        fecha: dec31,
        valor_cuota: Math.round(pastCuota * 10000) / 10000,
        valor_cuota_orig: cuotaOrig && f.rentYTD !== 0 ? Math.round((cuotaOrig / (1 + f.rentYTD / 100)) * 10000) / 10000 : null,
        moneda,
        source: "aafm_derived_ytd",
      });
    }
  }

  // Upsert derived history in parallel with other upserts
  const upsertHistory = async () => {
    if (derivedHistory.length === 0) return 0;
    let historyUpserted = 0;
    const promises: Promise<void>[] = [];
    for (let i = 0; i < derivedHistory.length; i += BATCH) {
      const batch = derivedHistory.slice(i, i + BATCH);
      promises.push(
        (async () => {
          const { error } = await sb
            .from("fund_cuota_history")
            .upsert(batch, { onConflict: "fondo_id,fecha,source" });
          if (error) console.error("[AAFM→History] Upsert error:", error.message);
          else historyUpserted += batch.length;
        })()
      );
    }
    await Promise.all(promises);
    debugLog(`[History] Upserted ${historyUpserted} cuota history records`);
    return historyUpserted;
  };

  const [inserted, , historyCount] = await Promise.all([upsertAgregadas(), upsertDailyPrices(), upsertHistory()]);
  return { updated: inserted, historyRecords: historyCount };
}

// Serie code mapping for fintual_funds matching (reverse direction)
const SERIE_MAP_REVERSE: Record<string, string[]> = {
  "BPRIV": ["BANCA PRIVADA", "BPRIVADA", "B. PRIVADA"],
  "ALPAT": ["ALTO PATRIMONIO", "A. PATRIMONIO"],
  "INSTI": ["INSTITUCIONAL"],
  "CLASI": ["CLASICA", "CLÁSICA"],
  "APV": ["APV"],
  "COLAB": ["COLABORADOR"],
  "INVER": ["INVERSIONISTA"],
};

function collectMatchedUpdates(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fintualRecords: any[],
  byRun: Map<string, AAFMFundRow[]>,
  result: SyncResult,
  pendingUpdates: Array<{ id: string; last_price: number; last_price_date: string; currency?: string }>
) {
  for (const rec of fintualRecords) {
    const cleanRun = String(rec.run || "").replace(/-[\dK]$/i, "").trim();
    const aafmFunds = byRun.get(cleanRun);
    if (!aafmFunds) continue;

    const serieName = (rec.serie_name || "").toUpperCase();
    const symbolUpper = (rec.symbol || "").toUpperCase();

    // Extract serie code from symbol: "FFMM-BCI-9226-BPRIV" → "BPRIV"
    const symbolParts = symbolUpper.split("-");
    const symbolSerie = symbolParts.length >= 4 ? symbolParts.slice(3).join("-") : "";

    let bestMatch: AAFMFundRow | null = null;
    let bestScore = 0;

    for (const af of aafmFunds) {
      let score = 1;
      const afSerie = af.serie.toUpperCase();

      // Exact match between symbol serie and AAFM serie (highest priority)
      if (symbolSerie && afSerie === symbolSerie) {
        score += 20;
      }

      // Fuzzy symbol-serie matching (e.g. "BPRIV" in "BANCA PRIVADA" or vice versa)
      if (serieName && afSerie.includes(serieName)) score += 5;
      if (serieName && serieName.includes(afSerie)) score += 5;
      // Only count symbol substring match if not already exact-matched
      if (symbolSerie !== afSerie && symbolUpper.includes(afSerie)) score += 3;

      for (const [code, names] of Object.entries(SERIE_MAP_REVERSE)) {
        if ((serieName.includes(code) || symbolSerie === code) &&
            names.some((n) => afSerie.includes(n))) {
          score += 5;
        }
      }

      if (score > bestScore) {
        bestScore = score;
        bestMatch = af;
      }
    }

    if (bestMatch && bestScore >= 2) {
      result.matched++;
      // Skip update if DB already has a newer price date
      const existingDate = rec.last_price_date || "";
      if (existingDate > bestMatch.fecha) continue;

      // For USD funds, use valor cuota in original currency (e.g., ~131 USD instead of ~121,283 CLP)
      const isUSD = bestMatch.moneda && !/peso|clp/i.test(bestMatch.moneda);
      const price = isUSD && bestMatch.valorCuotaOrig && bestMatch.valorCuotaOrig > 0
        ? bestMatch.valorCuotaOrig
        : bestMatch.valorCuota;
      const currency = isUSD ? "USD" : "CLP";

      pendingUpdates.push({
        id: rec.id,
        last_price: price,
        last_price_date: bestMatch.fecha,
        currency,
      });
    }
  }
}
