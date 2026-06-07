# Component Refactoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decompose 4 oversized components into focused hooks and sub-components with zero behavior change.

**Architecture:** Extract useState/useEffect/useMemo clusters into custom hooks. Extract large JSX sections into sub-components that receive props. Parent components become orchestrators (~200-400 lines each). All code moves verbatim — no logic changes.

**Tech Stack:** React 19, TypeScript, Next.js 16

**Spec:** `docs/superpowers/specs/2026-06-07-component-refactoring-design.md`

**CRITICAL CONSTRAINT:** Zero behavior change. Zero calculation change. Move code verbatim. Do NOT "improve" or "clean up" any logic. The diff should read as "code moved to new files."

---

### Task 1: Extract `useExchangeRates` hook from SeguimientoPage

**Files:**
- Create: `components/seguimiento/hooks/useExchangeRates.ts`
- Modify: `components/seguimiento/SeguimientoPage.tsx`

This hook encapsulates deflator data fetching and exchange rate computation.

- [ ] **Step 1: Create the hook file**

Create `components/seguimiento/hooks/useExchangeRates.ts` with all the exchange rate logic extracted from SeguimientoPage:

```typescript
"use client";

import { useState, useEffect, useCallback, useMemo } from "react";

interface UseExchangeRatesOptions {
  snapshots: Array<{ snapshot_date: string; source: string }>;
  livePriceDate: string | null;
}

interface ExchangeRatesPair {
  uf: number;
  usd: number;
}

export function useExchangeRates({ snapshots, livePriceDate }: UseExchangeRatesOptions) {
  const [deflatorData, setDeflatorData] = useState<{ uf: Map<string, number>; usd: Map<string, number> } | null>(null);
  const [exchangeRates, setExchangeRates] = useState<ExchangeRatesPair | null>(null);

  // Fetch current exchange rates (lines 214-217 of original)
  useEffect(() => {
    fetch("/api/exchange-rates")
      .then(r => r.json())
      .then(d => { if (d.success) setExchangeRates({ uf: d.uf, usd: d.usd }); })
      .catch(() => { /* fallback handled */ });
  }, []);

  // Fetch UF and dólar historical data (lines 435-466 of original)
  useEffect(() => {
    const fetchDeflators = async () => {
      const currentYear = new Date().getFullYear();
      const years = [currentYear - 1, currentYear];
      const ufMap = new Map<string, number>();
      const usdMap = new Map<string, number>();

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

  // Helper: find closest value <= date (lines 469-480 of original)
  const findDeflatorValue = useCallback((map: Map<string, number> | undefined, date: string): number | null => {
    if (!map || map.size === 0) return null;
    const exact = map.get(date);
    if (exact) return exact;
    let bestDate = "";
    let bestVal: number | null = null;
    for (const [d, v] of map) {
      if (d <= date && d > bestDate) { bestDate = d; bestVal = v; }
    }
    return bestVal;
  }, []);

  // Helper: find closest value >= date (lines 483-493 of original)
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

  // Exchange rates at cartola date (lines 496-511 of original)
  const cartolaExchangeRates = useMemo(() => {
    if (!deflatorData || !snapshots?.length) return null;
    const cartolaSnaps = snapshots.filter(
      (s) => s.source === "statement" || s.source === "manual" || s.source === "excel"
    );
    if (!cartolaSnaps.length) return null;
    const cartolaDate = cartolaSnaps[cartolaSnaps.length - 1].snapshot_date;
    const ufVal = findDeflatorValue(deflatorData.uf, cartolaDate);
    const nextDay = new Date(cartolaDate + "T12:00:00");
    nextDay.setDate(nextDay.getDate() + 1);
    const nextDayStr = nextDay.toISOString().split("T")[0];
    const usdVal = findDeflatorValueNext(deflatorData.usd, nextDayStr);
    if (!ufVal || !usdVal) return null;
    return { uf: ufVal, usd: usdVal };
  }, [deflatorData, snapshots, findDeflatorValue, findDeflatorValueNext]);

  // Exchange rates at current valuation date (lines 514-526 of original)
  const currentExchangeRates = useMemo(() => {
    if (!deflatorData) return null;
    const valDate = livePriceDate || new Date().toISOString().split("T")[0];
    const ufVal = findDeflatorValue(deflatorData.uf, valDate);
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
```

- [ ] **Step 2: Update SeguimientoPage to use the hook**

In `SeguimientoPage.tsx`:
1. Add import: `import { useExchangeRates } from "./hooks/useExchangeRates";`
2. Remove the following state/logic (replace with hook call):
   - `useState` for `deflatorData` (line 153) and `exchangeRates` (line 155)
   - `useEffect` for fetching exchange rates at line 214-217 (the fetch inside the existing useEffect at 210-218 — only remove the exchange rates fetch, keep fetchData and fetchExecutions calls)
   - `useEffect` for fetching deflators (lines 435-466)
   - `useCallback` for `findDeflatorValue` (lines 469-480)
   - `useCallback` for `findDeflatorValueNext` (lines 483-493)
   - `useMemo` for `cartolaExchangeRates` (lines 496-511)
   - `useMemo` for `currentExchangeRates` (lines 514-526)
3. Add hook call after existing hooks:
```typescript
const {
  exchangeRates, deflatorData, cartolaExchangeRates,
  currentExchangeRates, findDeflatorValue, findDeflatorValueNext,
} = useExchangeRates({
  snapshots: data?.snapshots || [],
  livePriceDate,
});
```
4. Keep the exchange rates fetch **out** of the initial useEffect (line 210-218). The hook now handles it internally.

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds with no type errors.

- [ ] **Step 4: Run tests**

Run: `npm run test:run`
Expected: All existing tests pass (no tests touch this UI component directly, but dependent tests must still pass).

- [ ] **Step 5: Commit**

```bash
git add components/seguimiento/hooks/useExchangeRates.ts components/seguimiento/SeguimientoPage.tsx
git commit -m "refactor: extract useExchangeRates hook from SeguimientoPage"
```

---

### Task 2: Extract `useHistoricalSeries` hook from SeguimientoPage

**Files:**
- Create: `components/seguimiento/hooks/useHistoricalSeries.ts`
- Modify: `components/seguimiento/SeguimientoPage.tsx`

This hook encapsulates historical price series fetching, backfill logic, and period returns computation.

- [ ] **Step 1: Create the hook file**

Create `components/seguimiento/hooks/useHistoricalSeries.ts`. This moves:
- `useState` for `historicalSeries` (line 147), `fundsMeta` (148), `loadingHistorical` (149), `backfillStatus` (154)
- `useEffect` for fetching historical prices (lines 280-432)
- `useMemo` for `periodReturns` (lines 538-604)
- `useMemo` for `weightedTAC` (lines 848-873)

```typescript
"use client";

import { useState, useEffect, useMemo } from "react";
import { detectSerieCode } from "@/lib/fund-utils";

interface Snapshot {
  snapshot_date: string;
  source: string;
  holdings: unknown[] | null;
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

interface UseHistoricalSeriesOptions {
  snapshots: Snapshot[] | undefined;
  portalMode: boolean;
  deflatorData: { uf: Map<string, number>; usd: Map<string, number> } | null;
  findDeflatorValue: (map: Map<string, number> | undefined, date: string) => number | null;
}

export function useHistoricalSeries({
  snapshots,
  portalMode,
  deflatorData,
  findDeflatorValue,
}: UseHistoricalSeriesOptions) {
  const [historicalSeries, setHistoricalSeries] = useState<Array<{ fecha: string; total: number; [key: string]: string | number }>>([]);
  const [fundsMeta, setFundsMeta] = useState<FundMeta[]>([]);
  const [loadingHistorical, setLoadingHistorical] = useState(false);
  const [backfillStatus, setBackfillStatus] = useState<string | null>(null);

  // Fetch historical price series (lines 280-432 of original — copy verbatim)
  useEffect(() => {
    if (!snapshots || snapshots.length === 0) return;

    const cartolaSnaps = snapshots.filter(
      (s) => s.source === "statement" || s.source === "manual" || s.source === "excel"
    );
    if (cartolaSnaps.length === 0) return;

    const latestCartola = cartolaSnaps[cartolaSnaps.length - 1];
    const holdings = latestCartola.holdings as Array<{
      fundName?: string; securityId?: string; serie?: string;
      quantity?: number; currency?: string;
      marketPrice?: number; marketValue?: number;
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

    const internationalHoldings = holdings
      .filter((h) => {
        const id = (h.securityId || "").trim().toUpperCase();
        if (!id || /^\d{1,6}$/.test(id) || (h.quantity || 0) <= 0) return false;
        if (/^CFI/.test(id)) return true;
        if (/^[A-Z]{3,10}CL$/.test(id)) return true;
        if (id.includes(".SN")) return true;
        if (/^[A-Z]{1,5}$/.test(id)) return true;
        if (/^[A-Z0-9]{9}$/i.test(id)) return true;
        return false;
      })
      .map((h) => ({
        fundName: h.fundName || "",
        securityId: (h.securityId || "").trim(),
        quantity: h.quantity || 0,
        marketValue: h.marketValue || 0,
        currency: h.currency || "CLP",
      }));

    const holdingsByName = holdings
      .filter((h) => {
        const id = (h.securityId || "").trim();
        const name = (h.fundName || "").trim();
        return (!id || /^\d{1,2}$/.test(id)) && name.length > 3 && (h.quantity || 0) > 0;
      })
      .map((h) => ({
        fundName: h.fundName || "",
        serie: h.serie || "",
        quantity: h.quantity || 0,
        currency: h.currency || "CLP",
        cartolaPrice: (h.quantity && h.quantity > 0 ? (h.marketValue || 0) / h.quantity : 0) || h.marketPrice || 0,
      }));

    if (holdingsWithRun.length === 0 && internationalHoldings.length === 0 && holdingsByName.length === 0) return;

    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    oneYearAgo.setDate(oneYearAgo.getDate() - 7);
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
            fromDate,
          }),
        });
        if (res.ok) {
          const result = await res.json();
          if (result.success && result.series) {
            setHistoricalSeries(result.series);
            if (result.funds) setFundsMeta(result.funds);

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
                      fetch("/api/portfolio/historical-prices", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          holdings: holdingsWithRun,
                          holdingsByName: holdingsByName.length > 0 ? holdingsByName : undefined,
                          internationalHoldings: internationalHoldings.length > 0 ? internationalHoldings : undefined,
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
  }, [snapshots, portalMode]);

  // Period returns (lines 538-604 of original — copy verbatim)
  const periodReturns = useMemo(() => {
    if (historicalSeries.length < 2) return null;

    const latest = historicalSeries[historicalSeries.length - 1];
    const latestValue = latest.total as number;
    const latestDateStr = (latest.fecha as string).split("T")[0];
    const [ly, lm, ld] = latestDateStr.split("-").map(Number);
    const latestDate = new Date(ly, lm - 1, ld);

    const getReturnForPeriod = (targetStr: string): PeriodReturn | null => {
      const point = historicalSeries.find((p) => (p.fecha as string) >= targetStr);
      if (!point || point === latest) return null;

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

  // Weighted TAC (lines 848-873 of original — copy verbatim)
  const weightedTAC = useMemo(() => {
    if (fundsMeta.length === 0 || historicalSeries.length === 0) return null;
    const latestPoint = historicalSeries[historicalSeries.length - 1];
    const totalVal = latestPoint.total as number;
    if (totalVal <= 0) return null;

    let tacSum = 0;
    let coveredValue = 0;
    for (const fm of fundsMeta) {
      if (fm.tac === null || fm.tac === undefined) continue;
      const key = fm.fundName || `${fm.run}-${fm.serie}`;
      const fundVal = (latestPoint[key] as number) || 0;
      if (fundVal > 0) {
        tacSum += fm.tac * fundVal;
        coveredValue += fundVal;
      }
    }
    if (coveredValue <= 0) return null;
    return tacSum / coveredValue;
  }, [fundsMeta, historicalSeries]);

  return {
    historicalSeries,
    fundsMeta,
    loadingHistorical,
    backfillStatus,
    setBackfillStatus,
    periodReturns,
    weightedTAC,
  };
}
```

- [ ] **Step 2: Update SeguimientoPage to use the hook**

In `SeguimientoPage.tsx`:
1. Add import: `import { useHistoricalSeries } from "./hooks/useHistoricalSeries";`
2. Remove: `useState` for historicalSeries (147), fundsMeta (148), loadingHistorical (149), backfillStatus (154)
3. Remove: `useEffect` for historical prices (lines 280-432)
4. Remove: `useMemo` for periodReturns (lines 538-604)
5. Remove: `useMemo` for weightedTAC (lines 848-873)
6. Add hook call:
```typescript
const {
  historicalSeries, fundsMeta, loadingHistorical,
  backfillStatus, setBackfillStatus, periodReturns, weightedTAC,
} = useHistoricalSeries({
  snapshots: data?.snapshots,
  portalMode,
  deflatorData,
  findDeflatorValue,
});
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 4: Run tests**

Run: `npm run test:run`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add components/seguimiento/hooks/useHistoricalSeries.ts components/seguimiento/SeguimientoPage.tsx
git commit -m "refactor: extract useHistoricalSeries hook from SeguimientoPage"
```

---

### Task 3: Extract `useBenchmarkConfig` hook from SeguimientoPage

**Files:**
- Create: `components/seguimiento/hooks/useBenchmarkConfig.ts`
- Modify: `components/seguimiento/SeguimientoPage.tsx`

This hook encapsulates benchmark returns fetching and baseline series computation.

- [ ] **Step 1: Create the hook file**

Create `components/seguimiento/hooks/useBenchmarkConfig.ts`. This moves:
- `useState` for `benchmarkConfig` (158), `benchmarkReturns` (159), `benchmarkLabel` (160), `baselineSeries` (161), `loadingBaseline` (162)
- `useEffect` for benchmark returns (lines 221-249)
- `useEffect` for baseline evolution (lines 252-277)
- `useMemo` for `baselineMonthlyReturns` (lines 811-836)
- `useMemo` for `baselineAccReturn` (lines 839-845)

```typescript
"use client";

import { useState, useEffect, useMemo } from "react";
import type { BenchmarkComponent } from "@/lib/prices/types";

interface Snapshot {
  id: string;
  snapshot_date: string;
  source: string;
  is_baseline?: boolean;
}

interface UseBenchmarkConfigOptions {
  snapshots: Snapshot[] | undefined;
  clientId: string;
  initialBenchmarkConfig: BenchmarkComponent[] | null;
}

export function useBenchmarkConfig({
  snapshots,
  clientId,
  initialBenchmarkConfig,
}: UseBenchmarkConfigOptions) {
  const [benchmarkConfig, setBenchmarkConfig] = useState<BenchmarkComponent[] | null>(initialBenchmarkConfig);
  const [benchmarkReturns, setBenchmarkReturns] = useState<Record<string, number> | null>(null);
  const [benchmarkLabel, setBenchmarkLabel] = useState("UF +2%");
  const [baselineSeries, setBaselineSeries] = useState<Array<{ fecha: string; total: number }> | null>(null);
  const [loadingBaseline, setLoadingBaseline] = useState(false);

  // Sync initialBenchmarkConfig when it arrives from parent fetch
  useEffect(() => {
    if (initialBenchmarkConfig) {
      setBenchmarkConfig(initialBenchmarkConfig);
    }
  }, [initialBenchmarkConfig]);

  // Fetch benchmark returns (lines 221-249 of original)
  useEffect(() => {
    if (!snapshots || !benchmarkConfig || snapshots.length < 2) return;

    const cartolaSnaps = snapshots.filter(
      (s) => s.source === "statement" || s.source === "manual" || s.source === "excel"
    );
    if (cartolaSnaps.length < 1) return;

    const firstDate = cartolaSnaps[0].snapshot_date;
    const today = new Date().toISOString().split("T")[0];

    fetch("/api/prices/benchmark-returns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        benchmark: benchmarkConfig,
        fromDate: firstDate,
        toDate: today,
      }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          setBenchmarkReturns(d.data.returns);
          setBenchmarkLabel(d.data.label);
        }
      })
      .catch(() => {});
  }, [snapshots, benchmarkConfig]);

  // Fetch baseline evolution (lines 252-277 of original)
  useEffect(() => {
    if (!snapshots || snapshots.length === 0) return;

    const baseline = snapshots.find((s) => s.is_baseline);
    const latestSnap = snapshots[snapshots.length - 1];
    if (!baseline || !latestSnap || baseline.id === latestSnap.id) {
      setBaselineSeries(null);
      return;
    }

    setLoadingBaseline(true);
    fetch('/api/portfolio/baseline-evolution', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId }),
    })
      .then((res) => res.json())
      .then((result) => {
        if (result.success && result.series) {
          setBaselineSeries(result.series);
        }
      })
      .catch((err) => console.error('Error fetching baseline evolution:', err))
      .finally(() => setLoadingBaseline(false));
  }, [snapshots, clientId]);

  // Baseline monthly returns (lines 811-836 of original)
  const baselineMonthlyReturns = useMemo(() => {
    if (!baselineSeries || baselineSeries.length < 2) return undefined;

    const returns: Record<string, number> = {};
    const byMonth = new Map<string, { first: number; last: number }>();
    for (const point of baselineSeries) {
      const monthKey = (point.fecha as string).substring(0, 7);
      const entry = byMonth.get(monthKey);
      if (!entry) {
        byMonth.set(monthKey, { first: point.total, last: point.total });
      } else {
        entry.last = point.total;
      }
    }

    let prevLast: number | null = null;
    for (const [monthKey, { first, last }] of byMonth) {
      const startVal = prevLast ?? first;
      if (startVal > 0) {
        returns[monthKey] = ((last / startVal) - 1) * 100;
      }
      prevLast = last;
    }

    return Object.keys(returns).length > 0 ? returns : undefined;
  }, [baselineSeries]);

  // Baseline accumulated return (lines 839-845 of original)
  const baselineAccReturn = useMemo(() => {
    if (!baselineSeries || baselineSeries.length < 2) return null;
    const first = baselineSeries[0].total;
    const last = baselineSeries[baselineSeries.length - 1].total;
    if (first <= 0) return null;
    return ((last / first) - 1) * 100;
  }, [baselineSeries]);

  return {
    benchmarkConfig,
    setBenchmarkConfig,
    benchmarkReturns,
    benchmarkLabel,
    baselineSeries,
    loadingBaseline,
    baselineMonthlyReturns,
    baselineAccReturn,
  };
}
```

- [ ] **Step 2: Update SeguimientoPage to use the hook**

In `SeguimientoPage.tsx`:
1. Add import: `import { useBenchmarkConfig } from "./hooks/useBenchmarkConfig";`
2. Remove all the state/effects listed above
3. Note: `benchmarkConfig` is initially set from `fetchData` response (line 197). Instead, pass it as `initialBenchmarkConfig` to the hook. In `fetchData`, remove `setBenchmarkConfig(result.data.benchmarkConfig)` and instead save it to a local state that's passed to the hook.
4. Add hook call:
```typescript
const {
  benchmarkConfig, setBenchmarkConfig,
  benchmarkReturns, benchmarkLabel,
  baselineSeries, loadingBaseline,
  baselineMonthlyReturns, baselineAccReturn,
} = useBenchmarkConfig({
  snapshots: data?.snapshots,
  clientId,
  initialBenchmarkConfig: data?.benchmarkConfig || null,
});
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add components/seguimiento/hooks/useBenchmarkConfig.ts components/seguimiento/SeguimientoPage.tsx
git commit -m "refactor: extract useBenchmarkConfig hook from SeguimientoPage"
```

---

### Task 4: Extract `CompositionBoxes` sub-component from SeguimientoPage

**Files:**
- Create: `components/seguimiento/CompositionBoxes.tsx`
- Modify: `components/seguimiento/SeguimientoPage.tsx`

This sub-component renders the 4 RV/RF/Alt/Caja boxes with "Desde inicio/Desde fecha" selector (lines 1366-1531 of original).

- [ ] **Step 1: Create the sub-component file**

Create `components/seguimiento/CompositionBoxes.tsx`. Extract the IIFE block from lines 1366-1531 into a proper component. The component receives all data it needs as props.

```typescript
"use client";

import React from "react";
import { formatNumber } from "@/lib/format";
import type { HoldingReturnsData } from "./HoldingReturnsPanel";

interface Snapshot {
  snapshot_date: string;
  cash_value: number;
  source: string;
}

interface Props {
  holdingReturnsData: HoldingReturnsData;
  snapshots: Snapshot[];
  compositionBaseMode: "inicio" | "fecha";
  compositionBaseDate: string;
  onBaseModeChange: (mode: "inicio" | "fecha") => void;
  onBaseDateChange: (date: string) => void;
  convertFromCLP: (clpValue: number, rates: { uf: number; usd: number } | null) => string;
  cartolaExchangeRates: { uf: number; usd: number } | null;
  currentExchangeRates: { uf: number; usd: number } | null;
  exchangeRates: { uf: number; usd: number } | null;
}

// Lines 1366-1531 of original SeguimientoPage — entire IIFE moved verbatim
export default function CompositionBoxes({
  holdingReturnsData,
  snapshots,
  compositionBaseMode,
  compositionBaseDate,
  onBaseModeChange,
  onBaseDateChange,
  convertFromCLP,
  cartolaExchangeRates,
  currentExchangeRates,
  exchangeRates,
}: Props) {
  const d = holdingReturnsData;
  const cashVal = d.cashValue > 0 ? d.cashValue : (snapshots[snapshots.length - 1]?.cash_value || 0);

  const useCustomBase = compositionBaseMode === "fecha" && compositionBaseDate;
  const baseSnap = useCustomBase
    ? (snapshots
        .filter(s => s.snapshot_date <= compositionBaseDate)
        .sort((a, b) => b.snapshot_date.localeCompare(a.snapshot_date))[0] || snapshots[0])
    : snapshots[0];

  const baseLabel = useCustomBase
    ? new Date(baseSnap.snapshot_date + "T12:00:00").toLocaleDateString("es-CL", { day: "numeric", month: "short", year: "2-digit" })
    : "Inicio";

  const initCLP = (h: { marketValue: number; purchasePrice: number; currentPrice: number }) =>
    h.currentPrice > 0 && h.purchasePrice > 0
      ? h.marketValue * (h.purchasePrice / h.currentPrice)
      : h.marketValue;

  const rvInitial = d.equityHoldings.reduce((s, h) => s + initCLP(h), 0);
  const rfInitial = d.fixedIncomeFundHoldings.reduce((s, h) => s + initCLP(h), 0)
    + d.bondHoldings.reduce((s, h) => {
      return s + (h.costBasis > 0 ? h.costBasis : h.marketValue);
    }, 0);
  const altInitial = (d.alternativesHoldings || []).reduce((s, h) => s + initCLP(h), 0);
  const cashInitial = baseSnap?.cash_value || 0;

  const rvFinal = d.equityHoldings.reduce((s, h) => s + h.marketValue, 0);
  const rfFinal = d.fixedIncomeFundHoldings.reduce((s, h) => s + h.marketValue, 0)
    + d.bondHoldings.reduce((s, h) => s + h.marketValue, 0);
  const altFinal = (d.alternativesHoldings || []).reduce((s, h) => s + h.marketValue, 0);

  type SubLine = { label: string; initial: number; final: number };
  type Box = { label: string; initial: number; final: number; pct: number; bg: string; border: string; text: string; textBold: string; subs: SubLine[] };

  const etfsFinal = d.equityHoldings.filter(h => h.assetType === "etf").reduce((s, h) => s + h.marketValue, 0);
  const fondosRVFinal = d.equityHoldings.filter(h => h.assetType === "fund").reduce((s, h) => s + h.marketValue, 0);
  const accionesFinal = d.equityHoldings.filter(h => h.assetType === "stock").reduce((s, h) => s + h.marketValue, 0);
  const fondosRFFinal = d.fixedIncomeFundHoldings.reduce((s, h) => s + h.marketValue, 0);
  const bonosFinal = d.bondHoldings.reduce((s, h) => s + h.marketValue, 0);

  const rvSubDistrib = (subFinal: number) => rvFinal > 0 ? rvInitial * (subFinal / rvFinal) : 0;
  const rfSubDistrib = (subFinal: number) => rfFinal > 0 ? rfInitial * (subFinal / rfFinal) : 0;

  const rvSubs: SubLine[] = [
    etfsFinal > 0 ? { label: "ETFs", initial: rvSubDistrib(etfsFinal), final: etfsFinal } : null,
    fondosRVFinal > 0 ? { label: "Fondos", initial: rvSubDistrib(fondosRVFinal), final: fondosRVFinal } : null,
    accionesFinal > 0 ? { label: "Acciones", initial: rvSubDistrib(accionesFinal), final: accionesFinal } : null,
  ].filter(Boolean) as SubLine[];
  const rfSubs: SubLine[] = [
    fondosRFFinal > 0 ? { label: "Fondos RF", initial: rfSubDistrib(fondosRFFinal), final: fondosRFFinal } : null,
    bonosFinal > 0 ? { label: "Bonos", initial: rfSubDistrib(bonosFinal), final: bonosFinal } : null,
  ].filter(Boolean) as SubLine[];

  const total = d.totalValue || 1;
  const boxes: Box[] = [
    rvFinal > 0 || rvInitial > 0 ? { label: "Renta Variable", initial: rvInitial, final: rvFinal, pct: (rvFinal / total) * 100, bg: "bg-blue-50", border: "border-blue-200", text: "text-blue-600", textBold: "text-blue-800", subs: rvSubs } : null,
    rfFinal > 0 || rfInitial > 0 ? { label: "Renta Fija", initial: rfInitial, final: rfFinal, pct: (rfFinal / total) * 100, bg: "bg-green-50", border: "border-green-200", text: "text-green-600", textBold: "text-green-800", subs: rfSubs } : null,
    altFinal > 0 || altInitial > 0 ? { label: "Alternativos", initial: altInitial, final: altFinal, pct: (altFinal / total) * 100, bg: "bg-orange-50", border: "border-orange-200", text: "text-orange-600", textBold: "text-orange-800", subs: [] } : null,
    cashVal > 0 ? { label: "Caja", initial: cashInitial, final: cashVal, pct: (cashVal / total) * 100, bg: "bg-slate-50", border: "border-slate-200", text: "text-slate-600", textBold: "text-slate-800", subs: [] } : null,
  ].filter(Boolean) as Box[];

  return (
    <>
      <div className="flex items-center gap-3 mb-3">
        <div className="flex rounded-lg border border-gb-border overflow-hidden">
          <button
            onClick={() => onBaseModeChange("inicio")}
            className={`px-3 py-1.5 text-xs font-medium transition-colors ${
              compositionBaseMode === "inicio"
                ? "bg-blue-600 text-white"
                : "bg-white text-gb-gray hover:bg-slate-50"
            }`}
          >
            Desde inicio
          </button>
          <button
            onClick={() => {
              onBaseModeChange("fecha");
              if (!compositionBaseDate && snapshots.length > 1) {
                onBaseDateChange(snapshots[Math.max(0, snapshots.length - 2)].snapshot_date);
              }
            }}
            className={`px-3 py-1.5 text-xs font-medium border-l border-gb-border transition-colors ${
              compositionBaseMode === "fecha"
                ? "bg-blue-600 text-white"
                : "bg-white text-gb-gray hover:bg-slate-50"
            }`}
          >
            Desde fecha
          </button>
        </div>
        {compositionBaseMode === "fecha" && (
          <input
            type="date"
            value={compositionBaseDate}
            onChange={(e) => onBaseDateChange(e.target.value)}
            min={snapshots[0]?.snapshot_date}
            max={snapshots[snapshots.length - 1]?.snapshot_date}
            className="px-2 py-1 text-xs border border-gb-border rounded-lg bg-white text-gb-black focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        )}
      </div>

      <div className="grid grid-cols-4 gap-3 mb-6">
        {boxes.map(b => {
          const ret = b.initial > 0 ? ((b.final / b.initial) - 1) * 100 : 0;
          return (
            <div key={b.label} className={`${b.bg} rounded-lg border ${b.border} p-3 flex flex-col`}>
              <div className="flex items-center justify-between mb-1.5">
                <p className={`text-xs ${b.text} font-medium`}>{b.label}</p>
                <span className={`text-[10px] ${b.text}`}>{formatNumber(b.pct, 1)}%</span>
              </div>
              <div className="flex items-baseline justify-between mb-1">
                <div>
                  <p className="text-[10px] text-gb-gray leading-tight">{baseLabel}</p>
                  <p className={`text-sm font-semibold ${b.textBold}`}>{convertFromCLP(b.initial, cartolaExchangeRates || exchangeRates)}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-gb-gray leading-tight">Actual</p>
                  <p className={`text-sm font-semibold ${b.textBold}`}>{convertFromCLP(b.final, currentExchangeRates || exchangeRates)}</p>
                </div>
              </div>
              {b.initial > 0 && b.label !== "Caja" && (
                <p className={`text-xs font-semibold text-right ${ret >= 0 ? "text-green-600" : "text-red-600"}`}>
                  {ret >= 0 ? "+" : ""}{formatNumber(ret, 1)}%
                </p>
              )}
              {b.subs.length > 0 && (
                <div className="mt-auto pt-1.5 border-t border-black/5 space-y-0.5">
                  {b.subs.map(sub => {
                    const subRet = sub.initial > 0 ? ((sub.final / sub.initial) - 1) * 100 : 0;
                    return (
                      <div key={sub.label} className="flex items-center justify-between text-[10px]">
                        <span className="text-gb-gray">{sub.label}</span>
                        <span className="flex items-center gap-1.5">
                          <span className="text-gb-gray">{convertFromCLP(sub.final, currentExchangeRates || exchangeRates)}</span>
                          {sub.initial > 0 && (
                            <span className={`font-medium ${subRet >= 0 ? "text-green-600" : "text-red-600"}`}>
                              {subRet >= 0 ? "+" : ""}{formatNumber(subRet, 1)}%
                            </span>
                          )}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
```

- [ ] **Step 2: Update SeguimientoPage to use the sub-component**

In `SeguimientoPage.tsx`:
1. Add import: `import CompositionBoxes from "./CompositionBoxes";`
2. Replace the IIFE block (lines 1366-1531 — `{holdingReturnsData && snapshots.length > 0 && (() => { ... })()}`) with:
```tsx
{holdingReturnsData && snapshots.length > 0 && (
  <CompositionBoxes
    holdingReturnsData={holdingReturnsData}
    snapshots={snapshots}
    compositionBaseMode={compositionBaseMode}
    compositionBaseDate={compositionBaseDate}
    onBaseModeChange={setCompositionBaseMode}
    onBaseDateChange={setCompositionBaseDate}
    convertFromCLP={convertFromCLP}
    cartolaExchangeRates={cartolaExchangeRates}
    currentExchangeRates={currentExchangeRates}
    exchangeRates={exchangeRates}
  />
)}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add components/seguimiento/CompositionBoxes.tsx components/seguimiento/SeguimientoPage.tsx
git commit -m "refactor: extract CompositionBoxes sub-component from SeguimientoPage"
```

---

### Task 5: Extract `useSnapshotExchangeRates` and `useAutoMatch` hooks from ReviewSnapshotModal

**Files:**
- Create: `components/seguimiento/hooks/useSnapshotExchangeRates.ts`
- Create: `components/seguimiento/hooks/useAutoMatch.ts`
- Modify: `components/seguimiento/ReviewSnapshotModal.tsx`

- [ ] **Step 1: Create useSnapshotExchangeRates hook**

Create `components/seguimiento/hooks/useSnapshotExchangeRates.ts`. This moves the first useEffect (lines 166-270 of ReviewSnapshotModal) that fetches BCCH+mindicador rates for the cartola date.

```typescript
"use client";

import { useState, useEffect } from "react";

interface ExchangeRates {
  usd: number;
  eur: number;
  uf: number;
}

export function useSnapshotExchangeRates(fechaCartola: string) {
  const [exchangeRates, setExchangeRates] = useState<ExchangeRates | null>(null);
  const [loadingRates, setLoadingRates] = useState(true);
  const [ratesError, setRatesError] = useState<string | null>(null);
  const [usingFallbackRates, setUsingFallbackRates] = useState(false);

  // Lines 166-270 of original ReviewSnapshotModal — copy the entire useEffect verbatim
  useEffect(() => {
    const controller = new AbortController();
    setLoadingRates(true);
    setRatesError(null);

    const fetchRates = async () => {
      try {
        const year = parseInt(fechaCartola.substring(0, 4), 10);
        const years = year === new Date().getFullYear() ? [year] : [year, year + 1];

        let usdRate: number | null = null;
        let ufRate: number | null = null;
        let eurRate: number | null = null;

        // Helper: find closest value <= date
        const findClosest = (serie: Array<{ fecha: string; valor: number }>, targetDate: string): number | null => {
          let best: { fecha: string; valor: number } | null = null;
          for (const entry of serie) {
            const d = entry.fecha.substring(0, 10);
            if (d <= targetDate && (!best || d > best.fecha.substring(0, 10))) {
              best = entry;
            }
          }
          return best?.valor ?? null;
        };

        // Helper: find closest value >= date (for T+1 USD convention)
        const findClosestNext = (serie: Array<{ fecha: string; valor: number }>, targetDate: string): number | null => {
          let best: { fecha: string; valor: number } | null = null;
          for (const entry of serie) {
            const d = entry.fecha.substring(0, 10);
            if (d >= targetDate && (!best || d < best.fecha.substring(0, 10))) {
              best = entry;
            }
          }
          return best?.valor ?? null;
        };

        // Fetch BCCH historical for USD and UF
        const allDolar: Array<{ fecha: string; valor: number }> = [];
        const allUF: Array<{ fecha: string; valor: number }> = [];

        for (const y of years) {
          try {
            const dRes = await fetch(`/api/exchange-rates/historical?indicator=dolar&year=${y}`, { signal: controller.signal });
            const dData = await dRes.json();
            if (dData.serie) allDolar.push(...dData.serie);
          } catch { /* ignore */ }
          try {
            const uRes = await fetch(`/api/exchange-rates/historical?indicator=uf&year=${y}`, { signal: controller.signal });
            const uData = await uRes.json();
            if (uData.serie) allUF.push(...uData.serie);
          } catch { /* ignore */ }
        }

        // UF: same day (no T+1)
        ufRate = findClosest(allUF, fechaCartola);

        // USD: T+1 convention (observado del dia siguiente)
        const nextDay = new Date(fechaCartola + "T12:00:00");
        nextDay.setDate(nextDay.getDate() + 1);
        const nextDayStr = nextDay.toISOString().split("T")[0];
        usdRate = findClosestNext(allDolar, nextDayStr);

        // EUR from mindicador.cl
        try {
          const eurYear = parseInt(fechaCartola.substring(0, 4), 10);
          const eurMonth = parseInt(fechaCartola.substring(5, 7), 10);
          const eurRes = await fetch(`https://mindicador.cl/api/euro/${eurMonth < 10 ? "0" + eurMonth : eurMonth}-${eurYear}`, { signal: controller.signal });
          const eurData = await eurRes.json();
          if (eurData.serie) {
            eurRate = findClosest(eurData.serie, fechaCartola);
          }
        } catch { /* ignore */ }

        if (usdRate && ufRate) {
          setExchangeRates({ usd: usdRate, eur: eurRate || 0, uf: ufRate });
          setUsingFallbackRates(false);
        } else {
          // Fallback to current rates
          try {
            const fallbackRes = await fetch("/api/exchange-rates", { signal: controller.signal });
            const fallbackData = await fallbackRes.json();
            if (fallbackData.success) {
              setExchangeRates({ usd: fallbackData.usd, eur: fallbackData.eur || 0, uf: fallbackData.uf });
              setUsingFallbackRates(true);
            }
          } catch {
            setRatesError("No se pudieron obtener tipos de cambio");
          }
        }
      } catch (err) {
        if (!(err instanceof DOMException && err.name === "AbortError")) {
          console.error("Error fetching exchange rates:", err);
          setRatesError("Error al obtener tipos de cambio");
        }
      } finally {
        setLoadingRates(false);
      }
    };

    fetchRates();

    return () => controller.abort();
  }, [fechaCartola]);

  return { exchangeRates, loadingRates, ratesError, usingFallbackRates };
}
```

**Note:** The implementer MUST read the actual useEffect at lines 166-270 of ReviewSnapshotModal and copy it EXACTLY. The code above is a faithful reconstruction but the exact formatting and edge cases must match the original.

- [ ] **Step 2: Create useAutoMatch hook**

Create `components/seguimiento/hooks/useAutoMatch.ts`. This moves:
- `useState` for `matchSuggestions` (153), `autoMatchLoading` (154), `autoMatchComplete` (156), `unmatchedIndices` (158), `autoAppliedCount` (160), `pendingSearchIndex` (162)
- `useEffect` for auto-matching (lines 274-417)
- Functions: `applyMatchSuggestion` (773-807), `dismissMatchSuggestion` (810-816), `applyAllSuggestions` (819-846)

```typescript
"use client";

import { useState, useEffect, useCallback } from "react";

interface Holding {
  fundName: string;
  securityId?: string | null;
  serie?: string;
  quantity?: number;
  marketPrice?: number;
  marketValue: number;
  assetClass?: string;
  assetType?: string;
  currency?: string;
}

interface MatchSuggestion {
  index: number;
  matched: boolean;
  matchType?: "fund" | "stock";
  confidence: "high" | "medium" | "low";
  matchedName?: string;
  matchedId?: string;
  matchedSerie?: string;
  price?: number;
  currency?: string;
  source?: string;
  assetClass?: string;
  familiaEstudios?: string;
  applied?: boolean;
  dismissed?: boolean;
}

interface UseAutoMatchOptions {
  holdings: Holding[];
  setHoldings: React.Dispatch<React.SetStateAction<Holding[]>>;
  editMode: boolean;
  sources?: string[];
  fechaCartola: string;
}

export function useAutoMatch({
  holdings,
  setHoldings,
  editMode,
  sources,
  fechaCartola,
}: UseAutoMatchOptions) {
  const [matchSuggestions, setMatchSuggestions] = useState<MatchSuggestion[]>([]);
  const [autoMatchLoading, setAutoMatchLoading] = useState(false);
  const [autoMatchComplete, setAutoMatchComplete] = useState(false);
  const [unmatchedIndices, setUnmatchedIndices] = useState<Set<number>>(new Set());
  const [autoAppliedCount, setAutoAppliedCount] = useState(0);
  const [pendingSearchIndex, setPendingSearchIndex] = useState<number | null>(null);

  // Auto-match on mount (lines 274-417 of original — copy EXACTLY)
  // The implementer MUST read the actual useEffect and copy it verbatim.
  // Key: Skip in editMode. Filter out bonds/cash. Call POST /api/fondos/match-holdings.
  // Auto-apply high-confidence matches. Set pendingSearchIndex for first unmatched.
  useEffect(() => {
    if (editMode) {
      setAutoMatchComplete(true);
      return;
    }

    const matchable = holdings
      .map((h, i) => ({ ...h, _origIndex: i }))
      .filter(h => h.assetType !== "bond" && h.assetType !== "cash");

    if (matchable.length === 0) {
      setAutoMatchComplete(true);
      return;
    }

    setAutoMatchLoading(true);

    const autoMatchHoldings = async () => {
      try {
        const res = await fetch("/api/fondos/match-holdings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            holdings: matchable.map(h => ({
              fundName: h.fundName,
              securityId: h.securityId,
              quantity: h.quantity,
              marketValue: h.marketValue,
              marketPrice: h.marketPrice,
            })),
            cartolaSource: sources,
            cartolaDate: fechaCartola,
          }),
        });

        if (!res.ok) {
          console.warn("[auto-match] API error:", res.status);
          setAutoMatchComplete(true);
          return;
        }

        const result = await res.json();
        if (!result.success || !result.matches) {
          setAutoMatchComplete(true);
          return;
        }

        // Remap indices from matchable subset to original holdings
        const remapped: MatchSuggestion[] = result.matches.map((m: MatchSuggestion) => ({
          ...m,
          index: matchable[m.index]._origIndex,
        }));

        const relevant = remapped.filter(m => m.matched && m.matchedName);
        const unmatched = new Set<number>();

        for (const m of remapped) {
          if (!m.matched) {
            unmatched.add(m.index);
          }
        }

        // Auto-apply high-confidence matches
        const updated = [...holdings];
        let appliedCount = 0;

        for (const m of relevant) {
          if (m.confidence === "high") {
            const h = updated[m.index];
            if (h) {
              h.securityId = m.matchedId || h.securityId;
              h.serie = m.matchedSerie || h.serie;
              h.currency = m.currency || h.currency;
              if (m.assetClass) h.assetClass = m.assetClass;

              if (m.matchType !== "stock" && m.price && h.quantity) {
                h.marketPrice = m.price;
                h.marketValue = h.quantity * m.price;
              }

              m.applied = true;
              appliedCount++;
            }
          } else if (m.confidence === "medium" && m.assetClass) {
            const h = updated[m.index];
            if (h) h.assetClass = m.assetClass;
          }
        }

        setMatchSuggestions(relevant);
        setUnmatchedIndices(unmatched);
        setAutoAppliedCount(appliedCount);
        setHoldings(updated);

        // Set pending search for first unmatched
        const firstUnmatched = [...unmatched].sort((a, b) => a - b)[0];
        if (firstUnmatched !== undefined) {
          setPendingSearchIndex(firstUnmatched);
        }

        console.log(`[auto-match] total=${matchable.length}, matched=${relevant.length}, autoApplied=${appliedCount}, unmatched=${unmatched.size}`);
      } catch (err) {
        console.error("[auto-match] Error:", err);
      } finally {
        setAutoMatchLoading(false);
        setAutoMatchComplete(true);
      }
    };

    autoMatchHoldings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Apply a single suggestion (lines 773-807 of original)
  const applyMatchSuggestion = useCallback((suggestion: MatchSuggestion) => {
    setHoldings(prev => {
      const updated = [...prev];
      const h = updated[suggestion.index];
      if (h) {
        h.securityId = suggestion.matchedId || h.securityId;
        h.serie = suggestion.matchedSerie || h.serie;
        h.currency = suggestion.currency || h.currency;
        if (suggestion.assetClass) h.assetClass = suggestion.assetClass;
        if (suggestion.price && h.quantity) {
          h.marketPrice = suggestion.price;
          h.marketValue = h.quantity * suggestion.price;
        }
      }
      return updated;
    });
    setUnmatchedIndices(prev => {
      const next = new Set(prev);
      next.delete(suggestion.index);
      return next;
    });
    setMatchSuggestions(prev =>
      prev.map(m => m.index === suggestion.index ? { ...m, applied: true } : m)
    );
  }, [setHoldings]);

  // Dismiss a suggestion (lines 810-816 of original)
  const dismissMatchSuggestion = useCallback((index: number) => {
    setMatchSuggestions(prev =>
      prev.map(m => m.index === index ? { ...m, dismissed: true } : m)
    );
  }, []);

  // Apply all high-confidence suggestions (lines 819-846 of original)
  const applyAllSuggestions = useCallback(() => {
    const toApply = matchSuggestions.filter(m => !m.applied && !m.dismissed && m.confidence === "high");
    if (toApply.length === 0) return;

    setHoldings(prev => {
      const updated = [...prev];
      for (const m of toApply) {
        const h = updated[m.index];
        if (h) {
          h.securityId = m.matchedId || h.securityId;
          h.serie = m.matchedSerie || h.serie;
          h.currency = m.currency || h.currency;
          if (m.assetClass) h.assetClass = m.assetClass;
          if (m.price && h.quantity) {
            h.marketPrice = m.price;
            h.marketValue = h.quantity * m.price;
          }
        }
      }
      return updated;
    });
    setMatchSuggestions(prev =>
      prev.map(m => toApply.some(t => t.index === m.index) ? { ...m, applied: true } : m)
    );
  }, [matchSuggestions, setHoldings]);

  return {
    matchSuggestions,
    autoMatchLoading,
    autoMatchComplete,
    unmatchedIndices,
    setUnmatchedIndices,
    autoAppliedCount,
    pendingSearchIndex,
    setPendingSearchIndex,
    applyMatchSuggestion,
    dismissMatchSuggestion,
    applyAllSuggestions,
  };
}
```

- [ ] **Step 3: Update ReviewSnapshotModal to use both hooks**

In `ReviewSnapshotModal.tsx`:
1. Add imports for both hooks
2. Remove the extracted state, effects, and functions
3. Add hook calls:
```typescript
const { exchangeRates, loadingRates, ratesError, usingFallbackRates } = useSnapshotExchangeRates(fechaCartola);

const {
  matchSuggestions, autoMatchLoading, autoMatchComplete,
  unmatchedIndices, setUnmatchedIndices, autoAppliedCount,
  pendingSearchIndex, setPendingSearchIndex,
  applyMatchSuggestion, dismissMatchSuggestion, applyAllSuggestions,
} = useAutoMatch({
  holdings,
  setHoldings,
  editMode: editMode || false,
  sources,
  fechaCartola,
});
```

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 5: Run tests**

Run: `npm run test:run`
Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add components/seguimiento/hooks/useSnapshotExchangeRates.ts components/seguimiento/hooks/useAutoMatch.ts components/seguimiento/ReviewSnapshotModal.tsx
git commit -m "refactor: extract useSnapshotExchangeRates and useAutoMatch hooks from ReviewSnapshotModal"
```

---

### Task 6: Extract `useSnapshotForm` hook from ReviewSnapshotModal

**Files:**
- Create: `components/seguimiento/hooks/useSnapshotForm.ts`
- Modify: `components/seguimiento/ReviewSnapshotModal.tsx`

This hook encapsulates the editable holdings array, total computations, composition, and all field change handlers.

- [ ] **Step 1: Create the hook file**

Create `components/seguimiento/hooks/useSnapshotForm.ts`. This moves:
- `useState` for `holdings` (128), `fechaCartola` (130), `consolidationCurrency` (140), `deposits/withdrawals` (143-146), `saving/savingMsg/error` (148-150)
- Event handlers: `handleAssetClassChange` (617-621), `handleValueChange` (623-627), `handleCurrencyChange` (629-633), `handleQuantityChange` (635-645), `handlePriceChange` (647-657), `handlePurchaseDateChange` (659-663)
- `useCallback` for `toCLP` (533-542), `fromCLP` (544-553)
- `useMemo` for `totalsByCurrency, consolidatedTotal, totalInCLP` (556-571), `netCashFlowCLP` (574-578), `composition` (581-609), `uniqueSources` (612-615)
- `getInitialHoldings()` function (116-126)

The implementer MUST read the exact code from ReviewSnapshotModal lines 116-663 and copy it verbatim into this hook. The hook receives `parsedData`, `editMode`, `existingSnapshot`, `sources`, `exchangeRates` as parameters.

The hook returns: `{ holdings, setHoldings, fechaCartola, setFechaCartola, consolidationCurrency, setConsolidationCurrency, deposits, setDeposits, withdrawals, setWithdrawals, depositsCurrency, setDepositsCurrency, withdrawalsCurrency, setWithdrawalsCurrency, saving, setSaving, savingMsg, setSavingMsg, error, setError, toCLP, fromCLP, totalsByCurrency, consolidatedTotal, totalInCLP, netCashFlowCLP, composition, uniqueSources, handleAssetClassChange, handleValueChange, handleCurrencyChange, handleQuantityChange, handlePriceChange, handlePurchaseDateChange }`

- [ ] **Step 2: Update ReviewSnapshotModal to use the hook**

Replace all extracted state/logic with the hook call.

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add components/seguimiento/hooks/useSnapshotForm.ts components/seguimiento/ReviewSnapshotModal.tsx
git commit -m "refactor: extract useSnapshotForm hook from ReviewSnapshotModal"
```

---

### Task 7: Extract `useClientData` and `useClientModals` hooks from ClientDetail

**Files:**
- Create: `components/clients/hooks/useClientData.ts`
- Create: `components/clients/hooks/useClientModals.ts`
- Modify: `components/clients/ClientDetail.tsx`

- [ ] **Step 1: Create useClientData hook**

Create `components/clients/hooks/useClientData.ts`. This moves:
- `useState` for `client` (120), `loading` (121), `editForm` (141-150), `saving` (133), `showEditModal` (124)
- `useCallback` for `fetchClient` (173-187)
- `useEffect` for initial fetch (189-191)
- Functions: `openEditModal` (290-304), `handleSaveEdit` (305-332), `updateQuestionnaireFrequency` (486-498), `updateFundMode` (499-511)
- Status change handler (inline onChange at ~556)
- Risk profile change handler (inline PATCH at ~1166)

The implementer MUST read the exact functions from ClientDetail and copy verbatim.

- [ ] **Step 2: Create useClientModals hook**

Create `components/clients/hooks/useClientModals.ts`. This moves:
- `useState` for `showAddInteraction` (122), `showDeleteConfirm` (123), `showAddFamilyModal` (153), `showShareModal` (159), `editingServicios` (125)
- Associated form state: `newInteraction` (134-140), `familyForm` (165-171), `serviciosForm` (127-131)
- Associated loading state: `deleting` (132), `inviting` (154), `inviteSuccess` (155), `portalLink` (156), `uploadingContract` (157), `contractError` (158), `savingFamily` (164), `savingServicios` (126), `shareLoading` (163), `sharingWith` (162), `shareAdvisors` (160), `currentShares` (161)

The hook returns all state and setters. Functions like `handleAddInteraction`, `handleDeleteClient`, `handleShare`, `handleUnshare`, etc. stay in the hook.

- [ ] **Step 3: Update ClientDetail to use both hooks**

Replace extracted state/logic with hook calls.

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add components/clients/hooks/useClientData.ts components/clients/hooks/useClientModals.ts components/clients/ClientDetail.tsx
git commit -m "refactor: extract useClientData and useClientModals hooks from ClientDetail"
```

---

### Task 8: Extract `ClientInfoCard` sub-component from ClientDetail

**Files:**
- Create: `components/clients/ClientInfoCard.tsx`
- Modify: `components/clients/ClientDetail.tsx`

- [ ] **Step 1: Create the sub-component**

Create `components/clients/ClientInfoCard.tsx`. This moves the JSX from approximately lines 1049-1364 of ClientDetail (the left column of the 3-column layout):
- Contact card (email, phone, RUT)
- Family group card
- Financial card (patrimonio, income)
- Risk profile card (perfil dropdown, score bar, questionnaire frequency)
- Goals card (objetivo, horizonte)
- Fund selection mode card
- Contract card (upload/download/delete)
- Notes card
- Servicios adicionales card

The component receives `client`, all edit handlers, modal openers, and utility functions as props.

The implementer MUST read the exact JSX from ClientDetail and move it verbatim.

- [ ] **Step 2: Update ClientDetail to use the sub-component**

Replace the left column JSX with `<ClientInfoCard ... />`.

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add components/clients/ClientInfoCard.tsx components/clients/ClientDetail.tsx
git commit -m "refactor: extract ClientInfoCard sub-component from ClientDetail"
```

---

### Task 9: Extract `useBondCalculations` and `useHoldingQuotes` hooks from HoldingReturnsPanel

**Files:**
- Create: `components/seguimiento/hooks/useBondCalculations.ts`
- Create: `components/seguimiento/hooks/useHoldingQuotes.ts`
- Modify: `components/seguimiento/HoldingReturnsPanel.tsx`

- [ ] **Step 1: Create useBondCalculations hook**

Create `components/seguimiento/hooks/useBondCalculations.ts`. This moves the `bondHoldings` useMemo (lines 596-747 of HoldingReturnsPanel) — the entire bond calculation pipeline including:
- Bond parameter extraction
- YTM and duration calculation via `calcYieldToMaturity`, `calcModifiedDuration`
- Devengo (linear accrual) via `calcBondPeriodReturn`
- Market deviation via duration
- Total return % calculation
- Market value calculation (Chilean UF vs International USD)
- Currency conversion to CLP

The hook receives: `enrichedSummaries`, `previousSnapshotDate`, `snapshots`, `bondPrices`, `ufRate`, `ufRateInitial`, `usdRate`
The hook returns: `bondHoldings` (array of BondHoldingRow)

The implementer MUST copy the bond calculation pipeline EXACTLY — no formula changes.

- [ ] **Step 2: Create useHoldingQuotes hook**

Create `components/seguimiento/hooks/useHoldingQuotes.ts`. This moves the 3 useEffect blocks that fetch market data (lines 338-456 of HoldingReturnsPanel):
- Fetch market prices for non-bond holdings (338-393)
- Fetch bond lookups from `/api/bonds/lookup/` (396-424)
- Fetch latest bond prices from `/api/bonds/latest-prices` (427-456)

The hook receives: `holdingSummaries` (from the main useMemo)
The hook returns: `{ marketPrices, bondLookups, bondPrices, loadingPrices }`

- [ ] **Step 3: Update HoldingReturnsPanel to use both hooks**

Replace extracted state/effects/memos with hook calls.

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add components/seguimiento/hooks/useBondCalculations.ts components/seguimiento/hooks/useHoldingQuotes.ts components/seguimiento/HoldingReturnsPanel.tsx
git commit -m "refactor: extract useBondCalculations and useHoldingQuotes hooks from HoldingReturnsPanel"
```

---

### Task 10: Final build verification and documentation update

**Files:**
- Modify: `docs/GREYBARK-ARCHITECTURE.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Full build**

Run: `npm run build`
Expected: Build succeeds with zero errors.

- [ ] **Step 2: Full test suite**

Run: `npm run test:run`
Expected: All tests pass (330+ tests).

- [ ] **Step 3: Update GREYBARK-ARCHITECTURE.md**

Add a note about the hooks directory pattern under the components section:
```markdown
### Hooks Pattern
Large components use extracted hooks in `hooks/` subdirectories:
- `components/seguimiento/hooks/` — useExchangeRates, useHistoricalSeries, useBenchmarkConfig, useSnapshotExchangeRates, useAutoMatch, useSnapshotForm, useBondCalculations, useHoldingQuotes
- `components/clients/hooks/` — useClientData, useClientModals
```

- [ ] **Step 4: Update CLAUDE.md**

In the directory layout section, add:
```markdown
- `components/seguimiento/hooks/` — Extracted hooks for SeguimientoPage, ReviewSnapshotModal, HoldingReturnsPanel
- `components/clients/hooks/` — Extracted hooks for ClientDetail
```

- [ ] **Step 5: Commit**

```bash
git add docs/GREYBARK-ARCHITECTURE.md CLAUDE.md
git commit -m "docs: document extracted hooks pattern after component refactoring"
```

---

## File Structure Summary

```
components/seguimiento/
  SeguimientoPage.tsx                    (~600 lines, down from 2106)
  CompositionBoxes.tsx                   (~200 lines, NEW)
  ReviewSnapshotModal.tsx                (~500 lines, down from 1725)
  HoldingReturnsPanel.tsx                (~350 lines, down from 927)
  hooks/
    useExchangeRates.ts                  (~120 lines, for SeguimientoPage)
    useHistoricalSeries.ts               (~250 lines, for SeguimientoPage)
    useBenchmarkConfig.ts                (~150 lines, for SeguimientoPage)
    useSnapshotExchangeRates.ts          (~120 lines, for ReviewSnapshotModal)
    useAutoMatch.ts                      (~200 lines, for ReviewSnapshotModal)
    useSnapshotForm.ts                   (~200 lines, for ReviewSnapshotModal)
    useBondCalculations.ts               (~200 lines, for HoldingReturnsPanel)
    useHoldingQuotes.ts                  (~120 lines, for HoldingReturnsPanel)

components/clients/
  ClientDetail.tsx                       (~500 lines, down from 1734)
  ClientInfoCard.tsx                     (~400 lines, NEW)
  hooks/
    useClientData.ts                     (~200 lines)
    useClientModals.ts                   (~300 lines)
```

## Dependency Order

Tasks 1-4 modify SeguimientoPage (sequential — each builds on the previous).
Task 5-6 modify ReviewSnapshotModal (sequential).
Tasks 7-8 modify ClientDetail (sequential).
Task 9 modifies HoldingReturnsPanel (independent).
Task 10 is final verification (depends on all previous).

Safe parallel groups: [1-4], [5-6], [7-8], [9] can run independently across different components, but tasks within each group must be sequential.
