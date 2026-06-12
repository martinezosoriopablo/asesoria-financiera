import { useState, useEffect, useMemo } from "react";
import { detectSerieCode } from "@/lib/fund-utils";

interface Snapshot {
  id: string;
  snapshot_date: string;
  total_value: number;
  holdings: unknown[] | null;
  source: string;
  is_baseline?: boolean;
}

interface FundMeta {
  fundName: string;
  run: string;
  serie: string;
  tac: number | null;
  moneda: string;
  quantity: number;
  lastPriceDate?: string | null;
  stale?: boolean;
}

type PeriodReturn = { nominal: number; real: number | null; usd: number | null };

interface UseHistoricalSeriesParams {
  snapshots: Snapshot[] | undefined;
  portalMode: boolean;
  deflatorData: { uf: Map<string, number>; usd: Map<string, number> } | null;
  findDeflatorValue: (map: Map<string, number> | undefined, date: string) => number | null;
}

interface UseHistoricalSeriesReturn {
  historicalSeries: Array<{ fecha: string; total: number; [key: string]: string | number }>;
  fundsMeta: FundMeta[];
  loadingHistorical: boolean;
  backfillStatus: string | null;
  setBackfillStatus: React.Dispatch<React.SetStateAction<string | null>>;
  periodReturns: { "1M": PeriodReturn | null; "3M": PeriodReturn | null; "6M": PeriodReturn | null; "1Y": PeriodReturn | null; "YTD": PeriodReturn | null } | null;
  accumulatedReturn: number | null;
  weightedTAC: { weighted: number; annualCost: number; coverage: number } | null;
}

export function useHistoricalSeries({
  snapshots,
  portalMode,
  deflatorData,
  findDeflatorValue,
}: UseHistoricalSeriesParams): UseHistoricalSeriesReturn {
  const [historicalSeries, setHistoricalSeries] = useState<Array<{ fecha: string; total: number; [key: string]: string | number }>>([]);
  const [fundsMeta, setFundsMeta] = useState<FundMeta[]>([]);
  const [loadingHistorical, setLoadingHistorical] = useState(false);
  const [backfillStatus, setBackfillStatus] = useState<string | null>(null);

  // Fetch historical price series for the evolution chart
  useEffect(() => {
    if (!snapshots || snapshots.length === 0) return;

    // Find holdings with RUN+serie from the latest cartola snapshot
    const cartolaSnaps = snapshots.filter(
      (s) => s.source === "statement" || s.source === "manual" || s.source === "excel"
    );
    if (cartolaSnaps.length === 0) return;

    const latestCartola = cartolaSnaps[cartolaSnaps.length - 1];
    const holdings = latestCartola.holdings as Array<{
      fundName?: string; securityId?: string; serie?: string;
      quantity?: number; currency?: string;
      marketPrice?: number; marketValue?: number;
      assetClass?: string; assetType?: string;
      couponRate?: number | null; maturityDate?: string | null;
    }> | null;
    if (!holdings || holdings.length === 0) return;

    const holdingsWithRun = holdings
      .filter((h) => {
        const id = h.securityId || "";
        return /^\d{3,6}$/.test(id.trim()) && (h.quantity || 0) > 0;
      })
      .map((h) => ({
        fundName: h.fundName || "",
        run: parseInt((h.securityId || "").trim(), 10),
        serie: h.serie || detectSerieCode(h.fundName || "") || "",
        quantity: h.quantity || 0,
        currency: h.currency || "CLP",
        cartolaPrice: (h.quantity && h.quantity > 0 ? (h.marketValue || 0) / h.quantity : 0) || h.marketPrice || 0,
      }));

    // Shared detection: is this holding a tradeable international instrument?
    const isTradeableInternational = (h: typeof holdings[0]): boolean => {
      const id = (h.securityId || "").trim().toUpperCase();
      if (!id || /^\d{1,6}$/.test(id) || (h.quantity || 0) <= 0) return false;
      const name = (h.fundName || "").toUpperCase();
      const isBond = (h.assetClass || "").toLowerCase().includes("fixed") ||
        (h.assetClass || "").toLowerCase() === "fixedincome" ||
        (h.assetType || "").toLowerCase() === "bond" ||
        /\b(CPN|DUE\s+\d|NOTE|UNSECD|FXD\/VAR)\b/.test(name) ||
        !!(h.couponRate || h.maturityDate);
      if (isBond) return false;
      if (/^CFI/.test(id)) return true;
      if (/^[A-Z]{3,10}CL$/.test(id)) return true;
      if (id.includes(".SN")) return true;
      if (/^[A-Z]{1,5}$/.test(id)) return true;
      if (/^[A-Z0-9]{9}$/i.test(id)) return true;
      return false;
    };

    // International holdings: tradeable instruments with non-numeric securityId
    const internationalHoldings = holdings
      .filter(isTradeableInternational)
      .map((h) => ({
        fundName: h.fundName || "",
        securityId: (h.securityId || "").trim(),
        quantity: h.quantity || 0,
        marketValue: h.marketValue || 0,
        currency: h.currency || "CLP",
      }));

    // Holdings without securityId but with fundName — resolve by name matching in API
    const holdingsByName = holdings
      .filter((h) => {
        const id = (h.securityId || "").trim();
        const name = (h.fundName || "").trim();
        // No securityId (or too short), has a fund name, has quantity
        return (!id || /^\d{1,2}$/.test(id)) && name.length > 3 && (h.quantity || 0) > 0;
      })
      .map((h) => ({
        fundName: h.fundName || "",
        serie: h.serie || "",
        quantity: h.quantity || 0,
        currency: h.currency || "CLP",
        cartolaPrice: (h.quantity && h.quantity > 0 ? (h.marketValue || 0) / h.quantity : 0) || h.marketPrice || 0,
      }));

    // Bond holdings: have couponRate + maturityDate, use bond math for projected prices
    const bondHoldings = holdings
      .filter((h) => {
        const qty = h.quantity || 0;
        if (qty <= 0) return false;
        // Must have coupon rate and maturity to project prices
        return (h.couponRate != null && h.couponRate > 0 && h.maturityDate);
      })
      .map((h) => ({
        fundName: h.fundName || "",
        securityId: (h.securityId || "").trim(),
        quantity: h.quantity || 0,
        marketValue: h.marketValue || 0,
        couponRate: h.couponRate!,
        maturityDate: h.maturityDate!,
        currency: h.currency || "USD",
      }));

    // Collect indices of holdings already categorized
    const categorizedIndices = new Set<number>();
    holdings.forEach((h, i) => {
      const id = (h.securityId || "").trim();
      const name = (h.fundName || "").trim();
      const qty = h.quantity || 0;
      // holdingsWithRun
      if (/^\d{3,6}$/.test(id) && qty > 0) { categorizedIndices.add(i); return; }
      // internationalHoldings (non-bond) — reuse shared detection
      if (isTradeableInternational(h)) { categorizedIndices.add(i); return; }
      // holdingsByName
      if ((!id || /^\d{1,2}$/.test(id)) && name.length > 3 && qty > 0) { categorizedIndices.add(i); return; }
      // bondHoldings (with coupon + maturity)
      if (qty > 0 && h.couponRate != null && h.couponRate > 0 && h.maturityDate) { categorizedIndices.add(i); return; }
    });

    // Flat holdings: everything with marketValue that wasn't categorized
    // (bonds without coupon/maturity, cash, money market, etc.)
    const flatHoldings = holdings
      .filter((_, i) => !categorizedIndices.has(i))
      .filter((h) => (h.marketValue || 0) > 0)
      .map((h) => ({
        fundName: h.fundName || "",
        marketValue: h.marketValue || 0,
        currency: h.currency || "USD",
      }));

    const hasAnyHoldings = holdingsWithRun.length > 0 || internationalHoldings.length > 0 ||
      holdingsByName.length > 0 || bondHoldings.length > 0 || flatHoldings.length > 0;
    if (!hasAnyHoldings) return;

    // Go back 1 year from today for historical data (rent 1Y, 6M, etc.)
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    oneYearAgo.setDate(oneYearAgo.getDate() - 7); // extra week buffer
    const fromDate = oneYearAgo.toISOString().split("T")[0];

    const fetchHistorical = async () => {
      setLoadingHistorical(true);
      try {
        const res = await fetch("/api/portfolio/historical-prices", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            holdings: holdingsWithRun,
            holdingsByName: holdingsByName.length > 0 ? holdingsByName : undefined,
            internationalHoldings: internationalHoldings.length > 0 ? internationalHoldings : undefined,
            bondHoldings: bondHoldings.length > 0 ? bondHoldings.map(b => ({
              ...b,
              referenceDate: latestCartola.snapshot_date,
            })) : undefined,
            flatHoldings: flatHoldings.length > 0 ? flatHoldings : undefined,
            fromDate,
          }),
        });
        if (res.ok) {
          const result = await res.json();
          if (result.success && result.series) {
            setHistoricalSeries(result.series);
            if (result.funds) setFundsMeta(result.funds);

            // If series is too short (< 30 points), trigger CMF backfill to get more data
            if (!portalMode && result.series.length < 30) {
              const uniqueRuns = [...new Set(holdingsWithRun.map((h) => h.run))];
              if (uniqueRuns.length > 0) {
                setBackfillStatus(`Descargando histórico CMF para ${uniqueRuns.length} fondos...`);
                fetch("/api/portfolio/backfill-cmf", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ runs: uniqueRuns, snapshotDate: fromDate }),
                })
                  .then((r) => r.json())
                  .then((r) => {
                    if (r.success && r.totalImported > 0) {
                      setBackfillStatus(`${r.totalImported} precios importados, actualizando gráfico...`);
                      // Re-fetch historical after backfill
                      fetch("/api/portfolio/historical-prices", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          holdings: holdingsWithRun,
                          holdingsByName: holdingsByName.length > 0 ? holdingsByName : undefined,
                          internationalHoldings: internationalHoldings.length > 0 ? internationalHoldings : undefined,
                          bondHoldings: bondHoldings.length > 0 ? bondHoldings.map(b => ({
                            ...b,
                            referenceDate: latestCartola.snapshot_date,
                          })) : undefined,
                          flatHoldings: flatHoldings.length > 0 ? flatHoldings : undefined,
                          fromDate,
                        }),
                      })
                        .then((r2) => r2.json())
                        .then((r2) => {
                          if (r2.success && r2.series) {
                            setHistoricalSeries(r2.series);
                            if (r2.funds) setFundsMeta(r2.funds);
                          }
                          setBackfillStatus(null);
                        })
                        .catch(() => setBackfillStatus(null));
                    } else {
                      setBackfillStatus(r.error ? `Error CMF: ${r.error}` : null);
                      setTimeout(() => setBackfillStatus(null), 5000);
                    }
                  })
                  .catch((err) => {
                    console.warn("[backfill-cmf] Error:", err);
                    setBackfillStatus(null);
                  });
              }
            }
          }
        }
      } catch (err) {
        console.error("Error fetching historical prices:", err);
      } finally {
        setLoadingHistorical(false);
      }
    };

    fetchHistorical();
  }, [snapshots]);

  // Calculate period returns from historical series (nominal + real + USD)
  const periodReturns = useMemo(() => {
    if (historicalSeries.length < 2) return null;

    const latest = historicalSeries[historicalSeries.length - 1];
    const latestValue = latest.total as number;
    const latestDateStr = (latest.fecha as string).split("T")[0];
    // Parse as local date to avoid timezone shift (e.g. 2026-04-21 UTC -> Apr 20 in Chile)
    const [ly, lm, ld] = latestDateStr.split("-").map(Number);
    const latestDate = new Date(ly, lm - 1, ld);

    const getReturnForPeriod = (targetStr: string): PeriodReturn | null => {
      const point = historicalSeries.find((p) => (p.fecha as string) >= targetStr);
      if (!point || point === latest) return null;

      // If the closest point is more than 10 days after the target date,
      // the series doesn't have enough data for this period — skip it
      // rather than showing the same return for all periods
      const pointDate = new Date(point.fecha as string);
      const targetDate = new Date(targetStr);
      const daysDiff = (pointDate.getTime() - targetDate.getTime()) / 86400000;
      if (daysDiff > 10) return null;

      const startValue = point.total as number;
      if (startValue <= 0) return null;
      const nominal = ((latestValue / startValue) - 1) * 100;
      const startDateStr = point.fecha as string;

      let real: number | null = null;
      let usd: number | null = null;

      if (deflatorData) {
        const ufStart = findDeflatorValue(deflatorData.uf, startDateStr);
        const ufEnd = findDeflatorValue(deflatorData.uf, latestDateStr);
        if (ufStart && ufEnd && ufStart > 0) {
          real = ((1 + nominal / 100) / (ufEnd / ufStart) - 1) * 100;
        }

        const usdStart = findDeflatorValue(deflatorData.usd, startDateStr);
        const usdEnd = findDeflatorValue(deflatorData.usd, latestDateStr);
        if (usdStart && usdEnd && usdStart > 0) {
          usd = ((1 + nominal / 100) / (usdEnd / usdStart) - 1) * 100;
        }
      }

      return { nominal, real, usd };
    };

    const toLocalDateStr = (d: Date) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    };
    const getForMonths = (months: number) => {
      const targetDate = new Date(latestDate);
      targetDate.setMonth(targetDate.getMonth() - months);
      return getReturnForPeriod(toLocalDateStr(targetDate));
    };

    return {
      "1M": getForMonths(1),
      "3M": getForMonths(3),
      "6M": getForMonths(6),
      "1Y": getForMonths(12),
      "YTD": getReturnForPeriod(`${latestDate.getFullYear()}-01-01`),
    };
  }, [historicalSeries, deflatorData, findDeflatorValue]);

  // Accumulated return from first to last point of historicalSeries
  // This is the single source of truth for portfolio-level total return
  const accumulatedReturn = useMemo(() => {
    if (historicalSeries.length < 2) return null;
    const first = historicalSeries[0].total as number;
    const last = historicalSeries[historicalSeries.length - 1].total as number;
    if (first <= 0) return null;
    return ((last / first) - 1) * 100;
  }, [historicalSeries]);

  // TAC ponderado del portafolio
  const weightedTAC = useMemo(() => {
    if (fundsMeta.length === 0 || historicalSeries.length === 0) return null;

    const latest = historicalSeries[historicalSeries.length - 1];
    const totalValue = latest.total;
    if (totalValue <= 0) return null;

    let tacSum = 0;
    let coveredValue = 0;

    for (const fund of fundsMeta) {
      if (fund.tac === null || fund.tac === undefined) continue;
      const fundValue = (latest[fund.fundName] as number) || 0;
      if (fundValue > 0) {
        tacSum += fund.tac * fundValue;
        coveredValue += fundValue;
      }
    }

    if (coveredValue <= 0) return null;
    return {
      weighted: tacSum / coveredValue,
      annualCost: Math.round(totalValue * (tacSum / coveredValue) / 100),
      coverage: coveredValue / totalValue,
    };
  }, [fundsMeta, historicalSeries]);

  return {
    historicalSeries,
    fundsMeta,
    loadingHistorical,
    backfillStatus,
    setBackfillStatus,
    periodReturns,
    accumulatedReturn,
    weightedTAC,
  };
}
