"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Loader, RefreshCw, AlertTriangle } from "lucide-react";
import MacroAllocation from "./MacroAllocation";
import SectorBreakdown from "./SectorBreakdown";
import HoldingsTable from "./HoldingsTable";
import TradeSuggestions from "./TradeSuggestions";

interface RadiografiaData {
  clientId: string;
  clientName: string;
  perfilModelo: string;
  perfilCliente: string;
  reportDate: string;
  notaComite: string | null;
  totalValueCLP: number;
  categories: Array<{
    categoria: string;
    categoriaLabel: string;
    role: "rv" | "rf" | "alt" | "cash";
    targetPct: number;
    actualPct: number;
    deltaPp: number;
    estado: "SOBREPONDERADO" | "SUBPONDERADO" | "EN_RANGO";
    vista: "OW" | "UW" | "N";
    conviction: string | null;
    currentHoldings: Array<{
      fundName: string;
      securityId: string | null;
      marketValueCLP: number;
      weightPct: number;
      custodian: string;
      custodianType: string;
      classificationConfidence: "high" | "medium" | "low";
    }>;
    proposedAction: {
      direction: "buy" | "sell" | "hold";
      amountCLP: number;
      instrument: string;
      ticker: string | null;
      custodian: string;
      custodianType: string;
    } | null;
  }>;
  allocation: Record<string, { actual: number; target: number; delta: number }>;
  flags: Array<{ type: string; holdingName: string; message: string }>;
  sleeves: Array<Record<string, unknown>>;
  custodians: Array<{ name: string; type: string; snapshotDate: string }>;
  sectorBreakdown: Array<{
    sector: string;
    sleeveId: string | null;
    actualPct: number;
    sleevePct: number | null;
    deltaPp: number;
    sleeveVista: "OW" | "UW" | "N" | null;
    sleeveConviction: "ALTA" | "MEDIA" | "BAJA" | null;
    holdings: Array<{
      fundName: string;
      ticker: string;
      marketValueUSD: number;
      weightInSector: number;
    }>;
  }>;
  tradeSuggestions: Array<{
    action: "REDUCIR" | "AGREGAR" | "MANTENER";
    reason: string;
    holdings?: string[];
    amountUSD?: number;
    instrument?: string;
    instrumentTicker?: string;
    priority: "alta" | "media" | "baja";
  }>;
  stockProfiles: Record<string, {
    ticker: string;
    name: string;
    sector: string;
    industry: string;
    marketCap: number;
    country: string;
  }>;
  taxAnalysisEnabled: boolean;
}

interface Props {
  clientId: string;
}

export default function RecomendacionPage({ clientId }: Props) {
  const [data, setData] = useState<RadiografiaData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRadiografia = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/portfolio/radiografia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId }),
      });
      const d = await res.json();
      if (d.success && d.data) {
        setData(d.data);
      } else {
        setError(d.error || "Error al generar radiografia");
      }
    } catch {
      setError("Error de conexion");
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    fetchRadiografia();
  }, [fetchRadiografia]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader className="w-6 h-6 animate-spin text-gb-gray" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
          <AlertTriangle className="w-4 h-4 inline mr-2" />
          {error || "No se pudo generar la radiografia"}
        </div>
      </div>
    );
  }

  const profileLabels: Record<string, string> = {
    conservador: "Conservador",
    moderado_conservador: "Moderado Conservador",
    moderado: "Moderado",
    moderado_agresivo: "Moderado Agresivo",
    agresivo: "Agresivo",
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gb-black">
            Radiografia — {data.clientName}
          </h1>
          <p className="text-sm text-gb-gray mt-1">
            Perfil: {profileLabels[data.perfilCliente] || data.perfilCliente}
            {" → "}
            Modelo: {profileLabels[data.perfilModelo] || data.perfilModelo}
            {" · "}
            Comite: {data.reportDate}
          </p>
        </div>
        <button
          onClick={fetchRadiografia}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gb-border rounded-md hover:bg-slate-50 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Actualizar
        </button>
      </div>

      {/* Flags */}
      {data.flags.length > 0 && (
        <div className="mb-4 bg-amber-50 border border-amber-200 rounded-lg p-3">
          <p className="text-xs font-medium text-amber-800 mb-1">Advertencias:</p>
          {data.flags.map((f, i) => (
            <p key={i} className="text-xs text-amber-700">• {f.message}</p>
          ))}
        </div>
      )}

      {/* Macro Allocation */}
      <MacroAllocation allocation={data.allocation} />

      {/* Sector Breakdown (if RV > 0) */}
      {data.sectorBreakdown.length > 0 && (
        <SectorBreakdown sectors={data.sectorBreakdown} />
      )}

      {/* Holdings Table */}
      <HoldingsTable
        categories={data.categories}
        stockProfiles={data.stockProfiles}
        sectorBreakdown={data.sectorBreakdown}
      />

      {/* Trade Suggestions */}
      {data.tradeSuggestions.length > 0 && (
        <TradeSuggestions suggestions={data.tradeSuggestions} />
      )}
    </div>
  );
}
