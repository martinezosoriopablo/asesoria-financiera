import { useState, useEffect, useCallback, useMemo } from "react";

interface UseExchangeRatesParams {
  snapshots: Array<{ snapshot_date: string; source: string }>;
  livePriceDate: string | null;
}

interface UseExchangeRatesReturn {
  exchangeRates: { uf: number; usd: number } | null;
  deflatorData: { uf: Map<string, number>; usd: Map<string, number> } | null;
  cartolaExchangeRates: { uf: number; usd: number } | null;
  currentExchangeRates: { uf: number; usd: number } | null;
  findDeflatorValue: (map: Map<string, number> | undefined, date: string) => number | null;
  findDeflatorValueNext: (map: Map<string, number> | undefined, date: string) => number | null;
}

export function useExchangeRates({ snapshots, livePriceDate }: UseExchangeRatesParams): UseExchangeRatesReturn {
  const [deflatorData, setDeflatorData] = useState<{ uf: Map<string, number>; usd: Map<string, number> } | null>(null);
  const [exchangeRates, setExchangeRates] = useState<{ uf: number; usd: number } | null>(null);

  // Fetch current exchange rates for UF/USD display
  useEffect(() => {
    fetch("/api/exchange-rates")
      .then(r => r.json())
      .then(d => { if (d.success) setExchangeRates({ uf: d.uf, usd: d.usd }); })
      .catch(() => { /* fallback handled */ });
  }, []);

  // Fetch UF and dólar historical data via our proxy (avoids CORS issues)
  useEffect(() => {
    const fetchDeflators = async () => {
      const currentYear = new Date().getFullYear();
      const years = [currentYear - 1, currentYear];
      const ufMap = new Map<string, number>();
      const usdMap = new Map<string, number>();

      // Fetch sequentially to avoid rate-limit (4 calls + StrictMode double-mount = 8+)
      for (const year of years) {
        try {
          const ufRes = await fetch(`/api/exchange-rates/historical?indicator=uf&year=${year}`);
          const ufData = await ufRes.json();
          for (const e of (ufData.serie || []) as Array<{ fecha: string; valor: number }>) {
            ufMap.set(e.fecha, e.valor);
          }
        } catch { /* ignore */ }
        try {
          const usdRes = await fetch(`/api/exchange-rates/historical?indicator=dolar&year=${year}`);
          const usdData = await usdRes.json();
          for (const e of (usdData.serie || []) as Array<{ fecha: string; valor: number }>) {
            usdMap.set(e.fecha, e.valor);
          }
        } catch { /* ignore */ }
      }

      if (ufMap.size > 0 || usdMap.size > 0) {
        setDeflatorData({ uf: ufMap, usd: usdMap });
      }
    };

    fetchDeflators();
  }, []);

  // Helper: find closest value <= date in a deflator map
  const findDeflatorValue = useCallback((map: Map<string, number> | undefined, date: string): number | null => {
    if (!map || map.size === 0) return null;
    const exact = map.get(date);
    if (exact) return exact;
    // Find nearest earlier date (maps aren't sorted, scan all)
    let bestDate = "";
    let bestVal: number | null = null;
    for (const [d, v] of map) {
      if (d <= date && d > bestDate) { bestDate = d; bestVal = v; }
    }
    return bestVal;
  }, []);

  // Helper: find closest value >= date (next-day lookup for USD observado)
  const findDeflatorValueNext = useCallback((map: Map<string, number> | undefined, date: string): number | null => {
    if (!map || map.size === 0) return null;
    const exact = map.get(date);
    if (exact) return exact;
    let bestDate = "9999-12-31";
    let bestVal: number | null = null;
    for (const [d, v] of map) {
      if (d >= date && d < bestDate) { bestDate = d; bestVal = v; }
    }
    return bestVal;
  }, []);

  // Exchange rates at cartola date: UF same day, USD observado next day (T+1 convention)
  const cartolaExchangeRates = useMemo(() => {
    if (!deflatorData || !snapshots?.length) return null;
    const cartolaSnaps = snapshots.filter(
      (s: { source: string }) => s.source === "statement" || s.source === "manual" || s.source === "excel"
    );
    if (!cartolaSnaps.length) return null;
    const cartolaDate = cartolaSnaps[cartolaSnaps.length - 1].snapshot_date;
    const ufVal = findDeflatorValue(deflatorData.uf, cartolaDate);
    // USD: observado from next calendar day (corredora convention)
    const nextDay = new Date(cartolaDate + "T12:00:00");
    nextDay.setDate(nextDay.getDate() + 1);
    const nextDayStr = nextDay.toISOString().split("T")[0];
    const usdVal = findDeflatorValueNext(deflatorData.usd, nextDayStr);
    if (!ufVal || !usdVal) return null;
    return { uf: ufVal, usd: usdVal };
  }, [deflatorData, snapshots, findDeflatorValue, findDeflatorValueNext]);

  // Exchange rates at current valuation date: same T+1 convention for USD
  const currentExchangeRates = useMemo(() => {
    if (!deflatorData) return null;
    // Use livePriceDate (from HoldingReturnsPanel) or today
    const valDate = livePriceDate || new Date().toISOString().split("T")[0];
    const ufVal = findDeflatorValue(deflatorData.uf, valDate);
    // USD: observado T+1
    const nextDay = new Date(valDate + "T12:00:00");
    nextDay.setDate(nextDay.getDate() + 1);
    const nextDayStr = nextDay.toISOString().split("T")[0];
    const usdVal = findDeflatorValueNext(deflatorData.usd, nextDayStr);
    if (!ufVal || !usdVal) return null;
    return { uf: ufVal, usd: usdVal };
  }, [deflatorData, livePriceDate, findDeflatorValue, findDeflatorValueNext]);

  return {
    exchangeRates,
    deflatorData,
    cartolaExchangeRates,
    currentExchangeRates,
    findDeflatorValue,
    findDeflatorValueNext,
  };
}
