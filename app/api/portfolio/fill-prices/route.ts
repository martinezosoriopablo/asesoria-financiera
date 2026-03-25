// app/api/portfolio/fill-prices/route.ts
// Llena snapshots intermedios entre cartolas usando precios de mercado
// Esto permite calcular TWR diario real entre cartolas

import { NextRequest, NextResponse } from "next/server";
import { requireAdvisor, createAdminClient } from "@/lib/auth/api-auth";
import { applyRateLimit } from "@/lib/rate-limit";
import { getSeriesPrices } from "@/lib/fintual-api";
import { getHistoricalPrices as getBolsaSantiagoHistorical } from "@/lib/bolsa-santiago/client";

// Execute async tasks in parallel with a concurrency limit
async function parallelWithLimit<T>(tasks: (() => Promise<T>)[], limit: number): Promise<T[]> {
  const results: T[] = [];
  const executing: Set<Promise<void>> = new Set();
  for (const task of tasks) {
    const p = task().then(r => { results.push(r); });
    const tracked = p.finally(() => executing.delete(tracked));
    executing.add(tracked);
    if (executing.size >= limit) {
      await Promise.race(executing);
    }
  }
  await Promise.all(executing);
  return results;
}

interface HoldingWithSource {
  fundName: string;
  securityId?: string | null;
  quantity: number;
  marketValue: number;
  assetClass?: string;
  currency?: string;
  // Price source identifiers
  fintual_id?: string;
  ticker?: string; // Yahoo Finance ticker
}

interface DailyPrice {
  date: string;
  price: number;
}

// Fetch historical prices from Yahoo Finance for a date range
async function fetchYahooHistorical(
  ticker: string,
  fromDate: string,
  toDate: string
): Promise<DailyPrice[]> {
  try {
    const from = Math.floor(new Date(fromDate).getTime() / 1000);
    const to = Math.floor(new Date(toDate).getTime() / 1000) + 86400;
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?period1=${from}&period2=${to}&interval=1d`;

    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });

    if (!response.ok) return [];
    const data = await response.json();
    if (data.chart.error || !data.chart.result?.length) return [];

    const result = data.chart.result[0];
    const timestamps = result.timestamp || [];
    const closes = result.indicators.quote[0]?.close || [];

    const prices: DailyPrice[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      if (closes[i] != null) {
        const date = new Date(timestamps[i] * 1000)
          .toISOString()
          .split("T")[0];
        prices.push({ date, price: closes[i] });
      }
    }
    return prices;
  } catch {
    return [];
  }
}

// Fetch historical prices from Alpha Vantage (TIME_SERIES_DAILY)
async function fetchAlphaVantageHistorical(
  ticker: string,
  fromDate: string,
  toDate: string
): Promise<DailyPrice[]> {
  try {
    const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
    if (!apiKey) return [];

    const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${encodeURIComponent(ticker)}&outputsize=full&apikey=${apiKey}`;
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });

    if (!response.ok) return [];
    const data = await response.json();

    // Check rate limit
    if (data.Note || data.Information) return [];

    const timeSeries = data["Time Series (Daily)"];
    if (!timeSeries) return [];

    const prices: DailyPrice[] = [];
    for (const [date, values] of Object.entries(timeSeries)) {
      if (date >= fromDate && date <= toDate) {
        const close = parseFloat((values as Record<string, string>)["4. close"]);
        if (!isNaN(close)) {
          prices.push({ date, price: close });
        }
      }
    }
    return prices.sort((a, b) => a.date.localeCompare(b.date));
  } catch {
    return [];
  }
}

// Fetch historical prices from Bolsa de Santiago API
// Note: API only available during Chilean business hours (until ~20:00 CLT)
async function fetchBolsaSantiagoHistoricalPrices(
  nemo: string,
  fromDate: string,
  toDate: string
): Promise<DailyPrice[]> {
  try {
    const data = await getBolsaSantiagoHistorical(nemo, fromDate, toDate);
    return data.map((d) => ({
      date: d.date,
      price: d.close,
    }));
  } catch {
    return [];
  }
}

// Fetch historical prices from Fintual API
async function fetchFintualHistorical(
  fintualId: string,
  fromDate: string,
  toDate: string
): Promise<DailyPrice[]> {
  try {
    const data = await getSeriesPrices(fintualId, fromDate, toDate);
    return data.map((d) => ({
      date: d.attributes.date,
      price: d.attributes.price,
    }));
  } catch {
    return [];
  }
}

// Serie keywords map: detect the serie from the holding name
// e.g., "BANCA PRIVADA" → BPRIV, "ALTO PATRIMONIO" → ALPAT
const SERIE_KEYWORDS: Array<{ pattern: RegExp; serieCode: string }> = [
  { pattern: /BANCA\s*PRIVADA|BPRIVADA/i, serieCode: "BPRIV" },
  { pattern: /ALTO\s*PATRIMONIO|ALTOPATRIM/i, serieCode: "ALPAT" },
  { pattern: /INSTITUCIONAL/i, serieCode: "INSTI" },
  { pattern: /INVERSIONIST/i, serieCode: "INVER" },
  { pattern: /COLABORADOR/i, serieCode: "COLAB" },
  { pattern: /CLASICA|CLASIC/i, serieCode: "CLASI" },
  { pattern: /\bAPV\b/i, serieCode: "APV" },
];

function detectSerieCode(holdingName: string): string | null {
  for (const { pattern, serieCode } of SERIE_KEYWORDS) {
    if (pattern.test(holdingName)) return serieCode;
  }
  return null;
}

// Cached fintual_funds data structure for in-memory lookups
interface FintualFundRow {
  fintual_id: string;
  fund_name: string;
  serie_name?: string;
  provider_name?: string;
  symbol?: string;
  run?: string;
}

interface FintualFundsCache {
  all: FintualFundRow[];
  byFintualId: Map<string, FintualFundRow>;
  byRun: Map<string, FintualFundRow[]>;
}

// Pre-fetch ALL fintual_funds into memory for O(1) lookups
async function prefetchFintualFunds(
  supabase: ReturnType<typeof createAdminClient>
): Promise<FintualFundsCache> {
  const { data, error } = await supabase
    .from("fintual_funds")
    .select("fintual_id, fund_name, serie_name, provider_name, symbol, run");

  const all: FintualFundRow[] = data && !error ? data : [];

  const byFintualId = new Map<string, FintualFundRow>();
  const byRun = new Map<string, FintualFundRow[]>();

  for (const row of all) {
    byFintualId.set(row.fintual_id, row);
    if (row.run) {
      const existing = byRun.get(row.run) || [];
      existing.push(row);
      byRun.set(row.run, existing);
    }
  }

  return { all, byFintualId, byRun };
}

// Try to match a holding to a Fintual fund using pre-fetched cache
// Strategy: name search → find candidates → pick best serie match
function matchHoldingToFintualCached(
  cache: FintualFundsCache,
  fundName: string,
  securityId?: string | null
): string | null {
  // 1. Try matching by symbol if securityId is provided
  if (securityId) {
    const sid = securityId.trim();
    const sidUpper = sid.toUpperCase();
    const bySymbol = cache.all.filter(
      (f) => f.symbol && f.symbol.toUpperCase().includes(sidUpper)
    );
    if (bySymbol.length > 0) {
      // If multiple results, prefer exact match
      const exact = bySymbol.find((f) => f.symbol?.trim().toUpperCase() === sidUpper);
      return exact ? exact.fintual_id : bySymbol[0].fintual_id;
    }

    // 1b. Try matching by CMF RUN code
    // RUN codes are typically 4-5 digits, different from internal BCI codes (7 digits)
    if (/^\d{3,5}$/.test(sid)) {
      const byRun = cache.byRun.get(sid);
      if (byRun && byRun.length > 0) {
        return pickBestSerie(byRun, fundName);
      }
    }
  }

  // 2. Extract core fund name for search (remove noise)
  const coreName = fundName
    .replace(/\b(FONDO\s+MUTUO|FONDO\s+DE\s+INVERSION|F\.?\s*I\.?|SERIE?)\b/gi, "")
    .replace(/\s*-\s*(BANCA\s+PRIVADA|BPRIVADA|ALTO\s+PATRIMONIO|APV|INSTITUCIONAL|CLASICA|COLABORADOR|INVERSIONIST\w*)\s*$/i, "")
    .replace(/\s*,\s*SER\s+\w+$/i, "")
    .trim();

  // Get 2-3 distinctive search words
  const searchTerms = coreName
    .split(/\s+/)
    .filter((w) => w.length > 2 && !/^(DE|DEL|LA|LOS|LAS|EL|EN|CON|POR|SER)$/i.test(w))
    .slice(0, 4);

  if (searchTerms.length === 0) return null;

  // 3. Search by the most distinctive terms combined (in-memory filter)
  let candidates: FintualFundRow[] | null = null;

  // Try searching with the first two terms combined for precision
  if (searchTerms.length >= 2) {
    const term0 = searchTerms[0].toLowerCase();
    const term1 = searchTerms[1].toLowerCase();
    candidates = cache.all.filter((f) => {
      const name = f.fund_name.toLowerCase();
      return name.includes(term0) && name.includes(term1);
    });
  }

  // Fallback to single term search
  if (!candidates || candidates.length === 0) {
    const term0 = searchTerms[0].toLowerCase();
    candidates = cache.all.filter((f) =>
      f.fund_name.toLowerCase().includes(term0)
    );
  }

  if (candidates.length === 0) return null;

  // 4. Score each candidate
  return pickBestSerie(candidates, fundName);
}

// Given multiple fund series (same fund, different series), pick the one that best matches the holding name
function pickBestSerie(
  funds: Array<{ fintual_id: string; fund_name: string; serie_name?: string; provider_name?: string; symbol?: string; run?: string }>,
  holdingName: string
): string | null {
  const nameLower = holdingName.toLowerCase();
  const targetSerie = detectSerieCode(holdingName);

  let bestId: string | null = null;
  let bestScore = 0;

  for (const fund of funds) {
    const fundLower = fund.fund_name.toLowerCase();
    const symbolUpper = (fund.symbol || "").toUpperCase();
    let score = 0;

    // Base: how much of the fund name matches
    const fundWords = fundLower.split(/\s+/).filter((w) => w.length > 2);
    for (const word of fundWords) {
      if (nameLower.includes(word)) score++;
    }

    // Serie match bonus (critical for getting the right price)
    if (targetSerie && symbolUpper.includes(targetSerie)) {
      score += 5; // Strong bonus for exact serie match
    }

    // Provider match bonus
    if (fund.provider_name && nameLower.includes(fund.provider_name.toLowerCase())) {
      score += 1;
    }

    if (score > bestScore) {
      bestScore = score;
      bestId = fund.fintual_id;
    }
  }

  // Require at least some match quality
  return bestScore >= 2 ? bestId : null;
}

// Chilean instruments on Yahoo Finance use the .SN suffix (Santiago exchange)
// This gives prices in CLP which is what the portfolio needs
// ADRs like GOOGLCL, NVDACL are traded on Bolsa de Santiago in CLP

// Map Chilean stock exchange nemotécnicos to Fintual fund search terms
// These are ETFs and fondos de inversión traded on Bolsa de Santiago
const CHILEAN_NEMO_TO_FINTUAL: Record<string, { searchTerm: string; fintualId?: string }> = {
  CFIETFCC: { searchTerm: "ETF SINGULAR CHILE CORPORATIVO", fintualId: "8093" },
  CFIETFIPSA: { searchTerm: "ETF SINGULAR IPSA", fintualId: "23385" },
  CFIETFLP: { searchTerm: "ETF SINGULAR CHILE LARGO PLAZO", fintualId: "22346" },
  CFIETFCD: { searchTerm: "ETF SINGULAR CHILE CORTA DURACION", fintualId: "15524" },
  CFIETFSP: { searchTerm: "ETF SINGULAR S&P 500", fintualId: "17147" },
  CFIETFGC: { searchTerm: "ETF SINGULAR GLOBAL CORPORATES", fintualId: "16245" },
  CFIETFC46: { searchTerm: "ETF SINGULAR CORE 40/60", fintualId: "23991" },
};

// Check if a securityId is a numeric Fintual series ID
function isFintualId(securityId: string): boolean {
  return /^\d{4,10}$/.test(securityId.trim());
}

// Known Chilean nemotécnicos (Bolsa de Santiago) — use .SN suffix on Yahoo
const KNOWN_CHILEAN_NEMOS = new Set([
  "GOOGLCL", "NVDACL", "AMZNCL", "MSFTCL", "AAPLCL", "METACL", "TSLACL",
  "NFLXCL", "DISNCL", "BABORACL", "MERCADOLCL",
  // Chilean stocks
  "BSANTANDER", "BCI", "ITAUCORP", "SECURITY", "COPEC", "SQM-A", "SQM-B",
  "CAP", "COLBUN", "FALABELLA", "CENCOSUD", "RIPLEY", "CMPC", "CHILE",
  "CCU", "VAPORES", "PARAUCO", "ENELCHILE", "HABITAT", "QUINENCO",
]);

// Try to resolve a Chilean market code to a Yahoo ticker
function resolveChileanTicker(code: string): string | null {
  const upper = code.toUpperCase().trim();

  // Already has .SN suffix
  if (/^[A-Z0-9-]+\.SN$/.test(upper)) return upper;

  // Known Chilean nemotécnico → add .SN for Yahoo
  if (KNOWN_CHILEAN_NEMOS.has(upper)) return `${upper}.SN`;

  // Pattern: ends in "CL" with 5+ chars = likely Chilean ADR → use .SN
  if (upper.length >= 5 && upper.endsWith("CL") && /^[A-Z]+CL$/.test(upper)) {
    return `${upper}.SN`;
  }

  // Starts with CFI (Chilean fund/ETF nemotécnico) → use .SN
  if (upper.startsWith("CFI") && /^[A-Z]{4,15}$/.test(upper)) {
    return `${upper}.SN`;
  }

  // Standard US ticker pattern (no special suffix)
  if (/^[A-Z]{1,5}$/.test(upper)) return upper;
  if (/^[A-Z]{1,5}\.(MX|L|TO)$/.test(upper)) return upper;

  return null;
}

// Extract Yahoo ticker from holding name or securityId
function extractTicker(name: string, securityId?: string | null): string | null {
  if (securityId) {
    const id = securityId.trim();
    // Skip numeric IDs (those are Fintual IDs, handled separately)
    if (isFintualId(id)) return null;
    // Try resolving as Chilean market code
    const resolved = resolveChileanTicker(id);
    if (resolved) return resolved;
  }

  // Try extracting from name patterns
  const tickerMatch = name.match(/^([A-Z]{1,5})\s*[-–]\s*/);
  if (tickerMatch) return tickerMatch[1];
  const parenMatch = name.match(/\(([A-Z]{1,10})\)/);
  if (parenMatch) {
    const resolved = resolveChileanTicker(parenMatch[1]);
    if (resolved) return resolved;
  }
  return null;
}

export async function POST(request: NextRequest) {
  const blocked = applyRateLimit(request, "fill-prices", {
    limit: 5,
    windowSeconds: 60,
  });
  if (blocked) return blocked;

  const { error: authError } = await requireAdvisor();
  if (authError) return authError;

  const supabase = createAdminClient();

  try {
    const { clientId } = await request.json();

    if (!clientId) {
      return NextResponse.json(
        { success: false, error: "clientId requerido" },
        { status: 400 }
      );
    }

    // 1. Get all existing snapshots from cartolas (source = 'statement' or 'manual' or 'excel')
    const { data: snapshots, error: snapError } = await supabase
      .from("portfolio_snapshots")
      .select("*")
      .eq("client_id", clientId)
      .order("snapshot_date", { ascending: true });

    if (snapError) throw snapError;
    if (!snapshots || snapshots.length === 0) {
      return NextResponse.json(
        { success: false, error: "No hay cartolas para este cliente" },
        { status: 400 }
      );
    }

    // Separate cartola snapshots (have holdings) from filled ones
    const cartolaSnapshots = snapshots.filter(
      (s) => s.holdings && Array.isArray(s.holdings) && s.holdings.length > 0
    );

    if (cartolaSnapshots.length === 0) {
      return NextResponse.json(
        { success: false, error: "No hay cartolas con holdings para interpolar" },
        { status: 400 }
      );
    }

    // 2. Pre-fetch ALL fintual_funds in a single query for O(1) lookups
    const fintualCache = await prefetchFintualFunds(supabase);

    // Resolve price sources for each unique holding across ALL cartolas
    type PriceSource = "fintual" | "yahoo" | "alphavantage" | "bolsa_santiago" | "none";
    type ResolvedSource = { source: PriceSource; sourceId: string | null };
    const resolvedCache = new Map<string, ResolvedSource>();

    const resolveHolding = (holding: HoldingWithSource): ResolvedSource => {
      const cacheKey = `${holding.fundName}||${holding.securityId || ""}`;
      if (resolvedCache.has(cacheKey)) return resolvedCache.get(cacheKey)!;

      let priceSource: PriceSource = "none";
      let sourceId: string | null = null;

      // 1. If securityId is numeric, try as Fintual series ID first, then as CMF RUN
      if (holding.securityId && isFintualId(holding.securityId)) {
        const sid = holding.securityId.trim();

        // 1a. Try as direct Fintual series ID (O(1) Map lookup)
        const directMatch = fintualCache.byFintualId.get(sid);
        if (directMatch) {
          priceSource = "fintual";
          sourceId = directMatch.fintual_id;
        }

        // 1b. Try as CMF RUN code (shorter numbers, typically 3-5 digits)
        if (priceSource === "none") {
          const byRun = fintualCache.byRun.get(sid);
          if (byRun && byRun.length > 0) {
            const bestId = pickBestSerie(byRun, holding.fundName);
            if (bestId) {
              priceSource = "fintual";
              sourceId = bestId;
            }
          }
        }
      }

      // 2. If holding already has fintual_id field
      if (priceSource === "none" && holding.fintual_id) {
        priceSource = "fintual";
        sourceId = holding.fintual_id;
      }

      // 3. For Chilean nemotécnicos (CFIETF*, CFI*), try Fintual direct mapping first
      //    (Fintual has daily prices even for low-liquidity instruments)
      if (priceSource === "none" && holding.securityId) {
        const sid = holding.securityId.trim().toUpperCase();
        const directNemoMatch = CHILEAN_NEMO_TO_FINTUAL[sid];
        if (directNemoMatch?.fintualId) {
          priceSource = "fintual";
          sourceId = directNemoMatch.fintualId;
        } else if (sid.startsWith("CFIETF") || sid.startsWith("CFI")) {
          // In-memory search by symbol or fund_name containing the nemo
          const sidLower = sid.toLowerCase();
          const match = fintualCache.all.find(
            (f) =>
              (f.symbol && f.symbol.toLowerCase().includes(sidLower)) ||
              f.fund_name.toLowerCase().includes(sidLower)
          );
          if (match) {
            priceSource = "fintual";
            sourceId = match.fintual_id;
          }
        }
      }

      // 4. Try matching to Fintual fund by name/symbol (fuzzy, in-memory)
      if (priceSource === "none") {
        const fintualId = matchHoldingToFintualCached(fintualCache, holding.fundName, holding.securityId);
        if (fintualId) {
          priceSource = "fintual";
          sourceId = fintualId;
        }
      }

      // 5. For Chilean instruments, try Bolsa de Santiago API (reliable during business hours)
      if (priceSource === "none" && holding.securityId) {
        const sid = holding.securityId.trim().toUpperCase();
        const isChilean = KNOWN_CHILEAN_NEMOS.has(sid) ||
          sid.endsWith("CL") && sid.length >= 5 ||
          sid.startsWith("CFI");
        if (isChilean) {
          // Remove .SN suffix if present for the Bolsa API
          const nemo = sid.replace(/\.SN$/, "");
          priceSource = "bolsa_santiago";
          sourceId = nemo;
        }
      }

      // 6. Try securityId as Yahoo ticker (Chilean with .SN, or international)
      if (priceSource === "none") {
        const ticker = extractTicker(holding.fundName, holding.securityId);
        if (ticker) {
          priceSource = "yahoo";
          sourceId = ticker;
        }
      }

      // 7. Last resort: try Alpha Vantage
      if (priceSource === "none" && holding.securityId && process.env.ALPHA_VANTAGE_API_KEY) {
        const sid = holding.securityId.trim();
        if (/^[A-Z0-9]{2,15}$/i.test(sid)) {
          priceSource = "alphavantage";
          sourceId = sid;
        }
      }

      const resolved: ResolvedSource = { source: priceSource, sourceId };
      resolvedCache.set(cacheKey, resolved);
      return resolved;
    };

    // Resolve all holdings from all cartolas
    const allHoldingMatches: Array<{ name: string; securityId?: string | null; source: string; sourceId: string | null }> = [];
    for (const snap of cartolaSnapshots) {
      if (!snap.holdings) continue;
      for (const h of snap.holdings) {
        const resolved = resolveHolding(h);
        // Only add unique entries to the report
        if (!allHoldingMatches.some((m) => m.name === h.fundName && m.securityId === h.securityId)) {
          allHoldingMatches.push({
            name: h.fundName,
            securityId: h.securityId,
            source: resolved.source,
            sourceId: resolved.sourceId,
          });
        }
      }
    }

    // 3. For each pair of consecutive cartolas, fill intermediate prices
    const result = {
      filled: 0,
      skipped: 0,
      errors: [] as string[],
      holdingMatches: allHoldingMatches,
    };

    // Process from the latest cartola to today (or between cartolas)
    for (let ci = 0; ci < cartolaSnapshots.length; ci++) {
      const startSnapshot = cartolaSnapshots[ci];
      const startDate = startSnapshot.snapshot_date;

      // End date is next cartola date, or today
      const endDate =
        ci < cartolaSnapshots.length - 1
          ? cartolaSnapshots[ci + 1].snapshot_date
          : new Date().toISOString().split("T")[0];

      // Skip if dates are same or adjacent
      const startMs = new Date(startDate).getTime();
      const endMs = new Date(endDate).getTime();
      const daysDiff = Math.round((endMs - startMs) / (1000 * 60 * 60 * 24));

      if (daysDiff <= 1) {
        result.skipped++;
        continue;
      }

      // Use the holdings from this cartola as base quantities
      const baseHoldings: HoldingWithSource[] = startSnapshot.holdings || [];

      // Build a map of holding name to source info (using cached resolution)
      const sourceMap = new Map<
        string,
        { source: PriceSource; sourceId: string | null; quantity: number; assetClass?: string; currency?: string }
      >();

      for (const bh of baseHoldings) {
        const resolved = resolveHolding(bh);
        sourceMap.set(bh.fundName, {
          source: resolved.source,
          sourceId: resolved.sourceId,
          quantity: bh.quantity || 0,
          assetClass: bh.assetClass,
          currency: bh.currency,
        });
      }

      // 4. Fetch daily prices for each holding with a price source (in parallel)
      const nextDay = new Date(startMs + 86400000).toISOString().split("T")[0];
      const pricesByHolding = new Map<string, Map<string, number>>();

      // Build fetch tasks for all holdings, preserving fallback logic per source
      const fetchTasks: Array<{ name: string; task: () => Promise<{ name: string; prices: DailyPrice[] }> }> = [];

      for (const [name, info] of sourceMap) {
        if (info.source === "none" || !info.sourceId) continue;

        const sourceId = info.sourceId;
        const holdingName = name;

        if (info.source === "fintual") {
          fetchTasks.push({
            name: holdingName,
            task: () => fetchFintualHistorical(sourceId, nextDay, endDate)
              .then(prices => ({ name: holdingName, prices })),
          });
        } else if (info.source === "bolsa_santiago") {
          fetchTasks.push({
            name: holdingName,
            task: async () => {
              let prices = await fetchBolsaSantiagoHistoricalPrices(sourceId, nextDay, endDate);
              // Fallback to Yahoo with .SN suffix if Bolsa de Santiago returns nothing
              // (e.g., API outside operating hours)
              if (prices.length === 0) {
                const yahooTicker = `${sourceId}.SN`;
                prices = await fetchYahooHistorical(yahooTicker, nextDay, endDate);
              }
              return { name: holdingName, prices };
            },
          });
        } else if (info.source === "yahoo") {
          fetchTasks.push({
            name: holdingName,
            task: async () => {
              let prices = await fetchYahooHistorical(sourceId, nextDay, endDate);
              // Fallback to Alpha Vantage if Yahoo returned no data
              if (prices.length === 0 && process.env.ALPHA_VANTAGE_API_KEY) {
                prices = await fetchAlphaVantageHistorical(sourceId, nextDay, endDate);
              }
              return { name: holdingName, prices };
            },
          });
        } else if (info.source === "alphavantage") {
          fetchTasks.push({
            name: holdingName,
            task: () => fetchAlphaVantageHistorical(sourceId, nextDay, endDate)
              .then(prices => ({ name: holdingName, prices })),
          });
        }
      }

      // Execute all fetch tasks in parallel with concurrency limit
      const CONCURRENCY_LIMIT = 5;
      const fetchResults = await parallelWithLimit(
        fetchTasks.map(({ name: holdingName, task }) => async () => {
          try {
            return await task();
          } catch (err) {
            result.errors.push(`Error fetching prices for ${holdingName}: ${err}`);
            return { name: holdingName, prices: [] as DailyPrice[] };
          }
        }),
        CONCURRENCY_LIMIT
      );

      // Populate pricesByHolding from parallel results
      for (const fetchResult of fetchResults) {
        if (fetchResult.prices.length > 0) {
          const priceMap = new Map<string, number>();
          for (const p of fetchResult.prices) {
            priceMap.set(p.date, p.price);
          }
          pricesByHolding.set(fetchResult.name, priceMap);
        }
      }

      // 5. Collect all dates that have at least one price
      const allDatesSet = new Set<string>();
      for (const priceMap of pricesByHolding.values()) {
        for (const date of priceMap.keys()) {
          allDatesSet.add(date);
        }
      }

      const allDates = Array.from(allDatesSet).sort();

      // Remove dates that already have snapshots
      const existingDates = new Set(
        snapshots.map((s) => s.snapshot_date)
      );

      const newDates = allDates.filter((d) => !existingDates.has(d));

      if (newDates.length === 0) {
        result.skipped++;
        continue;
      }

      // 6. Calculate portfolio value for each new date
      const baseValue = startSnapshot.total_value;

      // Base prices from cartola — fixed reference for return calculations
      const basePricesMap = new Map<string, number>();
      // Track last known prices for holdings that may not have daily prices
      const lastKnownPrices = new Map<string, number>();
      // Initialize both with cartola prices
      for (const bh of baseHoldings) {
        if (bh.quantity && bh.quantity > 0 && bh.marketValue) {
          const price = bh.marketValue / bh.quantity;
          basePricesMap.set(bh.fundName, price);
          lastKnownPrices.set(bh.fundName, price);
        }
      }

      // Calculate implied USD/CLP exchange rate from cartola total
      // total_value (CLP) = sum(CLP holdings) + sum(USD holdings × rate)
      const clpHoldingsSum = baseHoldings
        .filter((h) => h.currency !== "USD")
        .reduce((s, h) => s + (h.marketValue || 0), 0);
      const usdHoldingsSum = baseHoldings
        .filter((h) => h.currency === "USD")
        .reduce((s, h) => s + (h.marketValue || 0), 0);
      const impliedUsdClpRate = usdHoldingsSum > 0
        ? (baseValue - clpHoldingsSum) / usdHoldingsSum
        : 1;

      // Store base CLP values for USD holdings (for proportional scaling)
      const baseValuesCLP = new Map<string, number>();
      for (const bh of baseHoldings) {
        if (bh.currency === "USD" && bh.marketValue) {
          baseValuesCLP.set(bh.fundName, bh.marketValue * impliedUsdClpRate);
        }
      }

      // Previous snapshot values for TWR chain
      let prevValue = baseValue;
      let prevCuotas = baseHoldings.reduce((sum, h) => sum + (h.quantity || 0), 0);
      let prevTwrCumulative = startSnapshot.twr_cumulative || 0;

      for (const date of newDates) {
        // Calculate total portfolio value on this date
        let totalValue = 0;
        let holdingsValued = 0;
        let holdingsTotal = baseHoldings.length;

        const dailyHoldings: Array<{
          fundName: string;
          quantity: number;
          marketPrice: number;
          marketValue: number;
          assetClass?: string;
          currency?: string;
          returnFromBase?: number; // % return since cartola base price
          weight?: number; // % weight in portfolio
        }> = [];

        for (const bh of baseHoldings) {
          const info = sourceMap.get(bh.fundName);
          const quantity = bh.quantity || 0;
          // Default asset class to "equity" if not specified (most common)
          const assetClass = info?.assetClass || bh.assetClass || "equity";
          // Base price from cartola (original, trusted price)
          const cartolaPrice = basePricesMap.get(bh.fundName) || 0;
          const lastPrice = lastKnownPrices.get(bh.fundName) ||
            (bh.marketValue && bh.quantity ? bh.marketValue / bh.quantity : 0);

          const priceMap = pricesByHolding.get(bh.fundName);
          let dayPrice = priceMap?.get(date);

          // VALIDATION: Reject API prices that differ >20% from cartola price.
          // This catches wrong fund/series matches while allowing normal equity volatility.
          if (dayPrice && cartolaPrice > 0) {
            const priceRatio = dayPrice / cartolaPrice;
            if (priceRatio < 0.8 || priceRatio > 1.2) {
              // Price is way off — likely wrong fund match. Use last known good price.
              dayPrice = undefined;
              result.errors.push(
                `${bh.fundName}: API price ${dayPrice} rejected (cartola: ${cartolaPrice.toFixed(2)}, ratio: ${priceRatio.toFixed(2)}). Using last known price.`
              );
            }
          }

          // Helper to compute CLP value from price (handles USD conversion)
          const computeValue = (price: number): number => {
            if (info?.currency === "USD") {
              // Scale base CLP value by price change ratio to avoid needing daily FX rates
              const baseCLP = baseValuesCLP.get(bh.fundName) || 0;
              const priceRatio = cartolaPrice > 0 ? price / cartolaPrice : 1;
              return baseCLP * priceRatio;
            }
            return quantity * price;
          };

          if (dayPrice && quantity > 0) {
            const value = computeValue(dayPrice);
            totalValue += value;
            holdingsValued++;
            lastKnownPrices.set(bh.fundName, dayPrice);
            const returnFromBase = cartolaPrice > 0
              ? ((dayPrice / cartolaPrice) - 1) * 100 : 0;
            dailyHoldings.push({
              fundName: bh.fundName,
              quantity,
              marketPrice: dayPrice,
              marketValue: value,
              assetClass,
              currency: info?.currency,
              returnFromBase: Math.round(returnFromBase * 100) / 100,
            });
          } else if (quantity > 0) {
            const fallbackPrice = lastPrice > 0 ? lastPrice : cartolaPrice;
            if (fallbackPrice > 0) {
              const value = computeValue(fallbackPrice);
              totalValue += value;
              holdingsValued++;
              const returnFromBase = cartolaPrice > 0
                ? ((fallbackPrice / cartolaPrice) - 1) * 100 : 0;
              dailyHoldings.push({
                fundName: bh.fundName,
                quantity,
                marketPrice: fallbackPrice,
                marketValue: value,
                assetClass,
                currency: info?.currency,
                returnFromBase: Math.round(returnFromBase * 100) / 100,
              });
            }
          }
        }

        // Skip if we couldn't value enough of the portfolio
        if (holdingsValued === 0 || totalValue <= 0) continue;

        // If not all holdings have prices, scale proportionally
        if (holdingsValued < holdingsTotal && holdingsValued > 0) {
          const pricedRatio = holdingsValued / holdingsTotal;
          if (pricedRatio < 0.5) continue;
        }

        // Add weight to each holding now that we know totalValue
        for (const h of dailyHoldings) {
          h.weight = totalValue > 0
            ? Math.round((h.marketValue / totalValue) * 10000) / 100
            : 0;
        }

        // Calculate total cuotas for this day (sum of all quantities)
        const totalCuotas = dailyHoldings.reduce((sum, h) => sum + (h.quantity || 0), 0);

        // Calculate portfolio TWR as weighted sum of individual holding returns
        // TWR_portfolio = Σ(weight_i × return_i) — independent of cash flows
        let twrPeriod = 0;
        if (prevValue > 0) {
          // Use per-holding weighted returns for accuracy
          // Period return = portfolio value change (no cash flows between cartolas)
          twrPeriod = ((totalValue / prevValue) - 1) * 100;
        }
        // Clamp
        twrPeriod = Math.max(-9999.99, Math.min(9999.99, twrPeriod));

        // Cumulative TWR
        const prevFactor = 1 + prevTwrCumulative / 100;
        const periodFactor = 1 + twrPeriod / 100;
        let twrCumulative = (prevFactor * periodFactor - 1) * 100;
        twrCumulative = Math.max(-9999.99, Math.min(9999.99, twrCumulative));

        // Calculate composition
        const equityValue = dailyHoldings
          .filter((h) => h.assetClass === "equity")
          .reduce((s, h) => s + h.marketValue, 0);
        const fiValue = dailyHoldings
          .filter((h) => h.assetClass === "fixedIncome")
          .reduce((s, h) => s + h.marketValue, 0);
        const altValue = dailyHoldings
          .filter((h) => h.assetClass === "alternatives")
          .reduce((s, h) => s + h.marketValue, 0);
        const cashValue = dailyHoldings
          .filter((h) => h.assetClass === "cash")
          .reduce((s, h) => s + h.marketValue, 0);
        // Balanced splits 50/50 between equity and fixed income
        const balancedValue = dailyHoldings
          .filter((h) => h.assetClass === "balanced")
          .reduce((s, h) => s + h.marketValue, 0);
        const totalEquity = equityValue + balancedValue * 0.5;
        const totalFI = fiValue + balancedValue * 0.5;

        // Upsert snapshot
        const { error: upsertError } = await supabase
          .from("portfolio_snapshots")
          .upsert(
            {
              client_id: clientId,
              snapshot_date: date,
              total_value: Math.round(totalValue * 100) / 100,
              equity_value: Math.round(totalEquity * 100) / 100,
              fixed_income_value: Math.round(totalFI * 100) / 100,
              alternatives_value: Math.round(altValue * 100) / 100,
              cash_value: Math.round(cashValue * 100) / 100,
              equity_percent:
                totalValue > 0
                  ? Math.round((totalEquity / totalValue) * 10000) / 100
                  : 0,
              fixed_income_percent:
                totalValue > 0
                  ? Math.round((totalFI / totalValue) * 10000) / 100
                  : 0,
              alternatives_percent:
                totalValue > 0
                  ? Math.round((altValue / totalValue) * 10000) / 100
                  : 0,
              cash_percent:
                totalValue > 0
                  ? Math.round((cashValue / totalValue) * 10000) / 100
                  : 0,
              daily_return: twrPeriod,
              twr_period: twrPeriod,
              twr_cumulative: twrCumulative,
              deposits: 0,
              withdrawals: 0,
              net_cash_flow: 0,
              total_cuotas: totalCuotas,
              cuotas_change: 0, // No cuota changes between cartolas (same quantities)
              holdings: dailyHoldings,
              source: "api-prices",
            },
            { onConflict: "client_id,snapshot_date" }
          );

        if (upsertError) {
          result.errors.push(`Error on ${date}: ${upsertError.message}`);
        } else {
          result.filled++;
          prevValue = totalValue;
          prevCuotas = totalCuotas;
          prevTwrCumulative = twrCumulative;
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: `${result.filled} snapshots intermedios creados`,
      result,
    });
  } catch (error) {
    console.error("Error in fill-prices:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Error llenando precios",
      },
      { status: 500 }
    );
  }
}
