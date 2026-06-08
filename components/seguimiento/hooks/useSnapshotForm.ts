import { useState, useMemo, useCallback } from "react";
import { detectCurrencyFromName, assetTypeToClass, classifyFund } from "@/lib/portfolio/classify";

export interface Holding {
  fundName: string;
  securityId?: string | null;
  serie?: string;
  quantity?: number;
  unitCost?: number;
  costBasis?: number;
  marketPrice?: number;
  marketValue: number;
  unrealizedGainLoss?: number;
  assetClass?: string;
  assetType?: string;
  currency?: string;
  source?: string;
  isPrevisional?: boolean;
  couponRate?: number | null;
  maturityDate?: string | null;
  creditRating?: string | null;
  purchaseDate?: string | null;
  marketYield?: number | null;
}

interface ParsedData {
  clientName?: string;
  accountNumber?: string;
  period?: string;
  beginningValue?: number;
  endingValue?: number;
  totalValue?: number;
  holdings?: Holding[];
  detectedCurrency?: string;
  currencyConfidence?: string;
  currencyReason?: string;
}

interface ExistingSnapshot {
  id: string;
  snapshot_date: string;
  total_value: number;
  holdings?: Holding[];
  deposits?: number;
  withdrawals?: number;
}

interface ExchangeRates {
  usd: number;
  eur: number;
  uf: number;
}

interface UseSnapshotFormOptions {
  parsedData: ParsedData;
  editMode: boolean;
  existingSnapshot?: ExistingSnapshot;
  sources: string[];
  exchangeRates: ExchangeRates | null;
  fechaCartola: string;
  setFechaCartola: React.Dispatch<React.SetStateAction<string>>;
}

export function parseDate(period: string): string {
  if (!period) return new Date().toISOString().split("T")[0];

  const p = period.trim();

  // Try ISO format first (2025-01-31)
  if (/^\d{4}-\d{2}-\d{2}$/.test(p)) {
    return p;
  }

  // Chilean format dd/mm/yyyy or dd-mm-yyyy or dd.mm.yyyy
  const ddmmyyyy = p.match(/(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/);
  if (ddmmyyyy) {
    const [, day, month, year] = ddmmyyyy;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  // "al DD/MM/YYYY" format common in Chilean docs
  const alDate = p.match(/al\s+(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/i);
  if (alDate) {
    const [, day, month, year] = alDate;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  // Month Year format (Jan 2025, January 2025, Enero 2025)
  const monthNames: Record<string, string> = {
    jan: "01", january: "01", ene: "01", enero: "01",
    feb: "02", february: "02", febrero: "02",
    mar: "03", march: "03", marzo: "03",
    apr: "04", april: "04", abr: "04", abril: "04",
    may: "05", mayo: "05",
    jun: "06", june: "06", junio: "06",
    jul: "07", july: "07", julio: "07",
    aug: "08", august: "08", ago: "08", agosto: "08",
    sep: "09", sept: "09", september: "09", septiembre: "09",
    oct: "10", october: "10", octubre: "10",
    nov: "11", november: "11", noviembre: "11",
    dec: "12", december: "12", dic: "12", diciembre: "12",
  };

  // "Month YYYY" or "Month de YYYY"
  const monthYear = p.match(/([a-zA-Z]+)(?:\s+de)?\s+(\d{4})/i);
  if (monthYear) {
    const [, monthStr, year] = monthYear;
    const month = monthNames[monthStr.toLowerCase()];
    if (month) {
      // Use last day of month
      const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();
      return `${year}-${month}-${lastDay.toString().padStart(2, "0")}`;
    }
  }

  // "DD de Month de YYYY" format
  const fullDateSpanish = p.match(/(\d{1,2})\s+de\s+([a-zA-Z]+)\s+de\s+(\d{4})/i);
  if (fullDateSpanish) {
    const [, day, monthStr, year] = fullDateSpanish;
    const month = monthNames[monthStr.toLowerCase()];
    if (month) {
      return `${year}-${month}-${day.padStart(2, "0")}`;
    }
  }

  // Try native Date parsing as fallback
  try {
    const date = new Date(p);
    if (!isNaN(date.getTime())) {
      return date.toISOString().split("T")[0];
    }
  } catch {
    // ignore
  }

  return new Date().toISOString().split("T")[0];
}

export function useSnapshotForm(options: UseSnapshotFormOptions) {
  const { parsedData, editMode, existingSnapshot, sources, exchangeRates, fechaCartola, setFechaCartola } = options;

  // Initialize holdings - use existingSnapshot in edit mode, otherwise parsed data
  const getInitialHoldings = (): Holding[] => {
    const sourceHoldings = editMode && existingSnapshot?.holdings
      ? existingSnapshot.holdings
      : parsedData.holdings || [];

    return sourceHoldings.map((h) => ({
      ...h,
      assetClass: h.assetClass || assetTypeToClass(h.assetType) || classifyFund(h.fundName),
      currency: h.currency || parsedData.detectedCurrency || detectCurrencyFromName(h.fundName),
    }));
  };

  const [holdings, setHoldings] = useState<Holding[]>(getInitialHoldings());

  const [consolidationCurrency, setConsolidationCurrency] = useState("CLP");

  // Cash flows state - use existing values in edit mode
  const [deposits, setDeposits] = useState(editMode && existingSnapshot?.deposits ? existingSnapshot.deposits : 0);
  const [withdrawals, setWithdrawals] = useState(editMode && existingSnapshot?.withdrawals ? existingSnapshot.withdrawals : 0);
  const [depositsCurrency, setDepositsCurrency] = useState("CLP");
  const [withdrawalsCurrency, setWithdrawalsCurrency] = useState("CLP");

  const [saving, setSaving] = useState(false);
  const [savingMsg, setSavingMsg] = useState("Guardando...");
  const [error, setError] = useState<string | null>(null);

  const toCLP = useCallback((value: number, currency: string): number => {
    if (!exchangeRates) return value;
    switch (currency) {
      case "USD": return value * exchangeRates.usd;
      case "EUR": return value * exchangeRates.eur;
      case "UF": return value * exchangeRates.uf;
      case "CLP": return value;
      default: return value;
    }
  }, [exchangeRates]);

  const fromCLP = useCallback((clpValue: number, targetCurrency: string): number => {
    if (!exchangeRates) return clpValue;
    switch (targetCurrency) {
      case "USD": return clpValue / exchangeRates.usd;
      case "EUR": return clpValue / exchangeRates.eur;
      case "UF": return clpValue / exchangeRates.uf;
      case "CLP": return clpValue;
      default: return clpValue;
    }
  }, [exchangeRates]);

  // Calculate totals
  const { totalsByCurrency, consolidatedTotal, totalInCLP } = useMemo(() => {
    const totals: Record<string, number> = { USD: 0, CLP: 0, EUR: 0, UF: 0 };
    let clpTotal = 0;

    holdings.forEach((h) => {
      const curr = h.currency || "USD";
      totals[curr] = (totals[curr] || 0) + (h.marketValue || 0);
      clpTotal += toCLP(h.marketValue || 0, curr);
    });

    return {
      totalsByCurrency: totals,
      totalInCLP: clpTotal,
      consolidatedTotal: fromCLP(clpTotal, consolidationCurrency),
    };
  }, [holdings, toCLP, fromCLP, consolidationCurrency]);

  // Calculate net cash flows in CLP
  const netCashFlowCLP = useMemo(() => {
    const depositsCLP = toCLP(deposits, depositsCurrency);
    const withdrawalsCLP = toCLP(withdrawals, withdrawalsCurrency);
    return depositsCLP - withdrawalsCLP;
  }, [deposits, withdrawals, depositsCurrency, withdrawalsCurrency, toCLP]);

  // Calculate composition
  const composition = useMemo(() => {
    const comp: Record<string, { value: number; percent: number }> = {
      equity: { value: 0, percent: 0 },
      fixedIncome: { value: 0, percent: 0 },
      balanced: { value: 0, percent: 0 },
      alternatives: { value: 0, percent: 0 },
      cash: { value: 0, percent: 0 },
    };

    // Normalize display names to internal keys
    const normalizeClass = (cls: string): string => {
      const lower = cls.toLowerCase();
      if (lower === "fixed income" || lower === "fixedincome" || lower === "bond") return "fixedIncome";
      if (lower === "equity" || lower === "stock" || lower === "renta variable") return "equity";
      if (lower === "alternatives" || lower === "alternative" || lower === "alternativo") return "alternatives";
      if (lower === "cash" || lower === "liquidez" || lower === "efectivo") return "cash";
      if (lower === "balanced" || lower === "balanceado") return "balanced";
      return cls;
    };

    holdings.forEach((h) => {
      const clpValue = toCLP(h.marketValue || 0, h.currency || "USD");
      const assetClass = normalizeClass(h.assetClass || "equity");

      if (assetClass === "balanced") {
        comp.equity.value += clpValue * 0.5;
        comp.fixedIncome.value += clpValue * 0.5;
      } else if (comp[assetClass]) {
        comp[assetClass].value += clpValue;
      } else {
        // Unknown class defaults to equity
        comp.equity.value += clpValue;
      }
    });

    if (totalInCLP > 0) {
      Object.keys(comp).forEach((key) => {
        comp[key].percent = (comp[key].value / totalInCLP) * 100;
      });
    }

    return comp;
  }, [holdings, totalInCLP, toCLP]);

  // Get unique sources
  const uniqueSources = useMemo(() => {
    const holdingSources = holdings.map(h => h.source).filter(Boolean);
    return [...new Set([...sources, ...holdingSources])];
  }, [holdings, sources]);

  const handleAssetClassChange = (index: number, newClass: string) => {
    const updated = [...holdings];
    updated[index] = { ...updated[index], assetClass: newClass };
    setHoldings(updated);
  };

  const handleValueChange = (index: number, newValue: number) => {
    const updated = [...holdings];
    updated[index] = { ...updated[index], marketValue: newValue };
    setHoldings(updated);
  };

  const handleCurrencyChange = (index: number, newCurrency: string) => {
    const updated = [...holdings];
    updated[index] = { ...updated[index], currency: newCurrency };
    setHoldings(updated);
  };

  const handleQuantityChange = (index: number, newQuantity: number) => {
    const updated = [...holdings];
    const holding = updated[index];
    const price = holding.marketPrice || 0;
    updated[index] = {
      ...holding,
      quantity: newQuantity,
      marketValue: price > 0 ? newQuantity * price : holding.marketValue,
    };
    setHoldings(updated);
  };

  const handlePriceChange = (index: number, newPrice: number) => {
    const updated = [...holdings];
    const holding = updated[index];
    const quantity = holding.quantity || 0;
    updated[index] = {
      ...holding,
      marketPrice: newPrice,
      marketValue: quantity > 0 ? quantity * newPrice : holding.marketValue,
    };
    setHoldings(updated);
  };

  const handlePurchaseDateChange = (index: number, newDate: string) => {
    const updated = [...holdings];
    updated[index] = { ...updated[index], purchaseDate: newDate || null };
    setHoldings(updated);
  };

  return {
    holdings,
    setHoldings,
    fechaCartola,
    setFechaCartola,
    consolidationCurrency,
    setConsolidationCurrency,
    deposits,
    setDeposits,
    withdrawals,
    setWithdrawals,
    depositsCurrency,
    setDepositsCurrency,
    withdrawalsCurrency,
    setWithdrawalsCurrency,
    saving,
    setSaving,
    savingMsg,
    setSavingMsg,
    error,
    setError,
    toCLP,
    fromCLP,
    totalsByCurrency,
    consolidatedTotal,
    totalInCLP,
    netCashFlowCLP,
    composition,
    uniqueSources,
    handleAssetClassChange,
    handleValueChange,
    handleCurrencyChange,
    handleQuantityChange,
    handlePriceChange,
    handlePurchaseDateChange,
  };
}
