"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  FileText,
  Sparkles,
  Loader,
  Edit3,
  Check,
  Save,
  RotateCcw,
  CheckCircle2,
} from "lucide-react";

interface Props {
  clientId: string;
  month: string; // "2026-05"
  hasMonthlyReport?: boolean;
}

interface Closing {
  id: string;
  month: string;
  content: string;
  status: "draft" | "final";
}

export default function ClientMonthlyClosing({
  clientId,
  month,
  hasMonthlyReport,
}: Props) {
  const [closing, setClosing] = useState<Closing | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [hasReport, setHasReport] = useState(hasMonthlyReport ?? false);

  const fetchClosing = useCallback(async () => {
    if (!clientId || !month) return;
    setLoading(true);
    try {
      // Fetch closing and check monthly report existence in parallel
      const [closingRes, reportRes] = await Promise.all([
        fetch(`/api/client-closings?clientId=${clientId}&month=${month}`),
        fetch(`/api/monthly-reports?month=${month}`),
      ]);
      const closingData = await closingRes.json();
      const reportData = await reportRes.json();

      if (closingData.closing) {
        setClosing(closingData.closing);
        setEditContent(closingData.closing.content);
      } else {
        setClosing(null);
        setEditContent("");
      }
      setHasReport(!!reportData.report);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [clientId, month]);

  useEffect(() => {
    fetchClosing();
  }, [fetchClosing]);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const res = await fetch("/api/client-closings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, month }),
      });
      const d = await res.json();
      if (d.closing) {
        setClosing(d.closing);
        setEditContent(d.closing.content);
        setEditing(true);
      } else {
        alert(d.error || "Error al generar");
      }
    } catch {
      alert("Error de conexión");
    } finally {
      setGenerating(false);
    }
  };

  const handleSave = async (newStatus?: "draft" | "final") => {
    if (!closing) return;
    setSaving(true);
    try {
      const res = await fetch("/api/client-closings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: closing.id,
          content: editContent,
          status: newStatus || closing.status,
        }),
      });
      const d = await res.json();
      if (d.closing) {
        setClosing(d.closing);
        setEditing(false);
      }
    } catch {
      alert("Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  const handleRegenerate = async () => {
    if (!confirm("Esto reemplazará el texto actual. ¿Continuar?")) return;
    await handleGenerate();
  };

  // Month display name
  const monthNames = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
  ];
  const [year, m] = month.split("-");
  const monthLabel = `${monthNames[parseInt(m) - 1]} ${year}`;

  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-gb-border shadow-sm mb-6 p-6">
        <div className="flex items-center gap-2 text-gb-gray">
          <Loader className="w-4 h-4 animate-spin" />
          <span className="text-sm">Cargando cierre de {monthLabel}...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gb-border shadow-sm mb-6">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gb-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-blue-600" />
          <h2 className="text-base font-semibold text-gb-black">
            Explicación de Resultados — {monthLabel}
          </h2>
          {closing && (
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                closing.status === "final"
                  ? "bg-green-100 text-green-700"
                  : "bg-amber-100 text-amber-700"
              }`}
            >
              {closing.status === "final" ? "Final" : "Borrador"}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {closing && !editing && (
            <>
              <button
                onClick={() => setEditing(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gb-border rounded-md hover:bg-slate-50 transition-colors"
              >
                <Edit3 className="w-3.5 h-3.5" />
                Editar
              </button>
              <button
                onClick={handleRegenerate}
                disabled={generating || !hasReport}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gb-border rounded-md hover:bg-slate-50 transition-colors disabled:opacity-50"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Regenerar
              </button>
              {closing.status === "draft" && (
                <button
                  onClick={() => handleSave("final")}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors disabled:opacity-50"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Marcar Final
                </button>
              )}
              {closing.status === "final" && (
                <button
                  onClick={() => handleSave("draft")}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-amber-300 text-amber-700 rounded-md hover:bg-amber-50 transition-colors disabled:opacity-50"
                >
                  Volver a Borrador
                </button>
              )}
            </>
          )}
          {editing && (
            <>
              <button
                onClick={() => {
                  setEditing(false);
                  setEditContent(closing?.content || "");
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gb-border rounded-md hover:bg-slate-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleSave()}
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-gb-primary text-white rounded-md hover:bg-gb-primary/90 transition-colors disabled:opacity-50"
              >
                {saving ? (
                  <Loader className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
                Guardar
              </button>
            </>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="px-6 py-4">
        {!closing && (
          <div className="text-center py-8">
            <p className="text-sm text-gb-gray mb-4">
              No hay explicación de resultados para {monthLabel}.
            </p>
            {hasReport ? (
              <button
                onClick={handleGenerate}
                disabled={generating}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-gb-primary text-white rounded-lg hover:bg-gb-primary/90 transition-colors disabled:opacity-50"
              >
                {generating ? (
                  <>
                    <Loader className="w-4 h-4 animate-spin" />
                    Generando con IA...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Generar Explicación de Resultados
                  </>
                )}
              </button>
            ) : (
              <p className="text-xs text-amber-600">
                Primero suba el reporte mensual de mercados para {monthLabel}.
              </p>
            )}
          </div>
        )}

        {closing && editing && (
          <textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            className="w-full min-h-[400px] p-4 text-sm font-mono border border-gb-border rounded-lg focus:outline-none focus:ring-2 focus:ring-gb-primary/30 resize-y"
            placeholder="Escribe la explicación de resultados..."
          />
        )}

        {closing && !editing && (
          <div className="prose prose-sm max-w-none text-gb-black/80">
            {closing.content.split("\n").map((line, i) => {
              if (!line.trim()) return <br key={i} />;

              // Safe markdown rendering — no dangerouslySetInnerHTML
              const renderBold = (text: string) => {
                const parts = text.split(/\*\*([^*]+)\*\*/g);
                return parts.map((part, j) =>
                  j % 2 === 1 ? (
                    <strong key={j} className="text-gb-black">{part}</strong>
                  ) : (
                    <React.Fragment key={j}>{part}</React.Fragment>
                  )
                );
              };

              if (line.startsWith("- ")) {
                return (
                  <li key={i} className="ml-4 mb-1">
                    {renderBold(line.slice(2))}
                  </li>
                );
              }

              return (
                <p key={i} className="mb-3 leading-relaxed">
                  {renderBold(line)}
                </p>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
