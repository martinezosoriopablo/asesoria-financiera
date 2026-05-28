// app/api/portfolio/prices-at-date/route.ts
// Given holdings + two dates, returns per-holding prices at each date
// Uses fondos_rentabilidades_diarias (Chilean funds) and international_prices

import { NextRequest, NextResponse } from "next/server";
import { requireAdvisor, createAdminClient } from "@/lib/auth/api-auth";
import { applyRateLimit } from "@/lib/rate-limit";
import { resolveSource, fetchPriceRange, storeInternationalPrices } from "@/lib/prices/price-service";
import { detectSerieCode } from "@/lib/fund-utils";
import { stripAccents } from "@/lib/text";

interface HoldingInput {
  fundName: string;
  securityId?: string | null;
  serie?: string | null;
  quantity?: number;
  assetClass?: string;
}

interface PriceAtDateResult {
  fundName: string;
  assetClass?: string;
  startPrice: number | null;
  startDate: string | null;
  endPrice: number | null;
  endDate: string | null;
  returnPct: number | null;
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
    .eq("symbol", symbol)
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
): Promise<{ price: number; date: string } | null> {
  const secId = (h.securityId || "").trim();

  // 1. Chilean fund by RUN
  if (/^\d{3,6}$/.test(secId)) {
    const run = parseInt(secId, 10);
    const result = await getChileanFundPrice(run, h.serie || null, targetDate, supabase);
    if (result) return result;
  }

  // 2. International instrument (has non-numeric securityId)
  if (secId && !/^\d+$/.test(secId)) {
    const resolution = resolveSource({
      securityId: secId,
      fundName: h.fundName,
      marketValue: 0,
    });
    if (resolution.source !== "cmf") {
      // Try DB first
      const result = await getInternationalPrice(resolution.symbol, targetDate, supabase);
      if (result) return result;

      // Fallback: fetch on-demand from Yahoo/AlphaVantage
      if (resolution.source === "yahoo" || resolution.source === "alphavantage") {
        const minDate = new Date(targetDate);
        minDate.setDate(minDate.getDate() - 7);
        const minDateStr = minDate.toISOString().split("T")[0];
        try {
          const prices = await fetchPriceRange(resolution, minDateStr, targetDate);
          if (prices.length > 0) {
            // Store fetched prices for future lookups
            storeInternationalPrices(resolution.symbol, prices, resolution.currency, resolution.source)
              .catch(() => {}); // fire-and-forget
            // Find closest price on or before targetDate
            const sorted = prices.sort((a, b) => b.date.localeCompare(a.date));
            const match = sorted.find(p => p.date <= targetDate);
            if (match) return { price: match.price, date: match.date };
          }
        } catch {
          // Non-fatal — continue to name matching
        }
      }
    }
  }

  // 3. Fallback: Chilean fund by name matching
  const byName = await getChileanFundPriceByName(h.fundName, targetDate, supabase);
  if (byName) return byName;

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

          return {
            fundName: h.fundName,
            assetClass: h.assetClass,
            startPrice: startP?.price ?? null,
            startDate: startP?.date ?? null,
            endPrice: endP?.price ?? null,
            endDate: endP?.date ?? null,
            returnPct,
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
