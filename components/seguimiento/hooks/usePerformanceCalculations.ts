"use client";

import { useState, useMemo, useEffect } from "react";
import { inferInstrumentType } from "@/lib/instrument-type";
import type { Snapshot } from "../SeguimientoPage";
import type { HoldingReturnsData } from "../HoldingReturnsPanel";

interface Holding {
  fundName: string;
  securityId?: string;
  serie?: string;
  marketValue: number;
  marketValueCLP?: number;
  costBasis?: number;
  unrealizedGainLoss?: number;
  quantity?: number;
  assetClass?: string;
  currency?: string;
  market?: string;
}

export interface MonthOption {
  key: string; // "2026-05" or "_acumulado"
  label: string;
  isAccumulated: boolean;
}

export interface PositionAttr {
  name: string;
  initialValue: number;
  finalValue: number;
  return: number;
  contribution: number;
  weight: number;
  assetClass?: string;
}

export interface InstrumentBreakdown {
  type: string;
  label: string;
  color: string;
  negColor: string;
  contribution: number;
}

export interface AssetClassWithBreakdown {
  name: string;
  key: string;
  color: string;
  totalContribution: number;
  classReturn: number;
  breakdown: InstrumentBreakdown[];
}

export const INSTRUMENT_COLORS: Record<string, { label: string; color: string; negColor: string }> = {
  etf:   { label: "ETFs",     color: "#3b82f6", negColor: "#93c5fd" },
  stock: { label: "Acciones", color: "#10b981", negColor: "#6ee7b7" },
  fund:  { label: "Fondos",   color: "#f59e0b", negColor: "#fcd34d" },
  bond:  { label: "Bonos",    color: "#8b5cf6", negColor: "#c4b5fd" },
  cash:  { label: "Cash",     color: "#94a3b8", negColor: "#cbd5e1" },
};

/** Normalize assetClass from various formats to canonical keys */
const normalizeAC = (ac: string | undefined): string => {
  const lower = (ac || "").toLowerCase().replace(/\s+/g, "");
  if (lower === "equity" || lower === "rentavariable") return "equity";
  if (lower === "fixedincome" || lower === "rentafija") return "fixedIncome";
  if (lower === "alternatives" || lower === "alternativos") return "alternatives";
  if (lower === "cash" || lower === "efectivo") return "cash";
  if (lower === "balanced" || lower === "balanceado") return "balanced";
  return lower || "equity";
};

/**
 * Calcula retornos reales por clase de activo a partir de los snapshots.
 * Si no hay datos suficientes, usa estimaciones conservadoras como fallback.
 */
function calculateAssetClassReturns(
  first: Snapshot,
  last: Snapshot,
  daysDiff: number
): Record<string, number> {
  const classes = ["equity", "fixedIncome", "alternatives", "cash"];
  const result: Record<string, number> = {};

  for (const cls of classes) {
    const initialKey = cls === "fixedIncome" ? "fixed_income_value" : `${cls}_value`;
    const initial = (first as unknown as Record<string, number>)[initialKey] || 0;
    const final = (last as unknown as Record<string, number>)[initialKey] || 0;

    if (initial > 0) {
      result[cls] = ((final - initial) / initial) * 100;
    } else {
      // Conservative fallback estimates (annualized) scaled to period
      const yearFraction = daysDiff / 365;
      const annualEstimates: Record<string, number> = {
        equity: 8, fixedIncome: 4, alternatives: 6, cash: 2,
      };
      result[cls] = (annualEstimates[cls] || 0) * yearFraction;
    }
  }

  return result;
}

interface BenchmarkAllocation {
  equity_percent?: number;
  fixed_income_percent?: number;
  alternatives_percent?: number;
  cash_percent?: number;
}

interface UsePerformanceCalculationsProps {
  snapshots: Snapshot[];
  recommendation?: BenchmarkAllocation | null;
  previousPortfolio?: Snapshot | null;
  totalReturn?: number;
  holdingReturnsData?: HoldingReturnsData | null;
}

export function usePerformanceCalculations({
  snapshots,
  recommendation,
  previousPortfolio,
  totalReturn: totalReturnProp,
  holdingReturnsData,
}: UsePerformanceCalculationsProps) {
  // ---------- Month selector ----------
  const cartolas = useMemo(
    () => snapshots
      .filter(s => Array.isArray(s.holdings) && (s.holdings as unknown[]).length > 0)
      .filter(s => s.source === "statement" || s.source === "manual" || s.source === "excel")
      .sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date)),
    [snapshots]
  );

  const monthOptions = useMemo((): MonthOption[] => {
    if (cartolas.length === 0) return [{ key: "_acumulado", label: "Acumulado", isAccumulated: true }];

    const firstDate = new Date(cartolas[0].snapshot_date);
    const firstYM = `${firstDate.getFullYear()}-${String(firstDate.getMonth() + 1).padStart(2, "0")}`;
    const now = new Date();
    const currentYM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    const options: MonthOption[] = [];
    let [y, m] = firstYM.split("-").map(Number);
    const [endY, endM] = currentYM.split("-").map(Number);

    while (y < endY || (y === endY && m <= endM)) {
      const ym = `${y}-${String(m).padStart(2, "0")}`;
      const d = new Date(y, m - 1, 1);
      const label = d.toLocaleDateString("es-CL", { month: "long", year: "numeric" });
      options.push({ key: ym, label: label.charAt(0).toUpperCase() + label.slice(1), isAccumulated: false });
      m++;
      if (m > 12) { m = 1; y++; }
    }

    const firstLabel = firstDate.toLocaleDateString("es-CL", { month: "short", year: "2-digit" });
    options.push({ key: "_acumulado", label: `Acumulado (desde ${firstLabel})`, isAccumulated: true });
    return options;
  }, [cartolas]);

  const [selectedMonthIdx, setSelectedMonthIdx] = useState(() => Math.max(0, monthOptions.length - 1));
  const selectedMonth = monthOptions[Math.min(selectedMonthIdx, monthOptions.length - 1)];

  const [pastMonthAttribution, setPastMonthAttribution] = useState<PositionAttr[] | null>(null);
  const [loadingMonth, setLoadingMonth] = useState(false);

  const findCartolaNearest = (dateStr: string) => {
    let bestBefore: typeof cartolas[0] | null = null;
    let bestAfter: typeof cartolas[0] | null = null;
    for (const s of cartolas) {
      if (s.snapshot_date <= dateStr) bestBefore = s;
      else if (!bestAfter) bestAfter = s;
    }
    return bestBefore ?? bestAfter;
  };

  // Fetch per-month attribution from API
  useEffect(() => {
    if (selectedMonth.isAccumulated || !holdingReturnsData) {
      setPastMonthAttribution(null);
      return;
    }

    const [y, m] = selectedMonth.key.split("-").map(Number);
    const monthEnd = `${y}-${String(m).padStart(2, "0")}-${new Date(y, m, 0).getDate()}`;
    const snap = findCartolaNearest(monthEnd);
    if (!snap?.holdings) {
      setPastMonthAttribution([]);
      return;
    }

    const holdings = snap.holdings as Holding[];
    const startDate = `${y}-${String(m).padStart(2, "0")}-01`;
    const now = new Date();
    const isCurrentMonth = y === now.getFullYear() && m === now.getMonth() + 1;
    const endDate = isCurrentMonth ? now.toISOString().split("T")[0] : monthEnd;

    setLoadingMonth(true);
    setPastMonthAttribution(null);

    fetch("/api/portfolio/prices-at-date", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        holdings: holdings.map(h => ({
          fundName: h.fundName,
          securityId: h.securityId || null,
          serie: h.serie || null,
          assetClass: h.assetClass,
          currency: h.currency || null,
          market: h.market || null,
          cartolaPrice: (h.quantity && h.quantity > 0 ? h.marketValue / h.quantity : null) || null,
        })),
        startDate,
        endDate,
      }),
    })
      .then(res => res.json())
      .then(data => {
        if (!data.success || !data.results) {
          setPastMonthAttribution([]);
          return;
        }

        let totalStartCLP = 0;
        const positionsRaw: Array<{ name: string; startCLP: number; endCLP: number; assetClass?: string }> = [];

        for (const r of data.results as Array<{
          fundName: string;
          assetClass?: string;
          startPrice: number | null;
          endPrice: number | null;
          returnPct: number | null;
          currency?: string;
        }>) {
          if (r.startPrice === null || r.endPrice === null) continue;
          const h = holdings.find(hh => hh.fundName === r.fundName);
          const qty = h?.quantity || 1;
          // Use snapshot marketValue (always CLP) as initial value for correct weighting
          // Then derive end value from return % to keep currency-consistent
          const holdingReturnPct = r.startPrice > 0 ? ((r.endPrice / r.startPrice) - 1) : 0;
          const startCLP = h?.marketValue || r.startPrice * qty;
          const endCLP = startCLP * (1 + holdingReturnPct);
          totalStartCLP += startCLP;
          positionsRaw.push({ name: r.fundName, startCLP, endCLP, assetClass: r.assetClass });
        }

        if (totalStartCLP <= 0) {
          setPastMonthAttribution([]);
          return;
        }

        const positions: PositionAttr[] = positionsRaw.map(p => {
          const ret = p.startCLP > 0 ? ((p.endCLP - p.startCLP) / p.startCLP) * 100 : 0;
          const contribution = ((p.endCLP - p.startCLP) / totalStartCLP) * 100;
          const weight = (p.startCLP / totalStartCLP) * 100;
          return {
            name: p.name,
            initialValue: p.startCLP,
            finalValue: p.endCLP,
            return: ret,
            contribution,
            weight,
            assetClass: p.assetClass,
          };
        });

        positions.sort((a, b) => b.contribution - a.contribution);
        setPastMonthAttribution(positions);
      })
      .catch(err => {
        console.warn("[PerformanceAttribution] month API error:", err);
        setPastMonthAttribution([]);
      })
      .finally(() => setLoadingMonth(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMonth, holdingReturnsData, cartolas]);

  const canPrevMonth = selectedMonthIdx > 0;
  const canNextMonth = selectedMonthIdx < monthOptions.length - 1;

  // Use pastMonthAttribution when a specific month is selected, otherwise use accumulated positionAttribution
  const activePositionData = selectedMonth.isAccumulated ? null : pastMonthAttribution;
  const isMonthLoading = loadingMonth && !selectedMonth.isAccumulated && !pastMonthAttribution;

  // Use only snapshots that have asset class values (cartola snapshots, not fill-prices intermediates)
  const snapshotsWithAssetData = useMemo(() =>
    snapshots.filter(s => (s.equity_value > 0 || s.fixed_income_value > 0 || s.alternatives_value > 0 || s.cash_value > 0)),
    [snapshots]
  );

  // Get first and last snapshots with asset data for attribution
  const firstSnapshot = snapshotsWithAssetData[0] || snapshots[0];
  const lastSnapshot = snapshotsWithAssetData[snapshotsWithAssetData.length - 1] || snapshots[snapshots.length - 1];

  // ============================================
  // 1. ATTRIBUTION BY ASSET CLASS
  // ============================================
  const assetClassAttribution = useMemo(() => {
    if (!firstSnapshot || !lastSnapshot || snapshotsWithAssetData.length < 2) return null;

    const initialValue = firstSnapshot.total_value;
    const finalValue = lastSnapshot.total_value;
    // Use total return from metrics when available for consistency with top-level cards
    const totalReturn = totalReturnProp != null ? totalReturnProp : ((finalValue - initialValue) / initialValue) * 100;

    // Calculate contribution from each asset class
    // Contribution = (Weight * Return) for each class
    const classes = [
      {
        name: "Renta Variable",
        key: "equity",
        color: "#3b82f6",
        initialValue: firstSnapshot.equity_value,
        finalValue: lastSnapshot.equity_value,
        initialPercent: firstSnapshot.equity_percent,
        finalPercent: lastSnapshot.equity_percent,
      },
      {
        name: "Renta Fija",
        key: "fixedIncome",
        color: "#22c55e",
        initialValue: firstSnapshot.fixed_income_value,
        finalValue: lastSnapshot.fixed_income_value,
        initialPercent: firstSnapshot.fixed_income_percent,
        finalPercent: lastSnapshot.fixed_income_percent,
      },
      {
        name: "Alternativos",
        key: "alternatives",
        color: "#a855f7",
        initialValue: firstSnapshot.alternatives_value,
        finalValue: lastSnapshot.alternatives_value,
        initialPercent: firstSnapshot.alternatives_percent,
        finalPercent: lastSnapshot.alternatives_percent,
      },
      {
        name: "Cash",
        key: "cash",
        color: "#6b7280",
        initialValue: firstSnapshot.cash_value,
        finalValue: lastSnapshot.cash_value,
        initialPercent: firstSnapshot.cash_percent,
        finalPercent: lastSnapshot.cash_percent,
      },
    ];

    const contributions = classes.map((cls) => {
      const classReturn = cls.initialValue > 0
        ? ((cls.finalValue - cls.initialValue) / cls.initialValue) * 100
        : 0;
      const weight = (cls.initialPercent || 0) / 100;
      const contribution = classReturn * weight;

      return {
        ...cls,
        return: classReturn,
        contribution,
        valueChange: cls.finalValue - cls.initialValue,
      };
    });

    return {
      contributions,
      totalReturn,
      initialValue,
      finalValue,
    };
  }, [snapshotsWithAssetData, firstSnapshot, lastSnapshot, totalReturnProp]);

  // ============================================
  // 1b. INSTRUMENT TYPE BREAKDOWN within each asset class
  // ============================================
  const instrumentBreakdown = useMemo((): AssetClassWithBreakdown[] | null => {
    const classKeyMap: Record<string, string> = {
      equity: "Renta Variable",
      fixedIncome: "Renta Fija",
      alternatives: "Alternativos",
      cash: "Cash",
    };
    const classColorMap: Record<string, string> = {
      equity: "#3b82f6",
      fixedIncome: "#22c55e",
      alternatives: "#a855f7",
      cash: "#6b7280",
    };

    // === PRIMARY: Use holdingReturnsData from HoldingReturnsPanel ===
    if (holdingReturnsData) {
      const { equityHoldings, fixedIncomeFundHoldings = [], alternativesHoldings = [], bondHoldings, cashValue, totalValue } = holdingReturnsData;
      if (equityHoldings.length === 0 && fixedIncomeFundHoldings.length === 0 && alternativesHoldings.length === 0 && bondHoldings.length === 0) return null;

      const result: AssetClassWithBreakdown[] = [];

      // Equity: group by instrument type (fund, etf, stock)
      if (equityHoldings.length > 0) {
        const byType = new Map<string, { contribution: number; totalReturn: number; weight: number }>();
        for (const h of equityHoldings) {
          const t = h.assetType || "fund";
          const existing = byType.get(t) || { contribution: 0, totalReturn: 0, weight: 0 };
          existing.contribution += h.contribution;
          existing.weight += h.weight;
          byType.set(t, existing);
        }

        const breakdown: InstrumentBreakdown[] = [];
        for (const [instType, data] of byType) {
          const meta = INSTRUMENT_COLORS[instType] || INSTRUMENT_COLORS.fund;
          breakdown.push({
            type: instType,
            label: meta.label,
            color: meta.color,
            negColor: meta.negColor,
            contribution: data.contribution,
          });
        }
        breakdown.sort((a, b) => b.contribution - a.contribution);

        const totalContribution = breakdown.reduce((s, b) => s + b.contribution, 0);
        const totalWeight = equityHoldings.reduce((s, h) => s + h.weight, 0);
        const classReturn = totalWeight > 0 ? (totalContribution / totalWeight) * 100 : 0;

        result.push({
          name: classKeyMap.equity,
          key: "equity",
          color: classColorMap.equity,
          totalContribution,
          classReturn,
          breakdown,
        });
      }

      // Fixed Income: RF funds + bonds
      if (fixedIncomeFundHoldings.length > 0 || bondHoldings.length > 0) {
        const breakdown: InstrumentBreakdown[] = [];

        // RF funds contribution
        const fundContrib = fixedIncomeFundHoldings.reduce((s, h) => s + h.contribution, 0);
        if (fixedIncomeFundHoldings.length > 0) {
          const fundMeta = INSTRUMENT_COLORS.fund;
          breakdown.push({
            type: "fund",
            label: fundMeta.label,
            color: fundMeta.color,
            negColor: fundMeta.negColor,
            contribution: fundContrib,
          });
        }

        // Bonds contribution
        const bondContrib = bondHoldings.reduce((s, h) => s + h.contribution, 0);
        if (bondHoldings.length > 0) {
          const bondMeta = INSTRUMENT_COLORS.bond;
          breakdown.push({
            type: "bond",
            label: bondMeta.label,
            color: bondMeta.color,
            negColor: bondMeta.negColor,
            contribution: bondContrib,
          });
        }

        breakdown.sort((a, b) => b.contribution - a.contribution);

        const totalContribution = fundContrib + bondContrib;
        const totalWeight = fixedIncomeFundHoldings.reduce((s, h) => s + h.weight, 0)
          + bondHoldings.reduce((s, h) => s + h.weight, 0);
        const classReturn = totalWeight > 0 ? (totalContribution / totalWeight) * 100 : 0;

        result.push({
          name: classKeyMap.fixedIncome,
          key: "fixedIncome",
          color: classColorMap.fixedIncome,
          totalContribution,
          classReturn,
          breakdown,
        });
      }

      // Alternatives
      if (alternativesHoldings && alternativesHoldings.length > 0) {
        const byType = new Map<string, { contribution: number; weight: number }>();
        for (const h of alternativesHoldings) {
          const t = h.assetType || "fund";
          const existing = byType.get(t) || { contribution: 0, weight: 0 };
          existing.contribution += h.contribution;
          existing.weight += h.weight;
          byType.set(t, existing);
        }

        const breakdown: InstrumentBreakdown[] = [];
        for (const [instType, data] of byType) {
          const meta = INSTRUMENT_COLORS[instType] || INSTRUMENT_COLORS.fund;
          breakdown.push({
            type: instType,
            label: meta.label,
            color: meta.color,
            negColor: meta.negColor,
            contribution: data.contribution,
          });
        }
        breakdown.sort((a, b) => b.contribution - a.contribution);

        const totalContribution = breakdown.reduce((s, b) => s + b.contribution, 0);
        const totalWeight = alternativesHoldings.reduce((s, h) => s + h.weight, 0);
        const classReturn = totalWeight > 0 ? (totalContribution / totalWeight) * 100 : 0;

        result.push({
          name: classKeyMap.alternatives,
          key: "alternatives",
          color: classColorMap.alternatives,
          totalContribution,
          classReturn,
          breakdown,
        });
      }

      // Cash
      if (cashValue > 0 && totalValue > 0) {
        const cashWeight = (cashValue / totalValue) * 100;
        const meta = INSTRUMENT_COLORS.cash;
        result.push({
          name: classKeyMap.cash,
          key: "cash",
          color: classColorMap.cash,
          totalContribution: 0,
          classReturn: 0,
          breakdown: [{
            type: "cash",
            label: meta.label,
            color: meta.color,
            negColor: meta.negColor,
            contribution: 0,
          }],
        });
      }

      result.sort((a, b) => b.totalContribution - a.totalContribution);
      return result.length > 0 ? result : null;
    }

    // === FALLBACK: Calculate from snapshot holdings ===
    if (!firstSnapshot || !lastSnapshot || snapshotsWithAssetData.length < 2) return null;

    const initialHoldings = (firstSnapshot.holdings as Holding[]) || [];
    const finalHoldings = (lastSnapshot.holdings as Holding[]) || [];
    if (initialHoldings.length === 0 && finalHoldings.length === 0) return null;

    const portfolioInitialValue = firstSnapshot.total_value;
    if (portfolioInitialValue <= 0) return null;

    const clpValue = (h: Holding) => (h.marketValueCLP || 0) > 0 ? h.marketValueCLP! : (h.marketValue ?? 0);

    const groups = new Map<string, Map<string, { startValue: number; endValue: number }>>();
    const getGroup = (ac: string, it: string) => {
      if (!groups.has(ac)) groups.set(ac, new Map());
      const acMap = groups.get(ac)!;
      if (!acMap.has(it)) acMap.set(it, { startValue: 0, endValue: 0 });
      return acMap.get(it)!;
    };

    for (const h of initialHoldings) {
      const ac = normalizeAC(h.assetClass);
      const it = inferInstrumentType(h as Parameters<typeof inferInstrumentType>[0]);
      getGroup(ac, it).startValue += clpValue(h);
    }
    for (const h of finalHoldings) {
      const ac = normalizeAC(h.assetClass);
      const it = inferInstrumentType(h as Parameters<typeof inferInstrumentType>[0]);
      getGroup(ac, it).endValue += clpValue(h);
    }

    const classOrder = ["equity", "fixedIncome", "alternatives", "cash"];
    const result: AssetClassWithBreakdown[] = [];

    for (const classKey of classOrder) {
      const acMap = groups.get(classKey);
      if (!acMap) continue;

      const breakdown: InstrumentBreakdown[] = [];
      let classTotalStart = 0;
      let classTotalEnd = 0;

      for (const [instType, vals] of acMap) {
        const contribution = ((vals.endValue - vals.startValue) / portfolioInitialValue) * 100;
        const meta = INSTRUMENT_COLORS[instType] || INSTRUMENT_COLORS.fund;
        breakdown.push({ type: instType, label: meta.label, color: meta.color, negColor: meta.negColor, contribution });
        classTotalStart += vals.startValue;
        classTotalEnd += vals.endValue;
      }

      breakdown.sort((a, b) => b.contribution - a.contribution);
      const totalContribution = breakdown.reduce((s, b) => s + b.contribution, 0);
      const classReturn = classTotalStart > 0 ? ((classTotalEnd - classTotalStart) / classTotalStart) * 100 : 0;

      if (Math.abs(totalContribution) > 0.01 || classTotalStart > 0) {
        result.push({
          name: classKeyMap[classKey] || classKey,
          key: classKey,
          color: classColorMap[classKey] || "#6b7280",
          totalContribution,
          classReturn,
          breakdown,
        });
      }
    }

    return result.length > 0 ? result : null;
  }, [holdingReturnsData, firstSnapshot, lastSnapshot, snapshotsWithAssetData]);

  // ============================================
  // 2. ATTRIBUTION BY INDIVIDUAL POSITION
  // ============================================
  const positionAttribution = useMemo(() => {
    // === PRIMARY: Use holdingReturnsData (has real returns from live prices) ===
    // Contribution = (finalValueCLP - initialValueCLP) / portfolioInitialValue * 100
    // This captures both price changes AND FX impact in CLP terms.
    if (holdingReturnsData) {
      const { equityHoldings, fixedIncomeFundHoldings = [], alternativesHoldings = [], bondHoldings, totalValue } = holdingReturnsData;

      // Build initial CLP values from the first snapshot's holdings
      const initialCLPByName = new Map<string, number>();
      const portfolioInitialValue = firstSnapshot?.total_value || 0;
      if (firstSnapshot?.holdings && portfolioInitialValue > 0) {
        const holdings = firstSnapshot.holdings as Array<Holding & { weight?: number }>;

        // First pass: try marketValueCLP (saved since ReviewSnapshotModal toCLP)
        let totalCLPFromHoldings = 0;
        const rawEntries: Array<{ name: string; clp: number; hasCLP: boolean }> = [];

        for (const h of holdings) {
          if (!h.fundName) continue;
          const hasCLP = (h.marketValueCLP || 0) > 0;
          const clp = hasCLP ? h.marketValueCLP! : 0;
          rawEntries.push({ name: h.fundName, clp, hasCLP });
          totalCLPFromHoldings += clp;
        }

        // If most holdings have marketValueCLP, use it directly
        const withCLP = rawEntries.filter(e => e.hasCLP).length;
        if (withCLP > rawEntries.length / 2) {
          // Scale to match total_value (handles rounding)
          const scale = totalCLPFromHoldings > 0 ? portfolioInitialValue / totalCLPFromHoldings : 1;
          for (const e of rawEntries) {
            if (!e.hasCLP) continue;
            const scaled = e.clp * scale;
            initialCLPByName.set(e.name, (initialCLPByName.get(e.name) || 0) + scaled);
          }
        } else {
          // Fallback: derive CLP from raw marketValue share × total_value
          const totalRaw = holdings.reduce((s, h) => s + Math.abs(h.marketValue ?? 0), 0);
          if (totalRaw > 0) {
            for (const h of holdings) {
              if (!h.fundName) continue;
              const share = Math.abs(h.marketValue ?? 0) / totalRaw;
              const clp = share * portfolioInitialValue;
              initialCLPByName.set(h.fundName, (initialCLPByName.get(h.fundName) || 0) + clp);
            }
          }
        }
      }

      const positions: PositionAttr[] = [];

      for (const h of [...equityHoldings, ...fixedIncomeFundHoldings, ...alternativesHoldings]) {
        const initCLP = initialCLPByName.get(h.fundName) || 0;
        // For holdings NOT in first snapshot (initCLP=0), use HoldingReturnsPanel's
        // contribution directly — computing (fullMarketValue / portfolioInitial) would
        // inflate the contribution with the entire position, not just the gain.
        const contribution = initCLP > 0 && portfolioInitialValue > 0
          ? ((h.marketValue - initCLP) / portfolioInitialValue) * 100
          : (h.contribution ?? 0);
        const posReturn = initCLP > 0 ? ((h.marketValue - initCLP) / initCLP) * 100 : (h.totalReturn ?? 0);

        positions.push({
          name: h.fundName,
          initialValue: initCLP,
          finalValue: h.marketValue,
          return: posReturn,
          contribution,
          weight: h.weight ?? (totalValue > 0 ? (h.marketValue / totalValue) * 100 : 0),
          assetClass: h.assetClass,
        });
      }

      for (const b of bondHoldings) {
        const initCLP = initialCLPByName.get(b.fundName) || 0;
        const contribution = initCLP > 0 && portfolioInitialValue > 0
          ? ((b.marketValue - initCLP) / portfolioInitialValue) * 100
          : (b.contribution ?? 0);
        const posReturn = initCLP > 0 ? ((b.marketValue - initCLP) / initCLP) * 100 : (b.totalReturn ?? 0);

        positions.push({
          name: b.fundName,
          initialValue: initCLP,
          finalValue: b.marketValue,
          return: posReturn,
          contribution,
          weight: b.weight ?? (totalValue > 0 ? (b.marketValue / totalValue) * 100 : 0),
          assetClass: "fixedIncome",
        });
      }

      if (positions.length === 0) return null;
      positions.sort((a, b) => b.contribution - a.contribution);
      return positions;
    }

    // === FALLBACK: Snapshot-based calculation (requires 2+ snapshots) ===
    if (!firstSnapshot || !lastSnapshot) return null;

    const initialHoldings = (firstSnapshot.holdings as Holding[]) || [];
    const finalHoldings = (lastSnapshot.holdings as Holding[]) || [];

    if (initialHoldings.length === 0 && finalHoldings.length === 0) return null;

    const holdingsMap = new Map<string, {
      name: string;
      initialValue: number;
      finalValue: number;
      return: number;
      contribution: number;
      assetClass?: string;
    }>();

    const clpValue = (h: Holding) => (h.marketValueCLP || 0) > 0 ? h.marketValueCLP! : (h.marketValue ?? 0);

    initialHoldings.forEach((h) => {
      holdingsMap.set(h.fundName, {
        name: h.fundName,
        initialValue: clpValue(h),
        finalValue: 0,
        return: 0,
        contribution: 0,
        assetClass: h.assetClass,
      });
    });

    finalHoldings.forEach((h) => {
      const existing = holdingsMap.get(h.fundName);
      if (existing) {
        existing.finalValue = clpValue(h);
      } else {
        holdingsMap.set(h.fundName, {
          name: h.fundName,
          initialValue: 0,
          finalValue: clpValue(h),
          return: 0,
          contribution: 0,
          assetClass: h.assetClass,
        });
      }
    });

    const totalInitialValue = firstSnapshot.total_value;
    const positions = Array.from(holdingsMap.values()).map((pos) => {
      // New holdings (initialValue=0) get 0% return — we don't know actual cost
      const posReturn = pos.initialValue > 0
        ? ((pos.finalValue - pos.initialValue) / pos.initialValue) * 100
        : 0;
      const weight = pos.initialValue / totalInitialValue;
      const contribution = posReturn * weight;

      return {
        ...pos,
        return: posReturn,
        contribution,
        weight: weight * 100,
      };
    });

    positions.sort((a, b) => b.contribution - a.contribution);
    return positions;
  }, [holdingReturnsData, firstSnapshot, lastSnapshot]);

  // ============================================
  // 3. BENCHMARK COMPARISON (Allocation Effect)
  // ============================================
  const benchmarkAttribution = useMemo(() => {
    if (!recommendation || !firstSnapshot || !lastSnapshot || snapshotsWithAssetData.length < 2) return null;

    const portfolioReturn = ((lastSnapshot.total_value - firstSnapshot.total_value) / firstSnapshot.total_value) * 100;

    // Calculate actual returns per asset class from real data
    const daysDiff =
      (new Date(lastSnapshot.snapshot_date).getTime() -
        new Date(firstSnapshot.snapshot_date).getTime()) /
      (1000 * 60 * 60 * 24);
    const realReturns = calculateAssetClassReturns(firstSnapshot, lastSnapshot, daysDiff);

    // Benchmark return: what we would have gotten with recommended allocation + actual class returns
    const benchmarkReturn =
      (recommendation.equity_percent || 0) * realReturns.equity / 100 +
      (recommendation.fixed_income_percent || 0) * realReturns.fixedIncome / 100 +
      (recommendation.alternatives_percent || 0) * realReturns.alternatives / 100 +
      (recommendation.cash_percent || 0) * realReturns.cash / 100;

    // Calculate effects for each asset class
    const classes = [
      { name: "Renta Variable", key: "equity", recWeight: recommendation.equity_percent || 0, actualWeight: lastSnapshot.equity_percent },
      { name: "Renta Fija", key: "fixedIncome", recWeight: recommendation.fixed_income_percent || 0, actualWeight: lastSnapshot.fixed_income_percent },
      { name: "Alternativos", key: "alternatives", recWeight: recommendation.alternatives_percent || 0, actualWeight: lastSnapshot.alternatives_percent },
      { name: "Cash", key: "cash", recWeight: recommendation.cash_percent || 0, actualWeight: lastSnapshot.cash_percent },
    ];

    let totalAllocationEffect = 0;

    const effects = classes.map((cls) => {
      const classReturn = realReturns[cls.key] || 0;
      const weightDiff = (cls.actualWeight - cls.recWeight) / 100;

      // Allocation effect: (Actual Weight - Benchmark Weight) * Class Return
      const allocationEffect = weightDiff * classReturn;
      totalAllocationEffect += allocationEffect;

      return {
        ...cls,
        allocationEffect,
      };
    });

    const activeReturn = portfolioReturn - benchmarkReturn;

    return {
      portfolioReturn,
      benchmarkReturn,
      activeReturn,
      allocationEffect: totalAllocationEffect,
      residual: activeReturn - totalAllocationEffect,
      effects,
    };
  }, [recommendation, firstSnapshot, lastSnapshot, snapshotsWithAssetData]);

  // ============================================
  // 4. PREVIOUS PORTFOLIO COMPARISON
  // ============================================
  const portfolioComparison = useMemo(() => {
    const baselineSnapshot = previousPortfolio || firstSnapshot;
    if (!baselineSnapshot || !lastSnapshot || baselineSnapshot.id === lastSnapshot.id) return null;

    const classes = [
      { name: "Renta Variable", color: "#3b82f6", baseValue: baselineSnapshot.equity_value, currentValue: lastSnapshot.equity_value, basePercent: baselineSnapshot.equity_percent, currentPercent: lastSnapshot.equity_percent },
      { name: "Renta Fija", color: "#22c55e", baseValue: baselineSnapshot.fixed_income_value, currentValue: lastSnapshot.fixed_income_value, basePercent: baselineSnapshot.fixed_income_percent, currentPercent: lastSnapshot.fixed_income_percent },
      { name: "Alternativos", color: "#a855f7", baseValue: baselineSnapshot.alternatives_value, currentValue: lastSnapshot.alternatives_value, basePercent: baselineSnapshot.alternatives_percent, currentPercent: lastSnapshot.alternatives_percent },
      { name: "Cash", color: "#6b7280", baseValue: baselineSnapshot.cash_value, currentValue: lastSnapshot.cash_value, basePercent: baselineSnapshot.cash_percent, currentPercent: lastSnapshot.cash_percent },
    ];

    const comparison = classes.map((cls) => ({
      ...cls,
      valueChange: cls.currentValue - cls.baseValue,
      percentChange: cls.currentPercent - cls.basePercent,
      returnPct: cls.baseValue > 0 ? ((cls.currentValue - cls.baseValue) / cls.baseValue) * 100 : 0,
    }));

    return {
      baselineDate: baselineSnapshot.snapshot_date,
      currentDate: lastSnapshot.snapshot_date,
      baselineTotal: baselineSnapshot.total_value,
      currentTotal: lastSnapshot.total_value,
      totalChange: lastSnapshot.total_value - baselineSnapshot.total_value,
      totalReturnPct: ((lastSnapshot.total_value - baselineSnapshot.total_value) / baselineSnapshot.total_value) * 100,
      comparison,
    };
  }, [previousPortfolio, firstSnapshot, lastSnapshot]);

  // Toggle section
  const [expandedSection, setExpandedSection] = useState<string | null>("assetClass");
  const toggleSection = (section: string) =>
    setExpandedSection((prev) => (prev === section ? null : section));

  return {
    // Month selector
    monthOptions,
    selectedMonthIdx,
    setSelectedMonthIdx,
    selectedMonth,
    canPrevMonth,
    canNextMonth,
    // Section toggle
    expandedSection,
    toggleSection,
    // Computed data
    firstSnapshot,
    assetClassAttribution,
    instrumentBreakdown,
    positionAttribution,
    activePositionData,
    isMonthLoading,
    benchmarkAttribution,
    portfolioComparison,
    holdingReturnsData,
  };
}
