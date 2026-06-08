"use client";

import React from "react";
import { Loader, AlertTriangle, X, Sparkles, CheckCircle2 } from "lucide-react";
import type { MatchSuggestion } from "./hooks/useAutoMatch";

interface Props {
  holdings: Array<{ fundName: string }>;
  matchSuggestions: MatchSuggestion[];
  autoMatchLoading: boolean;
  autoMatchComplete: boolean;
  autoAppliedCount: number;
  unmatchedIndices: Set<number>;
  onApply: (suggestion: MatchSuggestion) => void;
  onDismiss: (index: number) => void;
  onApplyAll: () => void;
  formatNumber: (value: number, decimals?: number) => string;
}

export default function AutoMatchSuggestions({
  holdings,
  matchSuggestions,
  autoMatchLoading,
  autoMatchComplete,
  autoAppliedCount,
  unmatchedIndices,
  onApply,
  onDismiss,
  onApplyAll,
  formatNumber,
}: Props) {
  const pendingSuggestions = matchSuggestions.filter(
    (s) => !s.applied && !s.dismissed
  );
  const highConfidenceSuggestions = pendingSuggestions.filter(
    (s) => s.confidence === "high"
  );

  if (!autoMatchLoading && pendingSuggestions.length === 0 && !(autoMatchComplete && autoAppliedCount > 0)) {
    return null;
  }

  return (
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
                onClick={onApplyAll}
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
                <div className="flex items-center gap-1 mt-0.5">
                  <span className="text-[10px] text-gb-gray">{suggestion.source}</span>
                  {suggestion.matchedId && (
                    <span className="text-[10px] text-gb-gray">• RUN {suggestion.matchedId}</span>
                  )}
                  {suggestion.familiaEstudios && (
                    <span className="text-[10px] px-1 py-0.5 bg-slate-100 text-slate-600 rounded">
                      {suggestion.familiaEstudios}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 ml-2">
                <div className="text-right">
                  {suggestion.price ? (
                    <>
                      <p className="text-sm font-semibold text-green-600">
                        {formatNumber(suggestion.price, suggestion.matchType === "stock" ? 2 : 4)}
                      </p>
                      <p className="text-[10px] text-gb-gray">{suggestion.currency}</p>
                    </>
                  ) : (
                    <p className="text-[10px] text-amber-600 font-medium">Sin precio</p>
                  )}
                </div>
                <button
                  onClick={() => onApply(suggestion)}
                  className="p-1 text-green-600 hover:bg-green-50 rounded"
                  title="Aplicar"
                >
                  <CheckCircle2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => onDismiss(suggestion.index)}
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
          {autoAppliedCount > 0
            ? `✓ ${autoAppliedCount} fondo${autoAppliedCount !== 1 ? "s" : ""} identificado${autoAppliedCount !== 1 ? "s" : ""} por precio (aplicados automáticamente)`
            : matchSuggestions.length === 0
              ? "No se encontraron coincidencias — usa la lupa en cada holding para buscar por RUN"
              : `✓ ${matchSuggestions.filter(s => s.applied).length} precios aplicados`}
        </p>
      )}
      {autoMatchComplete && unmatchedIndices.size > 0 && (
        <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded flex items-center gap-2">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
          <span className="text-xs text-amber-700">
            <strong>{unmatchedIndices.size}</strong> fondo{unmatchedIndices.size !== 1 ? "s" : ""} sin coincidencia de precio — requieren búsqueda manual por RUN
          </span>
        </div>
      )}
    </div>
  );
}
