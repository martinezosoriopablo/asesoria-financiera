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
  /** Retornos CLP de la estrategia recomendada por "YYYY-MM" (revalorizada a mercado) */
  recommendedReturns?: Record<string, number>;
  recommendedLabel?: string;
  displayCurrency?: string;                              // moneda de reporte (toggle)
  fxRateAt?: (currency: string, date: string) => number; // FX por fecha (CLP por unidad de moneda)
  benchmarkSpread?: number;                              // spread anual del benchmark UF (default 2 = "UF +2%")
}

interface MonthData {
  monthKey: string;
  label: string;
  portfolio: number;
  benchmark: number | null;
  comparison: number | null;
  recommended: number | null;
}

export default function RetornosComparados({
  snapshots,
  historicalSeries,
  benchmarkLabel = "UF +2%",
  benchmarkMonthlyReturn,
  benchmarkReturns,
  comparisonLabel,
  comparisonReturns,
  recommendedReturns,
  recommendedLabel = "Recomendado",
  displayCurrency = "CLP",
  fxRateAt,
  benchmarkSpread = 2,
}: Props) {
  const R = (displayCurrency || "CLP").toUpperCase();
  const chartData = useMemo(() => {
    // Re-basa un retorno CLP a la moneda de reporte R usando el FX real de las
    // dos fechas del período. Portafolio y benchmark (UF+2% nominal CLP) y la
    // comparación son series CLP → mismo transform. En CLP queda igual.
    const rebaseCLP = (clpPct: number, startDate: string, endDate: string): number => {
      if (R === "CLP" || !fxRateAt || !startDate || !endDate) return clpPct;
      const s = fxRateAt(R, startDate);
      const e = fxRateAt(R, endDate);
      if (!s || !e) return clpPct;
      return ((1 + clpPct / 100) * (s / e) - 1) * 100;
    };
    // Benchmark "UF +spread%" del mes, en CLP nominal = variación REAL de la UF del
    // mes (inflación) + spread/12. Usa la UF histórica (fxRateAt). Si no hay UF,
    // cae al valor plano de fallback (benchmarkMonthlyReturn). El re-base a R lo
    // convierte luego: en UF queda ~spread/12, en USD ajustado por dólar.
    const defaultBenchCLP = (startDate: string, endDate: string): number | null => {
      if (!fxRateAt || !startDate || !endDate) return benchmarkMonthlyReturn ?? null;
      const ufStart = fxRateAt("UF", startDate);
      const ufEnd = fxRateAt("UF", endDate);
      if (!ufStart || !ufEnd) return benchmarkMonthlyReturn ?? null;
      const ufInflation = ((ufEnd / ufStart) - 1) * 100;
      return ufInflation + benchmarkSpread / 12;
    };
    // Derive monthly portfolio returns from historicalSeries (daily prices) when available
    // This gives proper month-by-month granularity even with few cartola snapshots
    const monthlyPortfolioReturns = new Map<string, number>();
    const monthlyDates = new Map<string, { start: string; end: string }>(); // fechas por mes para re-basar benchmark/comparación
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
        // Return = currMonth.last / prevMonth.last - 1  (CLP), re-basado a R
        if (prevMonth.last > 0) {
          const retCLP = ((currMonth.last / prevMonth.last) - 1) * 100;
          monthlyDates.set(monthKeys[i], { start: prevMonth.lastDate, end: currMonth.lastDate });
          monthlyPortfolioReturns.set(monthKeys[i], rebaseCLP(retCLP, prevMonth.lastDate, currMonth.lastDate));
        }
      }

      // Acumulado = compuesto de los retornos mensuales (ya re-basados), NO el
      // ratio directo primer→último punto. Así el acumulado calza con las barras
      // mensuales mostradas y con el benchmark (también compuesto), y la Diferencia
      // queda consistente en cualquier moneda (evita desfase de ventana FX).
      let compoundP = 1;
      for (const v of monthlyPortfolioReturns.values()) compoundP *= 1 + v / 100;
      accumPortfolio = (compoundP - 1) * 100;
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
          const portfolioReturnCLP = prev.total_value > 0
            ? ((curr.total_value - prev.total_value) / prev.total_value) * 100 : 0;
          const portfolioReturn = rebaseCLP(portfolioReturnCLP, prev.snapshot_date, curr.snapshot_date);

          let benchReturn: number | null = null;
          if (benchmarkReturns && benchmarkReturns[monthKeys[i]] != null) benchReturn = benchmarkReturns[monthKeys[i]];
          else benchReturn = defaultBenchCLP(prev.snapshot_date, curr.snapshot_date); // UF real del mes + spread/12
          if (benchReturn != null) benchReturn = rebaseCLP(benchReturn, prev.snapshot_date, curr.snapshot_date);

          let compReturn: number | null = null;
          if (comparisonReturns && comparisonReturns[monthKeys[i]] != null) compReturn = comparisonReturns[monthKeys[i]];
          if (compReturn != null) compReturn = rebaseCLP(compReturn, prev.snapshot_date, curr.snapshot_date);

          let recReturn: number | null = null;
          if (recommendedReturns && recommendedReturns[monthKeys[i]] != null) recReturn = recommendedReturns[monthKeys[i]];
          if (recReturn != null) recReturn = rebaseCLP(recReturn, prev.snapshot_date, curr.snapshot_date);

          months.push({
            monthKey: monthKeys[i],
            label,
            portfolio: parseFloat(portfolioReturn.toFixed(2)),
            benchmark: benchReturn != null ? parseFloat(benchReturn.toFixed(2)) : null,
            comparison: compReturn != null ? parseFloat(compReturn.toFixed(2)) : null,
            recommended: recReturn != null ? parseFloat(recReturn.toFixed(2)) : null,
          });
        }
      }

      if (months.length > 0) {
        // Acumulado = compuesto de los meses (ya re-basados), consistente con benchmark
        let compoundP = 1;
        for (const m of months) compoundP *= 1 + m.portfolio / 100;
        const accumP = (compoundP - 1) * 100;
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
        let accumRec: number | null = null;
        if (recommendedReturns) {
          let compound = 1;
          for (const m of months) { if (m.recommended != null) compound *= 1 + m.recommended / 100; }
          accumRec = (compound - 1) * 100;
        }
        months.push({
          monthKey: "_acum", label: "Acumulado",
          portfolio: parseFloat(accumP.toFixed(2)),
          benchmark: accumBench != null ? parseFloat(accumBench.toFixed(2)) : null,
          comparison: accumComp != null ? parseFloat(accumComp.toFixed(2)) : null,
          recommended: accumRec != null ? parseFloat(accumRec.toFixed(2)) : null,
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

      const portfolioReturn = monthlyPortfolioReturns.get(key) ?? 0; // ya re-basado
      const dates = monthlyDates.get(key);

      let benchReturn: number | null = null;
      if (benchmarkReturns && benchmarkReturns[key] != null) benchReturn = benchmarkReturns[key];
      else if (dates) benchReturn = defaultBenchCLP(dates.start, dates.end); // UF real del mes + spread/12
      else if (benchmarkMonthlyReturn != null) benchReturn = benchmarkMonthlyReturn;
      if (benchReturn != null && dates) benchReturn = rebaseCLP(benchReturn, dates.start, dates.end);

      let compReturn: number | null = null;
      if (comparisonReturns && comparisonReturns[key] != null) compReturn = comparisonReturns[key];
      if (compReturn != null && dates) compReturn = rebaseCLP(compReturn, dates.start, dates.end);

      let recReturn: number | null = null;
      if (recommendedReturns && recommendedReturns[key] != null) recReturn = recommendedReturns[key];
      if (recReturn != null && dates) recReturn = rebaseCLP(recReturn, dates.start, dates.end);

      months.push({
        monthKey: key,
        label,
        portfolio: parseFloat(portfolioReturn.toFixed(2)),
        benchmark: benchReturn != null ? parseFloat(benchReturn.toFixed(2)) : null,
        comparison: compReturn != null ? parseFloat(compReturn.toFixed(2)) : null,
        recommended: recReturn != null ? parseFloat(recReturn.toFixed(2)) : null,
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
      let accumRec: number | null = null;
      if (recommendedReturns) {
        let compound = 1;
        for (const m of months) { if (m.recommended != null) compound *= 1 + m.recommended / 100; }
        accumRec = (compound - 1) * 100;
      }

      months.push({
        monthKey: "_acum",
        label: "Acumulado",
        portfolio: parseFloat(accumPortfolio.toFixed(2)),
        benchmark: accumBench != null ? parseFloat(accumBench.toFixed(2)) : null,
        comparison: accumComp != null ? parseFloat(accumComp.toFixed(2)) : null,
        recommended: accumRec != null ? parseFloat(accumRec.toFixed(2)) : null,
      });
    }

    return months;
  }, [snapshots, historicalSeries, benchmarkMonthlyReturn, benchmarkReturns, comparisonReturns, recommendedReturns, R, fxRateAt, benchmarkSpread]);

  if (chartData.length === 0) return null;

  // Separate monthly data from accumulated totals
  const monthlyData = chartData.filter((d) => d.monthKey !== "_acum");
  const accumData = chartData.find((d) => d.monthKey === "_acum");

  const hasBenchmark = chartData.some((d) => d.benchmark != null);
  const hasComparison = chartData.some((d) => d.comparison != null);
  const hasRecommended = chartData.some((d) => d.recommended != null);
  const accumDiff = accumData && accumData.benchmark != null ? accumData.portfolio - accumData.benchmark : null;

  return (
    <div className="bg-white rounded-lg border border-gb-border shadow-sm p-6">
      <h3 className="text-base font-semibold text-gb-black flex items-center gap-2 mb-4">
        <GitCompare className="w-5 h-5 text-blue-500" />
        Retornos Comparados
        <span className="text-xs font-normal text-gb-gray">· {R}</span>
      </h3>

      {/* Accumulated summary cards */}
      {accumData && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <div className="bg-gray-50 rounded-lg px-3 py-2">
            <div className="text-[11px] text-gb-gray">Portafolio</div>
            <div className={`text-lg font-semibold ${accumData.portfolio >= 0 ? "text-green-600" : "text-red-600"}`}>
              {accumData.portfolio >= 0 ? "+" : ""}{formatNumber(accumData.portfolio, 2)}%
            </div>
          </div>
          {hasBenchmark && accumData.benchmark != null && (
            <div className="bg-gray-50 rounded-lg px-3 py-2">
              <div className="text-[11px] text-gb-gray">{benchmarkLabel}</div>
              <div className="text-lg font-semibold text-yellow-600">
                {accumData.benchmark >= 0 ? "+" : ""}{formatNumber(accumData.benchmark, 2)}%
              </div>
            </div>
          )}
          {accumDiff != null && (
            <div className="bg-gray-50 rounded-lg px-3 py-2">
              <div className="text-[11px] text-gb-gray">Diferencia</div>
              <div className={`text-lg font-semibold ${accumDiff >= 0 ? "text-green-600" : "text-red-600"}`}>
                {accumDiff >= 0 ? "+" : ""}{formatNumber(accumDiff, 2)}pp
              </div>
            </div>
          )}
          {hasComparison && accumData.comparison != null && (
            <div className="bg-gray-50 rounded-lg px-3 py-2">
              <div className="text-[11px] text-gb-gray">{comparisonLabel || "Portfolio Inicial"}</div>
              <div className="text-lg font-semibold text-orange-500">
                {accumData.comparison >= 0 ? "+" : ""}{formatNumber(accumData.comparison, 2)}%
              </div>
            </div>
          )}
          {hasRecommended && accumData.recommended != null && (
            <div className="bg-gray-50 rounded-lg px-3 py-2">
              <div className="text-[11px] text-gb-gray">{recommendedLabel}</div>
              <div className="text-lg font-semibold" style={{ color: "#EB7838" }}>
                {accumData.recommended >= 0 ? "+" : ""}{formatNumber(accumData.recommended, 2)}%
              </div>
            </div>
          )}
        </div>
      )}

      {/* Monthly bar chart — without accumulated */}
      {monthlyData.length > 0 && (
      <div style={{ height: 320 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={monthlyData} margin={{ top: 10, right: 20, bottom: 5, left: 10 }}>
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
                name={comparisonLabel || "Portfolio Inicial"}
                fill="#f97316"
                radius={[4, 4, 0, 0]}
                maxBarSize={40}
              />
            )}
            {hasRecommended && (
              <Bar
                dataKey="recommended"
                name={recommendedLabel}
                fill="#EB7838"
                radius={[4, 4, 0, 0]}
                maxBarSize={40}
              />
            )}
          </BarChart>
        </ResponsiveContainer>
      </div>
      )}

      {/* Summary table below chart */}
      {monthlyData.length > 1 && (
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
                  <th className="text-right py-1.5 px-2 text-gb-gray font-medium">{comparisonLabel || "Portfolio Inicial"}</th>
                )}
                {hasRecommended && (
                  <th className="text-right py-1.5 px-2 text-gb-gray font-medium">{recommendedLabel}</th>
                )}
                {hasBenchmark && (
                  <th className="text-right py-1.5 px-2 text-gb-gray font-medium">Diferencia</th>
                )}
              </tr>
            </thead>
            <tbody>
              {monthlyData.map((d) => {
                const diff = d.benchmark != null ? d.portfolio - d.benchmark : null;
                return (
                  <tr
                    key={d.monthKey}
                    className="border-b border-gb-border/30"
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
                    {hasRecommended && (
                      <td className="py-1.5 px-2 text-right text-gb-gray">
                        {d.recommended != null ? `${formatNumber(d.recommended, 2)}%` : "—"}
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
