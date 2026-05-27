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

interface Props {
  snapshots: Snapshot[];
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
  benchmarkLabel = "UF +2%",
  benchmarkMonthlyReturn,
  benchmarkReturns,
  comparisonLabel,
  comparisonReturns,
}: Props) {
  const chartData = useMemo(() => {
    if (snapshots.length < 2) return [];

    const sorted = [...snapshots].sort(
      (a, b) => new Date(a.snapshot_date).getTime() - new Date(b.snapshot_date).getTime()
    );

    // Group snapshots by YYYY-MM, keep last snapshot per month
    const byMonth = new Map<string, Snapshot>();
    for (const s of sorted) {
      const d = new Date(s.snapshot_date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      byMonth.set(key, s); // overwrites, keeping last per month
    }

    const monthKeys = Array.from(byMonth.keys()).sort();
    if (monthKeys.length < 2) return [];

    const months: MonthData[] = [];

    for (let i = 1; i < monthKeys.length; i++) {
      const prevSnap = byMonth.get(monthKeys[i - 1])!;
      const currSnap = byMonth.get(monthKeys[i])!;

      const portfolioReturn =
        prevSnap.total_value > 0
          ? ((currSnap.total_value - prevSnap.total_value) / prevSnap.total_value) * 100
          : 0;

      const d = new Date(currSnap.snapshot_date);
      const label = d
        .toLocaleDateString("es-CL", { month: "short", year: "2-digit" })
        .replace(".", "");

      let benchReturn: number | null = null;
      if (benchmarkReturns && benchmarkReturns[monthKeys[i]] != null) {
        benchReturn = benchmarkReturns[monthKeys[i]];
      } else if (benchmarkMonthlyReturn != null) {
        benchReturn = benchmarkMonthlyReturn;
      }

      let compReturn: number | null = null;
      if (comparisonReturns && comparisonReturns[monthKeys[i]] != null) {
        compReturn = comparisonReturns[monthKeys[i]];
      }

      months.push({
        monthKey: monthKeys[i],
        label,
        portfolio: parseFloat(portfolioReturn.toFixed(2)),
        benchmark: benchReturn != null ? parseFloat(benchReturn.toFixed(2)) : null,
        comparison: compReturn != null ? parseFloat(compReturn.toFixed(2)) : null,
      });
    }

    // Add accumulated bar
    if (months.length > 0) {
      const firstSnap = byMonth.get(monthKeys[0])!;
      const lastSnap = byMonth.get(monthKeys[monthKeys.length - 1])!;
      const accumPortfolio =
        firstSnap.total_value > 0
          ? ((lastSnap.total_value - firstSnap.total_value) / firstSnap.total_value) * 100
          : 0;

      // Compound benchmark
      let accumBench: number | null = null;
      if (benchmarkMonthlyReturn != null || benchmarkReturns) {
        let compound = 1;
        for (const m of months) {
          if (m.benchmark != null) compound *= 1 + m.benchmark / 100;
        }
        accumBench = (compound - 1) * 100;
      }

      // Compound comparison
      let accumComp: number | null = null;
      if (comparisonReturns) {
        let compound = 1;
        for (const m of months) {
          if (m.comparison != null) compound *= 1 + m.comparison / 100;
        }
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
  }, [snapshots, benchmarkMonthlyReturn, benchmarkReturns, comparisonReturns]);

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
              formatter={(value: number, name: string) => [
                `${formatNumber(value, 2)}%`,
                name,
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
