// lib/bolsa-santiago/client.ts
// Cliente para la API Brain Data de la Bolsa de Santiago
// Docs: Manual API Free trial (Brain Data)
// Base URL: api-private-braindata.bolsadesantiago.com
// Auth: Ocp-Apim-Subscription-Key header
// Hours: 7am-10pm Chile, Mon-Fri (excl. holidays)

const BOLSA_SANTIAGO_BASE_URL =
  "https://api-private-braindata.bolsadesantiago.com/api-servicios-de-consulta";
const API_TOKEN = process.env.BOLSA_SANTIAGO_API_TOKEN;

// ---------------------------------------------------------------------------
// Raw API response types (from manual)
// ---------------------------------------------------------------------------

interface BDInstrumento {
  NEMO: string;
  MERCADO: string;
  PRE_ULT_TR: number;
  CATEGORIA: number;
  AUT_VT_CORTO: string;
  MONEDA: number; // 0=CLP, 1=USD, 9=foreign
  CODIGO_ISIN: string;
  NON_FFLOAT: number;
  PAIS_EMISOR: string;
  TIPO_INSTRU: string;
}

interface BDResumenAccion {
  TOTAL_PAGINAS: number;
  MERCADO: string;
  PERIODO: string; // AN, ME, DI
  NEMO: string;
  CANTIDAD: number;
  MONTO: number;
  NUM_NEG: number;
  PRESEN: number;
  PRE_CIE: number;
  PRE_MAY: number;
  PRE_MED: number;
  PRE_MEN: number;
  VAR_PRE: number;
  FEC_FIJ_CIE: string;
  NUM_ACC_CIR: number;
  BETA_90DIAS: number;
  MONEDA: number;
}

interface BDTransaccion {
  TOTAL_PAGINAS: number;
  MERCADO: string;
  NEMO: string;
  HORA: string;
  CANTIDAD: number;
  COND_COD_002: string;
  COND_COD_011: string;
  FECHA: string;
  MONTO: number;
  PRECIO: number;
  RUEDA: string;
  TASA: number;
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ChileanStock {
  ticker: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  currency: string;
  volume?: number;
  open?: number;
  high?: number;
  low?: number;
  previousClose?: number;
  lastUpdate?: string;
}

// ---------------------------------------------------------------------------
// HTTP helper
// ---------------------------------------------------------------------------

async function makeRequest<T>(
  path: string,
  params: Record<string, string> = {}
): Promise<T | null> {
  if (!API_TOKEN) {
    console.error("BOLSA_SANTIAGO_API_TOKEN not configured");
    return null;
  }

  const qs = new URLSearchParams(params).toString();
  const url = `${BOLSA_SANTIAGO_BASE_URL}${path}${qs ? `?${qs}` : ""}`;

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "Ocp-Apim-Subscription-Key": API_TOKEN,
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      console.error(`Bolsa Santiago API error: ${response.status} ${body.substring(0, 200)}`);
      return null;
    }

    return (await response.json()) as T;
  } catch (error) {
    console.error("Error calling Bolsa Santiago API:", error);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

/**
 * GET /api/Util/Instrumentos
 * Returns available RV instruments (Free Trial: 10 random daily, 5 top gains + 5 top losses)
 */
export async function getInstrumentosValidos(): Promise<string[]> {
  const data = await makeRequest<BDInstrumento[]>("/api/Util/Instrumentos");
  if (!data) return [];
  return data.map((i) => i.NEMO);
}

/**
 * GET /api/Util/Instrumentos
 * Returns full instrument data
 */
export async function getInstrumentosRV(): Promise<BDInstrumento[]> {
  const data = await makeRequest<BDInstrumento[]>("/api/Util/Instrumentos");
  return data || [];
}

/**
 * GET /api/Util/ResumenAccion?NEMO=X&PERIODO=DI&numeroPagina=1
 * Returns daily summary for an instrument (price, volume, etc.)
 * PERIODO: AN (annual), ME (monthly), DI (daily)
 */
export async function getResumenAccion(nemo: string): Promise<ChileanStock | null> {
  const data = await makeRequest<BDResumenAccion[]>("/api/Util/ResumenAccion", {
    NEMO: nemo.toUpperCase(),
    PERIODO: "DI",
    numeroPagina: "1",
  });

  if (!data || data.length === 0) return null;

  const latest = data[0];
  return {
    ticker: latest.NEMO,
    name: latest.NEMO,
    price: latest.PRE_CIE || 0,
    change: latest.VAR_PRE || 0,
    changePercent: latest.VAR_PRE || 0,
    currency: latest.MONEDA === 1 ? "USD" : "CLP",
    lastUpdate: latest.FEC_FIJ_CIE,
  };
}

/**
 * GET /api/Util/ResumenAccion with PERIODO=DI, paginated
 * Returns historical daily closing prices (up to 1 year for Free Trial)
 */
export async function getHistoricalPrices(
  nemo: string,
  _fromDate: string,
  _toDate: string
): Promise<Array<{ date: string; close: number }>> {
  const results: Array<{ date: string; close: number }> = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    const data = await makeRequest<BDResumenAccion[]>("/api/Util/ResumenAccion", {
      NEMO: nemo.toUpperCase(),
      PERIODO: "DI",
      numeroPagina: String(page),
    });

    if (!data || data.length === 0) break;

    totalPages = data[0]?.TOTAL_PAGINAS || 1;

    for (const row of data) {
      if (row.PRE_CIE > 0 && row.FEC_FIJ_CIE) {
        const date = parseDate(row.FEC_FIJ_CIE);
        if (date) {
          results.push({ date, close: row.PRE_CIE });
        }
      }
    }

    page++;
    // Safety: max 10 pages to avoid burning through request quota
    if (page > 10) break;
  }

  // Filter by date range and sort
  const from = _fromDate;
  const to = _toDate;
  return results
    .filter((r) => r.date >= from && r.date <= to)
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * GET /api/Util/Transacciones?NEMO=X&fechaDesde=X&fechaHasta=X&numeroPagina=1
 * Returns transactions for an instrument (max 3-month periods)
 */
export async function getTransacciones(
  nemo: string,
  fromDate: string,
  toDate: string
): Promise<Array<{ date: string; price: number; quantity: number; amount: number }>> {
  const data = await makeRequest<BDTransaccion[]>("/api/Util/Transacciones", {
    NEMO: nemo.toUpperCase(),
    fechaDesde: fromDate,
    fechaHasta: toDate,
    numeroPagina: "1",
  });

  if (!data) return [];

  return data
    .filter((t) => t.PRECIO > 0)
    .map((t) => ({
      date: parseDate(t.FECHA) || t.FECHA,
      price: t.PRECIO,
      quantity: t.CANTIDAD,
      amount: t.MONTO,
    }));
}

/**
 * Search instruments by name/nemo from the available instruments list
 */
export async function searchChileanStocks(query: string): Promise<ChileanStock[]> {
  const instrumentos = await getInstrumentosRV();
  if (instrumentos.length === 0) return [];

  const queryUpper = query.toUpperCase();
  const matches = instrumentos.filter(
    (inst) => inst.NEMO?.toUpperCase().includes(queryUpper)
  );

  return matches.slice(0, 15).map((inst) => ({
    ticker: inst.NEMO,
    name: inst.NEMO,
    price: inst.PRE_ULT_TR || 0,
    change: 0,
    changePercent: 0,
    currency: inst.MONEDA === 1 ? "USD" : "CLP",
  }));
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse date from various formats to YYYY-MM-DD */
function parseDate(dateStr: string): string {
  if (!dateStr) return "";
  // DD-MM-YYYY or DD/MM/YYYY
  const match = dateStr.match(/(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (match) {
    const [, day, month, year] = match;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
    return dateStr.split("T")[0];
  }
  // ISO date
  try {
    return new Date(dateStr).toISOString().split("T")[0];
  } catch {
    return "";
  }
}

// Cache for instruments
let instrumentosCache: BDInstrumento[] | null = null;
let cacheTimestamp = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export async function getInstrumentosRVCached(): Promise<BDInstrumento[]> {
  const now = Date.now();
  if (instrumentosCache && now - cacheTimestamp < CACHE_DURATION) {
    return instrumentosCache;
  }
  const data = await getInstrumentosRV();
  if (data.length > 0) {
    instrumentosCache = data;
    cacheTimestamp = now;
  }
  return data;
}
