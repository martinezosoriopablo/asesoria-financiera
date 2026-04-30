import { NextRequest, NextResponse } from "next/server";
import { requireAdvisor, createAdminClient } from "@/lib/auth/api-auth";
import { applyRateLimit } from "@/lib/rate-limit";

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

export async function POST(req: NextRequest) {
  try {
  const blocked = await applyRateLimit(req, "historical-prices", { limit: 10, windowSeconds: 60 });
  if (blocked) return blocked;

  const { error: authError } = await requireAdvisor();
  if (authError) return authError;
  const { holdings, fromDate } = await req.json() as {
    holdings: HoldingInput[];
    fromDate?: string;
  };

  if (!holdings || !Array.isArray(holdings) || holdings.length === 0) {
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
  }>();

  for (const h of holdings) {
    if (!h.run || !h.serie) continue;
    const key = `${h.run}-${h.serie}`;

    // fondo_id from fondos_mutuos
    const { data: fondo } = await supabase
      .from("fondos_mutuos")
      .select("id")
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
  // eslint-disable-next-line no-constant-condition
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
  // eslint-disable-next-line no-constant-condition
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

  // Pre-load dólar observado for all years in the date range
  if (fromDate) {
    const startYear = parseInt(fromDate.split("-")[0], 10);
    const endYear = new Date().getFullYear();
    for (let y = startYear; y <= endYear; y++) {
      await preloadDolarYear(y);
    }
  }

  for (const [key, prices] of pricesByFund) {
    const info = fundInfo.get(key);
    const cartolaPrice = info?.cartolaPrice || 0;
    const fechaMap = new Map<string, number>();
    let usdCount = 0;

    for (const p of prices) {
      let precio = p.valor_cuota;

      if (cartolaPrice > 0) {
        const ratio = cartolaPrice / precio;
        if (ratio >= 500 && ratio <= 1500) {
          // This price is in USD, convert to CLP
          const dolar = await fetchDolarObservado(p.fecha);
          precio = precio * dolar;
          usdCount++;
        }
        // else: price is already in CLP (ratio close to 1)
      }

      fechaMap.set(p.fecha, precio);
    }

    if (usdCount > 0) {
      console.log(`[historical-prices] ${info?.fundName}: ${usdCount}/${prices.length} prices converted USD→CLP`);
    }

    normalizedPrices.set(key, fechaMap);
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

  // Track last known price per fund for forward-fill
  const lastKnownPrice = new Map<string, number>();

  const series = sortedDates.map((fecha) => {
    let total = 0;
    let fundsWithPrice = 0;
    const fundValues: Record<string, number> = {};

    for (const key of fundKeys) {
      const info = fundInfo.get(key)!;
      const fechaMap = normalizedPrices.get(key);
      const precio = fechaMap?.get(fecha);

      // Use current price or forward-fill from last known
      const effectivePrice = precio ?? lastKnownPrice.get(key);

      if (effectivePrice !== undefined) {
        if (precio !== undefined) lastKnownPrice.set(key, precio);
        const valor = info.quantity * effectivePrice;
        fundValues[info.fundName] = Math.round(valor);
        total += valor;
        fundsWithPrice++;
      }
    }

    return { fecha, total: Math.round(total), _fundsWithPrice: fundsWithPrice, ...fundValues };
  });

  // Filter out dates where we don't have data for at least half the funds
  const minFunds = Math.max(1, Math.ceil(fundKeys.length / 2));
  const filteredSeries = series
    .filter((p) => p._fundsWithPrice >= minFunds)
    .map(({ _fundsWithPrice, ...rest }) => rest);

  // 6. Info de fondos
  const funds = fundKeys.map((key) => {
    const info = fundInfo.get(key)!;
    return {
      fundName: info.fundName,
      run: key.split("-")[0],
      serie: key.split("-").slice(1).join("-"),
      tac: info.tac,
      quantity: info.quantity,
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

// Cache dólar observado — pre-cargado por año completo
const dolarCache = new Map<string, number>();
const yearsLoaded = new Set<number>();

async function preloadDolarYear(year: number): Promise<void> {
  if (yearsLoaded.has(year)) return;
  try {
    const res = await fetch(`https://mindicador.cl/api/dolar/${year}`);
    if (res.ok) {
      const data = await res.json();
      if (data.serie && Array.isArray(data.serie)) {
        for (const entry of data.serie) {
          // entry.fecha is ISO string like "2025-04-16T04:00:00.000Z"
          const fecha = entry.fecha.split("T")[0];
          dolarCache.set(fecha, entry.valor);
        }
        yearsLoaded.add(year);
        console.log(`[dolar] Loaded ${data.serie.length} rates for ${year}`);
      }
    }
  } catch (err) {
    console.warn(`[dolar] Failed to load year ${year}:`, err);
  }
}

async function fetchDolarObservado(fecha: string): Promise<number> {
  const cached = dolarCache.get(fecha);
  if (cached) return cached;

  // Load the full year if not loaded yet
  const year = parseInt(fecha.split("-")[0], 10);
  if (!yearsLoaded.has(year)) {
    await preloadDolarYear(year);
    const afterLoad = dolarCache.get(fecha);
    if (afterLoad) return afterLoad;
  }

  // Weekends/holidays: find nearest earlier date in cache
  const sorted = [...dolarCache.entries()]
    .filter(([d]) => d <= fecha)
    .sort((a, b) => b[0].localeCompare(a[0]));
  if (sorted.length > 0) {
    const val = sorted[0][1];
    dolarCache.set(fecha, val); // cache for next time
    return val;
  }

  return 950; // ultimate fallback
}
