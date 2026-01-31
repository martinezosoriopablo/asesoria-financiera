// components/portfolio/SavedModels.tsx

"use client";

import React, { useState, useEffect } from "react";
import { supabaseBrowserClient } from "@/lib/supabase/supabaseClient";
import { History, Download, Trash2, Calendar, TrendingUp, Shield, Landmark, X } from "lucide-react";

interface SavedModel {
  id: string;
  client_id: string;
  risk_profile_id: string;
  universe: "global" | "solo_chile";
  include_alternatives: boolean;
  portfolio_amount: number | null;
  weights: {
    equities: number;
    fixedIncome: number;
    alternatives: number;
    cash: number;
  };
  equity_blocks: any[];
  fixed_income_blocks: any[];
  alternative_blocks: any[];
  created_at: string;
}

interface SavedModelsProps {
  clientId: string;
  clientEmail: string;
  onLoadModel: (model: SavedModel) => void;
  onClose: () => void;
}

export function SavedModels({ clientId, clientEmail, onLoadModel, onClose }: SavedModelsProps) {
  const [models, setModels] = useState<SavedModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    loadModels();
  }, [clientId]);

  const loadModels = async () => {
    setLoading(true);
    setError(null);

    try {
      const supabase = supabaseBrowserClient();

      const { data, error: fetchError } = await supabase
        .from("portfolio_models")
        .select("*")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false });

      if (fetchError) {
        setError("Error al cargar los modelos guardados: " + fetchError.message);
        return;
      }

      setModels(data || []);
    } catch (err) {
      setError("Error inesperado al cargar los modelos");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (modelId: string) => {
    if (!confirm("¿Estás seguro de que quieres eliminar este modelo? Esta acción no se puede deshacer.")) {
      return;
    }

    setDeletingId(modelId);

    try {
      const supabase = supabaseBrowserClient();

      const { error: deleteError } = await supabase
        .from("portfolio_models")
        .delete()
        .eq("id", modelId);

      if (deleteError) {
        alert("Error al eliminar el modelo: " + deleteError.message);
        return;
      }

      // Recargar la lista
      await loadModels();
    } catch (err) {
      alert("Error inesperado al eliminar el modelo");
      console.error(err);
    } finally {
      setDeletingId(null);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat("es-CL", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="sticky top-0 bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <History className="w-6 h-6" />
            <div>
              <h2 className="text-2xl font-bold">Modelos Guardados</h2>
              <p className="text-blue-100 text-sm">{clientEmail}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white hover:bg-white/20 rounded-lg p-2 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border-2 border-red-200 rounded-xl p-4 text-red-800">
              {error}
            </div>
          )}

          {!loading && !error && models.length === 0 && (
            <div className="text-center py-12">
              <History className="w-16 h-16 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-600 text-lg font-medium">
                No hay modelos guardados para este cliente
              </p>
              <p className="text-slate-500 text-sm mt-2">
                Los modelos que guardes aparecerán aquí
              </p>
            </div>
          )}

          {!loading && !error && models.length > 0 && (
            <div className="space-y-4">
              {models.map((model) => (
                <ModelCard
                  key={model.id}
                  model={model}
                  onLoad={() => onLoadModel(model)}
                  onDelete={() => handleDelete(model.id)}
                  isDeleting={deletingId === model.id}
                  formatDate={formatDate}
                />
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-200 px-6 py-4 bg-slate-50">
          <div className="flex justify-between items-center">
            <p className="text-sm text-slate-600">
              {models.length} {models.length === 1 ? "modelo guardado" : "modelos guardados"}
            </p>
            <button
              onClick={onClose}
              className="px-6 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold rounded-lg transition-colors"
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Componente para cada tarjeta de modelo
interface ModelCardProps {
  model: SavedModel;
  onLoad: () => void;
  onDelete: () => void;
  isDeleting: boolean;
  formatDate: (date: string) => string;
}

function ModelCard({ model, onLoad, onDelete, isDeleting, formatDate }: ModelCardProps) {
  const [expanded, setExpanded] = useState(false);

  // Calcular número de tilts significativos
  const significantTilts = [
    ...model.equity_blocks,
    ...model.fixed_income_blocks,
    ...model.alternative_blocks,
  ].filter((block) => {
    const diff = Math.abs(block.model_weight - block.neutral_weight);
    return diff >= 0.2; // Considerar significativo si diff >= 0.2pp
  }).length;

  return (
    <div className="bg-white border-2 border-slate-200 rounded-xl overflow-hidden hover:border-blue-300 transition-all">
      {/* Header de la tarjeta */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <Calendar className="w-4 h-4 text-slate-500" />
              <span className="text-sm text-slate-600">{formatDate(model.created_at)}</span>
              <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                model.universe === "global"
                  ? "bg-blue-100 text-blue-800"
                  : "bg-indigo-100 text-indigo-800"
              }`}>
                {model.universe === "global" ? "Global" : "Solo Chile"}
              </span>
              {model.include_alternatives && (
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-800">
                  Con Alternativos
                </span>
              )}
            </div>

            {/* Asset Allocation Overview */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3">
              <div className="flex items-center gap-2 bg-blue-50 rounded-lg px-3 py-2">
                <TrendingUp className="w-4 h-4 text-blue-600" />
                <div>
                  <p className="text-xs text-blue-700 font-medium">RV</p>
                  <p className="text-sm font-bold text-blue-900">
                    {model.weights.equities.toFixed(1)}%
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2">
                <Shield className="w-4 h-4 text-slate-600" />
                <div>
                  <p className="text-xs text-slate-700 font-medium">RF</p>
                  <p className="text-sm font-bold text-slate-900">
                    {model.weights.fixedIncome.toFixed(1)}%
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 bg-indigo-50 rounded-lg px-3 py-2">
                <Landmark className="w-4 h-4 text-indigo-600" />
                <div>
                  <p className="text-xs text-indigo-700 font-medium">Alt</p>
                  <p className="text-sm font-bold text-indigo-900">
                    {model.weights.alternatives.toFixed(1)}%
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
                <div className="w-4 h-4 flex items-center justify-center text-gray-600 font-bold text-xs">
                  $
                </div>
                <div>
                  <p className="text-xs text-gray-700 font-medium">Cash</p>
                  <p className="text-sm font-bold text-gray-900">
                    {model.weights.cash.toFixed(1)}%
                  </p>
                </div>
              </div>
            </div>

            {/* Tilts Badge */}
            {significantTilts > 0 && (
              <div className="mt-3">
                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200">
                  {significantTilts} {significantTilts === 1 ? "ajuste significativo" : "ajustes significativos"} vs. benchmark
                </span>
              </div>
            )}

            {/* Portfolio Amount Display */}
            {model.portfolio_amount && (
              <div className="mt-3 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border-2 border-blue-300 p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      Monto Portafolio
                    </span>
                  </div>
                  <span className="text-lg font-bold text-blue-700">
                    ${model.portfolio_amount.toLocaleString("es-CL", {
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 0,
                    })}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Botones de acción */}
          <div className="flex flex-col gap-2">
            <button
              onClick={onLoad}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white font-semibold rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all shadow-md hover:shadow-lg text-sm"
            >
              <Download className="w-4 h-4" />
              Cargar
            </button>

            <button
              onClick={onDelete}
              disabled={isDeleting}
              className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-700 font-medium rounded-lg hover:bg-red-100 border border-red-200 transition-all text-sm disabled:opacity-50"
            >
              <Trash2 className="w-4 h-4" />
              {isDeleting ? "..." : "Eliminar"}
            </button>
          </div>
        </div>

        {/* Expand/Collapse button */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-3 text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
        >
          {expanded ? "Ocultar detalle" : "Ver detalle de bloques"}
          <svg
            className={`w-4 h-4 transition-transform ${expanded ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {/* Detalle expandible */}
      {expanded && (
        <div className="border-t border-slate-200 bg-slate-50 p-4 space-y-4">
          {/* Equity Blocks */}
          {model.equity_blocks.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-blue-900 mb-2 flex items-center gap-2">
                <TrendingUp className="w-4 h-4" />
                Renta Variable
              </h4>
              <div className="space-y-1">
                {model.equity_blocks.map((block, idx) => (
                  <BlockDetail key={idx} block={block} />
                ))}
              </div>
            </div>
          )}

          {/* Fixed Income Blocks */}
          {model.fixed_income_blocks.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-slate-900 mb-2 flex items-center gap-2">
                <Shield className="w-4 h-4" />
                Renta Fija
              </h4>
              <div className="space-y-1">
                {model.fixed_income_blocks.map((block, idx) => (
                  <BlockDetail key={idx} block={block} />
                ))}
              </div>
            </div>
          )}

          {/* Alternative Blocks */}
          {model.alternative_blocks.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-indigo-900 mb-2 flex items-center gap-2">
                <Landmark className="w-4 h-4" />
                Alternativos
              </h4>
              <div className="space-y-1">
                {model.alternative_blocks.map((block, idx) => (
                  <BlockDetail key={idx} block={block} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Componente para mostrar detalle de cada bloque
function BlockDetail({ block }: { block: any }) {
  const diff = block.model_weight - block.neutral_weight;
  const isSignificant = Math.abs(diff) >= 0.2;

  return (
    <div className="flex justify-between items-center bg-white rounded px-3 py-2 text-xs">
      <span className="text-slate-700 font-medium">{block.label}</span>
      <div className="flex items-center gap-3">
        <span className="text-slate-500">
          {block.neutral_weight.toFixed(1)}% → {block.model_weight.toFixed(1)}%
        </span>
        {isSignificant && (
          <span
            className={`font-semibold ${
              diff > 0 ? "text-blue-700" : "text-red-700"
            }`}
          >
            {diff > 0 ? "+" : ""}
            {diff.toFixed(1)}pp
          </span>
        )}
      </div>
    </div>
  );
}
