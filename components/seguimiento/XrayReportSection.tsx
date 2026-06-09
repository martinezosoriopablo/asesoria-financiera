"use client";

import React, { useState, useRef } from "react";
import {
  Loader,
  AlertTriangle,
  FileText,
  Pencil,
  Save,
  RotateCcw,
  Copy,
  Check,
} from "lucide-react";
import type { HoldingAnalysis, XrayData } from "./hooks/useXrayProposal";

interface MergedProposal {
  holdings: Array<{
    originalFund: string;
    changed: boolean;
    proposedTac: number;
    [key: string]: unknown;
  }>;
  currentTacPromedio: number;
  proposedTacPromedio: number;
  currentCostoAnual: number;
  proposedCostoAnual: number;
  ahorroFondosAnual: number;
  currentRent12m: number | null;
  proposedRent12m: number | null;
}

interface AdjustedCosts {
  tacPromedio: number;
  costoAnual: number;
  costoProyectado10Y: number;
  holdingsConTac: number;
}

interface Props {
  data: XrayData;
  mergedProposal: MergedProposal | null;
  adjustedCosts: AdjustedCosts | null;
  getEffectiveTac: (h: HoldingAnalysis) => number | null;
  clientName?: string;
  advisoryFee: number;
  ufValue: number | null;
  usdValue: number | null;
  cartolaDate?: string;
  currentValue?: number;
  currentValueDate?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  modelData: any;
  storageKey: string | null;
  customContext: string;
  onCustomContextChange: (value: string) => void;
}

export default function XrayReportSection({
  data,
  mergedProposal,
  adjustedCosts,
  getEffectiveTac,
  clientName,
  advisoryFee,
  ufValue,
  usdValue,
  cartolaDate,
  currentValue,
  currentValueDate,
  modelData,
  storageKey,
  customContext,
  onCustomContextChange,
}: Props) {
  const [report, setReport] = useState<string>("");
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedReport, setEditedReport] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Load saved report on mount
  React.useEffect(() => {
    if (!storageKey) return;
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.report) { setReport(parsed.report); setEditedReport(parsed.report); }
      }
    } catch { /* ignore */ }
  }, [storageKey]);

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

  return (
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
              onChange={(e) => onCustomContextChange(e.target.value)}
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
  );
}
