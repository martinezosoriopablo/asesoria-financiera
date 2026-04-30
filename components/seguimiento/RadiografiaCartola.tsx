"use client";

import React, { useState, useRef, useMemo, useCallback } from "react";
import {
  Loader,
  AlertTriangle,
  TrendingDown,
  DollarSign,
  PieChart,
  ArrowRight,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  XCircle,
  FileText,
  Pencil,
  Save,
  RotateCcw,
  Copy,
  Check,
  Search,
  X,
} from "lucide-react";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/format";

interface Alternative {
  nombre_fondo: string;
  nombre_agf: string;
  fm_serie: string;
  tac_sintetica: number;
  rent_12m: number | null;
  sharpe_365d: number | null;
  patrimonio_mm: number | null;
  categoria: string;
}

interface HoldingAnalysis {
  fundName: string;
  marketValue: number;
  weight: number;
  currency: string;
  matched: boolean;
  matchedFund: string | null;
  matchedAgf: string | null;
  categoria: string;
  isFondoInversion?: boolean;
  fiRut?: string;
  fiPrecioFecha?: string | null;
  fiValorLibro?: number | null;
  fiStale?: boolean;
  tac: number | null;
  tacImpactAnnual: number | null;
  tacImpact10Y: number | null;
  beneficio107lir?: boolean;
  beneficio108lir?: boolean;
  isApvEligible: boolean;
  regimen57bis: boolean;
  cheaperAlternatives: Alternative[];
  potentialSavingAnnual: number | null;
  potentialSaving10Y: number | null;
}

interface ProposalHolding {
  originalFund: string;
  proposedFund: string;
  proposedAgf: string;
  proposedSerie: string;
  categoria: string;
  marketValue: number;
  weight: number;
  currentTac: number | null;
  proposedTac: number;
  currentRent1m: number | null;
  currentRent3m: number | null;
  currentRent12m: number | null;
  proposedRent1m: number | null;
  proposedRent3m: number | null;
  proposedRent12m: number | null;
  proposedSharpe: number | null;
  tacSavingBps: number;
  changed: boolean;
}

interface OptimizedProposal {
  holdings: ProposalHolding[];
  currentTacPromedio: number;
  proposedTacPromedio: number;
  currentCostoAnual: number;
  proposedCostoAnual: number;
  ahorroFondosAnual: number;
}

interface XrayData {
  totalValue: number;
  totalValueCLP: number;
  allocation: {
    rentaVariable: { value: number; percent: number };
    rentaFija: { value: number; percent: number };
    balanceado: { value: number; percent: number };
    alternativos: { value: number; percent: number };
    otros: { value: number; percent: number };
  };
  tacPromedioPortfolio: number;
  costoAnualTotal: number;
  costoProyectado10Y: number;
  ahorroAnualPotencial: number;
  ahorroPotencial10Y: number;
  holdings: HoldingAnalysis[];
  holdingsConTac: number;
  holdingsSinTac: number;
  holdingsConAlternativa: number;
  fondosInversionDetected: Array<{ rut: string; nombre: string; stale: boolean }>;
  proposal: OptimizedProposal;
}

interface FundMeta {
  fundName: string;
  run: string;
  serie: string;
  tac: number | null;
  moneda: string;
  quantity: number;
}

interface Holding {
  fundName: string;
  securityId?: string | null;
  quantity?: number;
  marketPrice?: number;
  marketValue: number;
  assetClass?: string;
  currency?: string;
}

interface SearchResult {
  id: string;
  type: "fund" | "stock";
  fo_run?: number;
  serie?: string;
  nombre: string;
  agf?: string;
  moneda: string;
  valor_cuota: number | null;
  tac?: number | null;
  rent_1m?: number | null;
  rent_3m?: number | null;
  rent_12m?: number | null;
}

interface ProposalOverride {
  proposedFund: string;
  proposedAgf: string;
  proposedSerie: string;
  proposedTac: number;
  proposedRent1m: number | null;
  proposedRent3m: number | null;
  proposedRent12m: number | null;
}

interface Props {
  holdings: Holding[];
  clientName?: string;
  clientId?: string;
  fundsMeta?: FundMeta[];
}

export default function RadiografiaCartola({ holdings, clientName, clientId, fundsMeta }: Props) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<XrayData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedHolding, setExpandedHolding] = useState<string | null>(null);

  // Report state
  const [report, setReport] = useState<string>("");
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedReport, setEditedReport] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Advisory fee state (editable, default 1%)
  const [advisoryFee, setAdvisoryFee] = useState<number>(1.0);

  // TAC overrides (editable TAC per holding)
  const [tacOverrides, setTacOverrides] = useState<Record<string, number>>({});

  // Proposal overrides (manual fund search)
  const [proposalOverrides, setProposalOverrides] = useState<Record<string, ProposalOverride>>({});
  // Proposed TAC overrides (editable TAC for proposed funds)
  const [proposedTacOverrides, setProposedTacOverrides] = useState<Record<string, number>>({});
  const [searchingFund, setSearchingFund] = useState<string | null>(null);
  const [fundSearchQuery, setFundSearchQuery] = useState("");
  const [fundSearchResults, setFundSearchResults] = useState<SearchResult[]>([]);
  const [fundSearchLoading, setFundSearchLoading] = useState(false);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Custom context for AI report
  const [customContext, setCustomContext] = useState<string>("");
  // Rent period selector for proposal table
  const [rentPeriod, setRentPeriod] = useState<"1M" | "3M" | "1Y">("1Y");

  // Exchange rates (UF, USD)
  const [ufValue, setUfValue] = useState<number | null>(null);
  const [usdValue, setUsdValue] = useState<number | null>(null);

  // Fondos de inversión fetching state
  const [fiFetching, setFiFetching] = useState<Record<string, "loading" | "done" | "error">>({});
  const [fiFetchMsg, setFiFetchMsg] = useState<string | null>(null);

  // Storage key for persisting report
  const storageKey = clientId ? `xray-report-${clientId}` : null;

  // Load saved report and exchange rates on mount
  React.useEffect(() => {
    if (!storageKey) return;
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.report) { setReport(parsed.report); setEditedReport(parsed.report); }
        if (parsed.customContext) setCustomContext(parsed.customContext);
      }
    } catch { /* ignore */ }
  }, [storageKey]);

  React.useEffect(() => {
    fetch("/api/exchange-rates")
      .then(r => r.json())
      .then(d => { if (d.success) { setUfValue(d.uf); setUsdValue(d.usd); } })
      .catch(() => { /* fallback handled */ });
  }, []);

  const callXrayApi = async () => {
    const enrichedHoldings = holdings.map(h => {
      const meta = fundsMeta?.find(m => m.fundName === h.fundName);
      return { ...h, serie: meta?.serie || null };
    });
    const res = await fetch("/api/portfolio/xray", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ holdings: enrichedHoldings }),
    });
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`Xray API ${res.status}: ${text.slice(0, 300)}`);
    }
  };

  const fetchFIPrices = async (rut: string): Promise<boolean> => {
    try {
      setFiFetching(prev => ({ ...prev, [rut]: "loading" }));
      const res = await fetch("/api/fondos-inversion/fetch-prices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rut }),
      });
      const result = await res.json();
      if (result.success) {
        setFiFetching(prev => ({ ...prev, [rut]: "done" }));
        return true;
      } else {
        setFiFetching(prev => ({ ...prev, [rut]: "error" }));
        return false;
      }
    } catch {
      setFiFetching(prev => ({ ...prev, [rut]: "error" }));
      return false;
    }
  };

  const runXray = async () => {
    setLoading(true);
    setError(null);
    setFiFetching({});
    setFiFetchMsg(null);
    try {
      // First pass: run xray to detect FI holdings
      const result = await callXrayApi();
      if (!result.success) {
        setError(result.error || "Error en radiografía");
        return;
      }

      const xrayData = result.data;
      const staleFI = (xrayData.fondosInversionDetected || []).filter((fi: { stale: boolean }) => fi.stale);

      if (staleFI.length > 0) {
        // Fetch prices for stale FI holdings
        setFiFetchMsg(`Obteniendo precios de ${staleFI.length} fondo(s) de inversión desde CMF...`);
        let anyFetched = false;
        for (const fi of staleFI) {
          const ok = await fetchFIPrices(fi.rut);
          if (ok) anyFetched = true;
        }

        if (anyFetched) {
          // Re-run xray with fresh prices
          setFiFetchMsg("Precios actualizados. Recalculando radiografía...");
          const result2 = await callXrayApi();
          if (result2.success) {
            setData(result2.data);
            setTacOverrides({});
            setProposalOverrides({});
            setProposedTacOverrides({});
            setFiFetchMsg(null);
            return;
          }
        }
        setFiFetchMsg(null);
      }

      // Use first-pass result if no FI fetch needed or all failed
      setData(xrayData);
      setTacOverrides({});
      setProposalOverrides({});
      setProposedTacOverrides({});
    } catch (err) {
      console.error("runXray error:", err);
      setError(err instanceof Error ? err.message : "Error de conexión");
    } finally {
      setLoading(false);
    }
  };

  const generateReport = async () => {
    if (!data || !mergedProposal || !adjustedCosts) return;
    setReportLoading(true);
    setReportError(null);
    try {
      // Build enriched xrayData with all advisor edits applied
      const enrichedXrayData = {
        ...data,
        // Override with adjusted costs (reflects TAC edits)
        tacPromedioPortfolio: adjustedCosts.tacPromedio,
        costoAnualTotal: adjustedCosts.costoAnual,
        costoProyectado10Y: adjustedCosts.costoProyectado10Y,
        holdingsConTac: adjustedCosts.holdingsConTac,
        // Override holdings with effective TAC
        holdings: data.holdings.map(h => ({
          ...h,
          tac: getEffectiveTac(h),
        })),
        // Override proposal with merged (includes search overrides + TAC edits + returns)
        proposal: {
          holdings: mergedProposal.holdings,
          currentTacPromedio: mergedProposal.currentTacPromedio,
          proposedTacPromedio: mergedProposal.proposedTacPromedio,
          currentCostoAnual: mergedProposal.currentCostoAnual,
          proposedCostoAnual: mergedProposal.proposedCostoAnual,
          ahorroFondosAnual: mergedProposal.ahorroFondosAnual,
          currentRent12m: mergedProposal.currentRent12m,
          proposedRent12m: mergedProposal.proposedRent12m,
        },
      };
      const res = await fetch("/api/portfolio/xray-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          xrayData: enrichedXrayData,
          clientName,
          advisoryFee,
          customContext: customContext.trim() || undefined,
          ufValue: ufValue || undefined,
          usdValue: usdValue || undefined,
        }),
      });
      const result = await res.json();
      if (result.success) {
        setReport(result.report);
        setEditedReport(result.report);
        // Persist to localStorage
        if (storageKey) {
          try { localStorage.setItem(storageKey, JSON.stringify({ report: result.report, customContext: customContext.trim() })); } catch { /* ignore */ }
        }
      } else {
        setReportError(result.error || "Error generando informe");
      }
    } catch {
      setReportError("Error de conexión");
    } finally {
      setReportLoading(false);
    }
  };

  const startEditing = () => {
    setEditedReport(report);
    setIsEditing(true);
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.style.height = "auto";
        textareaRef.current.style.height = textareaRef.current.scrollHeight + "px";
      }
    }, 50);
  };

  const saveEdit = () => {
    setReport(editedReport);
    setIsEditing(false);
    // Persist edited report
    if (storageKey) {
      try { localStorage.setItem(storageKey, JSON.stringify({ report: editedReport, customContext: customContext.trim() })); } catch { /* ignore */ }
    }
  };

  const cancelEdit = () => {
    setEditedReport(report);
    setIsEditing(false);
  };

  const regenerateReport = () => {
    generateReport();
  };

  const copyReport = async () => {
    try {
      await navigator.clipboard.writeText(report);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  // Fund search for proposal overrides
  const searchFunds = useCallback(async (query: string) => {
    if (query.length < 2) { setFundSearchResults([]); return; }
    setFundSearchLoading(true);
    try {
      const res = await fetch(`/api/fondos/search-price?q=${encodeURIComponent(query)}&type=fund`);
      const result = await res.json();
      if (result.success) {
        setFundSearchResults(result.results || []);
      }
    } catch { /* ignore */ }
    setFundSearchLoading(false);
  }, []);

  const handleFundSearchInput = useCallback((value: string) => {
    setFundSearchQuery(value);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => searchFunds(value), 400);
  }, [searchFunds]);

  const selectFundForProposal = useCallback((holdingFundName: string, result: SearchResult) => {
    setProposalOverrides(prev => ({
      ...prev,
      [holdingFundName]: {
        proposedFund: result.nombre,
        proposedAgf: result.agf || "",
        proposedSerie: result.serie || "",
        proposedTac: result.tac ?? 0,
        proposedRent1m: result.rent_1m ?? null,
        proposedRent3m: result.rent_3m ?? null,
        proposedRent12m: result.rent_12m ?? null,
      },
    }));
    setSearchingFund(null);
    setFundSearchQuery("");
    setFundSearchResults([]);
  }, []);

  const removeProposalOverride = useCallback((holdingFundName: string) => {
    setProposalOverrides(prev => {
      const next = { ...prev };
      delete next[holdingFundName];
      return next;
    });
  }, []);

  // Get effective TAC for a holding (override or from data, or from fundsMeta fallback)
  const getEffectiveTac = useCallback((h: HoldingAnalysis): number | null => {
    if (tacOverrides[h.fundName] !== undefined) return tacOverrides[h.fundName];
    if (h.tac !== null) return h.tac;
    // Fallback: check fundsMeta
    const meta = fundsMeta?.find(m => m.fundName === h.fundName);
    return meta?.tac ?? null;
  }, [tacOverrides, fundsMeta]);

  // Recalculate adjusted costs with TAC overrides
  const adjustedCosts = useMemo(() => {
    if (!data) return null;
    const totalValue = data.totalValue;
    let weightedTac = 0;
    let costoAnual = 0;
    let countConTac = 0;

    for (const h of data.holdings) {
      const tac = getEffectiveTac(h);
      if (tac !== null) {
        weightedTac += tac * (h.weight / 100);
        costoAnual += (tac / 100) * h.marketValue;
        countConTac++;
      }
    }

    return {
      tacPromedio: Math.round(weightedTac * 100) / 100,
      costoAnual: Math.round(costoAnual),
      costoProyectado10Y: Math.round(costoAnual * 10 * 1.05),
      holdingsConTac: countConTac,
    };
  }, [data, getEffectiveTac]);

  // Merged proposal: original data + overrides
  const mergedProposal = useMemo(() => {
    if (!data?.proposal) return null;
    const totalValue = data.totalValue;

    const mergedHoldings = data.proposal.holdings.map(ph => {
      // 1) Current TAC: use tacOverrides if edited, else fallback to fundsMeta
      const effectiveCurrentTac = tacOverrides[ph.originalFund] !== undefined
        ? tacOverrides[ph.originalFund]
        : ph.currentTac !== null
          ? ph.currentTac
          : (fundsMeta?.find(m => m.fundName === ph.originalFund)?.tac ?? null);

      // 2) Proposed fund override (from search)
      const override = proposalOverrides[ph.originalFund];

      // 3) Proposed TAC: manual override > search override > original
      let proposedTac = ph.proposedTac;
      let proposedFund = ph.proposedFund;
      let proposedAgf = ph.proposedAgf;
      let proposedSerie = ph.proposedSerie;
      let proposedRent1m = ph.proposedRent1m;
      let proposedRent3m = ph.proposedRent3m;
      let proposedRent12m = ph.proposedRent12m;
      let changed = ph.changed;

      if (override) {
        proposedFund = override.proposedFund;
        proposedAgf = override.proposedAgf;
        proposedSerie = override.proposedSerie;
        proposedTac = override.proposedTac;
        proposedRent1m = override.proposedRent1m;
        proposedRent3m = override.proposedRent3m;
        proposedRent12m = override.proposedRent12m;
        changed = true;
      }

      // Manual TAC override for proposed fund (takes priority)
      if (proposedTacOverrides[ph.originalFund] !== undefined) {
        proposedTac = proposedTacOverrides[ph.originalFund];
      }

      const tacSavingBps = effectiveCurrentTac !== null
        ? Math.round((effectiveCurrentTac - proposedTac) * 100)
        : 0;

      return {
        ...ph,
        currentTac: effectiveCurrentTac,
        proposedFund,
        proposedAgf,
        proposedSerie,
        proposedTac,
        proposedRent1m,
        proposedRent3m,
        proposedRent12m,
        tacSavingBps,
        changed,
      };
    });

    // Use adjusted current TAC if overrides exist
    const currentCostoAnual = adjustedCosts?.costoAnual ?? data.proposal.currentCostoAnual;
    const currentTacPromedio = adjustedCosts?.tacPromedio ?? data.proposal.currentTacPromedio;
    const proposedCostoAnual = mergedHoldings.reduce(
      (s, h) => s + (h.proposedTac / 100) * h.marketValue, 0
    );
    const proposedTacPromedio = mergedHoldings.reduce(
      (s, h) => s + h.proposedTac * (h.weight / 100), 0
    );
    const feeAnual = Math.round(totalValue * advisoryFee / 100);
    const costoTotalPropuesto = Math.round(proposedCostoAnual) + feeAnual;
    const ahorroNeto = currentCostoAnual - costoTotalPropuesto;

    // Weighted rent 12M for current and proposed portfolios
    let currentRent12mWeighted = 0;
    let currentRent12mCoverage = 0;
    let proposedRent12mWeighted = 0;
    let proposedRent12mCoverage = 0;
    for (const h of mergedHoldings) {
      if (h.currentRent12m !== null) {
        currentRent12mWeighted += h.currentRent12m * (h.weight / 100);
        currentRent12mCoverage += h.weight;
      }
      if (h.proposedRent12m !== null) {
        proposedRent12mWeighted += h.proposedRent12m * (h.weight / 100);
        proposedRent12mCoverage += h.weight;
      }
    }

    return {
      holdings: mergedHoldings,
      currentTacPromedio: Math.round(currentTacPromedio * 100) / 100,
      proposedTacPromedio: Math.round(proposedTacPromedio * 100) / 100,
      currentCostoAnual,
      proposedCostoAnual: Math.round(proposedCostoAnual),
      ahorroFondosAnual: Math.round(currentCostoAnual - proposedCostoAnual),
      feeAnual,
      costoTotalPropuesto,
      ahorroNeto,
      currentRent12m: currentRent12mCoverage > 0 ? currentRent12mWeighted : null,
      proposedRent12m: proposedRent12mCoverage > 0 ? proposedRent12mWeighted : null,
      currentRent12mCoverage: Math.round(currentRent12mCoverage),
      proposedRent12mCoverage: Math.round(proposedRent12mCoverage),
    };
  }, [data, proposalOverrides, proposedTacOverrides, tacOverrides, fundsMeta, adjustedCosts, advisoryFee]);

  // Simple markdown renderer for ## headings and bold
  const renderMarkdown = (text: string) => {
    const lines = text.split("\n");
    const elements: React.ReactNode[] = [];
    let currentParagraph: string[] = [];

    const flushParagraph = () => {
      if (currentParagraph.length > 0) {
        const text = currentParagraph.join("\n");
        elements.push(
          <p key={elements.length} className="text-sm text-gb-black leading-relaxed mb-3">
            {text.split(/(\*\*[^*]+\*\*)/).map((part, i) =>
              part.startsWith("**") && part.endsWith("**")
                ? <strong key={i}>{part.slice(2, -2)}</strong>
                : part
            )}
          </p>
        );
        currentParagraph = [];
      }
    };

    for (const line of lines) {
      if (line.startsWith("## ")) {
        flushParagraph();
        elements.push(
          <h4 key={elements.length} className="text-sm font-bold text-gb-black mt-4 mb-2 pb-1 border-b border-gb-border">
            {line.replace("## ", "")}
          </h4>
        );
      } else if (line.startsWith("- ")) {
        flushParagraph();
        elements.push(
          <li key={elements.length} className="text-sm text-gb-black ml-4 mb-1 list-disc">
            {line.slice(2).split(/(\*\*[^*]+\*\*)/).map((part, i) =>
              part.startsWith("**") && part.endsWith("**")
                ? <strong key={i}>{part.slice(2, -2)}</strong>
                : part
            )}
          </li>
        );
      } else if (line.trim() === "") {
        flushParagraph();
      } else {
        currentParagraph.push(line);
      }
    }
    flushParagraph();
    return elements;
  };

  if (!data && !loading) {
    return (
      <div className="bg-white rounded-lg border border-gb-border shadow-sm p-6">
        <div className="text-center">
          <PieChart className="w-10 h-10 text-blue-500 mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-gb-black mb-1">
            Radiografía del Portafolio
          </h3>
          <p className="text-sm text-gb-gray mb-4">
            Analiza costos, composición y encuentra alternativas más económicas
            {clientName && <span> para {clientName}</span>}
          </p>
          <button
            onClick={runXray}
            className="px-6 py-2.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm font-medium"
          >
            Generar Radiografía
          </button>
          {error && (
            <p className="mt-3 text-sm text-red-600">
              <AlertTriangle className="w-4 h-4 inline mr-1" />
              {error}
            </p>
          )}
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-gb-border shadow-sm p-6">
        <div className="flex flex-col items-center justify-center gap-3 py-8">
          <div className="flex items-center gap-3">
            <Loader className="w-5 h-5 animate-spin text-blue-500" />
            <span className="text-gb-gray">
              {fiFetchMsg || `Analizando ${holdings.length} holdings...`}
            </span>
          </div>
          {Object.keys(fiFetching).length > 0 && (
            <div className="text-xs text-gb-gray mt-2 space-y-1">
              {Object.entries(fiFetching).map(([rut, status]) => (
                <div key={rut} className="flex items-center gap-2">
                  {status === "loading" && <Loader className="w-3 h-3 animate-spin text-amber-500" />}
                  {status === "done" && <CheckCircle2 className="w-3 h-3 text-green-500" />}
                  {status === "error" && <XCircle className="w-3 h-3 text-red-500" />}
                  <span>FI RUT {rut}: {status === "loading" ? "obteniendo precios CMF..." : status === "done" ? "listo" : "error"}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (!data) return null;

  const allocationEntries = [
    { label: "Renta Variable", ...data.allocation.rentaVariable, color: "bg-blue-500" },
    { label: "Renta Fija", ...data.allocation.rentaFija, color: "bg-green-500" },
    { label: "Balanceado", ...data.allocation.balanceado, color: "bg-purple-500" },
    { label: "Alternativos", ...data.allocation.alternativos, color: "bg-amber-500" },
    { label: "Otros", ...data.allocation.otros, color: "bg-slate-400" },
  ].filter((e) => e.percent > 0);

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        {/* Valor Total */}
        <div className="bg-white rounded-lg border border-gb-border p-4 shadow-sm">
          <p className="text-xs text-gb-gray font-medium uppercase mb-1">
            Valor Total
          </p>
          <p className="text-xl font-bold text-gb-black">
            {formatCurrency(data.totalValue)}
          </p>
          <p className="text-xs text-gb-gray mt-1">
            {ufValue ? `UF ${(data.totalValue / ufValue).toLocaleString("es-CL", { maximumFractionDigits: 1 })}` : ""}{ufValue && usdValue ? " · " : ""}{usdValue ? `USD ${(data.totalValue / usdValue).toLocaleString("es-CL", { maximumFractionDigits: 0 })}` : ""}
            {!ufValue && !usdValue ? `${data.holdings.length} holdings` : ` · ${data.holdings.length} holdings`}
          </p>
        </div>

        {/* TAC Promedio */}
        <div className="bg-white rounded-lg border border-gb-border p-4 shadow-sm">
          <p className="text-xs text-gb-gray font-medium uppercase mb-1">
            TAC Promedio
          </p>
          <p className="text-xl font-bold text-amber-600">
            {formatNumber(adjustedCosts?.tacPromedio ?? data.tacPromedioPortfolio, 2)}%
          </p>
          <p className="text-xs text-gb-gray mt-1">
            {adjustedCosts?.holdingsConTac ?? data.holdingsConTac}/{data.holdings.length} con datos TAC
          </p>
          {data.holdings.filter(h => !h.matched).length > 0 && (
            <p className="text-xs text-red-600 mt-0.5">
              {data.holdings.filter(h => !h.matched).length} sin identificar
            </p>
          )}
        </div>

        {/* Costo Anual */}
        <div className="bg-white rounded-lg border border-gb-border p-4 shadow-sm">
          <p className="text-xs text-gb-gray font-medium uppercase mb-1">
            Costo Anual
          </p>
          <p className="text-xl font-bold text-red-600">
            {formatCurrency(adjustedCosts?.costoAnual ?? data.costoAnualTotal)}
          </p>
          <p className="text-xs text-gb-gray mt-1">
            {ufValue ? `UF ${((adjustedCosts?.costoAnual ?? data.costoAnualTotal) / ufValue).toLocaleString("es-CL", { maximumFractionDigits: 1 })}/año · ` : ""}
            10 años: {formatCurrency(adjustedCosts?.costoProyectado10Y ?? data.costoProyectado10Y)}
          </p>
        </div>

        {/* Ahorro Potencial */}
        <div className="bg-white rounded-lg border border-gb-border p-4 shadow-sm">
          <p className="text-xs text-gb-gray font-medium uppercase mb-1">
            Ahorro Potencial
          </p>
          <p className="text-xl font-bold text-green-600">
            {formatCurrency(data.ahorroAnualPotencial)}
            <span className="text-sm font-normal text-gb-gray">/año</span>
          </p>
          <p className="text-xs text-gb-gray mt-1">
            {data.holdingsConAlternativa} holdings con alternativa más barata
          </p>
        </div>
      </div>

      {/* Allocation Bar */}
      <div className="bg-white rounded-lg border border-gb-border p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-gb-black mb-3">
          Composición del Portafolio
        </h3>
        <div className="flex rounded-full overflow-hidden h-6 mb-3">
          {allocationEntries.map((e) => (
            <div
              key={e.label}
              className={`${e.color} relative group`}
              style={{ width: `${Math.max(e.percent, 2)}%` }}
              title={`${e.label}: ${formatPercent(e.percent)}`}
            >
              {e.percent >= 10 && (
                <span className="absolute inset-0 flex items-center justify-center text-white text-xs font-semibold">
                  {Math.round(e.percent)}%
                </span>
              )}
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-4 text-xs">
          {allocationEntries.map((e) => (
            <div key={e.label} className="flex items-center gap-1.5">
              <span className={`w-2.5 h-2.5 rounded-full ${e.color}`} />
              <span className="text-gb-gray">
                {e.label}: {formatPercent(e.percent)} ({formatCurrency(e.value)})
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Holdings Detail Table */}
      <div className="bg-white rounded-lg border border-gb-border shadow-sm">
        <div className="px-4 py-3 border-b border-gb-border flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gb-black">
            Detalle por Holding
          </h3>
          {data.ahorroAnualPotencial > 0 && (
            <span className="text-xs px-2 py-1 bg-green-50 text-green-700 rounded-full font-medium">
              Ahorro 10 años: {formatCurrency(data.ahorroPotencial10Y)}
            </span>
          )}
        </div>
        <div className="divide-y divide-gb-border">
          {data.holdings
            .sort((a, b) => b.marketValue - a.marketValue)
            .map((h) => {
              const isExpanded = expandedHolding === h.fundName;
              return (
                <div key={h.fundName}>
                  <div
                    className="px-4 py-3 flex items-center gap-3 hover:bg-slate-50 cursor-pointer transition-colors"
                    onClick={() =>
                      setExpandedHolding(isExpanded ? null : h.fundName)
                    }
                  >
                    {/* Expand icon */}
                    <span className="text-gb-gray">
                      {h.cheaperAlternatives.length > 0 ? (
                        isExpanded ? (
                          <ChevronDown className="w-4 h-4" />
                        ) : (
                          <ChevronRight className="w-4 h-4" />
                        )
                      ) : (
                        <span className="w-4" />
                      )}
                    </span>

                    {/* Fund info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gb-black truncate">
                        {h.fundName}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-gb-gray">
                        <span className="px-1.5 py-0.5 bg-slate-100 rounded">
                          {h.categoria}
                        </span>
                        {h.matchedAgf && <span>{h.matchedAgf}</span>}
                        {!h.matched && (
                          <span className="px-1.5 py-0.5 bg-red-100 text-red-700 rounded font-medium">
                            No identificado
                          </span>
                        )}
                        {h.isFondoInversion && (
                          <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded font-medium">
                            FI{h.fiPrecioFecha ? ` ${h.fiPrecioFecha}` : ""}
                          </span>
                        )}
                        {h.beneficio107lir && (
                          <span className="px-1.5 py-0.5 bg-green-100 text-green-700 rounded font-medium">
                            107
                          </span>
                        )}
                        {h.beneficio108lir && (
                          <span className="px-1.5 py-0.5 bg-green-100 text-green-700 rounded font-medium">
                            108
                          </span>
                        )}
                        {h.isApvEligible && (
                          <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded font-medium">
                            APV
                          </span>
                        )}
                        {h.regimen57bis && (
                          <span className="px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded font-medium">
                            57bis
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Value */}
                    <div className="text-right">
                      <p className="text-sm font-semibold text-gb-black">
                        {formatCurrency(h.marketValue)}
                      </p>
                      <p className="text-xs text-gb-gray">
                        {formatNumber(h.weight, 1)}%
                      </p>
                    </div>

                    {/* TAC (editable) */}
                    <div className="text-right w-24" onClick={(e) => e.stopPropagation()}>
                      {(() => {
                        const effectiveTac = getEffectiveTac(h);
                        const isOverridden = tacOverrides[h.fundName] !== undefined;
                        return effectiveTac !== null ? (
                          <div>
                            <input
                              type="number"
                              value={isOverridden ? tacOverrides[h.fundName] : effectiveTac}
                              onChange={(e) => {
                                const val = parseFloat(e.target.value);
                                if (!isNaN(val) && val >= 0 && val <= 10) {
                                  setTacOverrides(prev => ({ ...prev, [h.fundName]: val }));
                                }
                              }}
                              className={`w-16 px-1 py-0.5 text-xs text-right border rounded ${
                                isOverridden ? "border-blue-400 bg-blue-50" : "border-gb-border"
                              } ${effectiveTac > 2 ? "text-red-600" : effectiveTac > 1 ? "text-amber-600" : "text-green-600"} font-semibold`}
                              step="0.01"
                              min="0"
                              max="10"
                            />
                            <p className="text-[10px] text-gb-gray uppercase">
                              TAC{isOverridden && " (edit)"}
                            </p>
                          </div>
                        ) : (
                          <div>
                            <input
                              type="number"
                              placeholder="-"
                              onChange={(e) => {
                                const val = parseFloat(e.target.value);
                                if (!isNaN(val) && val >= 0 && val <= 10) {
                                  setTacOverrides(prev => ({ ...prev, [h.fundName]: val }));
                                }
                              }}
                              className="w-16 px-1 py-0.5 text-xs text-right border border-dashed border-gb-border rounded text-gb-gray"
                              step="0.01"
                              min="0"
                              max="10"
                            />
                            <p className="text-[10px] text-gb-gray uppercase">TAC</p>
                          </div>
                        );
                      })()}
                    </div>

                    {/* Savings indicator */}
                    <div className="w-24 text-right">
                      {h.potentialSavingAnnual && h.potentialSavingAnnual > 0 ? (
                        <p className="text-sm font-semibold text-green-600">
                          <TrendingDown className="w-3 h-3 inline mr-0.5" />
                          {formatCurrency(h.potentialSavingAnnual)}
                        </p>
                      ) : h.tac !== null ? (
                        <span className="text-xs text-gb-gray">
                          <CheckCircle2 className="w-3 h-3 inline text-green-500" /> Competitivo
                        </span>
                      ) : (
                        <span className="text-xs text-gb-gray">
                          <XCircle className="w-3 h-3 inline text-slate-400" /> Sin datos
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Expanded: alternatives */}
                  {isExpanded && h.cheaperAlternatives.length > 0 && (
                    <div className="px-4 pb-3 ml-7">
                      <p className="text-xs font-semibold text-gb-gray mb-2">
                        Alternativas más económicas:
                      </p>
                      <div className="space-y-1.5">
                        {h.cheaperAlternatives.map((alt, i) => (
                          <div
                            key={i}
                            className="flex items-center gap-3 text-xs bg-green-50 border border-green-200 rounded-md px-3 py-2"
                          >
                            <ArrowRight className="w-3 h-3 text-green-600 shrink-0" />
                            <div className="flex-1 min-w-0">
                              <span className="font-medium text-gb-black truncate block">
                                {alt.nombre_fondo}
                              </span>
                              <span className="text-gb-gray">
                                {alt.nombre_agf} — Serie {alt.fm_serie}
                              </span>
                            </div>
                            <div className="text-right shrink-0">
                              <span className="font-bold text-green-700">
                                TAC {formatNumber(alt.tac_sintetica, 2)}%
                              </span>
                              <span className="text-gb-gray block">
                                vs {formatNumber(h.tac || 0, 2)}% actual
                              </span>
                            </div>
                            {alt.rent_12m !== null && (
                              <div className="text-right shrink-0">
                                <span className={`font-medium ${alt.rent_12m >= 0 ? "text-green-700" : "text-red-600"}`}>
                                  {formatPercent(alt.rent_12m)}
                                </span>
                                <span className="text-gb-gray block">12M</span>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                      {h.potentialSaving10Y && h.potentialSaving10Y > 0 && (
                        <p className="mt-2 text-xs text-green-700 font-medium">
                          <DollarSign className="w-3 h-3 inline" />
                          Ahorro estimado en 10 años: {formatCurrency(h.potentialSaving10Y)}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      </div>

      {/* Proposal Section — "Nuestra Propuesta" */}
      {mergedProposal && (
        <div className="bg-white rounded-lg border border-gb-border shadow-sm">
          <div className="px-4 py-3 border-b border-gb-border">
            <h3 className="text-sm font-semibold text-gb-black">
              Propuesta de Optimización
            </h3>
            <p className="text-xs text-gb-gray mt-0.5">
              Comparación entre fondos actuales y alternativas de menor costo. Usa el buscador para proponer fondos manualmente.
            </p>
          </div>

          {/* Proposal comparison table */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-gb-border">
                  <th className="text-left px-3 py-2 font-semibold text-gb-gray">Actual</th>
                  <th className="text-left px-3 py-2 font-semibold text-gb-gray">Propuesto</th>
                  <th className="text-center px-3 py-2 font-semibold text-gb-gray">Cat.</th>
                  <th className="text-right px-3 py-2 font-semibold text-gb-gray">Peso</th>
                  <th className="text-right px-3 py-2 font-semibold text-gb-gray">TAC Actual</th>
                  <th className="text-right px-3 py-2 font-semibold text-gb-gray">TAC Prop.</th>
                  <th className="text-center px-2 py-2 font-semibold text-gb-gray" colSpan={2}>
                    <div className="flex items-center justify-center gap-1">
                      <span>Rent.</span>
                      <select
                        value={rentPeriod}
                        onChange={(e) => setRentPeriod(e.target.value as "1M" | "3M" | "1Y")}
                        className="text-[10px] font-semibold text-gb-gray bg-white border border-gb-border rounded px-1 py-0.5 cursor-pointer"
                      >
                        <option value="1M">1M</option>
                        <option value="3M">3M</option>
                        <option value="1Y">1Y</option>
                      </select>
                    </div>
                    <div className="flex justify-between text-[9px] text-gb-gray mt-0.5 px-1">
                      <span>Actual</span>
                      <span>Prop.</span>
                    </div>
                  </th>
                  <th className="text-right px-3 py-2 font-semibold text-gb-gray">Ahorro</th>
                  <th className="text-center px-3 py-2 font-semibold text-gb-gray w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gb-border">
                {mergedProposal.holdings
                  .sort((a, b) => b.weight - a.weight)
                  .map((ph, i) => {
                    const isSearching = searchingFund === ph.originalFund;
                    const hasOverride = !!proposalOverrides[ph.originalFund];
                    return (
                      <React.Fragment key={i}>
                        <tr className={ph.changed ? "bg-green-50/50" : ""}>
                          <td className="px-3 py-2">
                            <span className="font-medium text-gb-black truncate block max-w-[180px]" title={ph.originalFund}>
                              {ph.originalFund.length > 28 ? ph.originalFund.substring(0, 28) + "..." : ph.originalFund}
                            </span>
                            {(() => {
                              const hMatch = data?.holdings.find(h => h.fundName === ph.originalFund);
                              if (!hMatch) return null;
                              const badges: Array<{ label: string; color: string }> = [];
                              if (hMatch.beneficio107lir) badges.push({ label: "107", color: "bg-green-100 text-green-700" });
                              if (hMatch.beneficio108lir) badges.push({ label: "108", color: "bg-green-100 text-green-700" });
                              if (hMatch.isApvEligible) badges.push({ label: "APV", color: "bg-blue-100 text-blue-700" });
                              if (hMatch.regimen57bis) badges.push({ label: "57bis", color: "bg-purple-100 text-purple-700" });
                              if (badges.length === 0) return null;
                              return (
                                <div className="flex gap-1 mt-0.5">
                                  {badges.map(b => (
                                    <span key={b.label} className={`px-1 py-0 rounded text-[9px] font-medium ${b.color}`}>{b.label}</span>
                                  ))}
                                </div>
                              );
                            })()}
                          </td>
                          <td className="px-3 py-2">
                            {ph.changed ? (
                              <div className="flex items-center gap-1">
                                <div className="flex-1 min-w-0">
                                  <span className={`font-medium truncate block max-w-[160px] ${hasOverride ? "text-blue-700" : "text-green-700"}`} title={ph.proposedFund}>
                                    {ph.proposedFund.length > 26 ? ph.proposedFund.substring(0, 26) + "..." : ph.proposedFund}
                                  </span>
                                  <span className="text-[10px] text-gb-gray">{ph.proposedAgf}{ph.proposedSerie && ` — ${ph.proposedSerie}`}</span>
                                </div>
                                {hasOverride && (
                                  <button
                                    onClick={() => removeProposalOverride(ph.originalFund)}
                                    className="text-gb-gray hover:text-red-500 shrink-0"
                                    title="Quitar override"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                )}
                              </div>
                            ) : (
                              <span className="text-gb-gray italic">Sin cambio</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-center">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                              ph.categoria === "Renta Variable" ? "bg-blue-100 text-blue-700" :
                              ph.categoria === "Renta Fija" ? "bg-green-100 text-green-700" :
                              ph.categoria === "Balanceado" ? "bg-purple-100 text-purple-700" :
                              "bg-slate-100 text-slate-700"
                            }`}>
                              {ph.categoria === "Renta Variable" ? "RV" :
                               ph.categoria === "Renta Fija" ? "RF" :
                               ph.categoria === "Balanceado" ? "Bal" :
                               ph.categoria === "Alternativos" ? "Alt" : "Otro"}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right text-gb-gray">{formatNumber(ph.weight, 1)}%</td>
                          <td className="px-3 py-2 text-right">
                            <input
                              type="number"
                              value={ph.currentTac ?? ""}
                              onChange={(e) => {
                                const val = parseFloat(e.target.value);
                                if (!isNaN(val) && val >= 0 && val <= 10) {
                                  setTacOverrides(prev => ({ ...prev, [ph.originalFund]: val }));
                                }
                              }}
                              placeholder="-"
                              className={`w-16 px-1 py-0.5 text-xs text-right border rounded ${
                                tacOverrides[ph.originalFund] !== undefined ? "border-blue-400 bg-blue-50" : "border-gb-border"
                              } ${(ph.currentTac ?? 0) > 2 ? "text-red-600 font-semibold" : (ph.currentTac ?? 0) > 1 ? "text-amber-600" : "text-gb-black"}`}
                              step="0.01"
                              min="0"
                              max="10"
                            />
                          </td>
                          <td className="px-3 py-2 text-right">
                            <input
                              type="number"
                              value={ph.proposedTac}
                              onChange={(e) => {
                                const val = parseFloat(e.target.value);
                                if (!isNaN(val) && val >= 0 && val <= 10) {
                                  setProposedTacOverrides(prev => ({ ...prev, [ph.originalFund]: val }));
                                }
                              }}
                              className={`w-16 px-1 py-0.5 text-xs text-right border rounded ${
                                proposedTacOverrides[ph.originalFund] !== undefined ? "border-blue-400 bg-blue-50" : "border-gb-border"
                              } ${ph.changed ? "text-green-700 font-semibold" : "text-gb-gray"}`}
                              step="0.01"
                              min="0"
                              max="10"
                            />
                          </td>
                          {(() => {
                            const currentRent = rentPeriod === "1M" ? ph.currentRent1m : rentPeriod === "3M" ? ph.currentRent3m : ph.currentRent12m;
                            const proposedRent = rentPeriod === "1M" ? ph.proposedRent1m : rentPeriod === "3M" ? ph.proposedRent3m : ph.proposedRent12m;
                            return (
                              <>
                                <td className="px-2 py-2 text-right">
                                  {currentRent !== null ? (
                                    <span className={`${currentRent >= 0 ? "text-gb-black" : "text-red-600"}`}>
                                      {formatPercent(currentRent)}
                                    </span>
                                  ) : <span className="text-gb-gray">-</span>}
                                </td>
                                <td className="px-2 py-2 text-right">
                                  {proposedRent !== null ? (
                                    <span className={`font-medium ${proposedRent >= 0 ? "text-green-600" : "text-red-600"}`}>
                                      {formatPercent(proposedRent)}
                                    </span>
                                  ) : <span className="text-gb-gray">-</span>}
                                </td>
                              </>
                            );
                          })()}
                          <td className="px-3 py-2 text-right">
                            {ph.tacSavingBps > 0 ? (
                              <span className="text-green-700 font-semibold">-{ph.tacSavingBps} bps</span>
                            ) : <span className="text-gb-gray">-</span>}
                          </td>
                          <td className="px-3 py-2 text-center">
                            <button
                              onClick={() => {
                                if (isSearching) {
                                  setSearchingFund(null);
                                  setFundSearchQuery("");
                                  setFundSearchResults([]);
                                } else {
                                  setSearchingFund(ph.originalFund);
                                  setFundSearchQuery("");
                                  setFundSearchResults([]);
                                }
                              }}
                              className={`p-1 rounded transition-colors ${isSearching ? "bg-blue-100 text-blue-600" : "text-gb-gray hover:bg-slate-100"}`}
                              title="Buscar fondo alternativo"
                            >
                              <Search className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                        {/* Inline search row */}
                        {isSearching && (
                          <tr>
                            <td colSpan={9} className="px-3 py-2 bg-blue-50/50">
                              <div className="flex items-center gap-2 mb-2">
                                <Search className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                                <input
                                  type="text"
                                  value={fundSearchQuery}
                                  onChange={(e) => handleFundSearchInput(e.target.value)}
                                  placeholder="Buscar fondo por nombre, RUN o AGF..."
                                  className="flex-1 px-2 py-1.5 text-xs border border-gb-border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                  autoFocus
                                />
                                <button
                                  onClick={() => { setSearchingFund(null); setFundSearchQuery(""); setFundSearchResults([]); }}
                                  className="text-gb-gray hover:text-red-500"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                              {fundSearchLoading && (
                                <div className="flex items-center gap-2 py-2 text-xs text-gb-gray">
                                  <Loader className="w-3 h-3 animate-spin" /> Buscando...
                                </div>
                              )}
                              {fundSearchResults.length > 0 && (
                                <div className="max-h-48 overflow-y-auto space-y-1">
                                  {fundSearchResults.slice(0, 10).map((r, ri) => (
                                    <button
                                      key={ri}
                                      onClick={() => selectFundForProposal(ph.originalFund, r)}
                                      className="w-full text-left px-2 py-1.5 text-xs bg-white border border-gb-border rounded hover:bg-blue-50 hover:border-blue-300 transition-colors flex items-center gap-2"
                                    >
                                      <div className="flex-1 min-w-0">
                                        <span className="font-medium text-gb-black block truncate">{r.nombre}</span>
                                        <span className="text-gb-gray">{r.agf}{r.serie && ` — Serie ${r.serie}`}</span>
                                      </div>
                                      {r.tac != null && (
                                        <span className={`shrink-0 font-semibold ${r.tac > 2 ? "text-red-600" : r.tac > 1 ? "text-amber-600" : "text-green-600"}`}>
                                          TAC {formatNumber(r.tac, 2)}%
                                        </span>
                                      )}
                                      {r.rent_12m != null && (
                                        <span className={`shrink-0 font-medium ${r.rent_12m >= 0 ? "text-green-600" : "text-red-600"}`}>
                                          {formatPercent(r.rent_12m)}
                                        </span>
                                      )}
                                    </button>
                                  ))}
                                </div>
                              )}
                              {!fundSearchLoading && fundSearchQuery.length >= 2 && fundSearchResults.length === 0 && (
                                <p className="text-xs text-gb-gray py-2">Sin resultados para &ldquo;{fundSearchQuery}&rdquo;</p>
                              )}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
              </tbody>
            </table>
          </div>

          {/* Cost & return comparison summary */}
          <div className="px-4 py-4 border-t border-gb-border bg-slate-50">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {/* Current Cost */}
              <div className="bg-white rounded-lg border border-gb-border p-3">
                <p className="text-[10px] text-gb-gray font-medium uppercase mb-1">Costo Actual (Fondos)</p>
                <p className="text-lg font-bold text-red-600">
                  {formatNumber(mergedProposal.currentTacPromedio, 2)}%
                </p>
                <p className="text-xs text-gb-gray">
                  {formatCurrency(mergedProposal.currentCostoAnual)}/año
                  {ufValue ? ` (UF ${(mergedProposal.currentCostoAnual / ufValue).toLocaleString("es-CL", { maximumFractionDigits: 1 })})` : ""}
                </p>
                {mergedProposal.currentRent12m !== null && (
                  <p className="text-xs mt-1">
                    <span className="text-gb-gray">Rent 12M: </span>
                    <span className={mergedProposal.currentRent12m >= 0 ? "text-green-600 font-medium" : "text-red-600 font-medium"}>
                      {formatPercent(mergedProposal.currentRent12m)}
                    </span>
                    {mergedProposal.currentRent12mCoverage < 100 && (
                      <span className="text-[10px] text-gb-gray"> ({mergedProposal.currentRent12mCoverage}% cobertura)</span>
                    )}
                  </p>
                )}
              </div>

              {/* Proposed Cost with Advisory Fee */}
              <div className="bg-white rounded-lg border border-green-200 p-3">
                <p className="text-[10px] text-gb-gray font-medium uppercase mb-1">Costo Propuesto (Fondos + Fee)</p>
                <p className="text-lg font-bold text-green-600">
                  {formatNumber(mergedProposal.proposedTacPromedio + advisoryFee, 2)}%
                </p>
                <div className="text-xs text-gb-gray space-y-0.5">
                  <p>Fondos: {formatNumber(mergedProposal.proposedTacPromedio, 2)}% ({formatCurrency(mergedProposal.proposedCostoAnual)}/año)</p>
                  <div className="flex items-center gap-1">
                    <span>Advisory Fee:</span>
                    <input
                      type="number"
                      value={advisoryFee}
                      onChange={(e) => setAdvisoryFee(Math.max(0, Math.min(5, parseFloat(e.target.value) || 0)))}
                      className="w-14 px-1 py-0.5 text-xs border border-gb-border rounded text-right"
                      step="0.1"
                      min="0"
                      max="5"
                    />
                    <span>% ({formatCurrency(mergedProposal.feeAnual)}/año)</span>
                  </div>
                  <p className="font-medium text-gb-black">
                    Total: {formatCurrency(mergedProposal.costoTotalPropuesto)}/año
                    {ufValue ? ` (UF ${(mergedProposal.costoTotalPropuesto / ufValue).toLocaleString("es-CL", { maximumFractionDigits: 1 })})` : ""}
                  </p>
                </div>
                {mergedProposal.proposedRent12m !== null && (
                  <p className="text-xs mt-1">
                    <span className="text-gb-gray">Rent 12M: </span>
                    <span className={mergedProposal.proposedRent12m >= 0 ? "text-green-600 font-medium" : "text-red-600 font-medium"}>
                      {formatPercent(mergedProposal.proposedRent12m)}
                    </span>
                    {mergedProposal.proposedRent12mCoverage < 100 && (
                      <span className="text-[10px] text-gb-gray"> ({mergedProposal.proposedRent12mCoverage}% cobertura)</span>
                    )}
                  </p>
                )}
              </div>

              {/* Net Savings */}
              <div className="bg-white rounded-lg border border-gb-border p-3">
                <p className="text-[10px] text-gb-gray font-medium uppercase mb-1">Ahorro Neto del Cliente</p>
                {(() => {
                  const ahorroNeto = mergedProposal.ahorroNeto;
                  const ahorro10Y = ahorroNeto * 10 * 1.05;
                  return (
                    <>
                      <p className={`text-lg font-bold ${ahorroNeto > 0 ? "text-green-600" : "text-red-600"}`}>
                        {ahorroNeto > 0 ? "+" : ""}{formatCurrency(ahorroNeto)}/año
                      </p>
                      <p className="text-xs text-gb-gray">
                        {ahorroNeto > 0
                          ? `Ahorra ${formatCurrency(Math.abs(ahorroNeto))}/año${ufValue ? ` (UF ${(Math.abs(ahorroNeto) / ufValue).toLocaleString("es-CL", { maximumFractionDigits: 1 })})` : ""}`
                          : ahorroNeto === 0
                            ? "Costo equivalente con asesoría profesional"
                            : `Costo adicional de ${formatCurrency(Math.abs(ahorroNeto))}/año por asesoría profesional`
                        }
                      </p>
                      <p className="text-[10px] text-gb-gray mt-1">
                        Diferencia TAC: {formatNumber(mergedProposal.currentTacPromedio - mergedProposal.proposedTacPromedio - advisoryFee, 2)}% puntos
                      </p>
                    </>
                  );
                })()}
              </div>

              {/* Return comparison */}
              <div className="bg-white rounded-lg border border-gb-border p-3">
                <p className="text-[10px] text-gb-gray font-medium uppercase mb-1">Rentabilidad 12M Ponderada</p>
                {mergedProposal.currentRent12m !== null || mergedProposal.proposedRent12m !== null ? (
                  <div className="space-y-2">
                    <div>
                      <p className="text-[10px] text-gb-gray">Actual</p>
                      <p className={`text-sm font-bold ${(mergedProposal.currentRent12m ?? 0) >= 0 ? "text-gb-black" : "text-red-600"}`}>
                        {mergedProposal.currentRent12m !== null ? formatPercent(mergedProposal.currentRent12m) : "N/D"}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-gb-gray">Propuesto</p>
                      <p className={`text-sm font-bold ${(mergedProposal.proposedRent12m ?? 0) >= 0 ? "text-green-600" : "text-red-600"}`}>
                        {mergedProposal.proposedRent12m !== null ? formatPercent(mergedProposal.proposedRent12m) : "N/D"}
                      </p>
                    </div>
                    {mergedProposal.currentRent12m !== null && mergedProposal.proposedRent12m !== null && (
                      <p className="text-[10px] text-gb-gray">
                        Diferencia: <span className={`font-medium ${mergedProposal.proposedRent12m - mergedProposal.currentRent12m >= 0 ? "text-green-600" : "text-red-600"}`}>
                          {mergedProposal.proposedRent12m - mergedProposal.currentRent12m >= 0 ? "+" : ""}{formatPercent(mergedProposal.proposedRent12m - mergedProposal.currentRent12m)}
                        </span>
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-gb-gray">Sin datos de rentabilidad</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Report Section */}
      <div className="bg-white rounded-lg border border-gb-border shadow-sm">
        <div className="px-4 py-3 border-b border-gb-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-blue-500" />
            <h3 className="text-sm font-semibold text-gb-black">
              Informe de Radiografía
            </h3>
          </div>
          {!report && !reportLoading && (
            <button
              onClick={() => generateReport()}
              className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors font-medium"
            >
              Generar Informe
            </button>
          )}
          {report && !isEditing && (
            <div className="flex items-center gap-1.5">
              <button
                onClick={copyReport}
                className="text-xs px-2 py-1 text-gb-gray hover:bg-slate-100 rounded transition-colors flex items-center gap-1"
                title="Copiar al portapapeles"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? "Copiado" : "Copiar"}
              </button>
              <button
                onClick={startEditing}
                className="text-xs px-2 py-1 text-gb-gray hover:bg-slate-100 rounded transition-colors flex items-center gap-1"
                title="Editar informe"
              >
                <Pencil className="w-3.5 h-3.5" />
                Editar
              </button>
              <button
                onClick={regenerateReport}
                className="text-xs px-2 py-1 text-gb-gray hover:bg-slate-100 rounded transition-colors flex items-center gap-1"
                title="Regenerar informe"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Regenerar
              </button>
            </div>
          )}
        </div>
        <div className="p-4">
          {reportLoading && (
            <div className="flex items-center justify-center gap-3 py-8">
              <Loader className="w-5 h-5 animate-spin text-blue-500" />
              <span className="text-sm text-gb-gray">Generando informe profesional...</span>
            </div>
          )}
          {reportError && (
            <p className="text-sm text-red-600 py-4 text-center">
              <AlertTriangle className="w-4 h-4 inline mr-1" />
              {reportError}
            </p>
          )}
          {/* Custom context — always visible */}
          {!reportLoading && !isEditing && (
            <div className="mb-3">
              <label className="text-xs font-medium text-gb-gray block mb-1">
                Notas del asesor para el informe (se incluyen en el prompt)
              </label>
              <textarea
                value={customContext}
                onChange={(e) => setCustomContext(e.target.value)}
                placeholder="Ej: El cliente tiene perfil conservador, está próximo a jubilarse, quiere priorizar renta fija, tiene beneficio 57bis..."
                className="w-full px-3 py-2 text-xs border border-gb-border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                rows={2}
              />
              {!report && (
                <p className="text-[10px] text-gb-gray mt-1">
                  Estas notas se incluirán en el informe AI. Puedes editarlas y regenerar en cualquier momento.
                </p>
              )}
            </div>
          )}
          {report && !isEditing && (
            <div className="prose prose-sm max-w-none">
              {renderMarkdown(report)}
            </div>
          )}
          {isEditing && (
            <div>
              <textarea
                ref={textareaRef}
                value={editedReport}
                onChange={(e) => {
                  setEditedReport(e.target.value);
                  e.target.style.height = "auto";
                  e.target.style.height = e.target.scrollHeight + "px";
                }}
                className="w-full min-h-[300px] p-3 text-sm font-mono border border-gb-border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                placeholder="Edita el informe..."
              />
              <div className="flex justify-end gap-2 mt-2">
                <button
                  onClick={cancelEdit}
                  className="text-xs px-3 py-1.5 text-gb-gray bg-white border border-gb-border rounded-md hover:bg-slate-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={saveEdit}
                  className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors flex items-center gap-1"
                >
                  <Save className="w-3.5 h-3.5" />
                  Guardar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Disclaimer */}
      <p className="text-[10px] text-gb-gray text-center">
        Los costos y ahorros son estimaciones basadas en TAC sintética (CMF).
        El rendimiento pasado no garantiza resultados futuros.
        Consulte las condiciones de cada fondo antes de invertir.
      </p>
    </div>
  );
}
