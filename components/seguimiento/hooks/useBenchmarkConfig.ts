"use client";

import { useState, useEffect, useMemo } from "react";
import type { BenchmarkComponent } from "@/lib/prices/types";

interface Snapshot {
  id: string;
  snapshot_date: string;
  source: string;
  is_baseline?: boolean;
  total_value: number;
}

interface UseBenchmarkConfigOptions {
  snapshots: Snapshot[] | undefined;
  clientId: string;
  initialBenchmarkConfig: BenchmarkComponent[] | null;
}

interface UseBenchmarkConfigReturn {
  benchmarkConfig: BenchmarkComponent[] | null;
  setBenchmarkConfig: React.Dispatch<React.SetStateAction<BenchmarkComponent[] | null>>;
  benchmarkReturns: Record<string, number> | null;
  benchmarkLabel: string;
  baselineSeries: Array<{ fecha: string; total: number }> | null;
  loadingBaseline: boolean;
  baselineMonthlyReturns: Record<string, number> | undefined;
  baselineAccReturn: number | null;
}

export function useBenchmarkConfig({
  snapshots,
  clientId,
  initialBenchmarkConfig,
}: UseBenchmarkConfigOptions): UseBenchmarkConfigReturn {
  const [benchmarkConfig, setBenchmarkConfig] = useState<BenchmarkComponent[] | null>(null);
  const [benchmarkReturns, setBenchmarkReturns] = useState<Record<string, number> | null>(null);
  const [benchmarkLabel, setBenchmarkLabel] = useState("UF +2%");
  const [baselineSeries, setBaselineSeries] = useState<Array<{ fecha: string; total: number }> | null>(null);
  const [loadingBaseline, setLoadingBaseline] = useState(false);

  // Sync initialBenchmarkConfig when it arrives
  useEffect(() => {
    if (initialBenchmarkConfig) {
      setBenchmarkConfig(initialBenchmarkConfig);
    }
  }, [initialBenchmarkConfig]);

  // Fetch benchmark returns when config and snapshots are available
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

  // Fetch baseline evolution (portfolio inicial revalorizado)
  useEffect(() => {
    if (!snapshots || snapshots.length === 0) return;

    const baseline = snapshots.find((s) => s.is_baseline);
    const latestSnap = snapshots[snapshots.length - 1];
    // Only fetch if baseline exists and is different from latest snapshot
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

  // Calculate monthly returns from baseline series for RetornosComparados
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

  // Baseline accumulated return for summary cards
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
