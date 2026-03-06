// app/api/securities/quote/[ticker]/route.ts
// API para obtener cotización actual de una acción

import { NextRequest, NextResponse } from "next/server";
import { requireAdvisor, createAdminClient } from "@/lib/auth/api-auth";
import { getResumenAccion } from "@/lib/bolsa-santiago/client";

interface YahooChartResult {
  chart: {
    result: Array<{
      meta: {
        currency: string;
        symbol: string;
        exchangeName: string;
        instrumentType: string;
        regularMarketPrice: number;
        previousClose: number;
        regularMarketTime: number;
        shortName?: string;
        longName?: string;
      };
      timestamp?: number[];
      indicators?: {
        quote: Array<{
          open: number[];
          high: number[];
          low: number[];
          close: number[];
          volume: number[];
        }>;
      };
    }>;
    error?: {
      code: string;
      description: string;
    };
  };
}

interface QuoteResponse {
  ticker: string;
  name: string;
  price: number;
  previousClose?: number;
  change?: number;
  changePercent?: number;
  currency: string;
  exchange: string;
  type: string;
  lastUpdate?: string;
  volume?: number;
  open?: number;
  high?: number;
  low?: number;
}

// Detectar si es un ticker chileno
function isChileanTicker(ticker: string): boolean {
  const upperTicker = ticker.toUpperCase();
  // Tickers con sufijo .SN o sin sufijo que son conocidos como chilenos
  if (upperTicker.endsWith(".SN") || upperTicker.endsWith(".CL")) {
    return true;
  }
  // Lista de nemotécnicos comunes de la Bolsa de Santiago
  const knownChileanTickers = [
    "BSANTANDER", "COPEC", "FALABELLA", "CENCOSUD", "SQM-A", "SQM-B",
    "CMPC", "CHILE", "ENELAM", "CCU", "VAPORES", "CAP", "COLBUN",
    "PARAUCO", "ITAUCORP", "ENELCHILE", "AGUAS-A", "SECURITY", "BCI",
    "HABITAT", "QUINENCO", "ANDINA-B", "SONDA", "LTM", "RIPLEY",
    "SM-CHILE B", "ORO BLANCO", "MASISA", "SALFACORP", "BESALCO"
  ];
  return knownChileanTickers.some(t => upperTicker === t || upperTicker.startsWith(t));
}

// Obtener cotización de la Bolsa de Santiago
async function fetchBolsaSantiagoQuote(ticker: string): Promise<QuoteResponse | null> {
  try {
    // Remover sufijo .SN si existe
    const nemo = ticker.toUpperCase().replace(".SN", "").replace(".CL", "");

    const quote = await getResumenAccion(nemo);

    if (!quote) {
      return null;
    }

    return {
      ticker: quote.ticker,
      name: quote.name,
      price: quote.price,
      previousClose: quote.previousClose,
      change: quote.change,
      changePercent: quote.changePercent,
      currency: quote.currency,
      exchange: "Bolsa de Santiago",
      type: "stock_cl",
      lastUpdate: quote.lastUpdate,
      volume: quote.volume,
      open: quote.open,
      high: quote.high,
      low: quote.low,
    };
  } catch (error) {
    console.error(`Error fetching Bolsa Santiago quote for ${ticker}:`, error);
    return null;
  }
}

async function fetchYahooQuote(ticker: string): Promise<QuoteResponse | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=1d`;

    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      next: { revalidate: 60 }, // Cache por 1 minuto
    });

    if (!response.ok) {
      console.error(`Yahoo Finance quote error for ${ticker}:`, response.status);
      return null;
    }

    const data: YahooChartResult = await response.json();

    if (data.chart.error || !data.chart.result || data.chart.result.length === 0) {
      console.error(`No data for ticker ${ticker}:`, data.chart.error);
      return null;
    }

    const meta = data.chart.result[0].meta;
    const price = meta.regularMarketPrice;
    const previousClose = meta.previousClose || price;
    const change = price - previousClose;
    const changePercent = (change / previousClose) * 100;

    // Determinar tipo basado en exchange
    let type = "stock_us";
    if (ticker.endsWith(".SN") || meta.exchangeName?.includes("Santiago")) {
      type = "stock_cl";
    } else if (meta.instrumentType === "ETF") {
      type = "etf";
    }

    return {
      ticker: meta.symbol,
      name: meta.longName || meta.shortName || meta.symbol,
      price,
      previousClose,
      change,
      changePercent,
      currency: meta.currency || "USD",
      exchange: meta.exchangeName,
      type,
      lastUpdate: new Date(meta.regularMarketTime * 1000).toISOString(),
    };
  } catch (error) {
    console.error(`Error fetching Yahoo quote for ${ticker}:`, error);
    return null;
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  // Verificar autenticación
  const { error: authError } = await requireAdvisor();
  if (authError) return authError;

  const { ticker } = await params;

  if (!ticker) {
    return NextResponse.json(
      { success: false, error: "Ticker es requerido" },
      { status: 400 }
    );
  }

  try {
    // Buscar primero en cache
    const supabase = createAdminClient();
    const { data: cached } = await supabase
      .from("security_prices_cache")
      .select("*")
      .eq("ticker", ticker.toUpperCase())
      .single();

    // Si el cache tiene menos de 5 minutos, usarlo
    if (cached) {
      const cacheAge = Date.now() - new Date(cached.updated_at).getTime();
      if (cacheAge < 5 * 60 * 1000) {
        return NextResponse.json({
          success: true,
          quote: {
            ticker: cached.ticker,
            name: cached.nombre,
            price: parseFloat(cached.precio),
            currency: cached.moneda,
            exchange: cached.exchange,
            type: cached.tipo,
            fromCache: true,
            lastUpdate: cached.updated_at,
          },
        });
      }
    }

    let quote: QuoteResponse | null = null;

    // Si es un ticker chileno, intentar primero con la API de la Bolsa de Santiago
    if (isChileanTicker(ticker)) {
      quote = await fetchBolsaSantiagoQuote(ticker);

      // Fallback a Yahoo Finance si la API de la Bolsa falla
      if (!quote) {
        const yahooTicker = ticker.toUpperCase().endsWith(".SN") ? ticker : `${ticker}.SN`;
        quote = await fetchYahooQuote(yahooTicker);
      }
    } else {
      // Para tickers no chilenos, usar Yahoo Finance
      quote = await fetchYahooQuote(ticker);
    }

    if (!quote) {
      return NextResponse.json(
        { success: false, error: `No se encontró cotización para ${ticker}` },
        { status: 404 }
      );
    }

    // Guardar en cache (upsert)
    await supabase
      .from("security_prices_cache")
      .upsert({
        ticker: quote.ticker.toUpperCase(),
        tipo: quote.type,
        nombre: quote.name,
        precio: quote.price,
        moneda: quote.currency,
        exchange: quote.exchange,
        updated_at: new Date().toISOString(),
      }, { onConflict: "ticker" });

    return NextResponse.json({
      success: true,
      quote,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error obteniendo cotización";
    console.error("Quote error:", error);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
