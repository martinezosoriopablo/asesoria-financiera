// app/api/portfolio/current-prices/route.ts
// Fetches current Fintual prices for a list of holdings

import { NextRequest, NextResponse } from "next/server";
import { requireAdvisor, createAdminClient } from "@/lib/auth/api-auth";
import { applyRateLimit } from "@/lib/rate-limit";
import { getLatestPrice } from "@/lib/fintual-api";

interface HoldingInput {
  fundName: string;
  securityId?: string | null;
  cartolaPrice?: number; // Price from the original cartola, used for cache validation
}

interface PriceResult {
  fundName: string;
  fintualId: string | null;
  fintualName: string | null;
  serieName: string | null;
  currentPrice: number | null;
  lastPriceDate: string | null;
  currency: string;
  source: string; // "fintual_api" | "fintual_db" | "cmf" | "none"
}

// Serie keywords for matching
const SERIE_KEYWORDS: Array<{ pattern: RegExp; serieCode: string }> = [
  { pattern: /BANCA\s*PRIVADA|BPRIVADA/i, serieCode: "BPRIV" },
  { pattern: /ALTO\s*PATRIMONIO|ALTOPATRIM/i, serieCode: "ALPAT" },
  { pattern: /INSTITUCIONAL/i, serieCode: "INSTI" },
  { pattern: /INVERSIONIST/i, serieCode: "INVER" },
  { pattern: /COLABORADOR/i, serieCode: "COLAB" },
  { pattern: /CLASICA|CLASIC/i, serieCode: "CLASI" },
  { pattern: /\bAPV\b/i, serieCode: "APV" },
  // Abbreviated series from cartola names (e.g., "PATRIMONIAL BALANCEADA - B")
  { pattern: /\s-\s*BPRIV$/i, serieCode: "BPRIV" },
  { pattern: /\s-\s*ALPAT$/i, serieCode: "ALPAT" },
  { pattern: /\s-\s*INSTI$/i, serieCode: "INSTI" },
  { pattern: /\s-\s*B$/i, serieCode: "BPRIV" },
  { pattern: /\s-\s*A$/i, serieCode: "ALPAT" },
  { pattern: /\s-\s*I$/i, serieCode: "INSTI" },
];

function detectSerieCode(name: string): string | null {
  for (const { pattern, serieCode } of SERIE_KEYWORDS) {
    if (pattern.test(name)) return serieCode;
  }
  return null;
}

// Strip diacritics/accents for fuzzy comparison
function stripAccents(str: string): string {
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

// Fetch live price from Fintual API and update DB cache
async function fetchLivePrice(
  fintualId: string,
  supabase: ReturnType<typeof createAdminClient>
): Promise<{ price: number; date: string } | null> {
  try {
    const latest = await getLatestPrice(fintualId);
    if (!latest || !latest.attributes.price) return null;

    const price = latest.attributes.price;
    const date = latest.attributes.date;

    // Update cache in DB (fire-and-forget)
    supabase
      .from("fintual_funds")
      .update({ last_price: price, last_price_date: date })
      .eq("fintual_id", fintualId)
      .then(() => {});

    return { price, date };
  } catch (err) {
    console.error(`Error fetching live price for ${fintualId}:`, err);
    return null;
  }
}

// Fetch price from AAFM data: fintual_funds (name match) → get RUN → fondos_mutuos → fondos_rentabilidades_diarias
// This is the most reliable path for Chilean mutual fund prices
async function fetchAAFMPrice(
  fundName: string,
  supabase: ReturnType<typeof createAdminClient>
): Promise<{ price: number; date: string; fundName?: string; serie?: string } | null> {
  try {
    const targetSerie = detectSerieCode(fundName);

    // Step 1: Find the fund in fintual_funds by name (has complete names + RUN)
    const coreName = fundName
      .replace(/\b(FONDO\s+MUTUO|SERIE?)\b/gi, "")
      .replace(/\s*-\s*(BANCA\s+PRIVADA|BPRIVADA|ALTO\s+PATRIMONIO|APV|INSTITUCIONAL|CLASICA|COLABORADOR|INVERSIONIST\w*|BPRIV|ALPAT|INSTI|[A-Z])\s*$/i, "")
      .trim();

    const searchTerms = coreName
      .split(/\s+/)
      .filter((w) => w.length > 2 && !/^(DE|DEL|LA|LOS|LAS|EL|EN|CON|POR)$/i.test(w))
      .slice(0, 5);

    if (searchTerms.length < 2) return null;

    // Use up to 3 search terms for the ilike query (more precise than 2)
    let query = supabase
      .from("fintual_funds")
      .select("run, fund_name, symbol, serie_name");
    for (const term of searchTerms.slice(0, Math.min(searchTerms.length, 3))) {
      query = query.ilike("fund_name", `%${term}%`);
    }
    if (targetSerie) {
      query = query.ilike("symbol", `%${targetSerie}%`);
    }

    const { data: fintualMatches } = await query.limit(20);

    // If too few results with 3 terms, retry with 2
    let matches = fintualMatches;
    if ((!matches || matches.length === 0) && searchTerms.length >= 3) {
      let fallbackQuery = supabase
        .from("fintual_funds")
        .select("run, fund_name, symbol, serie_name");
      for (const term of searchTerms.slice(0, 2)) {
        fallbackQuery = fallbackQuery.ilike("fund_name", `%${term}%`);
      }
      if (targetSerie) {
        fallbackQuery = fallbackQuery.ilike("symbol", `%${targetSerie}%`);
      }
      const { data: fallbackMatches } = await fallbackQuery.limit(20);
      matches = fallbackMatches;
    }

    if (!matches || matches.length === 0) return null;

    // Score matches by word overlap with the original fund name
    const nameNorm = stripAccents(coreName.toLowerCase());
    const nameWords = nameNorm.split(/\s+/).filter((w) => w.length > 2);

    let bestMatch = matches[0];
    let bestScore = -1;

    for (const m of matches) {
      const mNorm = stripAccents(m.fund_name.toLowerCase());
      let score = 0;
      for (const w of nameWords) {
        if (mNorm.includes(w)) score++;
      }
      // Penalize if fund_name has many extra words (less specific match)
      const mWords = mNorm.split(/\s+/).filter((w) => w.length > 2);
      const extraWords = mWords.filter((w) => !nameNorm.includes(w)).length;
      score -= extraWords * 0.3;

      if (score > bestScore) {
        bestScore = score;
        bestMatch = m;
      }
    }

    const cleanRun = (bestMatch.run || "").replace(/-[\dK]$/i, "").trim();
    if (!cleanRun) return null;

    // Step 2: Find in fondos_mutuos by RUN + serie
    const serieCode = targetSerie || "";
    let fondoQuery = supabase
      .from("fondos_mutuos")
      .select("id, fo_run, fm_serie, nombre_fondo")
      .eq("fo_run", parseInt(cleanRun, 10));

    if (serieCode) {
      fondoQuery = fondoQuery.eq("fm_serie", serieCode);
    }

    const { data: fondos } = await fondoQuery.limit(5);
    if (!fondos || fondos.length === 0) return null;

    const fondo = fondos[0];

    // Step 3: Get latest daily price
    const { data: priceData } = await supabase
      .from("fondos_rentabilidades_diarias")
      .select("valor_cuota, fecha")
      .eq("fondo_id", fondo.id)
      .order("fecha", { ascending: false })
      .limit(1)
      .single();

    if (!priceData || !priceData.valor_cuota) return null;

    return {
      price: priceData.valor_cuota,
      date: priceData.fecha,
      fundName: fondo.nombre_fondo,
      serie: fondo.fm_serie,
    };
  } catch {
    return null;
  }
}

// Fetch price from fondos_rentabilidades_diarias (CMF data, often more recent)
async function fetchCMFPrice(
  fundName: string,
  serieName: string | null,
  supabase: ReturnType<typeof createAdminClient>
): Promise<{ price: number; date: string } | null> {
  try {
    const nameNorm = stripAccents(fundName.toLowerCase());
    // Extract meaningful search words
    const words = nameNorm.split(/\s+/).filter(
      (w) => w.length > 3 && !/^(fondo|mutuo|de|del|la|los|las)$/i.test(w)
    );
    if (words.length < 2) return null;

    // Search fondos_mutuos by name
    const { data: fondos } = await supabase
      .from("fondos_mutuos")
      .select("id, fo_run, fm_serie, nombre_fondo, nombre_agf")
      .ilike("nombre_fondo", `%${words[0]}%`)
      .ilike("nombre_fondo", `%${words[1]}%`)
      .limit(20);

    if (!fondos || fondos.length === 0) return null;

    // Score and pick best match (with serie preference)
    const targetSerie = serieName || detectSerieCode(fundName);
    let bestFondo = fondos[0];
    let bestScore = 0;

    for (const f of fondos) {
      const fNorm = stripAccents(f.nombre_fondo.toLowerCase());
      let score = 0;
      for (const w of words) {
        if (fNorm.includes(w)) score++;
      }
      // Serie match
      if (targetSerie && f.fm_serie) {
        const serieNorm = stripAccents(f.fm_serie.toLowerCase());
        if (serieNorm.includes(stripAccents(targetSerie.toLowerCase()))) {
          score += 5;
        }
      }
      if (score > bestScore) {
        bestScore = score;
        bestFondo = f;
      }
    }

    if (bestScore < 2) return null;

    // Get latest price
    const { data: priceData } = await supabase
      .from("fondos_rentabilidades_diarias")
      .select("valor_cuota, fecha")
      .eq("fondo_id", bestFondo.id)
      .order("fecha", { ascending: false })
      .limit(1)
      .single();

    if (!priceData || !priceData.valor_cuota) return null;

    return { price: priceData.valor_cuota, date: priceData.fecha };
  } catch {
    return null;
  }
}

function assignMatch(
  result: PriceResult,
  fund: { fintual_id: string; fund_name: string; serie_name?: string; last_price?: number; last_price_date?: string; currency?: string },
  livePrice: { price: number; date: string } | null,
  source: string,
  cartolaPrice?: number,
) {
  result.fintualId = fund.fintual_id;
  result.fintualName = fund.fund_name;
  result.serieName = fund.serie_name ?? null;
  result.currency = fund.currency || "CLP";

  if (livePrice) {
    result.currentPrice = livePrice.price;
    result.lastPriceDate = livePrice.date;
    result.source = source;
  } else if (fund.last_price && fund.last_price > 0) {
    // Check how recent the cached price is
    const daysSinceCache = fund.last_price_date
      ? (Date.now() - new Date(fund.last_price_date).getTime()) / (1000 * 60 * 60 * 24)
      : Infinity;

    if (daysSinceCache <= 14) {
      // Recent cache (likely from AAFM sync) — trust it
      result.currentPrice = fund.last_price;
      result.lastPriceDate = fund.last_price_date ?? null;
      result.source = "fintual_db";
    } else {
      // Stale cache — validate against cartola price if available
      if (cartolaPrice && cartolaPrice > 0) {
        const ratio = fund.last_price / cartolaPrice;
        if (ratio >= 0.5 && ratio <= 2.0) {
          result.currentPrice = fund.last_price;
          result.lastPriceDate = fund.last_price_date ?? null;
          result.source = "fintual_db";
        } else {
          result.currentPrice = null;
          result.lastPriceDate = null;
          result.source = "none";
        }
      } else {
        result.currentPrice = fund.last_price;
        result.lastPriceDate = fund.last_price_date ?? null;
        result.source = "fintual_db";
      }
    }
  } else {
    result.currentPrice = null;
    result.lastPriceDate = null;
    result.source = "none";
  }
}

export async function POST(request: NextRequest) {
  const blocked = applyRateLimit(request, "current-prices", { limit: 10, windowSeconds: 60 });
  if (blocked) return blocked;

  const { error: authError } = await requireAdvisor();
  if (authError) return authError;

  const supabase = createAdminClient();

  try {
    const { holdings, clientId } = await request.json() as { holdings: HoldingInput[]; clientId?: string };

    if (!holdings || !Array.isArray(holdings)) {
      return NextResponse.json(
        { success: false, error: "holdings array requerido" },
        { status: 400 }
      );
    }

    const results: PriceResult[] = [];

    for (const holding of holdings) {
      const result: PriceResult = {
        fundName: holding.fundName,
        fintualId: null,
        fintualName: null,
        serieName: null,
        currentPrice: null,
        lastPriceDate: null,
        currency: "CLP",
        source: "none",
      };

      // 0. FIRST: Try AAFM daily price via fintual_funds RUN → fondos_mutuos → fondos_rentabilidades_diarias
      //    This is the most reliable source for Chilean mutual fund prices
      {
        const aafmPrice = await fetchAAFMPrice(holding.fundName, supabase);
        if (aafmPrice && aafmPrice.price > 0) {
          result.currentPrice = aafmPrice.price;
          result.lastPriceDate = aafmPrice.date;
          result.fintualName = aafmPrice.fundName || holding.fundName;
          result.serieName = aafmPrice.serie || null;
          result.source = "aafm";
          results.push(result);
          continue;
        }
      }

      // 1. Try matching by securityId (BCI account number → search in fintual_funds)
      if (holding.securityId) {
        const sid = holding.securityId.trim();

        if (/^\d{4,10}$/.test(sid)) {
          // Try as direct Fintual ID
          const { data } = await supabase
            .from("fintual_funds")
            .select("fintual_id, fund_name, serie_name, last_price, last_price_date, currency")
            .eq("fintual_id", sid)
            .limit(1);

          if (data && data.length > 0) {
            const live = await fetchLivePrice(data[0].fintual_id, supabase);
            assignMatch(result, data[0], live, live ? "fintual_api" : "fintual_db", holding.cartolaPrice);
            results.push(result);
            continue;
          }

          // Try as CMF RUN
          const { data: byRun } = await supabase
            .from("fintual_funds")
            .select("fintual_id, fund_name, serie_name, last_price, last_price_date, currency, symbol")
            .eq("run", sid)
            .limit(10);

          if (byRun && byRun.length > 0) {
            const best = pickBestSerie(byRun, holding.fundName);
            if (best) {
              const live = await fetchLivePrice(best.fintual_id, supabase);
              assignMatch(result, best, live, live ? "fintual_api" : "fintual_db", holding.cartolaPrice);
              results.push(result);
              continue;
            }
          }
        }
      }

      // 2. Search by fund name in fintual_funds
      const coreName = holding.fundName
        .replace(/\b(FONDO\s+MUTUO|FONDO\s+DE\s+INVERSION|F\.?\s*I\.?|SERIE?)\b/gi, "")
        .replace(/\s*-\s*(BANCA\s+PRIVADA|BPRIVADA|ALTO\s+PATRIMONIO|APV|INSTITUCIONAL|CLASICA|COLABORADOR|INVERSIONIST\w*|BPRIV|ALPAT|INSTI|[A-Z])\s*$/i, "")
        .replace(/\s*,\s*SER\s+\w+$/i, "")
        .trim();

      const searchTerms = coreName
        .split(/\s+/)
        .filter((w) => w.length > 2 && !/^(DE|DEL|LA|LOS|LAS|EL|EN|CON|POR|SER)$/i.test(w))
        .slice(0, 4);

      const selectFields = "fintual_id, fund_name, serie_name, last_price, last_price_date, currency, symbol, provider_name";
      let matched = false;

      // 2a. Try symbol-based search first (symbol = "FFMM-BCI-9226-BPRIV", no accents)
      // Symbol contains AGF code and serie code, very reliable for matching
      const targetSerie = detectSerieCode(holding.fundName);
      if (searchTerms.length >= 1) {
        // Build symbol search: e.g., symbol contains "BCI" and optionally the serie
        let symbolQuery = supabase.from("fintual_funds").select(selectFields)
          .ilike("symbol", `%${searchTerms[0]}%`);

        // Also filter by at least one fund_name term for precision
        if (searchTerms.length >= 2) {
          symbolQuery = symbolQuery.ilike("fund_name", `%${searchTerms[1]}%`);
        }

        // If we know the serie, filter by it in symbol
        if (targetSerie) {
          symbolQuery = symbolQuery.ilike("symbol", `%${targetSerie}%`);
        }

        const { data: symbolCandidates } = await symbolQuery.limit(15);

        if (symbolCandidates && symbolCandidates.length > 0) {
          const best = pickBestSerie(symbolCandidates, holding.fundName);
          if (best) {
            const live = await fetchLivePrice(best.fintual_id, supabase);
            assignMatch(result, best, live, live ? "fintual_api" : "fintual_db", holding.cartolaPrice);
            matched = true;
          }
        }
      }

      // 2b. Progressive fund_name search (fallback if symbol search didn't work)
      // ilike doesn't handle accents, so start with accent-free terms and reduce progressively
      for (let termCount = Math.min(searchTerms.length, 4); termCount >= 1 && !matched; termCount--) {
        let query = supabase.from("fintual_funds").select(selectFields);

        for (let t = 0; t < termCount; t++) {
          query = query.ilike("fund_name", `%${searchTerms[t]}%`);
        }

        const { data: candidates } = await query.limit(termCount >= 3 ? 15 : 30);

        if (candidates && candidates.length > 0) {
          const best = pickBestSerie(candidates, holding.fundName);
          if (best) {
            const live = await fetchLivePrice(best.fintual_id, supabase);
            assignMatch(result, best, live, live ? "fintual_api" : "fintual_db", holding.cartolaPrice);
            matched = true;
          }
        }
      }

      // 3. If Fintual data is stale (>30 days), try CMF as supplement
      if (result.fintualId && result.lastPriceDate) {
        const priceDate = new Date(result.lastPriceDate);
        const daysSincePrice = (Date.now() - priceDate.getTime()) / (1000 * 60 * 60 * 24);

        if (daysSincePrice > 30) {
          const cmfPrice = await fetchCMFPrice(holding.fundName, result.serieName, supabase);
          if (cmfPrice && cmfPrice.price > 0) {
            // Use CMF price if it's more recent
            const cmfDate = new Date(cmfPrice.date);
            if (cmfDate > priceDate) {
              result.currentPrice = cmfPrice.price;
              result.lastPriceDate = cmfPrice.date;
              result.source = "cmf";
            }
          }
        }
      }

      // 4. If no Fintual match at all, try CMF directly
      if (!result.fintualId) {
        const cmfPrice = await fetchCMFPrice(holding.fundName, null, supabase);
        if (cmfPrice && cmfPrice.price > 0) {
          result.currentPrice = cmfPrice.price;
          result.lastPriceDate = cmfPrice.date;
          result.fintualName = holding.fundName;
          result.source = "cmf";
        }
      }

      // 5. Last resort: if still no price and we have clientId, use the latest snapshot holding price
      if (!result.currentPrice && clientId) {
        const { data: latestSnap } = await supabase
          .from("portfolio_snapshots")
          .select("snapshot_date, holdings")
          .eq("client_id", clientId)
          .order("snapshot_date", { ascending: false })
          .limit(1)
          .single();

        if (latestSnap?.holdings && Array.isArray(latestSnap.holdings)) {
          const match = (latestSnap.holdings as Array<{ fundName: string; marketPrice?: number; marketValue?: number; quantity?: number }>)
            .find((h) => h.fundName === holding.fundName);
          if (match) {
            const price = match.marketPrice || (match.quantity && match.quantity > 0 ? (match.marketValue || 0) / match.quantity : 0);
            if (price > 0) {
              result.currentPrice = price;
              result.lastPriceDate = latestSnap.snapshot_date;
              result.source = "snapshot";
            }
          }
        }
      }

      results.push(result);
    }

    return NextResponse.json({ success: true, prices: results });
  } catch (error) {
    console.error("Error in current-prices:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Error obteniendo precios" },
      { status: 500 }
    );
  }
}

function pickBestSerie(
  funds: Array<{
    fintual_id: string;
    fund_name: string;
    serie_name?: string;
    last_price?: number;
    last_price_date?: string;
    currency?: string;
    symbol?: string;
    provider_name?: string;
  }>,
  holdingName: string
) {
  // Normalize: lowercase + strip accents for comparison
  const nameLower = stripAccents(holdingName.toLowerCase());
  const targetSerie = detectSerieCode(holdingName);

  let best: (typeof funds)[0] | null = null;
  let bestScore = 0;

  for (const fund of funds) {
    const fundLower = stripAccents(fund.fund_name.toLowerCase());
    const symbolUpper = (fund.symbol || "").toUpperCase();
    const serieUpper = (fund.serie_name || "").toUpperCase();
    let score = 0;

    // Word overlap scoring
    const fundWords = fundLower.split(/\s+/).filter((w) => w.length > 2);
    for (const word of fundWords) {
      if (nameLower.includes(word)) {
        score++;
      } else {
        // Handle gender variants: balanceada/balanceado, conservadora/conservador
        const stem = word.replace(/(a|o|as|os|or|ora)$/, "");
        if (stem.length >= 4 && nameLower.includes(stem)) {
          score += 0.8;
        }
      }
    }

    // Serie match bonus (very important — BPRIV vs CLASI have different prices)
    if (targetSerie) {
      if (symbolUpper.includes(targetSerie) || serieUpper.includes(targetSerie)) {
        score += 5;
      } else {
        // Penalize wrong serie so we don't pick e.g. Serie A when looking for BPRIV
        score -= 1;
      }
    }

    // Provider match bonus
    if (fund.provider_name && nameLower.includes(stripAccents(fund.provider_name.toLowerCase()))) {
      score += 1;
    }

    // Prefer funds with a recent price
    if (fund.last_price && fund.last_price > 0) {
      score += 0.5;
    }

    if (score > bestScore) {
      bestScore = score;
      best = fund;
    }
  }

  return bestScore >= 2 ? best : null;
}
