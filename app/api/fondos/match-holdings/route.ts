// app/api/fondos/match-holdings/route.ts
// Batch match holdings to funds/stocks and get prices

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getResumenAccion } from "@/lib/bolsa-santiago/client";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface HoldingInput {
  fundName: string;
  securityId?: string | null;
  quantity?: number;
  marketValue?: number;
}

interface MatchResult {
  index: number;
  matched: boolean;
  matchType?: "fund" | "stock";
  confidence: "high" | "medium" | "low";
  matchedName?: string;
  matchedId?: string;
  price?: number;
  currency?: string;
  source?: string;
}

// Common fund name patterns to extract search terms
function extractSearchTerms(fundName: string): string[] {
  const name = fundName.toLowerCase();
  const terms: string[] = [];

  // Extract AGF names
  const agfPatterns = [
    "banchile", "btg", "larrainvial", "santander", "security", "sura",
    "itau", "principal", "bice", "credicorp", "scotia", "compass",
    "moneda", "euroamerica", "nevasa", "renta4", "vector", "tanner",
    "fintual", "davivalores", "bci"
  ];
  for (const agf of agfPatterns) {
    if (name.includes(agf)) {
      terms.push(agf);
      break;
    }
  }

  // Extract fund type keywords
  const typeKeywords = [
    "accionario", "equity", "renta variable",
    "renta fija", "fixed income", "bond", "deuda",
    "money market", "liquidez", "cash",
    "balanceado", "balanced", "mixto",
    "global", "emergente", "latam", "usa", "chile"
  ];
  for (const keyword of typeKeywords) {
    if (name.includes(keyword)) {
      terms.push(keyword);
    }
  }

  // Use first significant words if no patterns found
  if (terms.length === 0) {
    const words = fundName.split(/\s+/).filter(w => w.length > 3);
    terms.push(...words.slice(0, 2));
  }

  return terms;
}

// Check if string looks like a stock ticker
function extractTicker(name: string, securityId?: string | null): string | null {
  // If securityId looks like a ticker, use it
  if (securityId) {
    const id = securityId.toUpperCase().trim();
    if (/^[A-Z]{1,5}$/.test(id) || /^[A-Z]{2,10}(-[A-B])?$/.test(id)) {
      return id;
    }
  }

  // Look for ticker pattern in name (e.g., "AAPL - Apple Inc")
  const tickerMatch = name.match(/^([A-Z]{1,5})\s*[-–]\s*/);
  if (tickerMatch) {
    return tickerMatch[1];
  }

  // Look for ticker in parentheses (e.g., "Apple Inc (AAPL)")
  const parenMatch = name.match(/\(([A-Z]{1,5})\)/);
  if (parenMatch) {
    return parenMatch[1];
  }

  return null;
}

// Fetch stock quote from Yahoo Finance
async function fetchYahooQuote(ticker: string): Promise<{
  name: string;
  price: number;
  currency: string;
} | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=1d`;
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });

    if (!response.ok) return null;

    const data = await response.json();
    if (data.chart.error || !data.chart.result?.length) return null;

    const meta = data.chart.result[0].meta;
    return {
      name: meta.longName || meta.shortName || meta.symbol,
      price: meta.regularMarketPrice,
      currency: meta.currency || "USD",
    };
  } catch {
    return null;
  }
}

// Known Chilean tickers
const CHILEAN_TICKERS = [
  "BSANTANDER", "COPEC", "FALABELLA", "CENCOSUD", "SQM-A", "SQM-B",
  "CMPC", "CHILE", "ENELAM", "CCU", "VAPORES", "CAP", "COLBUN",
  "PARAUCO", "ITAUCORP", "ENELCHILE", "AGUAS-A", "SECURITY", "BCI",
  "HABITAT", "QUINENCO", "ANDINA-B", "SONDA", "LTM", "RIPLEY"
];

function isChileanTicker(ticker: string): boolean {
  const upper = ticker.toUpperCase();
  return CHILEAN_TICKERS.includes(upper) || upper.endsWith(".SN") || upper.endsWith(".CL");
}

export async function POST(request: NextRequest) {
  try {
    const { holdings } = await request.json() as { holdings: HoldingInput[] };

    if (!holdings || !Array.isArray(holdings)) {
      return NextResponse.json({
        success: false,
        error: "Holdings array is required",
      });
    }

    const results: MatchResult[] = [];

    // Process holdings in parallel (but limit concurrency)
    const batchSize = 5;
    for (let i = 0; i < holdings.length; i += batchSize) {
      const batch = holdings.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(async (holding, batchIndex): Promise<MatchResult> => {
          const index = i + batchIndex;
          const { fundName, securityId } = holding;

          // Try to extract a ticker first
          const ticker = extractTicker(fundName, securityId);

          if (ticker) {
            // Try stock lookup
            let stockQuote = null;

            if (isChileanTicker(ticker)) {
              try {
                const quote = await getResumenAccion(ticker);
                if (quote) {
                  stockQuote = {
                    name: quote.name,
                    price: quote.price,
                    currency: quote.currency,
                  };
                }
              } catch {
                // Fallback to Yahoo
              }

              if (!stockQuote) {
                const yahooTicker = ticker.endsWith(".SN") ? ticker : `${ticker}.SN`;
                stockQuote = await fetchYahooQuote(yahooTicker);
              }
            } else {
              stockQuote = await fetchYahooQuote(ticker);
            }

            if (stockQuote && stockQuote.price > 0) {
              return {
                index,
                matched: true,
                matchType: "stock",
                confidence: "high",
                matchedName: stockQuote.name,
                matchedId: ticker,
                price: stockQuote.price,
                currency: stockQuote.currency,
                source: isChileanTicker(ticker) ? "Bolsa Santiago" : "Yahoo Finance",
              };
            }
          }

          // Try fund lookup
          const searchTerms = extractSearchTerms(fundName);
          if (searchTerms.length > 0) {
            const searchQuery = searchTerms.join(" ");

            const { data: fondos } = await supabase
              .from("fondos_mutuos")
              .select("id, fo_run, fm_serie, nombre_fondo, nombre_agf, moneda_funcional")
              .or(`nombre_fondo.ilike.%${searchTerms[0]}%`)
              .limit(5);

            if (fondos && fondos.length > 0) {
              // Find best match by comparing names
              const nameLower = fundName.toLowerCase();
              let bestMatch = fondos[0];
              let bestScore = 0;

              for (const fondo of fondos) {
                const fondoNameLower = fondo.nombre_fondo.toLowerCase();
                let score = 0;

                // Score based on word overlap
                const fundWords = nameLower.split(/\s+/);
                const fondoWords = fondoNameLower.split(/\s+/);

                for (const word of fundWords) {
                  if (word.length > 3 && fondoWords.some((fw: string) => fw.includes(word) || word.includes(fw))) {
                    score += 1;
                  }
                }

                // Bonus for AGF match
                if (fondo.nombre_agf && nameLower.includes(fondo.nombre_agf.toLowerCase())) {
                  score += 2;
                }

                if (score > bestScore) {
                  bestScore = score;
                  bestMatch = fondo;
                }
              }

              // Get price for best match
              const { data: priceData } = await supabase
                .from("fondos_rentabilidades_diarias")
                .select("valor_cuota, fecha")
                .eq("fondo_id", bestMatch.id)
                .order("fecha", { ascending: false })
                .limit(1)
                .single();

              const confidence = bestScore >= 3 ? "high" : bestScore >= 1 ? "medium" : "low";

              return {
                index,
                matched: true,
                matchType: "fund",
                confidence,
                matchedName: bestMatch.nombre_fondo,
                matchedId: bestMatch.fo_run?.toString(),
                price: priceData?.valor_cuota || undefined,
                currency: bestMatch.moneda_funcional || "CLP",
                source: bestMatch.nombre_agf,
              };
            }
          }

          // No match found
          return {
            index,
            matched: false,
            confidence: "low",
          };
        })
      );

      results.push(...batchResults);
    }

    return NextResponse.json({
      success: true,
      matches: results,
    });
  } catch (error) {
    console.error("Error in match-holdings:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Error matching holdings",
      },
      { status: 500 }
    );
  }
}
