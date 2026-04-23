// app/api/fondos/match-holdings/route.ts
// Batch match holdings to funds/stocks and get prices
//
// MATCHING STRATEGY:
// 1. If cartola is from AGF X and holding doesn't mention another AGF → search within AGF X's funds
// 2. PRICE IS THE DEFINITIVE PROOF: compare holding's marketPrice (valor cuota) with DB price at cartola date
//    - If price matches within 0.5% → confirmed match (high confidence)
//    - If price doesn't match → NOT the fund, keep searching
// 3. Name is used as a secondary filter/confirmation, not as primary criterion
// 4. Classification (RV/RF/etc) comes from DB's familia_estudios, not from guessing by name
// 5. If no price match found → return "no match" so advisor can search by RUN manually

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
  matchedId?: string; // fo_run as string
  price?: number;
  currency?: string;
  source?: string;
  assetClass?: string; // from DB familia_estudios: "equity" | "fixedIncome" | "balanced" | "alternatives" | "cash"
  familiaEstudios?: string; // raw familia_estudios from DB
}

// Map familia_estudios from DB to normalized asset class for frontend
function familiaToAssetClass(familia: string | null | undefined): string | undefined {
  if (!familia) return undefined;
  const f = familia.toLowerCase();
  if (f.includes("accionario") || f.includes("renta variable")) return "equity";
  if (f.includes("deuda") || f.includes("renta fija")) return "fixedIncome";
  if (f.includes("balanceado")) return "balanced";
  if (f.includes("estructurado") || f.includes("otro")) return "alternatives";
  return undefined;
}

// Check if string looks like a stock ticker
function extractTicker(name: string, securityId?: string | null): string | null {
  if (securityId) {
    const id = securityId.toUpperCase().trim();
    if (/^[A-Z]{1,5}$/.test(id) || /^[A-Z]{2,10}(-[A-B])?$/.test(id)) {
      return id;
    }
  }
  const tickerMatch = name.match(/^([A-Z]{1,5})\s*[-–]\s*/);
  if (tickerMatch) return tickerMatch[1];
  const parenMatch = name.match(/\(([A-Z]{1,5})\)/);
  if (parenMatch) return parenMatch[1];
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

// Simple name scoring for secondary confirmation
function scoreNameMatch(holdingName: string, fondoName: string): number {
  const hWords = holdingName.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  const fLower = fondoName.toLowerCase();
  let score = 0;
  for (const word of hWords) {
    if (fLower.includes(word)) score += 1;
  }
  return score;
}

interface FondoRow {
  id: string;
  fo_run: number;
  fm_serie: string;
  nombre_fondo: string;
  nombre_agf: string;
  moneda_funcional: string;
  familia_estudios: string | null;
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
      return NextResponse.json({ success: false, error: "Holdings array is required" });
    }

    // Detect the AGF from the cartola source
    const sourceNames = Array.isArray(cartolaSource) ? cartolaSource : cartolaSource ? [cartolaSource] : [];
    const detectedAgfKey = sourceNames
      .map(s => s.toLowerCase().trim())
      .reduce<string | null>((found, s) => {
        if (found) return found;
        return Object.keys(AGF_NAME_MAP).find(agf => s.includes(agf)) || null;
      }, null);
    const agfSearchPatterns = detectedAgfKey ? AGF_NAME_MAP[detectedAgfKey] : null;

    // Pre-fetch ALL funds from the cartola's AGF (one query for all holdings)
    let agfFunds: FondoRow[] = [];
    if (agfSearchPatterns) {
      const agfFilter = agfSearchPatterns
        .map(p => `nombre_agf.ilike.%${sanitizeSearchInput(p)}%`)
        .join(",");

      const { data } = await supabase
        .from("vw_fondos_completo")
        .select("id, fo_run, fm_serie, nombre_fondo, nombre_agf, moneda_funcional, familia_estudios")
        .or(agfFilter)
        .limit(1000);

      agfFunds = data || [];
    }

    // Pre-fetch prices for ALL AGF funds at cartola date (one bulk query)
    // This avoids N+1 queries — fetch once, look up in memory
    const priceMap = new Map<string, number>(); // fondo_id -> valor_cuota at cartola date
    if (agfFunds.length > 0 && cartolaDate) {
      const fondoIds = agfFunds.map(f => f.id);

      // Fetch latest price on or before cartola date for each fund
      // Use a window of the same month to get closest price
      const { data: prices } = await supabase
        .from("fondos_rentabilidades_diarias")
        .select("fondo_id, valor_cuota, fecha")
        .in("fondo_id", fondoIds)
        .lte("fecha", cartolaDate)
        .gte("fecha", cartolaDate.slice(0, 7) + "-01") // same month start
        .order("fecha", { ascending: false });

      if (prices) {
        // Keep only the latest price per fondo_id
        for (const p of prices) {
          if (!priceMap.has(p.fondo_id)) {
            priceMap.set(p.fondo_id, p.valor_cuota);
          }
        }
      }
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

          // === STEP 1: Try stock ticker lookup ===
          const ticker = extractTicker(fundName, securityId);
          if (ticker) {
            let stockQuote = null;
            if (isChileanTicker(ticker)) {
              try {
                const quote = await getResumenAccion(ticker);
                if (quote) {
                  stockQuote = { name: quote.name, price: quote.price, currency: quote.currency };
                }
              } catch { /* fallback */ }
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
                assetClass: "equity",
              };
            }
          }

          // === STEP 2: Fund matching — PRICE IS KING ===
          const nameLower = fundName.toLowerCase();

          // Check if holding mentions another AGF explicitly
          const mentionsOtherAgf = detectedAgfKey
            ? Object.keys(AGF_NAME_MAP).some(
                agf => nameLower.includes(agf) && agf !== detectedAgfKey
              )
            : false;

          // Determine search universe
          const searchUniverse = (agfSearchPatterns && !mentionsOtherAgf) ? agfFunds : [];

          // If we have a price from the cartola → use it as definitive matching criterion
          const holdingPrice = holding.marketPrice;

          if (holdingPrice && holdingPrice > 0 && searchUniverse.length > 0) {
            // Find funds where price matches within 0.5% tolerance
            const priceMatches: Array<{ fondo: FondoRow; dbPrice: number; nameScore: number }> = [];

            for (const fondo of searchUniverse) {
              const dbPrice = priceMap.get(fondo.id);
              if (dbPrice && dbPrice > 0) {
                const priceDiff = Math.abs(dbPrice - holdingPrice) / holdingPrice;
                if (priceDiff < 0.005) {
                  priceMatches.push({
                    fondo,
                    dbPrice,
                    nameScore: scoreNameMatch(fundName, fondo.nombre_fondo),
                  });
                }
              }
            }

            if (priceMatches.length > 0) {
              // Sort by name score (highest first) to pick the best among price matches
              priceMatches.sort((a, b) => b.nameScore - a.nameScore);
              const best = priceMatches[0];

              return {
                index,
                matched: true,
                matchType: "fund",
                confidence: "high", // Price match = definitive
                matchedName: best.fondo.nombre_fondo,
                matchedId: best.fondo.fo_run?.toString(),
                price: best.dbPrice,
                currency: best.fondo.moneda_funcional || "CLP",
                source: best.fondo.nombre_agf,
                assetClass: familiaToAssetClass(best.fondo.familia_estudios),
                familiaEstudios: best.fondo.familia_estudios || undefined,
              };
            }

            // Price exists in cartola but NO fund in this AGF has matching price
            // → Don't guess. Tell advisor to search by RUN.
            // Still try a name-only match as a suggestion (low confidence)
            const nameOnlyMatches = searchUniverse
              .map(f => ({ fondo: f, nameScore: scoreNameMatch(fundName, f.nombre_fondo) }))
              .filter(m => m.nameScore >= 2)
              .sort((a, b) => b.nameScore - a.nameScore);

            if (nameOnlyMatches.length > 0) {
              const best = nameOnlyMatches[0];
              return {
                index,
                matched: true,
                matchType: "fund",
                confidence: "low", // Name-only, no price confirmation → low
                matchedName: best.fondo.nombre_fondo,
                matchedId: best.fondo.fo_run?.toString(),
                price: undefined, // Don't return price — it didn't match
                currency: best.fondo.moneda_funcional || "CLP",
                source: best.fondo.nombre_agf,
                assetClass: familiaToAssetClass(best.fondo.familia_estudios),
                familiaEstudios: best.fondo.familia_estudios || undefined,
              };
            }
          }

          // === STEP 3: No price in cartola — try name matching within AGF ===
          if (searchUniverse.length > 0 && (!holdingPrice || holdingPrice <= 0)) {
            const nameMatches = searchUniverse
              .map(f => ({ fondo: f, nameScore: scoreNameMatch(fundName, f.nombre_fondo) }))
              .filter(m => m.nameScore >= 1)
              .sort((a, b) => b.nameScore - a.nameScore);

            if (nameMatches.length > 0) {
              const best = nameMatches[0];
              const dbPrice = priceMap.get(best.fondo.id);
              const confidence = best.nameScore >= 3 ? "medium" : "low";

              return {
                index,
                matched: true,
                matchType: "fund",
                confidence: confidence as "medium" | "low",
                matchedName: best.fondo.nombre_fondo,
                matchedId: best.fondo.fo_run?.toString(),
                price: dbPrice || undefined,
                currency: best.fondo.moneda_funcional || "CLP",
                source: best.fondo.nombre_agf,
                assetClass: familiaToAssetClass(best.fondo.familia_estudios),
                familiaEstudios: best.fondo.familia_estudios || undefined,
              };
            }
          }

          // === STEP 4: No AGF context — general search (fallback) ===
          if (searchUniverse.length === 0) {
            const searchTerms = fundName.split(/\s+/).filter(w => w.length > 3);
            if (searchTerms.length > 0) {
              const { data: generalFunds } = await supabase
                .from("vw_fondos_completo")
                .select("id, fo_run, fm_serie, nombre_fondo, nombre_agf, moneda_funcional, familia_estudios")
                .or(`nombre_fondo.ilike.%${sanitizeSearchInput(searchTerms[0])}%`)
                .limit(20);

              if (generalFunds && generalFunds.length > 0) {
                // Try price match first
                if (holdingPrice && holdingPrice > 0 && cartolaDate) {
                  for (const fondo of generalFunds) {
                    const { data: priceRow } = await supabase
                      .from("fondos_rentabilidades_diarias")
                      .select("valor_cuota")
                      .eq("fondo_id", fondo.id)
                      .lte("fecha", cartolaDate)
                      .order("fecha", { ascending: false })
                      .limit(1)
                      .single();

                    if (priceRow?.valor_cuota) {
                      const diff = Math.abs(priceRow.valor_cuota - holdingPrice) / holdingPrice;
                      if (diff < 0.005) {
                        return {
                          index,
                          matched: true,
                          matchType: "fund",
                          confidence: "high",
                          matchedName: fondo.nombre_fondo,
                          matchedId: fondo.fo_run?.toString(),
                          price: priceRow.valor_cuota,
                          currency: fondo.moneda_funcional || "CLP",
                          source: fondo.nombre_agf,
                          assetClass: familiaToAssetClass(fondo.familia_estudios),
                          familiaEstudios: fondo.familia_estudios || undefined,
                        };
                      }
                    }
                  }
                }

                // Name-only fallback
                const scored = generalFunds
                  .map(f => ({ fondo: f, nameScore: scoreNameMatch(fundName, f.nombre_fondo) }))
                  .filter(m => m.nameScore >= 2)
                  .sort((a, b) => b.nameScore - a.nameScore);

                if (scored.length > 0) {
                  const best = scored[0];
                  return {
                    index,
                    matched: true,
                    matchType: "fund",
                    confidence: "low",
                    matchedName: best.fondo.nombre_fondo,
                    matchedId: best.fondo.fo_run?.toString(),
                    price: undefined,
                    currency: best.fondo.moneda_funcional || "CLP",
                    source: best.fondo.nombre_agf,
                    assetClass: familiaToAssetClass(best.fondo.familia_estudios),
                    familiaEstudios: best.fondo.familia_estudios || undefined,
                  };
                }
              }
            }
          }

          // No match found
          return { index, matched: false, confidence: "low" };
        })
      );

      results.push(...batchResults);
    }

    return NextResponse.json({ success: true, matches: results });
  } catch (error) {
    console.error("Error in match-holdings:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Error matching holdings" },
      { status: 500 }
    );
  }
}
