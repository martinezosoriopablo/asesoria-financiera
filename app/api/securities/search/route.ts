// app/api/securities/search/route.ts
// API para buscar acciones USA y Chile usando Yahoo Finance y Bolsa de Santiago

import { NextRequest, NextResponse } from "next/server";
import { requireAdvisor } from "@/lib/auth/api-auth";
import { searchChileanStocks } from "@/lib/bolsa-santiago/client";
import { applyRateLimit } from "@/lib/rate-limit";
import { CHILEAN_TICKERS } from "@/lib/constants/chilean-finance";

interface YahooQuote {
  symbol: string;
  shortname?: string;
  longname?: string;
  quoteType: string;
  exchange: string;
  exchDisp?: string;
  typeDisp?: string;
}

interface YahooSearchResult {
  quotes: YahooQuote[];
}

interface SecuritySearchResult {
  ticker: string;
  name: string;
  type: "stock_us" | "stock_cl" | "etf";
  exchange: string;
  exchangeName: string;
  price?: number;
  changePercent?: number;
}

// Mapeo de exchanges para identificar región
const CL_EXCHANGES = ["SNT", "SGO", "SN"];

function determineSecurityType(quote: YahooQuote): "stock_us" | "stock_cl" | "etf" {
  // ETFs
  if (quote.quoteType === "ETF") {
    return "etf";
  }

  // Acciones Chile
  if (CL_EXCHANGES.includes(quote.exchange) || quote.symbol.endsWith(".SN") || quote.symbol.endsWith(".CL")) {
    return "stock_cl";
  }

  // Por defecto, acciones USA
  return "stock_us";
}

async function searchYahooFinance(query: string): Promise<SecuritySearchResult[]> {
  try {
    const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=15&newsCount=0&listsCount=0&enableFuzzyQuery=false&quotesQueryId=tss_match_phrase_query`;

    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      next: { revalidate: 300 }, // Cache por 5 minutos
    });

    if (!response.ok) {
      console.error("Yahoo Finance search error:", response.status);
      return [];
    }

    const data: YahooSearchResult = await response.json();

    if (!data.quotes || !Array.isArray(data.quotes)) {
      return [];
    }

    // Filtrar solo EQUITY y ETF
    const filtered = data.quotes.filter(
      (q) => q.quoteType === "EQUITY" || q.quoteType === "ETF"
    );

    return filtered.map((q) => ({
      ticker: q.symbol,
      name: q.longname || q.shortname || q.symbol,
      type: determineSecurityType(q),
      exchange: q.exchange,
      exchangeName: q.exchDisp || q.exchange,
    }));
  } catch (error) {
    console.error("Error searching Yahoo Finance:", error);
    return [];
  }
}

// Búsqueda en la API oficial de la Bolsa de Santiago
async function searchBolsaSantiagoAPI(query: string): Promise<SecuritySearchResult[]> {
  try {
    const chileanStocks = await searchChileanStocks(query);

    return chileanStocks.map((stock) => ({
      ticker: stock.ticker,
      name: stock.name,
      type: "stock_cl" as const,
      exchange: "BCS",
      exchangeName: "Bolsa de Santiago",
      price: stock.price,
      changePercent: stock.changePercent,
    }));
  } catch (error) {
    console.error("Error searching Bolsa Santiago API:", error);
    return [];
  }
}

// Fallback: búsqueda de acciones chilenas via Yahoo Finance
async function searchBolsaSantiagoYahoo(query: string): Promise<SecuritySearchResult[]> {
  try {
    const clQuery = query.toUpperCase();

    // Build .SN suffixed tickers from shared constant
    const commonChileanTickers = CHILEAN_TICKERS.map(t => `${t}.SN`);

    // Si es un ticker corto, buscar coincidencias en los comunes
    const matches = commonChileanTickers.filter(t =>
      t.startsWith(clQuery) || t.includes(clQuery)
    );

    // También buscar el ticker con .SN
    const tickerWithSN = clQuery.includes(".SN") ? clQuery : `${clQuery}.SN`;

    // Buscar en Yahoo Finance con el sufijo .SN
    const results = await searchYahooFinance(tickerWithSN);

    // Si no encontró nada con .SN pero hay matches en comunes, buscar esos
    if (results.length === 0 && matches.length > 0) {
      const allResults: SecuritySearchResult[] = [];
      for (const ticker of matches.slice(0, 5)) {
        const tickerResults = await searchYahooFinance(ticker);
        allResults.push(...tickerResults);
      }
      return allResults;
    }

    return results;
  } catch (error) {
    console.error("Error searching Bolsa Santiago via Yahoo:", error);
    return [];
  }
}

export async function GET(request: NextRequest) {
  const blocked = await applyRateLimit(request, "securities-search", { limit: 10, windowSeconds: 60 });
  if (blocked) return blocked;

  // Verificar autenticación
  const { error: authError } = await requireAdvisor();
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q");
  const market = searchParams.get("market"); // "us", "cl", "all"

  if (!query || query.length < 1) {
    return NextResponse.json({
      success: true,
      results: [],
      message: "Ingrese al menos 1 carácter para buscar",
    });
  }

  try {
    let results: SecuritySearchResult[] = [];

    if (market === "cl") {
      // Solo buscar en Chile - usar API oficial primero, fallback a Yahoo
      results = await searchBolsaSantiagoAPI(query);
      if (results.length === 0) {
        results = await searchBolsaSantiagoYahoo(query);
      }
    } else if (market === "us") {
      // Solo buscar en USA
      const allResults = await searchYahooFinance(query);
      results = allResults.filter(r => r.type === "stock_us" || r.type === "etf");
    } else {
      // Buscar en ambos mercados
      const [usResults, clResults] = await Promise.all([
        searchYahooFinance(query),
        query.length >= 2 ? searchBolsaSantiagoAPI(query) : Promise.resolve([]),
      ]);

      // Si no hay resultados de Chile, intentar con Yahoo
      let chileanResults = clResults;
      if (chileanResults.length === 0 && query.length >= 2) {
        chileanResults = await searchBolsaSantiagoYahoo(query);
      }

      // Combinar y deduplicar
      const seen = new Set<string>();
      results = [...usResults, ...chileanResults].filter(r => {
        // Normalizar ticker para deduplicación
        const normalizedTicker = r.ticker.replace(".SN", "").toUpperCase();
        if (seen.has(normalizedTicker)) return false;
        seen.add(normalizedTicker);
        return true;
      });
    }

    // Ordenar: primero USA, luego ETFs, luego Chile
    results.sort((a, b) => {
      const order = { stock_us: 0, etf: 1, stock_cl: 2 };
      return order[a.type] - order[b.type];
    });

    return NextResponse.json({
      success: true,
      results: results.slice(0, 20),
      total: results.length,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error en búsqueda";
    console.error("Search error:", error);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
