"use client";

import React, { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
} from "recharts";
import { GitCompare } from "lucide-react";
import { formatNumber } from "@/lib/format";
import type { Snapshot } from "./SeguimientoPage";

interface HistoricalPoint {
  fecha: string;
  total: number;
  [key: string]: string | number;
}

interface Props {
  snapshots: Snapshot[];
  historicalSeries?: HistoricalPoint[];
  benchmarkLabel?: string; // e.g. "UF +2%"
  benchmarkMonthlyReturn?: number; // fixed monthly return for simple benchmarks (e.g. 0.5 for UF+2%/12)
  /** Optional: actual monthly benchmark returns keyed by "YYYY-MM" */
  benchmarkReturns?: Record<string, number>;
  /** Optional: second comparison series (e.g. "Portafolio Banchile" or modelo) */
  comparisonLabel?: string;
  comparisonReturns?: Record<string, number>;
}

interface MonthData {
  monthKey: string;
  label: string;
  portfolio: number;
  benchmark: number | null;
  comparison: number | null;
}

export default function RetornosComparados({
  snapshots,
  historicalSeries,
  benchmarkLabel = "UF +2%",
  benchmarkMonthlyReturn,
  benchmarkReturns,
  comparisonLabel,
  comparisonReturns,
}: Props) {
  const chartData = useMemo(() => {
    // Derive monthly portfolio returns from historicalSeries (daily prices) when available
    // This gives proper month-by-month granularity even with few cartola snapshots
    const monthlyPortfolioReturns = new Map<string, number>();
    let accumPortfolio = 0;

    if (historicalSeries && historicalSeries.length > 1) {
      // Group historical points by month, get first and last value per month
      const byMonth = new Map<string, { first: number; last: number; firstDate: string; lastDate: string }>();
      for (const p of historicalSeries) {
        const fecha = typeof p.fecha === "string" ? p.fecha : String(p.fecha);
        const ym = fecha.slice(0, 7); // "YYYY-MM"
        const total = typeof p.total === "number" ? p.total : Number(p.total);
        if (total <= 0) continue;
        const existing = byMonth.get(ym);
        if (!existing) {
          byMonth.set(ym, { first: total, last: total, firstDate: fecha, lastDate: fecha });
        } else {
          if (fecha < existing.firstDate) { existing.first = total; existing.firstDate = fecha; }
          if (fecha > existing.lastDate) { existing.last = total; existing.lastDate = fecha; }
        }
      }

      const monthKeys = Array.from(byMonth.keys()).sort();
      for (let i = 1; i < monthKeys.length; i++) {
        const prevMonth = byMonth.get(monthKeys[i - 1])!;
        const currMonth = byMonth.get(monthKeys[i])!;
        // Return = currMonth.last / prevMonth.last - 1
        if (prevMonth.last > 0) {
          const ret = ((currMonth.last / prevMonth.last) - 1) * 100;
          monthlyPortfolioReturns.set(monthKeys[i], ret);
        }
      }

      // Accumulated from first point to last point
      const firstTotal = historicalSeries[0].total;
      const lastTotal = historicalSeries[historicalSeries.length - 1].total;
      if (typeof firstTotal === "number" && typeof lastTotal === "number" && firstTotal > 0) {
        accumPortfolio = ((lastTotal / firstTotal) - 1) * 100;
      }
    }

    const useHistorical = monthlyPortfolioReturns.size > 0;

    if (!useHistorical) {
      // Fallback: use snapshots (original logic)
      if (snapshots.length < 2) return [];

      const sorted = [...snapshots].sort(
        (a, b) => new Date(a.snapshot_date).getTime() - new Date(b.snapshot_date).getTime()
      );

      const byMonth = new Map<string, Snapshot>();
      for (const s of sorted) {
        const d = new Date(s.snapshot_date);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        byMonth.set(key, s);
      }

      const monthKeys = Array.from(byMonth.keys()).sort();
      const months: MonthData[] = [];

      if (monthKeys.length >= 2) {
        for (let i = 1; i < monthKeys.length; i++) {
          const prev = byMonth.get(monthKeys[i - 1])!;
          const curr = byMonth.get(monthKeys[i])!;
          const d = new Date(curr.snapshot_date);
          const label = d.toLocaleDateString("es-CL", { month: "short", year: "2-digit" }).replace(".", "");
          const portfolioReturn = prev.total_value > 0
            ? ((curr.total_value - prev.total_value) / prev.total_value) * 100 : 0;

          let benchReturn: number | null = null;
          if (benchmarkReturns && benchmarkReturns[monthKeys[i]] != null) benchReturn = benchmarkReturns[monthKeys[i]];
          else if (benchmarkMonthlyReturn != null) benchReturn = benchmarkMonthlyReturn;

          let compReturn: number | null = null;
          if (comparisonReturns && comparisonReturns[monthKeys[i]] != null) compReturn = comparisonReturns[monthKeys[i]];

          months.push({
            monthKey: monthKeys[i],
            label,
            portfolio: parseFloat(portfolioReturn.toFixed(2)),
            benchmark: benchReturn != null ? parseFloat(benchReturn.toFixed(2)) : null,
            comparison: compReturn != null ? parseFloat(compReturn.toFixed(2)) : null,
          });
        }
      }

      if (months.length > 0) {
        const accumP = sorted[0].total_value > 0
          ? ((sorted[sorted.length - 1].total_value - sorted[0].total_value) / sorted[0].total_value) * 100 : 0;
        let accumBench: number | null = null;
        if (benchmarkMonthlyReturn != null || benchmarkReturns) {
          let compound = 1;
          for (const m of months) { if (m.benchmark != null) compound *= 1 + m.benchmark / 100; }
          accumBench = (compound - 1) * 100;
        }
        months.push({
          monthKey: "_acum", label: "Acumulado",
          portfolio: parseFloat(accumP.toFixed(2)),
          benchmark: accumBench != null ? parseFloat(accumBench.toFixed(2)) : null,
          comparison: null,
        });
      }

      return months;
    }

    // Use historicalSeries-derived monthly returns
    const sortedKeys = Array.from(monthlyPortfolioReturns.keys()).sort();
    const months: MonthData[] = [];

    for (const key of sortedKeys) {
      const [y, m] = key.split("-").map(Number);
      const d = new Date(y, m - 1, 1);
      const label = d.toLocaleDateString("es-CL", { month: "short", year: "2-digit" }).replace(".", "");

      const portfolioReturn = monthlyPortfolioReturns.get(key) ?? 0;

      let benchReturn: number | null = null;
      if (benchmarkReturns && benchmarkReturns[key] != null) benchReturn = benchmarkReturns[key];
      else if (benchmarkMonthlyReturn != null) benchReturn = benchmarkMonthlyReturn;

      let compReturn: number | null = null;
      if (comparisonReturns && comparisonReturns[key] != null) compReturn = comparisonReturns[key];

      months.push({
        monthKey: key,
        label,
        portfolio: parseFloat(portfolioReturn.toFixed(2)),
        benchmark: benchReturn != null ? parseFloat(benchReturn.toFixed(2)) : null,
        comparison: compReturn != null ? parseFloat(compReturn.toFixed(2)) : null,
      });
    }

    // Accumulated
    if (months.length > 0) {
      let accumBench: number | null = null;
      if (benchmarkMonthlyReturn != null || benchmarkReturns) {
        let compound = 1;
        for (const m of months) { if (m.benchmark != null) compound *= 1 + m.benchmark / 100; }
        accumBench = (compound - 1) * 100;
      }
      let accumComp: number | null = null;
      if (comparisonReturns) {
        let compound = 1;
        for (const m of months) { if (m.comparison != null) compound *= 1 + m.comparison / 100; }
        accumComp = (compound - 1) * 100;
      }

      months.push({
        monthKey: "_acum",
        label: "Acumulado",
        portfolio: parseFloat(accumPortfolio.toFixed(2)),
        benchmark: accumBench != null ? parseFloat(accumBench.toFixed(2)) : null,
        comparison: accumComp != null ? parseFloat(accumComp.toFixed(2)) : null,
      });
    }

    return months;
  }, [snapshots, historicalSeries, benchmarkMonthlyReturn, benchmarkReturns, comparisonReturns]);

  if (chartData.length === 0) return null;

  const hasBenchmark = chartData.some((d) => d.benchmark != null);
  const hasComparison = chartData.some((d) => d.comparison != null);

  return (
    <div className="bg-white rounded-lg border border-gb-border shadow-sm p-6">
      <h3 className="text-base font-semibold text-gb-black flex items-center gap-2 mb-4">
        <GitCompare className="w-5 h-5 text-blue-500" />
        Retornos Comparados
      </h3>

      <div style={{ height: 350 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 10, right: 20, bottom: 5, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" fontSize={11} />
            <YAxis
              tickFormatter={(v: number) => `${v.toFixed(1)}%`}
              fontSize={11}
            />
            <Tooltip
              formatter={(value: number | undefined, name: string | undefined) => [
                `${formatNumber(value ?? 0, 2)}%`,
                name ?? "",
              ]}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <ReferenceLine y={0} stroke="#94a3b8" />
            <Bar
              dataKey="portfolio"
              name="Portafolio"
              fill="#22c55e"
              radius={[4, 4, 0, 0]}
              maxBarSize={40}
            />
            {hasBenchmark && (
              <Bar
                dataKey="benchmark"
                name={benchmarkLabel}
                fill="#eab308"
                radius={[4, 4, 0, 0]}
                maxBarSize={40}
              />
            )}
            {hasComparison && (
              <Bar
                dataKey="comparison"
                name={comparisonLabel || "Comparación"}
                fill="#ef4444"
                radius={[4, 4, 0, 0]}
                maxBarSize={40}
              />
            )}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Summary table below chart */}
      {chartData.length > 1 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gb-border">
                <th className="text-left py-1.5 px-2 text-gb-gray font-medium">Período</th>
                <th className="text-right py-1.5 px-2 text-gb-gray font-medium">Portafolio</th>
                {hasBenchmark && (
                  <th className="text-right py-1.5 px-2 text-gb-gray font-medium">{benchmarkLabel}</th>
                )}
                {hasComparison && (
                  <th className="text-right py-1.5 px-2 text-gb-gray font-medium">{comparisonLabel}</th>
                )}
                {hasBenchmark && (
                  <th className="text-right py-1.5 px-2 text-gb-gray font-medium">Diferencia</th>
                )}
              </tr>
            </thead>
            <tbody>
              {chartData.map((d) => {
                const diff = d.benchmark != null ? d.portfolio - d.benchmark : null;
                const isAccum = d.monthKey === "_acum";
                return (
                  <tr
                    key={d.monthKey}
                    className={`border-b border-gb-border/30 ${isAccum ? "font-semibold bg-gb-light/30" : ""}`}
                  >
                    <td className="py-1.5 px-2 text-gb-black">{d.label}</td>
                    <td className={`py-1.5 px-2 text-right ${d.portfolio >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {formatNumber(d.portfolio, 2)}%
                    </td>
                    {hasBenchmark && (
                      <td className="py-1.5 px-2 text-right text-gb-gray">
                        {d.benchmark != null ? `${formatNumber(d.benchmark, 2)}%` : "—"}
                      </td>
                    )}
                    {hasComparison && (
                      <td className="py-1.5 px-2 text-right text-gb-gray">
                        {d.comparison != null ? `${formatNumber(d.comparison, 2)}%` : "—"}
                      </td>
                    )}
                    {hasBenchmark && (
                      <td className={`py-1.5 px-2 text-right font-medium ${
                        diff != null && diff >= 0 ? "text-green-600" : "text-red-600"
                      }`}>
                        {diff != null ? `${diff >= 0 ? "+" : ""}${formatNumber(diff, 2)}%` : "—"}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
