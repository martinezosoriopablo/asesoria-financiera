"use client";

import React, { useState, useRef } from "react";
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
  tac: number | null;
  tacImpactAnnual: number | null;
  tacImpact10Y: number | null;
  isApvEligible: boolean;
  regimen57bis: boolean;
  cheaperAlternatives: Alternative[];
  potentialSavingAnnual: number | null;
  potentialSaving10Y: number | null;
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

interface Props {
  holdings: Holding[];
  clientName?: string;
}

export default function RadiografiaCartola({ holdings, clientName }: Props) {
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

  const runXray = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/portfolio/xray", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ holdings }),
      });
      const result = await res.json();
      if (result.success) {
        setData(result.data);
      } else {
        setError(result.error || "Error en radiografía");
      }
    } catch {
      setError("Error de conexión");
    } finally {
      setLoading(false);
    }
  };

  const generateReport = async (xrayData: XrayData) => {
    setReportLoading(true);
    setReportError(null);
    try {
      const res = await fetch("/api/portfolio/xray-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ xrayData, clientName }),
      });
      const result = await res.json();
      if (result.success) {
        setReport(result.report);
        setEditedReport(result.report);
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
  };

  const cancelEdit = () => {
    setEditedReport(report);
    setIsEditing(false);
  };

  const regenerateReport = () => {
    if (data) generateReport(data);
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
        <div className="flex items-center justify-center gap-3 py-8">
          <Loader className="w-5 h-5 animate-spin text-blue-500" />
          <span className="text-gb-gray">
            Analizando {holdings.length} holdings...
          </span>
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
            {data.holdings.length} holdings
          </p>
        </div>

        {/* TAC Promedio */}
        <div className="bg-white rounded-lg border border-gb-border p-4 shadow-sm">
          <p className="text-xs text-gb-gray font-medium uppercase mb-1">
            TAC Promedio
          </p>
          <p className="text-xl font-bold text-amber-600">
            {formatNumber(data.tacPromedioPortfolio, 2)}%
          </p>
          <p className="text-xs text-gb-gray mt-1">
            {data.holdingsConTac}/{data.holdings.length} con datos TAC
          </p>
        </div>

        {/* Costo Anual */}
        <div className="bg-white rounded-lg border border-gb-border p-4 shadow-sm">
          <p className="text-xs text-gb-gray font-medium uppercase mb-1">
            Costo Anual
          </p>
          <p className="text-xl font-bold text-red-600">
            {formatCurrency(data.costoAnualTotal)}
          </p>
          <p className="text-xs text-gb-gray mt-1">
            Proyectado 10 años: {formatCurrency(data.costoProyectado10Y)}
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
                        {h.isApvEligible && (
                          <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded font-medium">
                            APV
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

                    {/* TAC */}
                    <div className="text-right w-20">
                      {h.tac !== null ? (
                        <p
                          className={`text-sm font-semibold ${
                            h.tac > 2 ? "text-red-600" : h.tac > 1 ? "text-amber-600" : "text-green-600"
                          }`}
                        >
                          {formatNumber(h.tac, 2)}%
                        </p>
                      ) : (
                        <p className="text-sm text-gb-gray">-</p>
                      )}
                      <p className="text-[10px] text-gb-gray uppercase">TAC</p>
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
              onClick={() => generateReport(data)}
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
          {!report && !reportLoading && !reportError && (
            <p className="text-sm text-gb-gray text-center py-6">
              Genera un informe profesional basado en los datos de la radiografía.
              El informe es editable después de generado.
            </p>
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
