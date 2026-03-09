// lib/finnhub/bond-client.ts
// Cliente para la API de bonos de Finnhub
// Documentación: https://finnhub.io/docs/api/bond-price
//
// CONFIGURACIÓN:
// 1. Comprar acceso a Bond API en https://finnhub.io/pricing-bonds-api-finra-trace ($99.99)
// 2. Agregar FINNHUB_API_KEY en .env.local
// 3. La integración funcionará automáticamente

const FINNHUB_BASE_URL = "https://finnhub.io/api/v1";

// Obtener API key del entorno
function getApiKey(): string | null {
  return process.env.FINNHUB_API_KEY || null;
}

// Verificar si la API está configurada
export function isFinnhubConfigured(): boolean {
  return !!getApiKey();
}

// ============================================================
// TIPOS
// ============================================================

export interface BondCandle {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  yield?: number;
}

export interface BondCandleResponse {
  c: number[];  // Close prices
  h: number[];  // High prices
  l: number[];  // Low prices
  o: number[];  // Open prices
  t: number[];  // Timestamps (UNIX)
  v: number[];  // Volume
  y?: number[]; // Yield
  s: "ok" | "no_data";
}

export interface BondProfile {
  isin: string;
  cusip: string;
  figi: string;
  coupon: number;
  maturityDate: string;
  offeringDate: string;
  issueDate: string;
  bondType: string;
  debtType: string;
  industryGroup: string;
  industrySubGroup: string;
  asset: string;
  assetType: string;
  sector: string;
  currency: string;
  marketSector: string;
  securityLevel: string;
  securityTypeDescription: string;
  amountOutstanding: number;
  paymentFrequency: string;
}

export interface BondTick {
  price: number;
  volume: number;
  yield: number;
  timestamp: number;
  conditions?: string[];
}

// ============================================================
// API CALLS
// ============================================================

async function makeRequest<T>(endpoint: string, params: Record<string, string> = {}): Promise<T | null> {
  const apiKey = getApiKey();

  if (!apiKey) {
    console.warn("Finnhub API key not configured. Add FINNHUB_API_KEY to .env.local");
    return null;
  }

  try {
    const searchParams = new URLSearchParams({
      ...params,
      token: apiKey,
    });

    const url = `${FINNHUB_BASE_URL}${endpoint}?${searchParams.toString()}`;

    const response = await fetch(url, {
      headers: {
        "Content-Type": "application/json",
      },
      next: { revalidate: 3600 }, // Cache 1 hora
    });

    if (!response.ok) {
      if (response.status === 401) {
        console.error("Finnhub: Invalid API key or insufficient permissions");
      } else if (response.status === 429) {
        console.error("Finnhub: Rate limit exceeded");
      } else {
        console.error(`Finnhub API error: ${response.status}`);
      }
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error("Finnhub request error:", error);
    return null;
  }
}

/**
 * Obtener datos históricos OHLCV de un bono
 * @param isin - ISIN del bono
 * @param from - Fecha inicio (UNIX timestamp)
 * @param to - Fecha fin (UNIX timestamp)
 */
export async function getBondCandles(
  isin: string,
  from: number,
  to: number
): Promise<BondCandle[]> {
  const data = await makeRequest<BondCandleResponse>("/bond/candle", {
    isin,
    from: from.toString(),
    to: to.toString(),
  });

  if (!data || data.s === "no_data" || !data.t || data.t.length === 0) {
    return [];
  }

  const candles: BondCandle[] = [];
  for (let i = 0; i < data.t.length; i++) {
    candles.push({
      date: new Date(data.t[i] * 1000).toISOString().split("T")[0],
      open: data.o[i],
      high: data.h[i],
      low: data.l[i],
      close: data.c[i],
      volume: data.v[i],
      yield: data.y?.[i],
    });
  }

  return candles;
}

/**
 * Obtener perfil detallado de un bono
 * @param isin - ISIN del bono
 */
export async function getBondProfile(isin: string): Promise<BondProfile | null> {
  return makeRequest<BondProfile>("/bond/profile", { isin });
}

/**
 * Obtener ticks recientes de un bono
 * @param isin - ISIN del bono
 */
export async function getBondTicks(isin: string): Promise<BondTick[]> {
  const data = await makeRequest<{ data: BondTick[] }>("/bond/tick", { isin });
  return data?.data || [];
}

// ============================================================
// HELPERS
// ============================================================

/**
 * Obtener datos históricos de los últimos N días
 */
export async function getBondHistorical(
  isin: string,
  days: number = 365
): Promise<BondCandle[]> {
  const to = Math.floor(Date.now() / 1000);
  const from = to - (days * 24 * 60 * 60);
  return getBondCandles(isin, from, to);
}

/**
 * Calcular métricas del bono basadas en histórico
 */
export function calculateBondMetrics(candles: BondCandle[]): {
  totalReturn: number;
  avgYield: number;
  volatility: number;
  minPrice: number;
  maxPrice: number;
} | null {
  if (candles.length < 2) return null;

  const prices = candles.map(c => c.close);
  const yields = candles.filter(c => c.yield != null).map(c => c.yield!);

  // Retorno total
  const firstPrice = prices[0];
  const lastPrice = prices[prices.length - 1];
  const totalReturn = ((lastPrice - firstPrice) / firstPrice) * 100;

  // Yield promedio
  const avgYield = yields.length > 0
    ? yields.reduce((a, b) => a + b, 0) / yields.length
    : 0;

  // Volatilidad
  const returns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
  }
  const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
  const volatility = Math.sqrt(variance) * Math.sqrt(252) * 100;

  return {
    totalReturn,
    avgYield,
    volatility,
    minPrice: Math.min(...prices),
    maxPrice: Math.max(...prices),
  };
}
