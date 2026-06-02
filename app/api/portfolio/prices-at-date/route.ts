// app/api/portfolio/prices-at-date/route.ts
// Given holdings + two dates, returns per-holding prices at each date
// Uses fondos_rentabilidades_diarias (Chilean funds) and international_prices

import { NextRequest, NextResponse } from "next/server";
import { requireAdvisor, createAdminClient } from "@/lib/auth/api-auth";
import { applyRateLimit } from "@/lib/rate-limit";
import { resolveSource, fetchPriceRange, storeInternationalPrices } from "@/lib/prices/price-service";
import { getHistoricalPrices as getBolsaHistorical } from "@/lib/bolsa-santiago/client";
import { detectSerieCode } from "@/lib/fund-utils";
import { stripAccents } from "@/lib/text";

interface HoldingInput {
  fundName: string;
  securityId?: string | null;
  serie?: string | null;
  quantity?: number;
  assetClass?: string;
  currency?: string;
  market?: string;
}

interface PriceAtDateResult {
  fundName: string;
  assetClass?: string;
  startPrice: number | null;
  startDate: string | null;
  endPrice: number | null;
  endDate: string | null;
  returnPct: number | null;
  currency: string;
}

// Lookup price for a Chilean fund (by RUN + serie) at a specific date
// Returns the closest price on or before the target date (within 7 days)
async function getChileanFundPrice(
  run: number,
  serie: string | null,
  targetDate: string,
  supabase: ReturnType<typeof createAdminClient>
): Promise<{ price: number; date: string } | null> {
  // Find fondo_id
  let query = supabase
    .from("fondos_mutuos")
    .select("id, fm_serie")
    .eq("fo_run", run);

  if (serie) {
    query = query.eq("fm_serie", serie);
  }

  const { data: fondos } = await query.limit(5);
  if (!fondos || fondos.length === 0) return null;

  const fondo = fondos[0];

  // Get price at or before targetDate (within 7-day window)
  const minDate = new Date(targetDate);
  minDate.setDate(minDate.getDate() - 7);
  const minDateStr = minDate.toISOString().split("T")[0];

  const { data: priceRow } = await supabase
    .from("fondos_rentabilidades_diarias")
    .select("valor_cuota, fecha")
    .eq("fondo_id", fondo.id)
    .gte("fecha", minDateStr)
    .lte("fecha", targetDate)
    .order("fecha", { ascending: false })
    .limit(1)
    .single();

  if (priceRow && priceRow.valor_cuota > 0) {
    return { price: priceRow.valor_cuota, date: priceRow.fecha };
  }

  return null;
}

// Lookup price for a Chilean fund by name matching (fallback when no RUN)
async function getChileanFundPriceByName(
  fundName: string,
  targetDate: string,
  supabase: ReturnType<typeof createAdminClient>
): Promise<{ price: number; date: string } | null> {
  const targetSerie = detectSerieCode(fundName);

  // Strip the serie suffix from the fund name before tokenizing
  // e.g. "FM BCI AMERICA LATINA SERIE ALTO PATRIMONIO" → "FM BCI AMERICA LATINA"
  let cleanName = fundName;
  if (targetSerie) {
    const serieIdx = cleanName.search(/\bSERIE?\b/i);
    if (serieIdx > 0) cleanName = cleanName.slice(0, serieIdx).trim();
  }

  const nameNorm = stripAccents(cleanName.toLowerCase());
  const words = nameNorm.split(/\s+/).filter(
    (w) => w.length > 2 && !/^(fondo|mutuo|de|del|la|los|las|el|en|con|por|serie?|tipo|inv)$/i.test(w)
  );
  if (words.length < 2) return null;

  // Sort words by length descending (longer words are more distinctive)
  const sortedWords = [...words].sort((a, b) => b.length - a.length);

  // Try progressively fewer search terms (3→2→1) to handle abbreviated DB names
  // Use most distinctive (longest) words for each attempt
  let fondos: Array<{ id: string; fo_run: number; fm_serie: string; nombre_fondo: string }> | null = null;
  for (let termCount = Math.min(sortedWords.length, 3); termCount >= 1; termCount--) {
    let q = supabase
      .from("fondos_mutuos")
      .select("id, fo_run, fm_serie, nombre_fondo");
    for (const term of sortedWords.slice(0, termCount)) {
      q = q.ilike("nombre_fondo", `%${term}%`);
    }
    const { data } = await q.limit(30);
    if (data && data.length > 0) {
      fondos = data;
      break;
    }
  }

  if (!fondos || fondos.length === 0) return null;

  // Serie alias mapping (BCI convention: BANCA PRIVADA→BPRIV, ALTO PATRIMONIO→ALPAT, etc.)
  const SERIE_ALIASES: Record<string, string[]> = {
    BANCA: ["BPRIV", "BP"],
    ALTO: ["ALPAT", "ALTOP", "AP"],
    CLASICA: ["CLASI"],
    FAMILIAR: ["FAMIL"],
    INSTITUCIONAL: ["INSTI"],
    COLABORADOR: ["COLAB"],
  };

  // Score and pick best match
  let bestFondo = fondos[0];
  let bestScore = 0;
  for (const f of fondos) {
    const fNorm = stripAccents(f.nombre_fondo.toLowerCase());
    let score = 0;
    for (const w of words) {
      if (fNorm.includes(w)) score++;
    }
    if (targetSerie && f.fm_serie) {
      const dbSerie = f.fm_serie.toUpperCase();
      if (dbSerie === targetSerie) {
        score += 5;
      } else if (SERIE_ALIASES[targetSerie]?.includes(dbSerie)) {
        score += 5;
      } else {
        score -= 1;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestFondo = f;
    }
  }

  if (bestScore < 2) return null;

  const minDate = new Date(targetDate);
  minDate.setDate(minDate.getDate() - 7);
  const minDateStr = minDate.toISOString().split("T")[0];

  const { data: priceRow } = await supabase
    .from("fondos_rentabilidades_diarias")
    .select("valor_cuota, fecha")
    .eq("fondo_id", bestFondo.id)
    .gte("fecha", minDateStr)
    .lte("fecha", targetDate)
    .order("fecha", { ascending: false })
    .limit(1)
    .single();

  if (priceRow && priceRow.valor_cuota > 0) {
    return { price: priceRow.valor_cuota, date: priceRow.fecha };
  }
  return null;
}

// Lookup price for a Fondo de Inversión (CFI*) by fund name + serie
// Searches fondos_inversion by name tokens, then gets valor_libro from fondos_inversion_precios
async function getFondoInversionPrice(
  fundName: string,
  nemo: string,
  serie: string | null,
  targetDate: string,
  supabase: ReturnType<typeof createAdminClient>
): Promise<{ price: number; date: string } | null> {
  // Extract serie from nemo suffix if not provided: CFIBAIN11A → "A"
  const nemoUpper = nemo.toUpperCase().replace(/^CFI/, "");
  const serieFromNemo = serie || nemoUpper.match(/([A-Z]{1,2})$/)?.[1] || null;

  // Tokenize fund name for search (same approach as getChileanFundPriceByName)
  const nameNorm = stripAccents(fundName.toLowerCase());
  const words = nameNorm.split(/\s+/).filter(
    (w) => w.length > 2 && !/^(fondo|inversion|de|del|la|los|las|el|en|con|por|serie?|tipo|inv|fi)$/i.test(w)
  );

  if (words.length === 0) return null;

  // Sort by length descending (most distinctive first)
  const sortedWords = [...words].sort((a, b) => b.length - a.length);

  // Progressive search: try 3→2→1 terms
  let fondos: Array<{ id: string; rut: string; nombre: string }> | null = null;
  for (let termCount = Math.min(sortedWords.length, 3); termCount >= 1; termCount--) {
    let q = supabase
      .from("fondos_inversion")
      .select("id, rut, nombre")
      .eq("activo", true);
    for (const term of sortedWords.slice(0, termCount)) {
      q = q.ilike("nombre", `%${term}%`);
    }
    const { data } = await q.limit(10);
    if (data && data.length > 0) {
      fondos = data;
      break;
    }
  }

  if (!fondos || fondos.length === 0) return null;

  // Score matches
  let bestFondo = fondos[0];
  let bestScore = 0;
  for (const f of fondos) {
    const fNorm = stripAccents(f.nombre.toLowerCase());
    let score = 0;
    for (const w of words) {
      if (fNorm.includes(w)) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      bestFondo = f;
    }
  }

  const minDate = new Date(targetDate);
  minDate.setDate(minDate.getDate() - 7);
  const minDateStr = minDate.toISOString().split("T")[0];

  // Build price query
  let priceQuery = supabase
    .from("fondos_inversion_precios")
    .select("valor_libro, fecha, serie")
    .eq("fondo_id", bestFondo.id)
    .gte("fecha", minDateStr)
    .lte("fecha", targetDate)
    .order("fecha", { ascending: false });

  if (serieFromNemo) {
    priceQuery = priceQuery.eq("serie", serieFromNemo);
  }

  const { data: priceRows } = await priceQuery.limit(1);
  const row = priceRows?.[0] as { valor_libro: number; fecha: string; serie: string } | undefined;

  if (row && Number(row.valor_libro) > 0) {
    return { price: Number(row.valor_libro), date: row.fecha };
  }

  return null;
}

// Lookup price for an international instrument from international_prices table
async function getInternationalPrice(
  symbol: string,
  targetDate: string,
  supabase: ReturnType<typeof createAdminClient>
): Promise<{ price: number; date: string } | null> {
  const minDate = new Date(targetDate);
  minDate.setDate(minDate.getDate() - 7);
  const minDateStr = minDate.toISOString().split("T")[0];

  const { data } = await supabase
    .from("international_prices")
    .select("close_price, price_date")
    .eq("ticker", symbol)
    .gte("price_date", minDateStr)
    .lte("price_date", targetDate)
    .order("price_date", { ascending: false })
    .limit(1);

  const row = (data as Array<{ close_price: number; price_date: string }> | null)?.[0];
  if (row && row.close_price > 0) {
    return { price: row.close_price, date: row.price_date };
  }
  return null;
}

// Get price for a single holding at a target date
async function getPriceForHolding(
  h: HoldingInput,
  targetDate: string,
  supabase: ReturnType<typeof createAdminClient>
): Promise<{ price: number; date: string; currency: string } | null> {
  const secId = (h.securityId || "").trim();

  // 1. Chilean fund by RUN
  if (/^\d{3,6}$/.test(secId)) {
    const run = parseInt(secId, 10);
    const result = await getChileanFundPrice(run, h.serie || null, targetDate, supabase);
    // Some Chilean funds have USD-denominated quota values (e.g. INDEX FUND US)
    // Respect the currency from the cartola when available
    if (result) return { ...result, currency: h.currency || "CLP" };
  }

  // 2. CFI* Fondo de Inversión → CMF (fondos_inversion_precios), fallback Yahoo .SN
  if (/^CFI/i.test(secId) && !/^CFIETF/i.test(secId)) {
    const fiPrice = await getFondoInversionPrice(h.fundName, secId, h.serie || null, targetDate, supabase);
    if (fiPrice) return { ...fiPrice, currency: "CLP" };

    // Fallback: try Yahoo .SN
    const yahooSymbol = secId.toUpperCase().endsWith(".SN")
      ? secId.toUpperCase()
      : `${secId.toUpperCase()}.SN`;
    try {
      const { fetchYahooHistorical } = await import("@/lib/prices/yahoo");
      const minDate = new Date(targetDate);
      minDate.setDate(minDate.getDate() - 7);
      const prices = await fetchYahooHistorical(yahooSymbol, minDate.toISOString().split("T")[0], targetDate);
      if (prices.length > 0) {
        storeInternationalPrices(secId.toUpperCase(), prices, "CLP", "yahoo")
          .catch(() => {});
        const sorted = prices.sort((a, b) => b.date.localeCompare(a.date));
        const match = sorted.find(p => p.date <= targetDate);
        if (match) return { price: match.price, date: match.date, currency: "CLP" };
      }
    } catch {
      // Non-fatal
    }
  }

  // 3. International instrument (has non-numeric securityId)
  if (secId && !/^\d+$/.test(secId)) {
    const resolution = resolveSource({
      securityId: secId,
      fundName: h.fundName,
      marketValue: 0,
      market: h.market as 'CL' | 'INT' | 'US' | null | undefined,
      currency: h.currency,
    });
    if (resolution.source !== "cmf") {
      // Try DB first
      const result = await getInternationalPrice(resolution.symbol, targetDate, supabase);
      if (result) return { ...result, currency: resolution.currency };

      // Fallback: fetch on-demand from Yahoo/AlphaVantage/Bolsa de Santiago
      if (resolution.source === "yahoo" || resolution.source === "alphavantage" || resolution.source === "bolsa-santiago") {
        const minDate = new Date(targetDate);
        minDate.setDate(minDate.getDate() - 7);
        const minDateStr = minDate.toISOString().split("T")[0];
        try {
          // bolsa-santiago: try Bolsa API first, then Yahoo .SN fallback
          let prices = await fetchPriceRange(resolution, minDateStr, targetDate);

          if (prices.length > 0) {
            // Store fetched prices for future lookups
            storeInternationalPrices(resolution.symbol, prices, resolution.currency, resolution.source)
              .catch(() => {}); // fire-and-forget
            // Find closest price on or before targetDate
            const sorted = prices.sort((a, b) => b.date.localeCompare(a.date));
            const match = sorted.find(p => p.date <= targetDate);
            if (match) return { price: match.price, date: match.date, currency: resolution.currency };
          }
        } catch {
          // Non-fatal — continue to name matching
        }
      }
    }
  }

  // 4. Fallback: Chilean fund by name matching
  const byName = await getChileanFundPriceByName(h.fundName, targetDate, supabase);
  if (byName) return { ...byName, currency: h.currency || "CLP" };

  return null;
}

export async function POST(request: NextRequest) {
  const blocked = await applyRateLimit(request, "prices-at-date", { limit: 20, windowSeconds: 60 });
  if (blocked) return blocked;

  const { error: authError } = await requireAdvisor();
  if (authError) return authError;

  const supabase = createAdminClient();

  try {
    const { holdings, startDate, endDate } = await request.json() as {
      holdings: HoldingInput[];
      startDate: string;
      endDate: string;
    };

    if (!holdings || !Array.isArray(holdings) || !startDate || !endDate) {
      return NextResponse.json(
        { success: false, error: "holdings, startDate y endDate son requeridos" },
        { status: 400 }
      );
    }

    const results: PriceAtDateResult[] = [];

    // Process holdings concurrently (batch of 10)
    const BATCH = 10;
    for (let i = 0; i < holdings.length; i += BATCH) {
      const batch = holdings.slice(i, i + BATCH);
      const batchResults = await Promise.all(
        batch.map(async (h) => {
          const [startP, endP] = await Promise.all([
            getPriceForHolding(h, startDate, supabase),
            getPriceForHolding(h, endDate, supabase),
          ]);

          let returnPct: number | null = null;
          if (startP && endP && startP.price > 0) {
            returnPct = ((endP.price / startP.price) - 1) * 100;
          }

          // Currency from price lookup (both dates should agree); fallback to CLP
          const currency = endP?.currency || startP?.currency || "CLP";

          return {
            fundName: h.fundName,
            assetClass: h.assetClass,
            startPrice: startP?.price ?? null,
            startDate: startP?.date ?? null,
            endPrice: endP?.price ?? null,
            endDate: endP?.date ?? null,
            returnPct,
            currency,
          };
        })
      );
      results.push(...batchResults);
    }

    return NextResponse.json({ success: true, results });
  } catch (error) {
    console.error("Error in prices-at-date:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Error obteniendo precios" },
      { status: 500 }
    );
  }
}
