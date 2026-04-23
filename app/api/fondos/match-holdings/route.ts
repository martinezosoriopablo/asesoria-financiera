// app/api/fondos/match-holdings/route.ts
// Batch match holdings to funds/stocks and get prices

import { NextRequest, NextResponse } from "next/server";
import { requireAdvisor, createAdminClient } from "@/lib/auth/api-auth";
import { sanitizeSearchInput } from "@/lib/sanitize";
import { getResumenAccion } from "@/lib/bolsa-santiago/client";
import { applyRateLimit } from "@/lib/rate-limit";

interface HoldingInput {
  fundName: string;
  securityId?: string | null;
  quantity?: number;
  marketValue?: number;
  marketPrice?: number;
}

// Known AGF name mappings (cartola source name -> DB nombre_agf patterns)
const AGF_NAME_MAP: Record<string, string[]> = {
  "security": ["security", "administradora general de fondos security"],
  "banchile": ["banchile"],
  "btg": ["btg", "btg pactual"],
  "larrainvial": ["larrainvial", "larrain vial"],
  "santander": ["santander"],
  "sura": ["sura"],
  "itau": ["itau", "itaú"],
  "principal": ["principal"],
  "bice": ["bice"],
  "credicorp": ["credicorp"],
  "scotia": ["scotia", "scotiabank"],
  "compass": ["compass"],
  "moneda": ["moneda"],
  "euroamerica": ["euroamerica"],
  "fintual": ["fintual"],
  "bci": ["bci"],
  "nevasa": ["nevasa"],
};

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
  const blocked = await applyRateLimit(request, "match-holdings", { limit: 5, windowSeconds: 60 });
  if (blocked) return blocked;

  const { error: authError } = await requireAdvisor();
  if (authError) return authError;

  const supabase = createAdminClient();

  try {
    const { holdings, cartolaSource, cartolaDate } = await request.json() as {
      holdings: HoldingInput[];
      cartolaSource?: string | string[];
      cartolaDate?: string; // YYYY-MM-DD
    };

    if (!holdings || !Array.isArray(holdings)) {
      return NextResponse.json({
        success: false,
        error: "Holdings array is required",
      });
    }

    // Detect the AGF from the cartola source (e.g., "Security", "Banchile")
    const sourceNames = Array.isArray(cartolaSource) ? cartolaSource : cartolaSource ? [cartolaSource] : [];
    const detectedAgf = sourceNames
      .map(s => s.toLowerCase().trim())
      .find(s => Object.keys(AGF_NAME_MAP).some(agf => s.includes(agf)));
    const agfSearchPatterns = detectedAgf
      ? AGF_NAME_MAP[Object.keys(AGF_NAME_MAP).find(k => detectedAgf.includes(k))!]
      : null;

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
            // Check if the fund name explicitly mentions another AGF
            const nameLower = fundName.toLowerCase();
            const mentionsOtherAgf = Object.keys(AGF_NAME_MAP).some(
              agf => nameLower.includes(agf) && agf !== Object.keys(AGF_NAME_MAP).find(k => detectedAgf?.includes(k))
            );

            // Strategy: if cartola is from a specific AGF and fund doesn't mention another AGF,
            // search within that AGF's funds first
            let fondos: Array<{
              id: string; fo_run: number; fm_serie: string;
              nombre_fondo: string; nombre_agf: string; moneda_funcional: string;
            }> | null = null;

            if (agfSearchPatterns && !mentionsOtherAgf) {
              // Priority search: within the cartola's AGF
              const agfFilter = agfSearchPatterns
                .map(p => `nombre_agf.ilike.%${sanitizeSearchInput(p)}%`)
                .join(",");
              const termFilter = searchTerms
                .filter(t => !agfSearchPatterns.some(p => t.includes(p)))
                .slice(0, 2)
                .map(t => `nombre_fondo.ilike.%${sanitizeSearchInput(t)}%`)
                .join(",");

              if (termFilter) {
                const { data } = await supabase
                  .from("fondos_mutuos")
                  .select("id, fo_run, fm_serie, nombre_fondo, nombre_agf, moneda_funcional")
                  .or(agfFilter)
                  .or(termFilter)
                  .limit(10);
                fondos = data;
              } else {
                // No type keywords found - search all funds of this AGF
                const { data } = await supabase
                  .from("fondos_mutuos")
                  .select("id, fo_run, fm_serie, nombre_fondo, nombre_agf, moneda_funcional")
                  .or(agfFilter)
                  .limit(20);
                fondos = data;
              }
            }

            // Fallback: general search if AGF-specific search found nothing
            if (!fondos || fondos.length === 0) {
              const { data } = await supabase
                .from("fondos_mutuos")
                .select("id, fo_run, fm_serie, nombre_fondo, nombre_agf, moneda_funcional")
                .or(`nombre_fondo.ilike.%${sanitizeSearchInput(searchTerms[0])}%`)
                .limit(10);
              fondos = data;
            }

            if (fondos && fondos.length > 0) {
              // Score each candidate by name + verify by price
              const holdingPrice = holding.marketPrice;
              const scoredCandidates: Array<{
                fondo: typeof fondos[0];
                nameScore: number;
                priceMatch: boolean;
                dbPrice?: number;
              }> = [];

              for (const fondo of fondos) {
                const fondoNameLower = fondo.nombre_fondo.toLowerCase();
                let nameScore = 0;

                const fundWords = nameLower.split(/\s+/);
                const fondoWords = fondoNameLower.split(/\s+/);

                for (const word of fundWords) {
                  if (word.length > 3 && fondoWords.some((fw: string) => fw.includes(word) || word.includes(fw))) {
                    nameScore += 1;
                  }
                }

                if (agfSearchPatterns && !mentionsOtherAgf) {
                  const fondoAgfLower = (fondo.nombre_agf || "").toLowerCase();
                  if (agfSearchPatterns.some(p => fondoAgfLower.includes(p))) {
                    nameScore += 3;
                  }
                }

                if (fondo.nombre_agf && nameLower.includes(fondo.nombre_agf.toLowerCase())) {
                  nameScore += 2;
                }

                // Price verification: if cartola has a marketPrice, check if it matches
                let priceMatch = false;
                let dbPrice: number | undefined;

                if (holdingPrice && holdingPrice > 0) {
                  // Get price at cartola date (or closest)
                  let priceQuery = supabase
                    .from("fondos_rentabilidades_diarias")
                    .select("valor_cuota, fecha")
                    .eq("fondo_id", fondo.id);

                  if (cartolaDate) {
                    priceQuery = priceQuery.lte("fecha", cartolaDate);
                  }

                  const { data: priceRow } = await priceQuery
                    .order("fecha", { ascending: false })
                    .limit(1)
                    .single();

                  if (priceRow?.valor_cuota) {
                    dbPrice = priceRow.valor_cuota;
                    // Match if within 0.5% tolerance (rounding differences)
                    const priceDiff = Math.abs(priceRow.valor_cuota - holdingPrice) / holdingPrice;
                    priceMatch = priceDiff < 0.005;
                  }
                }

                scoredCandidates.push({ fondo, nameScore, priceMatch, dbPrice });
              }

              // Sort: price match first, then by name score
              scoredCandidates.sort((a, b) => {
                if (a.priceMatch !== b.priceMatch) return a.priceMatch ? -1 : 1;
                return b.nameScore - a.nameScore;
              });

              const best = scoredCandidates[0];

              // Determine confidence
              let confidence: "high" | "medium" | "low";
              if (best.priceMatch) {
                confidence = "high"; // Price match is definitive proof
              } else if (best.nameScore >= 3) {
                confidence = "high";
              } else if (best.nameScore >= 1) {
                confidence = "medium";
              } else {
                confidence = "low";
              }

              // If we don't have the price yet (no price verification was done), fetch it
              let returnPrice = best.dbPrice;
              if (!returnPrice) {
                const { data: priceData } = await supabase
                  .from("fondos_rentabilidades_diarias")
                  .select("valor_cuota")
                  .eq("fondo_id", best.fondo.id)
                  .order("fecha", { ascending: false })
                  .limit(1)
                  .single();
                returnPrice = priceData?.valor_cuota;
              }

              return {
                index,
                matched: true,
                matchType: "fund" as const,
                confidence,
                matchedName: best.fondo.nombre_fondo,
                matchedId: best.fondo.fo_run?.toString(),
                price: returnPrice || undefined,
                currency: best.fondo.moneda_funcional || "CLP",
                source: best.fondo.nombre_agf,
              };
            }

            // Last resort: if holding has a price, search ALL funds of the cartola's AGF by price
            if (holding.marketPrice && holding.marketPrice > 0 && agfSearchPatterns && cartolaDate) {
              const agfFilter = agfSearchPatterns
                .map(p => `nombre_agf.ilike.%${sanitizeSearchInput(p)}%`)
                .join(",");

              // Get all funds from this AGF
              const { data: agfFondos } = await supabase
                .from("fondos_mutuos")
                .select("id, fo_run, fm_serie, nombre_fondo, nombre_agf, moneda_funcional")
                .or(agfFilter)
                .limit(100);

              if (agfFondos && agfFondos.length > 0) {
                const fondoIds = agfFondos.map(f => f.id);

                // Search for price matches at the cartola date
                const { data: priceMatches } = await supabase
                  .from("fondos_rentabilidades_diarias")
                  .select("fondo_id, valor_cuota, fecha")
                  .in("fondo_id", fondoIds)
                  .lte("fecha", cartolaDate)
                  .gte("fecha", cartolaDate.slice(0, 8) + "01") // Same month
                  .order("fecha", { ascending: false });

                if (priceMatches) {
                  // Find funds whose valor_cuota matches within 0.5%
                  const seen = new Set<string>();
                  for (const pm of priceMatches) {
                    if (seen.has(pm.fondo_id)) continue;
                    seen.add(pm.fondo_id);

                    const diff = Math.abs(pm.valor_cuota - holding.marketPrice) / holding.marketPrice;
                    if (diff < 0.005) {
                      const matchedFondo = agfFondos.find(f => f.id === pm.fondo_id);
                      if (matchedFondo) {
                        return {
                          index,
                          matched: true,
                          matchType: "fund" as const,
                          confidence: "high" as const,
                          matchedName: matchedFondo.nombre_fondo,
                          matchedId: matchedFondo.fo_run?.toString(),
                          price: pm.valor_cuota,
                          currency: matchedFondo.moneda_funcional || "CLP",
                          source: matchedFondo.nombre_agf,
                        };
                      }
                    }
                  }
                }
              }
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
