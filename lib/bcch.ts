// lib/bcch.ts — Banco Central de Chile API (SI3)
// Canonical source for exchange rates: dólar observado + UF
// Docs: https://si3.bcentral.cl/estadisticas/Principal1/Web_Services/doc_es.htm

const BASE_URL = "https://si3.bcentral.cl/SieteRestWS/SieteRestWS.ashx";

// Series codes
const SERIES = {
  dolar: "F073.TCO.PRE.Z.D", // Tipo de cambio del dólar observado (CLP/USD)
  uf: "F073.UFF.PRE.Z.D",    // Unidad de fomento
} as const;

type Indicator = keyof typeof SERIES;

interface BcchObs {
  indexDateString: string; // DD-MM-YYYY
  value: string;           // numeric string or "NaN"
  statusCode: string;      // "OK" or "ND"
}

interface BcchResponse {
  Codigo: number;
  Descripcion: string;
  Series: {
    seriesId: string | null;
    Obs: BcchObs[] | null;
  };
}

export interface ExchangeRate {
  fecha: string; // YYYY-MM-DD
  valor: number;
}

function getCredentials(): { user: string; pass: string } | null {
  const user = process.env.BCCH_API_USER;
  const pass = process.env.BCCH_API_PASSWORD;
  if (!user || !pass) return null;
  return { user, pass };
}

// Validate BCCH credentials at module load — warn if missing
if (typeof window === "undefined") {
  const _creds = getCredentials();
  if (!_creds) {
    console.warn("[bcch] WARNING: BCCH_API_USER or BCCH_API_PASSWORD not configured — exchange rates will use fallback sources");
  }
}

/** Convert DD-MM-YYYY → YYYY-MM-DD */
function parseDate(ddmmyyyy: string): string {
  const [d, m, y] = ddmmyyyy.split("-");
  return `${y}-${m}-${d}`;
}

/**
 * Fetch a series from Banco Central API.
 * Returns observations sorted by date ascending.
 */
export async function fetchBcchSeries(
  indicator: Indicator,
  firstDate: string, // YYYY-MM-DD
  lastDate: string,  // YYYY-MM-DD
): Promise<ExchangeRate[]> {
  const creds = getCredentials();
  if (!creds) throw new Error("BCCH_API_USER/PASSWORD not configured");

  const params = new URLSearchParams({
    user: creds.user,
    pass: creds.pass,
    function: "GetSeries",
    timeseries: SERIES[indicator],
    firstdate: firstDate,
    lastdate: lastDate,
  });

  const res = await fetch(`${BASE_URL}?${params}`, {
    next: { revalidate: 3600 }, // cache 1h at HTTP layer
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    throw new Error(`BCCH API HTTP ${res.status}`);
  }

  const data: BcchResponse = await res.json();

  if (data.Codigo !== 0) {
    throw new Error(`BCCH API error ${data.Codigo}: ${data.Descripcion}`);
  }

  const obs = data.Series?.Obs;
  if (!obs || obs.length === 0) return [];

  return obs
    .filter((o) => o.statusCode === "OK" && o.value !== "NaN")
    .map((o) => ({
      fecha: parseDate(o.indexDateString),
      valor: parseFloat(o.value),
    }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
}

// ---------------------------------------------------------------------------
// In-memory cache for exchange rates (per-year, per-indicator)
// Populated lazily and shared across requests in the same serverless instance.
// ---------------------------------------------------------------------------

const rateCache = new Map<string, Map<string, number>>(); // key: "dolar-2026" → Map<fecha, valor>
const yearsLoaded = new Set<string>();

function cacheKey(indicator: Indicator, year: number): string {
  return `${indicator}-${year}`;
}

/**
 * Pre-load an entire year of data into cache.
 * Safe to call multiple times — no-ops if already loaded.
 */
export async function preloadYear(indicator: Indicator, year: number): Promise<void> {
  const key = cacheKey(indicator, year);
  if (yearsLoaded.has(key)) return;

  try {
    const rates = await fetchBcchSeries(
      indicator,
      `${year}-01-01`,
      `${year}-12-31`,
    );

    const map = rateCache.get(key) || new Map<string, number>();
    for (const r of rates) {
      map.set(r.fecha, r.valor);
    }
    rateCache.set(key, map);
    yearsLoaded.add(key);
  } catch (err) {
    console.warn(`[bcch] Failed to preload ${key}:`, err);
  }
}

/**
 * Get exchange rate for a specific date.
 * Loads the year on first access, then looks up.
 * For weekends/holidays, falls back to the nearest earlier business day.
 */
export async function getRate(indicator: Indicator, fecha: string): Promise<number | null> {
  const year = parseInt(fecha.split("-")[0], 10);
  await preloadYear(indicator, year);

  const key = cacheKey(indicator, year);
  const yearMap = rateCache.get(key);
  if (!yearMap || yearMap.size === 0) return null;

  // Exact match
  const exact = yearMap.get(fecha);
  if (exact !== undefined) return exact;

  // Forward-fill: find nearest earlier date
  let best: number | null = null;
  let bestDate = "";
  for (const [d, v] of yearMap) {
    if (d <= fecha && d > bestDate) {
      bestDate = d;
      best = v;
    }
  }

  // If fecha is early January and no earlier date, try previous year
  if (best === null && fecha.endsWith("-01-01") || (best === null && bestDate === "")) {
    await preloadYear(indicator, year - 1);
    const prevKey = cacheKey(indicator, year - 1);
    const prevMap = rateCache.get(prevKey);
    if (prevMap) {
      for (const [d, v] of prevMap) {
        if (d > bestDate) {
          bestDate = d;
          best = v;
        }
      }
    }
  }

  if (best !== null) {
    // Cache the forward-filled value so we don't search again
    yearMap.set(fecha, best);
  }

  return best;
}

/**
 * Get dólar observado for a specific date.
 * Never returns null — uses last known rate, or throws if API completely fails.
 */
export async function getDolarObservado(fecha: string): Promise<number> {
  const rate = await getRate("dolar", fecha);
  if (rate !== null) return rate;

  // Last resort: try fetching today's rate
  try {
    const today = new Date().toISOString().split("T")[0];
    const rates = await fetchBcchSeries("dolar", today, today);
    if (rates.length > 0) return rates[0].valor;
  } catch { /* fallthrough */ }

  throw new Error(`[bcch] No dólar observado available for ${fecha}`);
}

/**
 * Get UF for a specific date.
 */
export async function getUF(fecha: string): Promise<number> {
  const rate = await getRate("uf", fecha);
  if (rate !== null) return rate;

  try {
    const today = new Date().toISOString().split("T")[0];
    const rates = await fetchBcchSeries("uf", today, today);
    if (rates.length > 0) return rates[0].valor;
  } catch { /* fallthrough */ }

  throw new Error(`[bcch] No UF available for ${fecha}`);
}

/**
 * Get current exchange rates (dólar + UF + EUR).
 * Optimized for the /api/exchange-rates endpoint.
 */
export async function getCurrentRates(): Promise<{
  usd: number;
  uf: number;
  timestamp: string;
  source: string;
}> {
  const today = new Date().toISOString().split("T")[0];
  // Fetch last 7 days to handle weekends
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];

  const [dolarRates, ufRates] = await Promise.all([
    fetchBcchSeries("dolar", weekAgo, today),
    fetchBcchSeries("uf", weekAgo, today),
  ]);

  const latestDolar = dolarRates.length > 0 ? dolarRates[dolarRates.length - 1] : null;
  const latestUf = ufRates.length > 0 ? ufRates[ufRates.length - 1] : null;

  if (!latestDolar || !latestUf) {
    throw new Error("[bcch] No current rates available");
  }

  return {
    usd: latestDolar.valor,
    uf: latestUf.valor,
    timestamp: latestDolar.fecha,
    source: "Banco Central de Chile",
  };
}
