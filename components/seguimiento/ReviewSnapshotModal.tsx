"use client";

import React, { useState, useMemo, useEffect, useCallback } from "react";
import { X, Loader, AlertTriangle, Check, DollarSign, Calendar, RefreshCw, Plus, TrendingUp, TrendingDown, Building2, Search, Sparkles, CheckCircle2 } from "lucide-react";

interface Holding {
  fundName: string;
  securityId?: string | null;
  quantity?: number;
  unitCost?: number;
  costBasis?: number;
  marketPrice?: number;
  marketValue: number;
  unrealizedGainLoss?: number;
  assetClass?: string;
  currency?: string;
  source?: string; // Custodian name
  isPrevisional?: boolean;
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

interface Props {
  clientId: string;
  parsedData: ParsedData;
  sources?: string[]; // List of custodians
  onClose: () => void;
  onSuccess: () => void;
  onAddMore?: () => void; // Callback to add more files
  editMode?: boolean; // If true, we're editing an existing snapshot
  existingSnapshot?: ExistingSnapshot; // Existing snapshot data for edit mode
}

interface ExchangeRates {
  usd: number;
  eur: number;
  uf: number;
}

interface MatchSuggestion {
  index: number;
  matched: boolean;
  matchType?: "fund" | "stock";
  confidence: "high" | "medium" | "low";
  matchedName?: string;
  matchedId?: string;
  price?: number;
  currency?: string;
  source?: string;
  applied?: boolean;
  dismissed?: boolean;
}

const ASSET_CLASS_OPTIONS = [
  { value: "equity", label: "Renta Variable", color: "bg-blue-100 text-blue-800" },
  { value: "fixedIncome", label: "Renta Fija", color: "bg-green-100 text-green-800" },
  { value: "balanced", label: "Balanceado", color: "bg-purple-100 text-purple-800" },
  { value: "alternatives", label: "Alternativos", color: "bg-orange-100 text-orange-800" },
  { value: "cash", label: "Cash/MM", color: "bg-gray-100 text-gray-800" },
];

const CURRENCY_OPTIONS = [
  { value: "USD", label: "USD", shortLabel: "$" },
  { value: "CLP", label: "CLP", shortLabel: "$" },
  { value: "EUR", label: "EUR", shortLabel: "€" },
  { value: "UF", label: "UF", shortLabel: "UF" },
];

function detectCurrencyFromName(fundName: string): string {
  const name = fundName.toLowerCase();
  if (name.includes("usd") || name.includes("dollar") || name.includes("dolar") ||
      name.includes("us ") || name.includes("(us)") || name.includes("eeuu") ||
      name.includes("usa") || name.includes("global") || name.includes("international")) {
    return "USD";
  }
  if (name.includes("eur") || name.includes("euro") || name.includes("europa") ||
      name.includes("european")) {
    return "EUR";
  }
  if (name.includes(" uf") || name.includes("(uf)") || name.includes("uf ")) {
    return "UF";
  }
  if (name.includes("clp") || name.includes("peso") || name.includes("chile") ||
      name.includes("local") || name.includes("nacional")) {
    return "CLP";
  }
  return "USD";
}

function classifyFund(fundName: string): string {
  const name = fundName.toLowerCase();
  if (name.includes("money market") || name.includes("mm ") || name.includes("liquidez") ||
      name.includes("efectivo") || name.includes("cash") || name.includes("disponible")) {
    return "cash";
  }
  if (name.includes("renta fija") || name.includes("fixed income") || name.includes("bond") ||
      name.includes("bono") || name.includes("deuda") || name.includes("corporate") ||
      name.includes("soberan") || name.includes("high yield") || name.includes("investment grade") ||
      name.includes("ig ") || name.includes("hy ") || name.includes("rf ") ||
      name.includes("deposito") || name.includes("depósito") || name.includes("pacto")) {
    return "fixedIncome";
  }
  if (name.includes("balanced") || name.includes("balanceado") || name.includes("mixto") ||
      name.includes("multi-asset") || name.includes("multiactivo") || name.includes("allocation") ||
      name.includes("moderate") || name.includes("moderado")) {
    return "balanced";
  }
  if (name.includes("alternativ") || name.includes("real estate") || name.includes("inmobiliario") ||
      name.includes("private equity") || name.includes("hedge") || name.includes("commodity") ||
      name.includes("infraestruct") || name.includes("real asset")) {
    return "alternatives";
  }
  return "equity";
}

export default function ReviewSnapshotModal({
  clientId,
  parsedData,
  sources = [],
  onClose,
  onSuccess,
  onAddMore,
  editMode = false,
  existingSnapshot,
}: Props) {
  // Exchange rates state
  const [exchangeRates, setExchangeRates] = useState<ExchangeRates | null>(null);
  const [loadingRates, setLoadingRates] = useState(true);
  const [ratesError, setRatesError] = useState<string | null>(null);

  // Initialize holdings - use existingSnapshot in edit mode, otherwise parsed data
  const getInitialHoldings = (): Holding[] => {
    const sourceHoldings = editMode && existingSnapshot?.holdings
      ? existingSnapshot.holdings
      : parsedData.holdings || [];

    return sourceHoldings.map((h) => ({
      ...h,
      assetClass: h.assetClass || classifyFund(h.fundName),
      currency: h.currency || parsedData.detectedCurrency || detectCurrencyFromName(h.fundName),
    }));
  };

  const [holdings, setHoldings] = useState<Holding[]>(getInitialHoldings());

  const [fechaCartola, setFechaCartola] = useState(() => {
    if (editMode && existingSnapshot?.snapshot_date) {
      return existingSnapshot.snapshot_date;
    }
    if (parsedData.period) {
      const parsed = parseDate(parsedData.period);
      return parsed;
    }
    return new Date().toISOString().split("T")[0];
  });
  const [consolidationCurrency, setConsolidationCurrency] = useState("CLP");

  // Cash flows state - use existing values in edit mode
  const [deposits, setDeposits] = useState(editMode && existingSnapshot?.deposits ? existingSnapshot.deposits : 0);
  const [withdrawals, setWithdrawals] = useState(editMode && existingSnapshot?.withdrawals ? existingSnapshot.withdrawals : 0);
  const [depositsCurrency, setDepositsCurrency] = useState("CLP");
  const [withdrawalsCurrency, setWithdrawalsCurrency] = useState("CLP");

  const [saving, setSaving] = useState(false);
  const [savingMsg, setSavingMsg] = useState("Guardando...");
  const [error, setError] = useState<string | null>(null);

  // Auto-match state
  const [matchSuggestions, setMatchSuggestions] = useState<MatchSuggestion[]>([]);
  const [autoMatchLoading, setAutoMatchLoading] = useState(false);
  const [usingFallbackRates, setUsingFallbackRates] = useState(false);
  const [autoMatchComplete, setAutoMatchComplete] = useState(false);

  // Fetch exchange rates on mount
  useEffect(() => {
    async function fetchRates() {
      setLoadingRates(true);
      try {
        const res = await fetch("/api/exchange-rates");
        const data = await res.json();
        if (data.success) {
          setExchangeRates({
            usd: data.usd || 980,
            eur: data.eur || 1060,
            uf: data.uf || 38500,
          });
          // Warn if API returned but values look like fallbacks
          if (!data.usd || !data.eur || !data.uf) {
            setUsingFallbackRates(true);
          }
        } else {
          setRatesError("Error al obtener tipos de cambio — usando valores estimados");
          setExchangeRates({ usd: 980, eur: 1060, uf: 38500 });
          setUsingFallbackRates(true);
        }
      } catch {
        setRatesError("Error de conexión — usando tipos de cambio estimados");
        setExchangeRates({ usd: 980, eur: 1060, uf: 38500 });
        setUsingFallbackRates(true);
      } finally {
        setLoadingRates(false);
      }
    }
    fetchRates();
  }, []);

  // Auto-match holdings on mount
  useEffect(() => {
    async function autoMatchHoldings() {
      if (holdings.length === 0) return;

      setAutoMatchLoading(true);
      try {
        const res = await fetch("/api/fondos/match-holdings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            holdings: holdings.map((h) => ({
              fundName: h.fundName,
              securityId: h.securityId,
              quantity: h.quantity,
              marketValue: h.marketValue,
            })),
          }),
        });

        const data = await res.json();
        if (data.success && data.matches) {
          // Filter to only show matches with prices and medium/high confidence
          const relevantMatches = data.matches.filter(
            (m: MatchSuggestion) => m.matched && m.price && m.confidence !== "low"
          );
          setMatchSuggestions(relevantMatches);
        }
      } catch (err) {
        console.error("Error auto-matching holdings:", err);
      } finally {
        setAutoMatchLoading(false);
        setAutoMatchComplete(true);
      }
    }

    autoMatchHoldings();
  }, []); // Only run once on mount

  function parseDate(period: string): string {
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

  const toCLP = (value: number, currency: string): number => {
    if (!exchangeRates) return value;
    switch (currency) {
      case "USD": return value * exchangeRates.usd;
      case "EUR": return value * exchangeRates.eur;
      case "UF": return value * exchangeRates.uf;
      case "CLP": return value;
      default: return value;
    }
  };

  const fromCLP = (clpValue: number, targetCurrency: string): number => {
    if (!exchangeRates) return clpValue;
    switch (targetCurrency) {
      case "USD": return clpValue / exchangeRates.usd;
      case "EUR": return clpValue / exchangeRates.eur;
      case "UF": return clpValue / exchangeRates.uf;
      case "CLP": return clpValue;
      default: return clpValue;
    }
  };

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
  }, [holdings, exchangeRates, consolidationCurrency]);

  // Calculate net cash flows in CLP
  const netCashFlowCLP = useMemo(() => {
    const depositsCLP = toCLP(deposits, depositsCurrency);
    const withdrawalsCLP = toCLP(withdrawals, withdrawalsCurrency);
    return depositsCLP - withdrawalsCLP;
  }, [deposits, withdrawals, depositsCurrency, withdrawalsCurrency, exchangeRates]);

  // Calculate composition
  const composition = useMemo(() => {
    const comp: Record<string, { value: number; percent: number }> = {
      equity: { value: 0, percent: 0 },
      fixedIncome: { value: 0, percent: 0 },
      balanced: { value: 0, percent: 0 },
      alternatives: { value: 0, percent: 0 },
      cash: { value: 0, percent: 0 },
    };

    holdings.forEach((h) => {
      const clpValue = toCLP(h.marketValue || 0, h.currency || "USD");
      const assetClass = h.assetClass || "equity";

      if (assetClass === "balanced") {
        comp.equity.value += clpValue * 0.5;
        comp.fixedIncome.value += clpValue * 0.5;
      } else {
        comp[assetClass].value += clpValue;
      }
    });

    if (totalInCLP > 0) {
      Object.keys(comp).forEach((key) => {
        comp[key].percent = (comp[key].value / totalInCLP) * 100;
      });
    }

    return comp;
  }, [holdings, totalInCLP]);

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

  // State for fund/stock search
  const [searchingIndex, setSearchingIndex] = useState<number | null>(null);
  const [searchResults, setSearchResults] = useState<Array<{
    id: string;
    type: "fund" | "stock";
    fo_run?: number;
    serie?: string;
    nombre: string;
    agf?: string;
    exchange?: string;
    moneda: string;
    valor_cuota: number | null;
    fecha_precio: string | null;
  }>>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  // Search for fund price in database
  const searchFundPrice = useCallback(async (index: number, fundName: string) => {
    setSearchingIndex(index);
    setSearchLoading(true);
    setSearchResults([]);

    try {
      // Extract meaningful search terms (first few words)
      const searchTerm = fundName
        .split(/\s+/)
        .slice(0, 3)
        .join(" ")
        .substring(0, 40);

      const res = await fetch(`/api/fondos/search-price?q=${encodeURIComponent(searchTerm)}`);
      const data = await res.json();

      if (data.success && data.results) {
        setSearchResults(data.results);
      }
    } catch (err) {
      console.error("Error searching fund price:", err);
    } finally {
      setSearchLoading(false);
    }
  }, []);

  // Apply selected fund/stock price
  const applyFundPrice = (index: number, result: typeof searchResults[0]) => {
    const updated = [...holdings];
    updated[index] = {
      ...updated[index],
      marketPrice: result.valor_cuota || updated[index].marketPrice,
      securityId: result.type === "stock"
        ? result.id.replace("stock-", "")
        : result.fo_run?.toString() || updated[index].securityId,
      currency: result.moneda || updated[index].currency,
    };
    // Recalculate market value if we have quantity and price
    if (updated[index].quantity && updated[index].quantity > 0 && result.valor_cuota) {
      updated[index].marketValue = updated[index].quantity * result.valor_cuota;
    }
    setHoldings(updated);
    setSearchingIndex(null);
    setSearchResults([]);
  };

  const closeSearch = () => {
    setSearchingIndex(null);
    setSearchResults([]);
  };

  // Apply a match suggestion
  const applyMatchSuggestion = (suggestion: MatchSuggestion) => {
    const updated = [...holdings];
    const holding = updated[suggestion.index];

    updated[suggestion.index] = {
      ...holding,
      marketPrice: suggestion.price || holding.marketPrice,
      securityId: suggestion.matchedId || holding.securityId,
      currency: suggestion.currency || holding.currency,
    };

    // Recalculate market value if we have quantity and price
    if (holding.quantity && holding.quantity > 0 && suggestion.price) {
      updated[suggestion.index].marketValue = holding.quantity * suggestion.price;
    }

    setHoldings(updated);

    // Mark suggestion as applied
    setMatchSuggestions((prev) =>
      prev.map((s) =>
        s.index === suggestion.index ? { ...s, applied: true } : s
      )
    );
  };

  // Dismiss a match suggestion
  const dismissMatchSuggestion = (index: number) => {
    setMatchSuggestions((prev) =>
      prev.map((s) =>
        s.index === index ? { ...s, dismissed: true } : s
      )
    );
  };

  // Apply all high-confidence suggestions
  const applyAllSuggestions = () => {
    const toApply = matchSuggestions.filter(
      (s) => !s.applied && !s.dismissed && s.confidence === "high"
    );

    const updated = [...holdings];
    for (const suggestion of toApply) {
      const holding = updated[suggestion.index];
      updated[suggestion.index] = {
        ...holding,
        marketPrice: suggestion.price || holding.marketPrice,
        securityId: suggestion.matchedId || holding.securityId,
        currency: suggestion.currency || holding.currency,
      };

      if (holding.quantity && holding.quantity > 0 && suggestion.price) {
        updated[suggestion.index].marketValue = holding.quantity * suggestion.price;
      }
    }

    setHoldings(updated);
    setMatchSuggestions((prev) =>
      prev.map((s) =>
        toApply.some((t) => t.index === s.index) ? { ...s, applied: true } : s
      )
    );
  };

  // Get pending suggestions count
  const pendingSuggestions = matchSuggestions.filter(
    (s) => !s.applied && !s.dismissed
  );
  const highConfidenceSuggestions = pendingSuggestions.filter(
    (s) => s.confidence === "high"
  );

  const handleSave = async () => {
    setSaving(true);
    setSavingMsg("Guardando...");
    setError(null);

    try {
      // Use PUT for edit mode, POST for new snapshots
      const url = editMode && existingSnapshot?.id
        ? `/api/portfolio/snapshots/${existingSnapshot.id}`
        : "/api/portfolio/snapshots";
      const method = editMode && existingSnapshot?.id ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          snapshotDate: fechaCartola,
          totalValue: totalInCLP,
          composition: {
            equity: composition.equity,
            fixedIncome: composition.fixedIncome,
            alternatives: composition.alternatives,
            cash: composition.cash,
          },
          holdings: holdings.map((h) => ({
            ...h,
            marketValueCLP: toCLP(h.marketValue || 0, h.currency || "USD"),
          })),
          sources: uniqueSources,
          currency: "CLP",
          exchangeRates,
          // Cash flows for TWR calculation
          cashFlows: {
            deposits: toCLP(deposits, depositsCurrency),
            withdrawals: toCLP(withdrawals, withdrawalsCurrency),
            netFlow: netCashFlowCLP,
          },
        }),
      });

      const result = await res.json();

      if (result.success) {
        // Auto-fill prices to generate daily evolution
        if (result.shouldFillPrices) {
          setSavingMsg("Calculando evolución de precios...");
          try {
            const fillRes = await fetch("/api/portfolio/fill-prices", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ clientId }),
            });
            const fillResult = await fillRes.json();
            if (fillResult.success) {
              const filled = fillResult.result?.filled || 0;
              const matched = fillResult.result?.holdingMatches?.filter((m: { source: string }) => m.source !== "none").length || 0;
              const total = fillResult.result?.holdingMatches?.length || 0;
              console.log(`Fill prices: ${filled} snapshots creados, ${matched}/${total} holdings con fuente de precios`);
              if (filled === 0 && matched === 0) {
                console.warn("Fill prices: ningún holding matcheó con una fuente de precios", fillResult.result?.holdingMatches);
              }
            } else {
              console.warn("Fill prices error:", fillResult.error);
            }
          } catch (err) {
            console.warn("Fill prices failed:", err);
          }
        }
        onSuccess();
      } else {
        setError(result.error || "Error al guardar snapshot");
      }
    } catch (err) {
      console.error("Error saving snapshot:", err);
      setError("Error de conexión");
    } finally {
      setSaving(false);
    }
  };

  // Formato chileno: puntos para miles, comas para decimales
  const formatNumber = (value: number, decimals: number = 0): string => {
    const fixed = Math.abs(value).toFixed(decimals);
    const [intPart, decPart] = fixed.split(".");
    const withThousands = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    const formatted = decPart ? `${withThousands},${decPart}` : withThousands;
    return value < 0 ? `-${formatted}` : formatted;
  };

  const formatCurrency = (value: number, currency: string) => {
    switch (currency) {
      case "CLP": return `$${formatNumber(value, 0)}`;
      case "USD": return `US$${formatNumber(value, 0)}`;
      case "EUR": return `€${formatNumber(value, 0)}`;
      case "UF": return `UF ${formatNumber(value, 2)}`;
      default: return `${currency} ${formatNumber(value, 0)}`;
    }
  };

  const formatRate = (rate: number) => formatNumber(rate, 2);

  const activeCurrencies = Object.entries(totalsByCurrency)
    .filter(([, value]) => value > 0)
    .map(([currency]) => currency);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-5xl w-full mx-4 shadow-xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-semibold text-gb-black">
              {editMode ? "Editar Snapshot" : "Revisar y Confirmar"}
            </h3>
            <p className="text-sm text-gb-gray">
              {uniqueSources.length > 0 && (
                <span className="flex items-center gap-1">
                  <Building2 className="w-3 h-3" />
                  {uniqueSources.join(", ")}
                </span>
              )}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gb-gray hover:text-gb-black hover:bg-slate-100 rounded transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* Exchange Rates Info */}
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-blue-600" />
              <span className="text-sm font-medium text-blue-800">Tipos de Cambio (BCCH)</span>
            </div>
            {loadingRates ? (
              <Loader className="w-4 h-4 text-blue-600 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4 text-blue-400" />
            )}
          </div>
          {exchangeRates && (
            <div className="mt-2 flex gap-4 text-xs text-blue-700">
              <span>USD/CLP: {formatRate(exchangeRates.usd)}</span>
              <span>EUR/CLP: {formatRate(exchangeRates.eur)}</span>
              <span>UF: {formatRate(exchangeRates.uf)}</span>
            </div>
          )}
          {(ratesError || usingFallbackRates) && (
            <p className="mt-1 text-xs text-amber-600">
              <AlertTriangle className="w-3 h-3 inline mr-1" />
              {ratesError || "Tipos de cambio pueden estar desactualizados"} — los valores en CLP son aproximados
            </p>
          )}
        </div>

        {/* Auto-Match Suggestions */}
        {(autoMatchLoading || pendingSuggestions.length > 0) && (
          <div className="mb-4 p-3 bg-purple-50 border border-purple-200 rounded-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-purple-600" />
                <span className="text-sm font-medium text-purple-800">
                  Precios Sugeridos
                </span>
              </div>
              {autoMatchLoading ? (
                <div className="flex items-center gap-2 text-xs text-purple-600">
                  <Loader className="w-3 h-3 animate-spin" />
                  Buscando coincidencias...
                </div>
              ) : pendingSuggestions.length > 0 ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-purple-600">
                    {pendingSuggestions.length} sugerencia{pendingSuggestions.length !== 1 ? "s" : ""}
                  </span>
                  {highConfidenceSuggestions.length > 0 && (
                    <button
                      onClick={applyAllSuggestions}
                      className="text-xs px-2 py-1 bg-purple-600 text-white rounded hover:bg-purple-700 transition-colors"
                    >
                      Aplicar todas ({highConfidenceSuggestions.length})
                    </button>
                  )}
                </div>
              ) : null}
            </div>

            {!autoMatchLoading && pendingSuggestions.length > 0 && (
              <div className="mt-3 space-y-2 max-h-48 overflow-y-auto">
                {pendingSuggestions.map((suggestion) => (
                  <div
                    key={suggestion.index}
                    className="flex items-center justify-between p-2 bg-white rounded border border-purple-100"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                          suggestion.matchType === "stock"
                            ? "bg-purple-100 text-purple-700"
                            : "bg-blue-100 text-blue-700"
                        }`}>
                          {suggestion.matchType === "stock" ? "Acción" : "Fondo"}
                        </span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                          suggestion.confidence === "high"
                            ? "bg-green-100 text-green-700"
                            : "bg-amber-100 text-amber-700"
                        }`}>
                          {suggestion.confidence === "high" ? "Alta" : "Media"}
                        </span>
                      </div>
                      <p className="text-xs text-gb-black mt-1 truncate">
                        <strong>{holdings[suggestion.index]?.fundName.substring(0, 30)}</strong>
                        {" → "}
                        {suggestion.matchedName?.substring(0, 30)}
                      </p>
                      <p className="text-[10px] text-gb-gray">{suggestion.source}</p>
                    </div>
                    <div className="flex items-center gap-2 ml-2">
                      <div className="text-right">
                        <p className="text-sm font-semibold text-green-600">
                          {formatNumber(suggestion.price || 0, suggestion.matchType === "stock" ? 2 : 4)}
                        </p>
                        <p className="text-[10px] text-gb-gray">{suggestion.currency}</p>
                      </div>
                      <button
                        onClick={() => applyMatchSuggestion(suggestion)}
                        className="p-1 text-green-600 hover:bg-green-50 rounded"
                        title="Aplicar"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => dismissMatchSuggestion(suggestion.index)}
                        className="p-1 text-slate-400 hover:bg-slate-50 rounded"
                        title="Ignorar"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {autoMatchComplete && pendingSuggestions.length === 0 && !autoMatchLoading && (
              <p className="mt-2 text-xs text-purple-600">
                {matchSuggestions.filter(s => s.applied).length > 0
                  ? `✓ ${matchSuggestions.filter(s => s.applied).length} precios aplicados`
                  : "No se encontraron coincidencias de alta confianza"}
              </p>
            )}
          </div>
        )}

        {/* Date and Cash Flows */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {/* Date */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-1">
              <Calendar className="w-4 h-4" />
              Fecha de la Cartola
              {!parsedData.period && (
                <span className="text-amber-600 text-xs font-normal ml-1">(no detectada)</span>
              )}
            </label>
            <input
              type="date"
              value={fechaCartola}
              onChange={(e) => setFechaCartola(e.target.value)}
              className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 ${
                !parsedData.period ? "border-amber-400 bg-amber-50" : "border-slate-300"
              }`}
            />
            {!parsedData.period && (
              <p className="text-xs text-amber-600 mt-1">
                No se detectó la fecha automáticamente. Por favor verifica o ingresa la fecha correcta.
              </p>
            )}
          </div>

          {/* Deposits */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-1">
              <TrendingUp className="w-4 h-4 text-green-600" />
              Aportes del Período
            </label>
            <div className="flex gap-1">
              <input
                type="number"
                value={deposits || ""}
                onChange={(e) => setDeposits(parseFloat(e.target.value) || 0)}
                placeholder="0"
                className="flex-1 px-3 py-2 border border-slate-300 rounded-l-md focus:ring-2 focus:ring-blue-500"
              />
              <select
                value={depositsCurrency}
                onChange={(e) => setDepositsCurrency(e.target.value)}
                className="w-20 px-2 py-2 border border-l-0 border-slate-300 rounded-r-md bg-slate-50"
              >
                {CURRENCY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.value}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Withdrawals */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-1">
              <TrendingDown className="w-4 h-4 text-red-600" />
              Retiros del Período
            </label>
            <div className="flex gap-1">
              <input
                type="number"
                value={withdrawals || ""}
                onChange={(e) => setWithdrawals(parseFloat(e.target.value) || 0)}
                placeholder="0"
                className="flex-1 px-3 py-2 border border-slate-300 rounded-l-md focus:ring-2 focus:ring-blue-500"
              />
              <select
                value={withdrawalsCurrency}
                onChange={(e) => setWithdrawalsCurrency(e.target.value)}
                className="w-20 px-2 py-2 border border-l-0 border-slate-300 rounded-r-md bg-slate-50"
              >
                {CURRENCY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.value}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Net Cash Flow indicator */}
        {(deposits > 0 || withdrawals > 0) && (
          <div className="mb-4 p-2 bg-slate-100 rounded-lg flex items-center justify-between">
            <span className="text-sm text-slate-600">Flujo Neto del Período:</span>
            <span className={`text-sm font-semibold ${netCashFlowCLP >= 0 ? "text-green-600" : "text-red-600"}`}>
              {netCashFlowCLP >= 0 ? "+" : ""}{formatCurrency(netCashFlowCLP, "CLP")}
            </span>
          </div>
        )}

        {/* Totals by Currency */}
        <div className="mb-6 p-4 bg-slate-50 rounded-lg">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-slate-700">Totales por Moneda</span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">Consolidar en:</span>
              <select
                value={consolidationCurrency}
                onChange={(e) => setConsolidationCurrency(e.target.value)}
                className="px-2 py-1 text-sm border border-slate-300 rounded focus:ring-1 focus:ring-blue-500"
              >
                {CURRENCY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-2 mb-3">
            {activeCurrencies.map((curr) => (
              <div key={curr} className="p-2 bg-white rounded border border-slate-200 text-center">
                <p className="text-xs text-slate-500">{curr}</p>
                <p className="text-sm font-semibold text-slate-800">
                  {formatCurrency(totalsByCurrency[curr], curr)}
                </p>
              </div>
            ))}
          </div>

          <div className="pt-3 border-t border-slate-200 flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-700">Total Consolidado</span>
            <span className="text-2xl font-bold text-gb-black">
              {formatCurrency(consolidatedTotal, consolidationCurrency)}
            </span>
          </div>
          {consolidationCurrency !== "CLP" && (
            <p className="text-xs text-slate-500 text-right mt-1">
              ({formatCurrency(totalInCLP, "CLP")})
            </p>
          )}
        </div>

        {/* Composition Summary */}
        <div className="mb-6">
          <h4 className="text-sm font-semibold text-gb-black mb-3">Composición Resultante</h4>
          <div className="flex gap-2">
            {composition.equity.percent > 0 && (
              <div className="flex-1 p-2 bg-blue-50 rounded text-center">
                <p className="text-xs text-blue-700">RV</p>
                <p className="text-sm font-bold text-blue-800">{formatNumber(composition.equity.percent, 1)}%</p>
              </div>
            )}
            {composition.fixedIncome.percent > 0 && (
              <div className="flex-1 p-2 bg-green-50 rounded text-center">
                <p className="text-xs text-green-700">RF</p>
                <p className="text-sm font-bold text-green-800">{formatNumber(composition.fixedIncome.percent, 1)}%</p>
              </div>
            )}
            {composition.alternatives.percent > 0 && (
              <div className="flex-1 p-2 bg-orange-50 rounded text-center">
                <p className="text-xs text-orange-700">Alt</p>
                <p className="text-sm font-bold text-orange-800">{formatNumber(composition.alternatives.percent, 1)}%</p>
              </div>
            )}
            {composition.cash.percent > 0 && (
              <div className="flex-1 p-2 bg-gray-100 rounded text-center">
                <p className="text-xs text-gray-600">Cash</p>
                <p className="text-sm font-bold text-gray-800">{formatNumber(composition.cash.percent, 1)}%</p>
              </div>
            )}
          </div>
        </div>

        {/* Holdings */}
        <div className="mb-6">
          <h4 className="text-sm font-semibold text-gb-black mb-3">
            Posiciones ({holdings.length})
          </h4>
          <div className="border border-slate-200 rounded-lg overflow-x-auto">
            <table className="w-full text-sm min-w-[800px]">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600">Instrumento</th>
                  {uniqueSources.length > 1 && (
                    <th className="px-3 py-2 text-center text-xs font-semibold text-slate-600 w-20">Custodio</th>
                  )}
                  <th className="px-3 py-2 text-center text-xs font-semibold text-slate-600 w-16">Moneda</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600 w-24">Cantidad</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600 w-28">Precio</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600 w-32">Valor Total</th>
                  <th className="px-3 py-2 text-center text-xs font-semibold text-slate-600 w-28">Clase</th>
                </tr>
              </thead>
              <tbody>
                {holdings.map((holding, index) => (
                  <tr key={index} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-gb-black truncate" title={holding.fundName}>
                            {holding.fundName}
                          </p>
                          <div className="flex items-center gap-1">
                            {holding.securityId && (
                              <span className="text-xs text-gb-gray">{holding.securityId}</span>
                            )}
                            {holding.isPrevisional && (
                              <span className="text-[10px] px-1 py-0.5 bg-orange-100 text-orange-700 rounded font-medium">
                                Previsional
                              </span>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => searchFundPrice(index, holding.fundName)}
                          className="p-1 text-blue-500 hover:bg-blue-50 rounded shrink-0"
                          title="Buscar precio en base de datos"
                        >
                          <Search className="w-3 h-3" />
                        </button>
                      </div>
                    </td>
                    {uniqueSources.length > 1 && (
                      <td className="px-3 py-2 text-center">
                        <span className="text-xs px-1 py-0.5 bg-slate-100 rounded text-slate-600">
                          {holding.source || "-"}
                        </span>
                      </td>
                    )}
                    <td className="px-3 py-2 text-center">
                      <select
                        value={holding.currency || "USD"}
                        onChange={(e) => handleCurrencyChange(index, e.target.value)}
                        className="w-14 px-1 py-1 text-xs border border-slate-200 rounded focus:ring-1 focus:ring-blue-500"
                      >
                        {CURRENCY_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>{opt.value}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <input
                        type="number"
                        value={holding.quantity || ""}
                        onChange={(e) => handleQuantityChange(index, parseFloat(e.target.value) || 0)}
                        placeholder="0"
                        className="w-20 px-2 py-1 text-right border border-slate-200 rounded text-sm focus:ring-1 focus:ring-blue-500"
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <input
                        type="number"
                        value={holding.marketPrice || ""}
                        onChange={(e) => handlePriceChange(index, parseFloat(e.target.value) || 0)}
                        placeholder="0"
                        step="0.0001"
                        className="w-24 px-2 py-1 text-right border border-slate-200 rounded text-sm focus:ring-1 focus:ring-blue-500"
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <input
                        type="text"
                        inputMode="numeric"
                        value={holding.marketValue ? holding.marketValue.toLocaleString("es-CL") : "0"}
                        onChange={(e) => {
                          const raw = e.target.value.replace(/\./g, "").replace(/,/g, ".");
                          handleValueChange(index, parseFloat(raw) || 0);
                        }}
                        className="w-32 px-2 py-1 text-right border border-slate-200 rounded text-sm focus:ring-1 focus:ring-blue-500"
                      />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <select
                        value={holding.assetClass || "equity"}
                        onChange={(e) => handleAssetClassChange(index, e.target.value)}
                        className={`px-2 py-1 text-xs font-medium rounded border-0 cursor-pointer ${
                          ASSET_CLASS_OPTIONS.find((o) => o.value === holding.assetClass)?.color || "bg-blue-100 text-blue-800"
                        }`}
                      >
                        {ASSET_CLASS_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Search Results Popup */}
          {searchingIndex !== null && (
            <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-blue-800">
                  Buscando precio para: {holdings[searchingIndex]?.fundName.substring(0, 40)}...
                </span>
                <button
                  onClick={closeSearch}
                  className="text-blue-600 hover:text-blue-800"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {searchLoading ? (
                <div className="flex items-center gap-2 text-sm text-blue-600">
                  <Loader className="w-4 h-4 animate-spin" />
                  Buscando fondos y acciones...
                </div>
              ) : searchResults.length > 0 ? (
                <div className="space-y-2">
                  {searchResults.map((result) => (
                    <div
                      key={result.id}
                      className={`flex items-center justify-between p-2 bg-white rounded border cursor-pointer ${
                        result.type === "stock"
                          ? "border-purple-100 hover:border-purple-300"
                          : "border-blue-100 hover:border-blue-300"
                      }`}
                      onClick={() => applyFundPrice(searchingIndex, result)}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                            result.type === "stock"
                              ? "bg-purple-100 text-purple-700"
                              : "bg-blue-100 text-blue-700"
                          }`}>
                            {result.type === "stock" ? "Acción" : "Fondo"}
                          </span>
                          <p className="text-sm font-medium text-gb-black truncate">{result.nombre}</p>
                        </div>
                        <p className="text-xs text-gb-gray">
                          {result.type === "stock"
                            ? result.exchange || "Bolsa"
                            : `${result.agf} - Serie ${result.serie}`}
                        </p>
                      </div>
                      <div className="text-right ml-3">
                        {result.valor_cuota ? (
                          <>
                            <p className="text-sm font-semibold text-green-600">
                              {result.type === "stock"
                                ? formatNumber(result.valor_cuota, 2)
                                : formatNumber(result.valor_cuota, 4)}
                            </p>
                            <p className="text-xs text-gb-gray">{result.moneda}</p>
                          </>
                        ) : (
                          <p className="text-xs text-amber-600">Sin precio</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-blue-600">No se encontraron fondos ni acciones</p>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-3 justify-between pt-4 border-t border-slate-200">
          <div>
            {onAddMore && (
              <button
                onClick={onAddMore}
                className="px-4 py-2 text-sm font-medium border border-blue-300 text-blue-600 rounded-md hover:bg-blue-50 transition-colors flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Agregar otra cartola
              </button>
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 text-sm font-medium border border-slate-300 text-slate-600 rounded-md hover:bg-slate-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={saving || holdings.length === 0 || loadingRates || totalInCLP <= 0}
              className="px-6 py-2 text-sm font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center gap-2"
            >
              {saving ? (
                <>
                  <Loader className="w-4 h-4 animate-spin" />
                  {savingMsg}
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  {editMode ? "Guardar Cambios" : "Confirmar y Guardar"}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
