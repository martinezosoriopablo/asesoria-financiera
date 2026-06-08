import { NextRequest, NextResponse } from "next/server";
import { requireAuth, createAdminClient } from "@/lib/auth/api-auth";
import { applyRateLimit } from "@/lib/rate-limit";
import { preloadYear, getDolarObservado } from "@/lib/bcch";
import { resolveSource, fetchPriceRange, storeInternationalPrices } from "@/lib/prices/price-service";
import { detectSerieCode } from "@/lib/fund-utils";
import { stripAccents } from "@/lib/text";
import { handleApiError } from "@/lib/api-response";
import { projectBondPrices } from "@/lib/bonds/price-projection";

// POST /api/portfolio/historical-prices
// Producto punto: vector de cuotas × vector de precios por fecha
// Para cada fecha t: valor_portafolio(t) = sum(cuotas_i × precio_i(t))

interface HoldingInput {
  fundName: string;
  run: number;
  serie: string;
  quantity: number;
  currency?: string;
  cartolaPrice?: number; // precio de la cartola (puede ser CLP o USD)
}

interface HoldingByNameInput {
  fundName: string;
  serie?: string;
  quantity: number;
  currency?: string;
  cartolaPrice?: number;
}

interface InternationalHoldingInput {
  fundName: string;
  securityId: string;
  quantity: number;
  marketValue?: number;
  currency?: string;
}

interface BondHoldingInput {
  fundName: string;
  securityId?: string;
  quantity: number;        // face value
  marketValue: number;     // market value at reference date
  couponRate: number;      // annual %, e.g. 5.4
  maturityDate: string;    // ISO date
  referenceDate: string;   // cartola date
  currency?: string;       // usually USD
}

interface FlatHoldingInput {
  fundName: string;
  marketValue: number;     // constant value (no price projection)
  currency?: string;
}

export async function POST(req: NextRequest) {
  const blocked = await applyRateLimit(req, "historical-prices", { limit: 10, windowSeconds: 60 });
  if (blocked) return blocked;

  const { error: authError } = await requireAuth();
  if (authError) return authError;

  return handleApiError("historical-prices-post", async () => {
  const { holdings, holdingsByName, internationalHoldings, bondHoldings, flatHoldings, fromDate } = await req.json() as {
    holdings: HoldingInput[];
    holdingsByName?: HoldingByNameInput[];
    internationalHoldings?: InternationalHoldingInput[];
    bondHoldings?: BondHoldingInput[];
    flatHoldings?: FlatHoldingInput[];
    fromDate?: string;
  };

  const hasHoldings = (holdings && holdings.length > 0) ||
    (holdingsByName && holdingsByName.length > 0) ||
    (internationalHoldings && internationalHoldings.length > 0) ||
    (bondHoldings && bondHoldings.length > 0) ||
    (flatHoldings && flatHoldings.length > 0);
  if (!hasHoldings) {
    return NextResponse.json({ error: "holdings required" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // 1. Resolver fondo_id desde fondos_mutuos + TAC desde vw_fondos_completo
  const fundInfo = new Map<string, {
    id: string;
    fundName: string;
    quantity: number;
    tac: number | null;
    cartolaPrice: number;
    moneda: string; // CLP, USD, etc. from fondos_mutuos.moneda_funcional
  }>();

  // Pre-fetch all fondos_mutuos for all RUNs in one query (batch N+1 fix)
  const allRuns = [...new Set(holdings.filter(h => h.run).map(h => h.run!))];
  const { data: allFondos } = allRuns.length > 0
    ? await supabase
        .from("fondos_mutuos")
        .select("id, fo_run, fm_serie, moneda_funcional")
        .in("fo_run", allRuns)
    : { data: [] as { id: string; fo_run: number; fm_serie: string; moneda_funcional: string | null }[] };

  // Group by RUN for fast lookup
  const fondosByRun = new Map<number, typeof allFondos>();
  for (const f of (allFondos || [])) {
    const list = fondosByRun.get(f.fo_run) || [];
    list.push(f);
    fondosByRun.set(f.fo_run, list);
  }

  for (const h of holdings) {
    if (!h.run) continue;
    // Try to resolve serie: explicit > detectSerieCode > best-match by price
    const resolvedSerie = h.serie || detectSerieCode(h.fundName || "") || "";
    const key = `${h.run}-${resolvedSerie}`;

    // fondo_id + moneda from pre-fetched fondos_mutuos
    const runFondos = fondosByRun.get(h.run) || [];
    let fondo: { id: string; moneda_funcional: string | null } | null = null;

    if (resolvedSerie) {
      const match = runFondos.find(f => f.fm_serie === resolvedSerie);
      fondo = match || null;
    }
    if (!fondo) {
      // No serie or serie didn't match — use all series from pre-fetched data
      if (runFondos.length === 0) continue;
      if (runFondos.length === 1) {
        fondo = runFondos[0];
      } else if (h.cartolaPrice && h.cartolaPrice > 0) {
        // Pick serie whose latest price is closest to cartolaPrice (most reliable)
        // This still needs individual queries for latest valor_cuota per serie
        let best = runFondos[0];
        let bestDiff = Infinity;
        for (const s of runFondos) {
          const { data: latest } = await supabase
            .from("fondos_rentabilidades_diarias")
            .select("valor_cuota")
            .eq("fondo_id", s.id)
            .order("fecha", { ascending: false })
            .limit(1)
            .single();
          if (latest) {
            const diff = Math.abs(latest.valor_cuota - h.cartolaPrice);
            if (diff < bestDiff) { bestDiff = diff; best = s; }
          }
        }
        fondo = best;
      } else {
        // No price available — fall back to name detection
        const nameDetected = detectSerieCode(h.fundName || "");
        const nameMatch = nameDetected
          ? runFondos.find((s) => s.fm_serie === nameDetected)
          : null;
        fondo = nameMatch || runFondos[0];
      }
    }

    if (!fondo) continue;

    // TAC from vw_fondos_completo
    let tacQuery = supabase
      .from("vw_fondos_completo")
      .select("tac_sintetica")
      .eq("fo_run", h.run);
    if (resolvedSerie) tacQuery = tacQuery.eq("fm_serie", resolvedSerie);
    const { data: vw } = await tacQuery.limit(1).single();

    fundInfo.set(key, {
      id: fondo.id,
      fundName: h.fundName,
      quantity: h.quantity,
      tac: vw?.tac_sintetica ?? null,
      cartolaPrice: h.cartolaPrice || 0,
      moneda: fondo.moneda_funcional || "CLP",
    });
  }

  // 1b. Resolve holdings by name matching (no RUN available)
  if (holdingsByName && holdingsByName.length > 0) {
    for (const h of holdingsByName) {
      if (!h.fundName || h.quantity <= 0) continue;

      const targetSerie = h.serie || detectSerieCode(h.fundName) || null;

      // Strip serie suffix from fund name before tokenizing
      let cleanName = h.fundName;
      if (targetSerie) {
        const serieIdx = cleanName.search(/\bSERIE?\b/i);
        if (serieIdx > 0) cleanName = cleanName.slice(0, serieIdx).trim();
      }

      const nameNorm = stripAccents(cleanName.toLowerCase());
      const words = nameNorm.split(/\s+/).filter(
        (w) => w.length > 2 && !/^(fondo|mutuo|de|del|la|los|las|el|en|con|por|serie?|tipo|inv)$/i.test(w)
      );
      if (words.length < 2) continue;

      // Sort by length descending (most distinctive first)
      const sortedWords = [...words].sort((a, b) => b.length - a.length);

      // Serie alias mapping (BCI convention)
      const SERIE_ALIASES: Record<string, string[]> = {
        BANCA: ["BPRIV", "BP"], ALTO: ["ALPAT", "ALTOP", "AP"],
        CLASICA: ["CLASI"], FAMILIAR: ["FAMIL"],
      };

      // Progressive search: 3→2→1 terms
      let fondos: Array<{ id: string; fo_run: number; fm_serie: string; nombre_fondo: string; moneda_funcional: string }> | null = null;
      for (let termCount = Math.min(sortedWords.length, 3); termCount >= 1; termCount--) {
        let q = supabase.from("fondos_mutuos").select("id, fo_run, fm_serie, nombre_fondo, moneda_funcional");
        for (const term of sortedWords.slice(0, termCount)) {
          q = q.ilike("nombre_fondo", `%${term}%`);
        }
        const { data } = await q.limit(30);
        if (data && data.length > 0) {
          fondos = data;
          break;
        }
      }

      if (!fondos || fondos.length === 0) continue;

      // Score and pick best match
      let bestFondo = fondos[0];
      let bestScore = 0;
      for (const f of fondos) {
        const fNorm = stripAccents(f.nombre_fondo.toLowerCase());
        let score = 0;
        for (const w of words) { if (fNorm.includes(w)) score++; }
        if (targetSerie && f.fm_serie) {
          const dbSerie = f.fm_serie.toUpperCase();
          if (dbSerie === targetSerie) score += 5;
          else if (SERIE_ALIASES[targetSerie]?.includes(dbSerie)) score += 5;
          else score -= 1;
        }
        if (score > bestScore) { bestScore = score; bestFondo = f; }
      }

      if (bestScore < 2) continue;

      const key = `${bestFondo.fo_run}-${bestFondo.fm_serie}`;
      if (fundInfo.has(key)) continue; // Already resolved by RUN

      fundInfo.set(key, {
        id: bestFondo.id,
        fundName: h.fundName,
        quantity: h.quantity,
        tac: null,
        cartolaPrice: h.cartolaPrice || 0,
        moneda: bestFondo.moneda_funcional || "CLP",
      });
    }
  }

  // 2. Traer precios históricos de AMBAS fuentes:
  //    - fondos_rentabilidades_diarias (CMF + AAFM daily)
  //    - fund_cuota_history (AAFM direct — llena gaps históricos)
  //    Prioridad: si ambas tienen la misma fecha, usar fondos_rentabilidades_diarias
  const allFondoIds = [...fundInfo.values()].map((f) => f.id);
  const priceMap = new Map<string, number>(); // key: "fondoId|fecha" → valor_cuota
  const PAGE_SIZE = 1000; // Supabase default max rows per query

  // Only query Chilean fund prices if we have Chilean funds
  if (allFondoIds.length > 0) {
    // 2a. fondos_rentabilidades_diarias (fuente primaria)
    let offset = 0;
    while (true) {
      let query = supabase
        .from("fondos_rentabilidades_diarias")
        .select("fondo_id, fecha, valor_cuota")
        .in("fondo_id", allFondoIds)
        .order("fecha", { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1);

      if (fromDate) query = query.gte("fecha", fromDate);

      const { data: prices, error } = await query;
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      if (!prices || prices.length === 0) break;
      for (const p of prices) {
        priceMap.set(`${p.fondo_id}|${p.fecha}`, p.valor_cuota);
      }
      if (prices.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }

    // 2b. fund_cuota_history (fuente complementaria — solo aafm_direct)
    //     Solo agrega fechas que NO existen en la fuente primaria
    offset = 0;
    while (true) {
      let query = supabase
        .from("fund_cuota_history")
        .select("fondo_id, fecha, valor_cuota")
        .in("fondo_id", allFondoIds)
        .eq("source", "aafm_direct")
        .order("fecha", { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1);

      if (fromDate) query = query.gte("fecha", fromDate);

      const { data: prices, error } = await query;
      if (error) {
        console.warn("fund_cuota_history query error:", error.message);
        break; // Non-fatal — primary source already loaded
      }
      if (!prices || prices.length === 0) break;
      for (const p of prices) {
        const key = `${p.fondo_id}|${p.fecha}`;
        if (!priceMap.has(key)) {
          priceMap.set(key, p.valor_cuota);
        }
      }
      if (prices.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }
  }

  // Convertir mapa a array para procesamiento posterior
  const allPrices: Array<{ fondo_id: string; fecha: string; valor_cuota: number }> = [];
  Array.from(priceMap.entries()).forEach(([key, valor_cuota]) => {
    const [fondo_id, fecha] = key.split("|");
    allPrices.push({ fondo_id, fecha, valor_cuota });
  });
  allPrices.sort((a, b) => a.fecha.localeCompare(b.fecha));

  // 3. Agrupar precios por fondo
  const idToKey = new Map<string, string>();
  for (const [key, info] of fundInfo) {
    idToKey.set(info.id, key);
  }

  const pricesByFund = new Map<string, Array<{ fecha: string; valor_cuota: number }>>();
  for (const p of allPrices) {
    const key = idToKey.get(p.fondo_id);
    if (!key) continue;
    if (!pricesByFund.has(key)) pricesByFund.set(key, []);
    pricesByFund.get(key)!.push(p);
  }

  // 4. Normalizar moneda: SIEMPRE llevar a CLP
  //    La CMF publica CLP y USD mezclados en la misma serie.
  //    Para cada precio, comparar con cartolaPrice (que viene en CLP de la cartola):
  //    - Si cartolaPrice / dbPrice ≈ 500-1500x → dbPrice está en USD → multiplicar por dólar
  //    - Si están en rango similar → ambos en CLP → usar directo
  //
  //    Pre-fetch dólar observado en batch para no hacer 372 requests individuales.
  const normalizedPrices = new Map<string, Map<string, number>>();

  // Pre-load dólar observado from Banco Central for all years in the date range
  // Determine which funds need USD conversion using moneda_funcional (DB field)
  const needsUsdConversion = new Set<string>();
  for (const [key, info] of fundInfo) {
    const m = info.moneda.toUpperCase();
    if (m === "USD" || m === "US$" || m === "DOLAR" || m === "DOL") {
      needsUsdConversion.add(key);
    }
  }

  if (needsUsdConversion.size > 0 && fromDate) {
    const startYear = parseInt(fromDate.split("-")[0], 10);
    const endYear = new Date().getFullYear();
    for (let y = startYear; y <= endYear; y++) {
      await preloadYear("dolar", y);
    }
  }

  for (const [key, prices] of pricesByFund) {
    const info = fundInfo.get(key);
    const cartolaPrice = info?.cartolaPrice || 0;
    const isUsdFund = needsUsdConversion.has(key);
    const fechaMap = new Map<string, number>();
    let usdCount = 0;

    for (const p of prices) {
      let precio = p.valor_cuota;

      // Currency detection: prefer moneda_funcional from DB, fall back to ratio heuristic
      const shouldConvert = isUsdFund || (
        !isUsdFund && cartolaPrice > 0 && (() => {
          const ratio = cartolaPrice / precio;
          return ratio >= 500 && ratio <= 1500;
        })()
      );

      if (shouldConvert) {
        try {
          const dolar = await getDolarObservado(p.fecha);
          precio = precio * dolar;
          usdCount++;
        } catch {
          // If BCCH fails, skip this price rather than use wrong currency
          continue;
        }
      }

      fechaMap.set(p.fecha, precio);
    }

    if (usdCount > 0) {
      console.log(`[historical-prices] ${info?.fundName}: ${usdCount}/${prices.length} prices converted USD→CLP (source: ${isUsdFund ? "moneda_funcional" : "ratio heuristic"})`);
    }

    normalizedPrices.set(key, fechaMap);
  }

  // 4b. International holdings: fetch from international_prices + Yahoo/AV fallback
  // Process in parallel to avoid Vercel timeout from sequential API calls
  if (internationalHoldings && internationalHoldings.length > 0) {
    // Pre-filter: resolve sources and skip non-tradeable (cmf, bcch, finra)
    const tradeableHoldings = internationalHoldings
      .filter((ih) => ih.securityId && ih.quantity > 0)
      .filter((ih) => {
        const res = resolveSource({
          securityId: ih.securityId,
          fundName: ih.fundName,
          marketValue: ih.marketValue || 0,
          currency: ih.currency,
        });
        return !["cmf", "bcch", "finra"].includes(res.source);
      });

    if (tradeableHoldings.length > 0) {
    const toDate = new Date().toISOString().split("T")[0];
    const intFromDate = fromDate || new Date(Date.now() - 365 * 86400000).toISOString().split("T")[0];

    // Pre-load dólar for USD→CLP conversion
    const startYear = parseInt(intFromDate.split("-")[0], 10);
    const endYear = new Date().getFullYear();
    for (let y = startYear; y <= endYear; y++) {
      await preloadYear("dolar", y);
    }

    // Process all international holdings in parallel
    const intResults = await Promise.allSettled(
      tradeableHoldings
        .map(async (ih) => {
          const resolution = resolveSource({
            securityId: ih.securityId,
            fundName: ih.fundName,
            marketValue: ih.marketValue || 0,
            currency: ih.currency,
          });

          if (resolution.source === "cmf" || resolution.source === "bcch" || resolution.source === "finra") return null;

          // For cl-adr, DB ticker is the original secId + .SN (e.g. GOOGLCL.SN)
          const dbTicker = resolution.source === "cl-adr"
            ? `${ih.securityId!.toUpperCase()}.SN`
            : resolution.symbol;

          // Check international_prices DB first
          let offset2 = 0;
          const intPriceMap = new Map<string, number>();
          while (true) {
            const { data: rows } = await supabase
              .from("international_prices")
              .select("price_date, close_price")
              .eq("ticker", dbTicker)
              .gte("price_date", intFromDate)
              .lte("price_date", toDate)
              .order("price_date", { ascending: true })
              .range(offset2, offset2 + 999);

            const typedRows = rows as Array<{ price_date: string; close_price: number }> | null;
            if (!typedRows || typedRows.length === 0) break;
            for (const r of typedRows) intPriceMap.set(r.price_date, r.close_price);
            if (typedRows.length < 1000) break;
            offset2 += 1000;
          }

          // If DB has < 30 days of data, backfill from source
          const backfillSources = ["yahoo", "alphavantage", "eodhd", "cl-adr"];
          if (intPriceMap.size < 30 && backfillSources.includes(resolution.source)) {
            try {
              const fetched = await fetchPriceRange(resolution, intFromDate, toDate);
              if (fetched.length > 0) {
                for (const p of fetched) intPriceMap.set(p.date, p.price);
                storeInternationalPrices(dbTicker, fetched, resolution.currency, resolution.source)
                  .catch(() => {});
              }
            } catch {
              // Non-fatal
            }
          }

          if (intPriceMap.size < 10) return null; // Skip instruments with too few prices

          return { ih, resolution, intPriceMap };
        })
    );

    for (const result of intResults) {
      if (result.status !== "fulfilled" || !result.value) continue;
      const { ih, resolution, intPriceMap } = result.value;

      const key = `int-${ih.securityId}`;
      const isCLP = resolution.currency === "CLP";

      fundInfo.set(key, {
        id: key,
        fundName: ih.fundName,
        quantity: ih.quantity,
        tac: null,
        cartolaPrice: 0,
        moneda: isCLP ? "CLP" : (ih.currency || "USD"),
      });

      const fechaMap = new Map<string, number>();
      if (!isCLP) {
        for (const [fecha, price] of intPriceMap) {
          try {
            const dolar = await getDolarObservado(fecha);
            fechaMap.set(fecha, price * dolar);
          } catch {
            // Skip dates without FX rate
          }
        }
      } else {
        for (const [fecha, price] of intPriceMap) {
          fechaMap.set(fecha, price);
        }
      }

      normalizedPrices.set(key, fechaMap);
    }
    } // end tradeableHoldings.length > 0
  }

  // 4c. Bond holdings: generate projected prices using bond math (constant-yield method)
  if (bondHoldings && bondHoldings.length > 0) {
    const toDate = new Date().toISOString().split("T")[0];
    const bondFromDate = fromDate || new Date(Date.now() - 365 * 86400000).toISOString().split("T")[0];

    // Pre-load dólar for USD→CLP conversion
    const startYear = parseInt(bondFromDate.split("-")[0], 10);
    const endYear = new Date().getFullYear();
    for (let y = startYear; y <= endYear; y++) {
      await preloadYear("dolar", y);
    }

    for (const bh of bondHoldings) {
      if (bh.quantity <= 0 || bh.marketValue <= 0) continue;

      // Reference price as % of par
      const refPrice = (bh.marketValue / bh.quantity) * 100;

      const projected = projectBondPrices({
        faceValue: bh.quantity,
        couponRate: bh.couponRate,
        maturityDate: bh.maturityDate,
        referencePrice: refPrice,
        referenceDate: bh.referenceDate,
        fromDate: bondFromDate,
        toDate,
      });

      if (projected.length === 0) continue;

      const key = `bond-${bh.securityId || bh.fundName}`;
      const isCLP = (bh.currency || "USD") === "CLP";

      fundInfo.set(key, {
        id: key,
        fundName: bh.fundName,
        quantity: bh.quantity,
        tac: null,
        cartolaPrice: 0,
        moneda: bh.currency || "USD",
      });

      const fechaMap = new Map<string, number>();
      for (const p of projected) {
        // p.price is fraction of par (e.g. 0.985 for 98.5%)
        const usdValue = bh.quantity * p.price;
        if (isCLP) {
          fechaMap.set(p.date, usdValue);
        } else {
          try {
            const dolar = await getDolarObservado(p.date);
            fechaMap.set(p.date, usdValue * dolar);
          } catch {
            // Skip dates without FX rate
          }
        }
      }

      normalizedPrices.set(key, fechaMap);
    }
  }

  // 4d. Flat holdings: constant value (bonds without coupon/maturity, cash, money market)
  // These contribute a flat daily amount to the portfolio total.
  if (flatHoldings && flatHoldings.length > 0) {
    const toDate = new Date().toISOString().split("T")[0];
    const flatFromDate = fromDate || new Date(Date.now() - 365 * 86400000).toISOString().split("T")[0];

    // Pre-load dólar if needed
    const needsFX = flatHoldings.some(fh => (fh.currency || "USD") !== "CLP");
    if (needsFX) {
      const startYear = parseInt(flatFromDate.split("-")[0], 10);
      const endYear = new Date().getFullYear();
      for (let y = startYear; y <= endYear; y++) {
        await preloadYear("dolar", y);
      }
    }

    for (const fh of flatHoldings) {
      if (fh.marketValue <= 0) continue;

      const key = `flat-${fh.fundName}`;
      const isCLP = (fh.currency || "USD") === "CLP";

      fundInfo.set(key, {
        id: key,
        fundName: fh.fundName,
        quantity: 1,
        tac: null,
        cartolaPrice: 0,
        moneda: fh.currency || "USD",
      });

      // Generate daily entries with constant value
      const fechaMap = new Map<string, number>();
      const start = new Date(flatFromDate + "T00:00:00");
      const end = new Date(toDate + "T00:00:00");
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        if (isCLP) {
          fechaMap.set(dateStr, fh.marketValue);
        } else {
          try {
            const dolar = await getDolarObservado(dateStr);
            fechaMap.set(dateStr, fh.marketValue * dolar);
          } catch {
            // Skip dates without FX rate
          }
        }
      }

      normalizedPrices.set(key, fechaMap);
    }
  }

  // 5. Producto punto por fecha: sum(cuotas_i × precio_i(t))
  //    Forward-fill: si un fondo no tiene precio en una fecha, usar el último precio conocido.
  //    Esto evita que el total baje artificialmente cuando un fondo no reporta un día.
  const allDates = new Set<string>();
  for (const fechaMap of normalizedPrices.values()) {
    for (const fecha of fechaMap.keys()) allDates.add(fecha);
  }

  const sortedDates = [...allDates].sort();
  const fundKeys = [...fundInfo.keys()];

  // Back-fill: seed each fund with its earliest known price so that ALL funds
  // contribute from the very first date in the series. Without this, when a fund's
  // first price appears mid-series, the total jumps by the fund's full value,
  // creating artificial >100% returns in monthly calculations.
  const lastKnownPrice = new Map<string, number>();
  for (const key of fundKeys) {
    const fechaMap = normalizedPrices.get(key);
    if (!fechaMap || fechaMap.size === 0) continue;
    // Find the earliest date with a price for this fund
    let earliestPrice: number | undefined;
    for (const fecha of sortedDates) {
      const p = fechaMap.get(fecha);
      if (p !== undefined) { earliestPrice = p; break; }
    }
    if (earliestPrice !== undefined) {
      lastKnownPrice.set(key, earliestPrice);
    }
  }

  const series = sortedDates.map((fecha) => {
    let total = 0;
    let fundsWithPrice = 0;
    const fundValues: Record<string, number> = {};

    for (const key of fundKeys) {
      const info = fundInfo.get(key)!;
      const fechaMap = normalizedPrices.get(key);
      const precio = fechaMap?.get(fecha);

      let effectivePrice: number | undefined;
      if (precio !== undefined) {
        effectivePrice = precio;
        lastKnownPrice.set(key, precio);
      } else {
        const last = lastKnownPrice.get(key);
        if (last !== undefined) {
          effectivePrice = last;
        }
      }

      if (effectivePrice !== undefined) {
        const valor = info.quantity * effectivePrice;
        fundValues[info.fundName] = Math.round(valor);
        total += valor;
        fundsWithPrice++;
      }
    }

    return { fecha, total: Math.round(total), _fundsWithPrice: fundsWithPrice, ...fundValues };
  });

  // If no fund has any price data, return empty
  if (normalizedPrices.size === 0) {
    return NextResponse.json({ success: true, funds: [], series: [] });
  }

  // Start from the first date where enough funds have data.
  // Require at least 50% of instruments (rounded up) to avoid artificial jumps,
  // but be lenient for instruments with sparse data (some CFI have very few prices).
  const allFundsCount = fundKeys.length;
  const minFundsRequired = Math.max(1, Math.ceil(allFundsCount * 0.5));
  const startIdx = series.findIndex((p) => p._fundsWithPrice >= minFundsRequired);
  const filteredSeries = series
    .slice(startIdx >= 0 ? startIdx : 0)
    .filter((p) => p._fundsWithPrice >= minFundsRequired)
    .map(({ _fundsWithPrice, ...rest }) => rest);

  // 6. Info de fondos + detect stale prices
  const latestSeriesDate = sortedDates[sortedDates.length - 1];
  const funds = fundKeys.map((key) => {
    const info = fundInfo.get(key)!;
    const fechaMap = normalizedPrices.get(key);
    // Find the last date this fund has actual data
    let lastPriceDate: string | null = null;
    if (fechaMap) {
      for (let i = sortedDates.length - 1; i >= 0; i--) {
        if (fechaMap.has(sortedDates[i])) {
          lastPriceDate = sortedDates[i];
          break;
        }
      }
    }
    const daysSinceLastPrice = lastPriceDate
      ? Math.round((new Date(latestSeriesDate).getTime() - new Date(lastPriceDate).getTime()) / 86400000)
      : null;

    return {
      fundName: info.fundName,
      run: key.split("-")[0],
      serie: key.split("-").slice(1).join("-"),
      tac: info.tac,
      quantity: info.quantity,
      lastPriceDate,
      stale: daysSinceLastPrice !== null && daysSinceLastPrice > 7,
    };
  });

  return NextResponse.json({ success: true, funds, series: filteredSeries });
  });
}

// Dólar observado functions now centralized in lib/bcch.ts
// Uses Banco Central de Chile SI3 API (canonical source)
