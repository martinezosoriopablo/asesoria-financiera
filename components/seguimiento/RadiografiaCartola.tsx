"use client";

import React, { useState, useCallback } from "react";
import {
  Loader,
  AlertTriangle,
  PieChart,
  ArrowRight,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { formatCurrency, formatPercent } from "@/lib/format";
import XraySummaryCards from "./XraySummaryCards";
import XrayHoldingsTable from "./XrayHoldingsTable";
import XrayProposalTable from "./XrayProposalTable";
import XrayReportSection from "./XrayReportSection";
import {
  useXrayProposal,
  type HoldingAnalysis,
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

  // Load saved customContext on mount
  React.useEffect(() => {
    if (!storageKey) return;
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
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
      {data?.holdings && data.holdings.length > 0 && (
        <div className="bg-white rounded-lg border border-gb-border shadow-sm">
          <div className="px-4 py-3 border-b border-gb-border">
            <h3 className="text-sm font-semibold text-gb-black">Analisis Tributario del Cambio</h3>
            <p className="text-[11px] text-gb-gray mt-0.5">Regimen tributario de cada posicion para el cambio de custodia.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gb-border bg-gray-50">
                  <th className="px-3 py-2 text-left font-medium text-gb-gray">Fondo</th>
                  <th className="px-3 py-2 text-left font-medium text-gb-gray">Regimen</th>
                  <th className="px-3 py-2 text-center font-medium text-gb-gray">MLT</th>
                </tr>
              </thead>
              <tbody>
                {data.holdings.map((h: HoldingAnalysis, i: number) => (
                  <tr key={i} className="border-b border-gb-border/50 last:border-0">
                    <td className="px-3 py-2 text-gb-black">{h.fundName}</td>
                    <td className="px-3 py-2">
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                        h.beneficio107lir ? "bg-blue-100 text-blue-700" :
                        h.beneficio108lir ? "bg-purple-100 text-purple-700" :
                        h.isApvEligible ? "bg-green-100 text-green-700" :
                        "bg-gray-100 text-gray-700"
                      }`}>
                        {h.beneficio107lir ? "Art. 107 (10%)" :
                         h.beneficio108lir ? "Art. 108/MLT" :
                         h.isApvEligible ? "APV" : "General"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center">{h.beneficio108lir ? "Si" : "No"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!readOnly && (
            <div className="px-4 py-3 border-t border-gb-border">
              <button
                onClick={() => {
                  // Save enriched xray data to sessionStorage for faster load
                  try {
                    sessionStorage.setItem("tax-simulator-holdings", JSON.stringify({
                      rawHoldings: holdings,
                      xrayHoldings: data?.holdings || [],
                      ufValue: ufValue || 38000,
                      usdRate: usdValue || 0,
                      clientName,
                      clientId,
                      proposal: mergedProposal ? Object.fromEntries(
                        mergedProposal.holdings.filter(h => h.changed).map(h => [h.originalFund, { proposedTac: h.proposedTac }])
                      ) : undefined,
                    }));
                  } catch { /* sessionStorage may be full */ }
                  // Navigate with clientId as fallback
                  window.location.href = `/tax-optimizer${clientId ? `?clientId=${clientId}` : ""}`;
                }}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-gb-primary hover:text-gb-primary/80"
              >
                Ver simulador completo
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Report Section — advisor only */}
      {!readOnly && (
        <XrayReportSection
          data={data}
          mergedProposal={mergedProposal}
          adjustedCosts={adjustedCosts}
          getEffectiveTac={getEffectiveTac}
          clientName={clientName}
          advisoryFee={advisoryFee}
          ufValue={ufValue}
          usdValue={usdValue}
          cartolaDate={cartolaDate}
          currentValue={currentValue}
          currentValueDate={currentValueDate}
          modelData={modelData}
          storageKey={storageKey}
          customContext={customContext}
          onCustomContextChange={setCustomContext}
        />
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
