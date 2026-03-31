"use client";

import React, { useState, useEffect } from "react";
import { History, ChevronDown, ChevronRight, Star, User, ArrowRight, Loader } from "lucide-react";
import { formatNumber, formatDate } from "@/lib/format";

interface CarteraPosition {
  clase: string;
  ticker: string;
  nombre: string;
  porcentaje: number;
}

interface RecommendationVersion {
  id: string;
  version_number: number;
  cartera_recomendada: {
    resumenEjecutivo?: string;
    cartera?: CarteraPosition[];
    cliente?: { perfil?: string; puntaje?: number };
    generadoEn?: string;
    aplicadoPor?: string;
  };
  applied_by: string | null;
  applied_at: string;
  notes: string | null;
}

interface Props {
  clientId: string;
}

const ASSET_CLASS_COLORS: Record<string, string> = {
  "Renta Variable": "bg-blue-500",
  "Renta Fija": "bg-green-500",
  "Commodities": "bg-purple-500",
  "Alternativos": "bg-purple-500",
  "Cash": "bg-gray-400",
};

export default function RecommendationHistory({ clientId }: Props) {
  const [versions, setVersions] = useState<RecommendationVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [comparing, setComparing] = useState<[string, string] | null>(null);

  useEffect(() => {
    fetchVersions();
  }, [clientId]);

  const fetchVersions = async () => {
    try {
      const res = await fetch(`/api/clients/${clientId}/recommendations`);
      const data = await res.json();
      if (data.success) {
        setVersions(data.versions);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-gb-border shadow-sm p-6">
        <div className="flex items-center gap-2 text-gb-gray">
          <Loader className="w-4 h-4 animate-spin" />
          <span className="text-sm">Cargando historial...</span>
        </div>
      </div>
    );
  }

  if (versions.length === 0) return null;

  // Aggregate weights per asset class
  const getWeights = (cartera: CarteraPosition[]) => {
    const w: Record<string, number> = {};
    for (const p of cartera) {
      const cls = p.clase === "Commodities" ? "Alternativos" : p.clase;
      w[cls] = (w[cls] || 0) + p.porcentaje;
    }
    return w;
  };

  const compareVersions = comparing
    ? [
        versions.find(v => v.id === comparing[0]),
        versions.find(v => v.id === comparing[1]),
      ]
    : null;

  return (
    <div className="bg-white rounded-lg border border-gb-border shadow-sm">
      <div className="px-6 py-4 border-b border-gb-border flex items-center justify-between">
        <h2 className="text-base font-semibold text-gb-black flex items-center gap-2">
          <History className="w-4 h-4 text-indigo-500" />
          Historial de Recomendaciones
        </h2>
        <span className="text-xs text-gb-gray">
          {versions.length} versión{versions.length !== 1 ? "es" : ""}
        </span>
      </div>

      {/* Comparison view */}
      {compareVersions && compareVersions[0] && compareVersions[1] && (
        <div className="px-6 py-4 border-b border-gb-border bg-indigo-50">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold text-indigo-800">
              Comparación: v{compareVersions[0].version_number} vs v{compareVersions[1].version_number}
            </span>
            <button
              onClick={() => setComparing(null)}
              className="text-xs text-indigo-600 hover:underline"
            >
              Cerrar comparación
            </button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {compareVersions.map((v) => {
              if (!v) return null;
              const weights = getWeights(v.cartera_recomendada.cartera || []);
              return (
                <div key={v.id} className="p-3 bg-white rounded-lg border border-indigo-200">
                  <p className="text-xs font-semibold text-gb-black mb-2">
                    v{v.version_number} — {formatDate(v.applied_at)}
                  </p>
                  <div className="h-6 flex rounded overflow-hidden mb-2">
                    {Object.entries(weights).map(([cls, pct]) => (
                      <div
                        key={cls}
                        className={`${ASSET_CLASS_COLORS[cls] || "bg-gray-300"} flex items-center justify-center`}
                        style={{ width: `${pct}%` }}
                      >
                        {pct > 10 && (
                          <span className="text-[10px] font-bold text-white">{formatNumber(pct, 0)}%</span>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="space-y-0.5">
                    {Object.entries(weights).map(([cls, pct]) => (
                      <div key={cls} className="flex justify-between text-xs">
                        <span className="text-gb-gray">{cls}</span>
                        <span className="font-medium text-gb-black">{formatNumber(pct, 0)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Timeline */}
      <div className="divide-y divide-gb-border">
        {versions.map((v, i) => {
          const isExpanded = expanded === v.id;
          const isLatest = i === 0;
          const cartera = v.cartera_recomendada.cartera || [];
          const weights = getWeights(cartera);
          const prevVersion = versions[i + 1];

          return (
            <div key={v.id}>
              <button
                onClick={() => setExpanded(isExpanded ? null : v.id)}
                className={`w-full px-6 py-4 flex items-center gap-4 text-left hover:bg-slate-50 transition-colors ${
                  isLatest ? "bg-indigo-50/30" : ""
                }`}
              >
                {/* Version badge */}
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold ${
                  isLatest
                    ? "bg-indigo-100 text-indigo-700"
                    : "bg-slate-100 text-slate-600"
                }`}>
                  v{v.version_number}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gb-black">
                      {formatDate(v.applied_at)}
                    </span>
                    {isLatest && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 bg-indigo-100 text-indigo-700 rounded">
                        Vigente
                      </span>
                    )}
                  </div>
                  {v.applied_by && (
                    <p className="text-xs text-gb-gray flex items-center gap-1">
                      <User className="w-3 h-3" />
                      {v.applied_by}
                    </p>
                  )}
                </div>

                {/* Mini allocation bar */}
                <div className="w-32 h-4 flex rounded overflow-hidden shrink-0">
                  {Object.entries(weights).map(([cls, pct]) => (
                    <div
                      key={cls}
                      className={`${ASSET_CLASS_COLORS[cls] || "bg-gray-300"}`}
                      style={{ width: `${pct}%` }}
                    />
                  ))}
                </div>

                {isExpanded ? (
                  <ChevronDown className="w-4 h-4 text-gb-gray shrink-0" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-gb-gray shrink-0" />
                )}
              </button>

              {/* Expanded detail */}
              {isExpanded && (
                <div className="px-6 pb-4 bg-slate-50">
                  {/* Summary */}
                  {v.cartera_recomendada.resumenEjecutivo && (
                    <p className="text-sm text-gb-gray mb-3 italic">
                      &ldquo;{v.cartera_recomendada.resumenEjecutivo.slice(0, 200)}
                      {v.cartera_recomendada.resumenEjecutivo.length > 200 ? "..." : ""}&rdquo;
                    </p>
                  )}

                  {/* Allocation breakdown */}
                  <div className="grid grid-cols-4 gap-3 mb-3">
                    {Object.entries(weights).map(([cls, pct]) => (
                      <div key={cls} className="p-2 bg-white rounded border border-slate-200">
                        <div className="flex items-center gap-1.5 mb-1">
                          <div className={`w-2.5 h-2.5 rounded ${ASSET_CLASS_COLORS[cls] || "bg-gray-300"}`} />
                          <span className="text-xs text-gb-gray">{cls}</span>
                        </div>
                        <span className="text-lg font-bold text-gb-black">{formatNumber(pct, 0)}%</span>
                      </div>
                    ))}
                  </div>

                  {/* Positions */}
                  <div className="space-y-1 mb-3">
                    {cartera.map((p, j) => (
                      <div key={j} className="flex items-center justify-between text-xs px-2 py-1.5 bg-white rounded">
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded ${ASSET_CLASS_COLORS[p.clase] || "bg-gray-300"}`} />
                          <span className="font-medium text-gb-black">{p.ticker}</span>
                          <span className="text-gb-gray truncate max-w-[200px]">{p.nombre}</span>
                        </div>
                        <span className="font-semibold text-gb-black">{formatNumber(p.porcentaje, 0)}%</span>
                      </div>
                    ))}
                  </div>

                  {/* Compare button */}
                  {prevVersion && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setComparing([v.id, prevVersion.id]);
                      }}
                      className="text-xs text-indigo-600 hover:underline flex items-center gap-1"
                    >
                      <ArrowRight className="w-3 h-3" />
                      Comparar con v{prevVersion.version_number}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
