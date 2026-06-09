"use client";

import React, { useState, useRef, useCallback } from "react";
import {
  Loader,
  AlertTriangle,
  PieChart,

  CheckCircle2,
  XCircle,
  FileText,
  Pencil,
  Save,
  RotateCcw,
  Copy,
  Check,
} from "lucide-react";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/format";
import XraySummaryCards from "./XraySummaryCards";
import XrayTaxSummary from "./XrayTaxSummary";
import XrayHoldingsTable from "./XrayHoldingsTable";
import XrayProposalTable from "./XrayProposalTable";
import {
  useXrayProposal,

  type XrayData,
  type ProposalOverride,
  type FundMeta,
} from "./hooks/useXrayProposal";

interface Holding {
  fundName: string;
  securityId?: string | null;
  serie?: string | null;
  quantity?: number;
  unitCost?: number;
  costBasis?: number;
  marketPrice?: number;
  marketValue: number;
  marketValueCLP?: number;
  assetClass?: string;
  currency?: string;
}

interface Props {
  holdings: Holding[];
  clientName?: string;
  clientId?: string;
  fundsMeta?: FundMeta[];
  cartolaDate?: string;     // fecha de la cartola (snapshot_date)
  currentValue?: number;    // valor actual del portafolio (último punto historicalSeries)
  currentValueDate?: string; // fecha del último precio
  perfilRiesgo?: string;
  custodianType?: string;
  readOnly?: boolean;
  radiografiaEndpoint?: string;
}

export default function RadiografiaCartola({ holdings, clientName, clientId, fundsMeta, cartolaDate, currentValue, currentValueDate, perfilRiesgo, custodianType, readOnly, radiografiaEndpoint }: Props) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<XrayData | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [modelData, setModelData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
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
  // Custom context for AI report
  const [customContext, setCustomContext] = useState<string>("");

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
      return {
        ...h,
        // Use serie/securityId from snapshot (auto-match), fallback to fundsMeta
        serie: h.serie || meta?.serie || null,
        securityId: h.securityId || meta?.run || null,
      };
    });
    const res = await fetch(radiografiaEndpoint || "/api/portfolio/xray", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        holdings: enrichedHoldings,
        perfilRiesgo,
        custodianType,
      }),
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
            setModelData(result2.modelData || null);
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
      setModelData(result.modelData || null);
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
          cartolaDate: cartolaDate || undefined,
          currentValue: currentValue || undefined,
          currentValueDate: currentValueDate || undefined,
          modelData: modelData || undefined,
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

  const selectFundForProposal = useCallback((holdingFundName: string, result: { nombre: string; agf?: string; serie?: string; tac?: number | null; rent_1m?: number | null; rent_3m?: number | null; rent_12m?: number | null }) => {
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
  }, []);

  const removeProposalOverride = useCallback((holdingFundName: string) => {
    setProposalOverrides(prev => {
      const next = { ...prev };
      delete next[holdingFundName];
      return next;
    });
  }, []);

  const { getEffectiveTac, adjustedCosts, mergedProposal, portfolioRent12m } = useXrayProposal({
    data,
    tacOverrides,
    proposalOverrides,
    proposedTacOverrides,
    fundsMeta,
    advisoryFee,
  });

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
      <XraySummaryCards
        totalValue={data.totalValue}
        holdingsCount={data.holdings.length}
        holdingsSinIdentificar={data.holdings.filter(h => !h.matched).length}
        ufValue={ufValue}
        usdValue={usdValue}
        tacPromedio={adjustedCosts?.tacPromedio ?? data.tacPromedioPortfolio}
        holdingsConTac={adjustedCosts?.holdingsConTac ?? data.holdingsConTac}
        costoAnual={adjustedCosts?.costoAnual ?? data.costoAnualTotal}
        costoProyectado10Y={adjustedCosts?.costoProyectado10Y ?? data.costoProyectado10Y}
        ahorroAnualPotencial={data.ahorroAnualPotencial}
        holdingsConAlternativa={data.holdingsConAlternativa}
        portfolioRent12m={portfolioRent12m}
      />

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

      {/* Model Portfolio Deviations */}
      {modelData && modelData.deviations && modelData.deviations.length > 0 && (
        <div className="mt-4 p-4 bg-blue-50 rounded-lg">
          <h4 className="text-sm font-semibold text-gb-black mb-2">
            Cartera Modelo vs Actual
            <span className="ml-2 text-xs font-normal text-gb-gray">
              Perfil: {modelData.perfil.replace(/_/g, " ")} | Comite: {modelData.reportDate}
            </span>
          </h4>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-blue-200">
                <th className="text-left py-1 px-2">Categoria</th>
                <th className="text-right py-1 px-2">Target</th>
                <th className="text-right py-1 px-2">Actual</th>
                <th className="text-right py-1 px-2">Desviacion</th>
                <th className="text-left py-1 px-2">Estado</th>
                <th className="text-left py-1 px-2">Fondo Recomendado</th>
              </tr>
            </thead>
            <tbody>
              {modelData.deviations.map((d: {
                categoria: string;
                targetWeight: number;
                actualWeight: number;
                deviation: number;
                estado: string;
                mappedFund: { fundName: string | null; ticker: string | null } | null;
              }) => (
                <tr key={d.categoria} className="border-b border-blue-100">
                  <td className="py-1 px-2 font-medium">{d.categoria}</td>
                  <td className="py-1 px-2 text-right">{d.targetWeight}%</td>
                  <td className="py-1 px-2 text-right">{d.actualWeight}%</td>
                  <td className={`py-1 px-2 text-right font-medium ${
                    d.deviation > 2 ? "text-orange-600" : d.deviation < -2 ? "text-red-600" : "text-green-600"
                  }`}>
                    {d.deviation > 0 ? "+" : ""}{d.deviation}%
                  </td>
                  <td className="py-1 px-2">
                    <span className={`text-xs px-1.5 py-0.5 rounded ${
                      d.estado === "SOBREPONDERADO" ? "bg-orange-100 text-orange-700" :
                      d.estado === "SUBPONDERADO" ? "bg-red-100 text-red-700" :
                      "bg-green-100 text-green-700"
                    }`}>
                      {d.estado === "EN_RANGO" ? "OK" : d.estado.toLowerCase().replace("_", " ")}
                    </span>
                  </td>
                  <td className="py-1 px-2 text-gb-gray">
                    {d.mappedFund ? (d.mappedFund.fundName || d.mappedFund.ticker || "\u2014") : "\u2014"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Holdings Detail Table */}
      <XrayHoldingsTable
        holdings={data.holdings}
        ahorroPotencial10Y={data.ahorroPotencial10Y}
        ahorroAnualPotencial={data.ahorroAnualPotencial}
        getEffectiveTac={getEffectiveTac}
        tacOverrides={tacOverrides}
        onTacOverride={(fundName, value) =>
          setTacOverrides(prev => ({ ...prev, [fundName]: value }))
        }
      />

      {/* Proposal Section */}
      {mergedProposal && (
        <XrayProposalTable
          mergedProposal={mergedProposal}
          dataHoldings={data.holdings}
          ufValue={ufValue}
          advisoryFee={advisoryFee}
          onAdvisoryFeeChange={setAdvisoryFee}
          tacOverrides={tacOverrides}
          onTacOverride={(fundName, value) =>
            setTacOverrides(prev => ({ ...prev, [fundName]: value }))
          }
          proposedTacOverrides={proposedTacOverrides}
          onProposedTacOverride={(fundName, value) =>
            setProposedTacOverrides(prev => ({ ...prev, [fundName]: value }))
          }
          proposalOverrides={proposalOverrides}
          onSelectFund={selectFundForProposal}
          onRemoveOverride={removeProposalOverride}
          readOnly={readOnly}
          clientId={clientId}
        />
      )}

      {/* Tax Summary Section */}
      <XrayTaxSummary
        holdings={data.holdings}
        rawHoldings={holdings}
        mergedProposal={mergedProposal}
        ufValue={ufValue}
        usdValue={usdValue}
        clientName={clientName}
        clientId={clientId}
        readOnly={readOnly}
      />

      {/* Report Section — advisor only */}
      {!readOnly && (
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
      )}

      {/* Disclaimer */}
      <p className="text-[10px] text-gb-gray text-center">
        Los costos y ahorros son estimaciones basadas en TAC sintética (CMF).
        El rendimiento pasado no garantiza resultados futuros.
        Consulte las condiciones de cada fondo antes de invertir.
      </p>
    </div>
  );
}
