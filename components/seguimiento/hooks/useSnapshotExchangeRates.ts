import { useState, useEffect } from "react";

interface ExchangeRates {
  usd: number;
  eur: number;
  uf: number;
}

export function useSnapshotExchangeRates(fechaCartola: string) {
  const [exchangeRates, setExchangeRates] = useState<ExchangeRates | null>(null);
  const [loadingRates, setLoadingRates] = useState(true);
  const [ratesError, _setRatesError] = useState<string | null>(null);
  const [usingFallbackRates, setUsingFallbackRates] = useState(false);

  // Fetch exchange rates at cartola date (not today)
  // Re-fetches when fechaCartola changes so valuation always matches the statement date
  useEffect(() => {
    const controller = new AbortController();

    async function fetchRates() {
      setLoadingRates(true);
      setUsingFallbackRates(false);
      try {
        const cartolaYear = fechaCartola.substring(0, 4);

        // Fetch historical dólar + UF at cartola date in parallel
        const [dolarRes, ufRes, eurRes] = await Promise.all([
          fetch(`/api/exchange-rates/historical?indicator=dolar&year=${cartolaYear}`, { signal: controller.signal }).catch(() => null),
          fetch(`/api/exchange-rates/historical?indicator=uf&year=${cartolaYear}`, { signal: controller.signal }).catch(() => null),
          // EUR: mindicador.cl has historical euro data
          fetch(`https://mindicador.cl/api/euro/${cartolaYear}`, { signal: controller.signal }).catch(() => null),
        ]);

        // Helper: find closest value <= date from a serie
        const findClosest = (serie: Array<{ fecha: string; valor: number }>, targetDate: string): number | null => {
          const candidates = serie.filter(e => e.fecha <= targetDate);
          if (candidates.length === 0) return null;
          candidates.sort((a, b) => b.fecha.localeCompare(a.fecha));
          return candidates[0].valor;
        };

        // Helper: find closest value >= date (for T+1 USD lookup)
        const findClosestNext = (serie: Array<{ fecha: string; valor: number }>, targetDate: string): number | null => {
          const candidates = serie.filter(e => e.fecha >= targetDate);
          if (candidates.length === 0) return null;
          candidates.sort((a, b) => a.fecha.localeCompare(b.fecha));
          return candidates[0].valor;
        };

        let usdRate = 980; // fallback
        let ufRate = 38500;
        let eurRate = 1060;
        let anyHistorical = false;

        // Dólar observado: use T+1 convention (observado from next calendar day)
        // Chilean brokerages value USD positions using the dólar observado published
        // the day AFTER the valuation date (the observado published on day D is the
        // average from D-1).
        if (dolarRes) {
          try {
            const data = await dolarRes.json();
            if (data.success && data.serie?.length > 0) {
              const nextDay = new Date(fechaCartola + "T12:00:00");
              nextDay.setDate(nextDay.getDate() + 1);
              const nextDayStr = nextDay.toISOString().split("T")[0];
              const val = findClosestNext(data.serie, nextDayStr);
              if (val) { usdRate = val; anyHistorical = true; }
              console.log(`[ReviewSnapshot] Dólar observado T+1 (>=${nextDayStr}): $${usdRate}`);
            }
          } catch { /* use fallback */ }
        }

        // UF at cartola date (same day, no T+1)
        if (ufRes) {
          try {
            const data = await ufRes.json();
            if (data.success && data.serie?.length > 0) {
              const val = findClosest(data.serie, fechaCartola);
              if (val) { ufRate = val; anyHistorical = true; }
              console.log(`[ReviewSnapshot] UF ${fechaCartola}: $${ufRate}`);
            }
          } catch { /* use fallback */ }
        }

        // EUR at cartola date (mindicador.cl format)
        if (eurRes) {
          try {
            const data = await eurRes.json();
            if (data.serie?.length > 0) {
              const serie = data.serie.map((e: { fecha: string; valor: number }) => ({
                fecha: e.fecha.split("T")[0],
                valor: e.valor,
              }));
              const val = findClosest(serie, fechaCartola);
              if (val) { eurRate = val; anyHistorical = true; }
              console.log(`[ReviewSnapshot] EUR ${fechaCartola}: $${eurRate}`);
            }
          } catch { /* use fallback */ }
        }

        if (controller.signal.aborted) return;

        setExchangeRates({ usd: usdRate, eur: eurRate, uf: ufRate });
        if (!anyHistorical) {
          setUsingFallbackRates(true);
        }
      } catch {
        if (!controller.signal.aborted) {
          setExchangeRates({ usd: 980, eur: 1060, uf: 38500 });
          setUsingFallbackRates(true);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoadingRates(false);
        }
      }
    }
    fetchRates();

    return () => controller.abort();
  }, [fechaCartola]);

  return { exchangeRates, loadingRates, ratesError, usingFallbackRates };
}
