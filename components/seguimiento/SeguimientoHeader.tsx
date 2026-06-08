"use client";

import React from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Plus,
  TrendingUp,
  RefreshCw,
  Scale,
  Mail,
} from "lucide-react";

interface SeguimientoHeaderProps {
  clientId: string;
  clientName: string;
  portalMode: boolean;
  loading: boolean;
  fillingPrices: boolean;
  snapshotsExist: boolean;
  onRefresh: () => void;
  onOpenSendModal: () => void;
  onFillPrices: () => void;
  onAddSnapshot: () => void;
}

export default function SeguimientoHeader({
  clientId,
  clientName,
  portalMode,
  loading,
  fillingPrices,
  snapshotsExist,
  onRefresh,
  onOpenSendModal,
  onFillPrices,
  onAddSnapshot,
}: SeguimientoHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-6">
      <div>
        {!portalMode && (
          <Link
            href={`/clients/${clientId}`}
            className="inline-flex items-center gap-1 text-sm text-gb-gray hover:text-gb-black mb-2"
          >
            <ArrowLeft className="w-4 h-4" />
            {clientName}
          </Link>
        )}
        <h1 className="text-2xl font-semibold text-gb-black">
          Seguimiento{portalMode ? "" : " de Cartolas"}
        </h1>
      </div>
      {!portalMode && (
        <div className="flex gap-2">
          <Link
            href={`/recomendacion/${clientId}`}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium border border-slate-200 text-slate-600 rounded-md hover:bg-slate-50 transition-colors"
          >
            <Scale className="w-4 h-4" />
            Ver Radiografia
          </Link>
          <button
            onClick={onRefresh}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium border border-slate-200 text-slate-600 rounded-md hover:bg-slate-50 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Actualizar
          </button>
          <button
            onClick={onOpenSendModal}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-gb-primary rounded-md hover:bg-gb-primary/90 transition-colors"
          >
            <Mail className="w-3.5 h-3.5" />
            Enviar Reporte
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={onFillPrices}
              disabled={fillingPrices || !snapshotsExist}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium border border-amber-300 text-amber-700 bg-amber-50 rounded-md hover:bg-amber-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed relative group"
              title="Fuentes: CMF > Fintual API > Yahoo > Manual. Interpola precios entre cartolas."
            >
              <TrendingUp className={`w-4 h-4 ${fillingPrices ? "animate-pulse" : ""}`} />
              {fillingPrices ? "Llenando..." : "Llenar Precios"}
            </button>
          </div>
          <button
            onClick={onAddSnapshot}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Agregar Cartola
          </button>
        </div>
      )}
    </div>
  );
}
