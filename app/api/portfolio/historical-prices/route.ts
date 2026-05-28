import { NextRequest, NextResponse } from "next/server";
import { requireAdvisor, createAdminClient } from "@/lib/auth/api-auth";
import { applyRateLimit } from "@/lib/rate-limit";
import { preloadYear, getDolarObservado } from "@/lib/bcch";
import { resolveSource, fetchPriceRange, storeInternationalPrices } from "@/lib/prices/price-service";

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

interface InternationalHoldingInput {
  fundName: string;
  securityId: string;
  quantity: number;
  marketValue?: number;
  currency?: string;
}

export async function POST(req: NextRequest) {
  try {
  const blocked = await applyRateLimit(req, "historical-prices", { limit: 10, windowSeconds: 60 });
  if (blocked) return blocked;

  const { error: authError } = await requireAdvisor();
  if (authError) return authError;
  const { holdings, internationalHoldings, fromDate } = await req.json() as {
    holdings: HoldingInput[];
    internationalHoldings?: InternationalHoldingInput[];
    fromDate?: string;
  };

  if ((!holdings || holdings.length === 0) && (!internationalHoldings || internationalHoldings.length === 0)) {
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

  for (const h of holdings) {
    if (!h.run || !h.serie) continue;
    const key = `${h.run}-${h.serie}`;

    // fondo_id + moneda from fondos_mutuos
    const { data: fondo } = await supabase
      .from("fondos_mutuos")
      .select("id, moneda_funcional")
      .eq("fo_run", h.run)
      .eq("fm_serie", h.serie)
      .limit(1)
      .single();

    if (!fondo) continue;

    // TAC from vw_fondos_completo
    const { data: vw } = await supabase
      .from("vw_fondos_completo")
      .select("tac_sintetica")
      .eq("fo_run", h.run)
      .eq("fm_serie", h.serie)
      .limit(1)
      .single();

    fundInfo.set(key, {
      id: fondo.id,
      fundName: h.fundName,
      quantity: h.quantity,
      tac: vw?.tac_sintetica ?? null,
      cartolaPrice: h.cartolaPrice || 0,
      moneda: fondo.moneda_funcional || "CLP",
    });
  }

  if (fundInfo.size === 0) {
    return NextResponse.json({ success: true, funds: [], series: [] });
  }

  // 2. Traer precios históricos de AMBAS fuentes:
  //    - fondos_rentabilidades_diarias (CMF + AAFM daily)
  //    - fund_cuota_history (AAFM direct — llena gaps históricos)
  //    Prioridad: si ambas tienen la misma fecha, usar fondos_rentabilidades_diarias
  const allFondoIds = [...fundInfo.values()].map((f) => f.id);
  const priceMap = new Map<string, number>(); // key: "fondoId|fecha" → valor_cuota
  const PAGE_SIZE = 1000; // Supabase default max rows per query

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

  if (priceMap.size === 0) {
    return NextResponse.json({ success: true, funds: [], series: [] });
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
  if (internationalHoldings && internationalHoldings.length > 0) {
    const toDate = new Date().toISOString().split("T")[0];
    const intFromDate = fromDate || new Date(Date.now() - 365 * 86400000).toISOString().split("T")[0];

    for (const ih of internationalHoldings) {
      if (!ih.securityId || !ih.quantity || ih.quantity <= 0) continue;

      const resolution = resolveSource({
        securityId: ih.securityId,
        fundName: ih.fundName,
        marketValue: ih.marketValue || 0,
        currency: ih.currency,
      });

      if (resolution.source === "cmf" || resolution.source === "bcch") continue;

      const key = `int-${ih.securityId}`;

      // Check international_prices DB first
      let offset2 = 0;
      const intPriceMap = new Map<string, number>();
      while (true) {
        const { data: rows } = await supabase
          .from("international_prices")
          .select("price_date, close_price")
          .eq("symbol", resolution.symbol)
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

      // If DB has < 30 days of data, backfill from Yahoo/AV
      if (intPriceMap.size < 30 && (resolution.source === "yahoo" || resolution.source === "alphavantage")) {
        try {
          const fetched = await fetchPriceRange(resolution, intFromDate, toDate);
          if (fetched.length > 0) {
            for (const p of fetched) intPriceMap.set(p.date, p.price);
            // Store for future use (fire-and-forget)
            storeInternationalPrices(resolution.symbol, fetched, resolution.currency, resolution.source)
              .catch(() => {});
          }
        } catch {
          // Non-fatal
        }
      }

      if (intPriceMap.size === 0) continue;

      // Determine if this is CLP or USD and needs conversion
      const isCLP = resolution.currency === "CLP";

      fundInfo.set(key, {
        id: key,
        fundName: ih.fundName,
        quantity: ih.quantity,
        tac: null,
        cartolaPrice: 0,
        moneda: isCLP ? "CLP" : (ih.currency || "USD"),
      });

      // For USD instruments, convert to CLP using dólar observado
      const fechaMap = new Map<string, number>();
      if (!isCLP) {
        // Ensure dólar data is loaded
        const startYear = parseInt(intFromDate.split("-")[0], 10);
        const endYear = new Date().getFullYear();
        for (let y = startYear; y <= endYear; y++) {
          await preloadYear("dolar", y);
        }
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

  // Track last known price per fund for forward-fill.
  // Always forward-fill with last known price — if a fund stops publishing,
  // its value stays flat rather than dropping to 0 (which distorts the total).
  // Stale funds are flagged separately in the response for UI warnings.
  const lastKnownPrice = new Map<string, number>();

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

  // Start from the first date where ALL funds have data.
  // Before that point, some funds contribute 0 which creates artificial jumps.
  const allFundsCount = fundKeys.length;
  const startIdx = series.findIndex((p) => p._fundsWithPrice >= allFundsCount);
  const filteredSeries = series
    .slice(startIdx >= 0 ? startIdx : 0)
    .filter((p) => p._fundsWithPrice >= allFundsCount)
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

  } catch (err) {
    console.error("historical-prices error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}

// Dólar observado functions now centralized in lib/bcch.ts
// Uses Banco Central de Chile SI3 API (canonical source)
