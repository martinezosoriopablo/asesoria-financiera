// app/api/fondos/search-price/route.ts
// Search for fund/stock and get latest price (valor_cuota or stock price)

import { NextRequest, NextResponse } from "next/server";
import { requireAdvisor, createAdminClient } from "@/lib/auth/api-auth";
import { sanitizeSearchInput } from "@/lib/sanitize";
import { getResumenAccion } from "@/lib/bolsa-santiago/client";
import { applyRateLimit } from "@/lib/rate-limit";

// Detect if query looks like a stock ticker
function looksLikeTicker(q: string): boolean {
  // Tickers are usually 1-5 uppercase letters, maybe with .SN or .CL suffix
  const tickerPattern = /^[A-Z]{1,5}(\.(SN|CL))?$/i;
  // Also common patterns like SQM-B, ANDINA-B
  const chileanTickerPattern = /^[A-Z]{2,10}(-[A-B])?$/i;
  return tickerPattern.test(q) || chileanTickerPattern.test(q);
}

// Known Chilean stock tickers for quick detection
const CHILEAN_TICKERS = [
  "BSANTANDER", "COPEC", "FALABELLA", "CENCOSUD", "SQM-A", "SQM-B",
  "CMPC", "CHILE", "ENELAM", "CCU", "VAPORES", "CAP", "COLBUN",
  "PARAUCO", "ITAUCORP", "ENELCHILE", "AGUAS-A", "SECURITY", "BCI",
  "HABITAT", "QUINENCO", "ANDINA-B", "SONDA", "LTM", "RIPLEY",
  "SM-CHILE B", "ORO BLANCO", "MASISA", "SALFACORP", "BESALCO"
];

function isChileanTicker(ticker: string): boolean {
  const upper = ticker.toUpperCase().replace(".SN", "").replace(".CL", "");
  return CHILEAN_TICKERS.includes(upper) || ticker.toUpperCase().endsWith(".SN") || ticker.toUpperCase().endsWith(".CL");
}

// Fetch stock quote from Yahoo Finance
async function fetchYahooQuote(ticker: string): Promise<{
  ticker: string;
  name: string;
  price: number;
  currency: string;
  exchange: string;
} | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=1d`;
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      next: { revalidate: 60 },
    });

    if (!response.ok) return null;

    const data = await response.json();
    if (data.chart.error || !data.chart.result?.length) return null;

    const meta = data.chart.result[0].meta;
    return {
      ticker: meta.symbol,
      name: meta.longName || meta.shortName || meta.symbol,
      price: meta.regularMarketPrice,
      currency: meta.currency || "USD",
      exchange: meta.exchangeName || "Unknown",
    };
  } catch {
    return null;
  }
}

// Fetch stock quote from Bolsa de Santiago
async function fetchBolsaSantiagoQuote(ticker: string): Promise<{
  ticker: string;
  name: string;
  price: number;
  currency: string;
  exchange: string;
} | null> {
  try {
    const nemo = ticker.toUpperCase().replace(".SN", "").replace(".CL", "");
    const quote = await getResumenAccion(nemo);
    if (!quote) return null;

    return {
      ticker: quote.ticker,
      name: quote.name,
      price: quote.price,
      currency: quote.currency,
      exchange: "Bolsa de Santiago",
    };
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const blocked = await applyRateLimit(request, "fondos-search-price", { limit: 10, windowSeconds: 60 });
  if (blocked) return blocked;

  const { error: authError } = await requireAdvisor();
  if (authError) return authError;

  const supabase = createAdminClient();

  try {
    const searchParams = request.nextUrl.searchParams;
    const q = searchParams.get("q");
    const type = searchParams.get("type"); // "fund", "stock", or null for both

    if (!q || q.length < 2) {
      return NextResponse.json({
        success: false,
        error: "Search query must be at least 2 characters",
      });
    }

    const results: Array<{
      id: string;
      type: "fund" | "stock";
      fo_run?: number;
      serie?: string;
      nombre: string;
      agf?: string;
      exchange?: string;
      moneda: string;
      valor_cuota: number | null;
      fecha_precio: string | null;
      fintual_id?: string; // For fetching real-time prices from Fintual API
    }> = [];

    // Search mutual funds (unless type=stock)
    if (type !== "stock") {
      // Search in fintual_funds first (has 5000+ funds)
      const { data: fintualFunds, error: fintualError } = await supabase
        .from("fintual_funds")
        .select("id, fintual_id, run, serie_name, fund_name, provider_name, currency, last_price, last_price_date")
        .or(`fund_name.ilike.%${sanitizeSearchInput(q)}%,provider_name.ilike.%${sanitizeSearchInput(q)}%,run.ilike.%${sanitizeSearchInput(q)}%`)
        .limit(10);

      if (!fintualError && fintualFunds && fintualFunds.length > 0) {
        fintualFunds.forEach((f) => {
          results.push({
            id: f.id,
            type: "fund",
            fo_run: f.run ? parseInt(f.run) : undefined,
            serie: f.serie_name,
            nombre: f.fund_name,
            agf: f.provider_name,
            moneda: f.currency || "CLP",
            valor_cuota: f.last_price,
            fecha_precio: f.last_price_date,
            fintual_id: f.fintual_id, // Add fintual_id for price fetching
          });
        });
      }

      // Also search in fondos_mutuos (legacy table) if few results
      if (results.length < 5) {
        const { data: fondos, error: fondosError } = await supabase
          .from("fondos_mutuos")
          .select("id, fo_run, fm_serie, nombre_fondo, nombre_agf, moneda_funcional")
          .or(`nombre_fondo.ilike.%${sanitizeSearchInput(q)}%,nombre_agf.ilike.%${sanitizeSearchInput(q)}%`)
          .limit(5);

        if (!fondosError && fondos && fondos.length > 0) {
          const fondoIds = fondos.map((f) => f.id);

          const { data: prices } = await supabase
            .from("fondos_rentabilidades_diarias")
            .select("fondo_id, fecha, valor_cuota")
            .in("fondo_id", fondoIds)
            .order("fecha", { ascending: false });

          const latestPrices: Record<string, { fecha: string; valor_cuota: number }> = {};
          if (prices) {
            for (const p of prices) {
              if (!latestPrices[p.fondo_id]) {
                latestPrices[p.fondo_id] = { fecha: p.fecha, valor_cuota: p.valor_cuota };
              }
            }
          }

          fondos.forEach((f) => {
            // Avoid duplicates (check by RUN)
            const exists = results.some(r => r.fo_run === f.fo_run);
            if (!exists) {
              results.push({
                id: f.id,
                type: "fund",
                fo_run: f.fo_run,
                serie: f.fm_serie,
                nombre: f.nombre_fondo,
                agf: f.nombre_agf,
                moneda: f.moneda_funcional || "CLP",
                valor_cuota: latestPrices[f.id]?.valor_cuota || null,
                fecha_precio: latestPrices[f.id]?.fecha || null,
              });
            }
          });
        }
      }
    }

    // Search stocks if query looks like a ticker or type=stock
    if (type === "stock" || looksLikeTicker(q) || results.length === 0) {
      const ticker = q.toUpperCase();
      let stockQuote = null;

      // Try Bolsa de Santiago first for Chilean tickers
      if (isChileanTicker(ticker)) {
        stockQuote = await fetchBolsaSantiagoQuote(ticker);
        // Fallback to Yahoo with .SN suffix
        if (!stockQuote) {
          const yahooTicker = ticker.endsWith(".SN") ? ticker : `${ticker}.SN`;
          stockQuote = await fetchYahooQuote(yahooTicker);
        }
      } else {
        // Try Yahoo Finance for international tickers
        stockQuote = await fetchYahooQuote(ticker);
      }

      if (stockQuote) {
        results.unshift({
          id: `stock-${stockQuote.ticker}`,
          type: "stock",
          nombre: `${stockQuote.ticker} - ${stockQuote.name}`,
          exchange: stockQuote.exchange,
          moneda: stockQuote.currency,
          valor_cuota: stockQuote.price,
          fecha_precio: new Date().toISOString().split("T")[0],
        });
      }
    }

    // Sort: stocks first if query looks like ticker, then by those with prices
    results.sort((a, b) => {
      // If query looks like a ticker, prioritize stocks
      if (looksLikeTicker(q)) {
        if (a.type === "stock" && b.type !== "stock") return -1;
        if (a.type !== "stock" && b.type === "stock") return 1;
      }
      // Then sort by having price
      if (a.valor_cuota && !b.valor_cuota) return -1;
      if (!a.valor_cuota && b.valor_cuota) return 1;
      return 0;
    });

    return NextResponse.json({
      success: true,
      results,
    });
  } catch (error) {
    console.error("Error in search-price:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Error searching",
      },
      { status: 500 }
    );
  }
}
