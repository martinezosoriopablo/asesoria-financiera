// components/recomendacion/RecomendacionPage.tsx
"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Loader, RefreshCw, AlertTriangle, Mail } from "lucide-react";
import MacroAllocationV2 from "./MacroAllocationV2";
import StocksTreemap from "./StocksTreemap";
import FundsBreakdown from "./FundsBreakdown";
import BondsBreakdown from "./BondsBreakdown";
import ObservacionesPanel from "./ObservacionesPanel";
import NarrativeAnalysis from "./NarrativeAnalysis";
import TradeSuggestions from "./TradeSuggestions";
import SendReportModal from "./SendReportModal";

// ── Types matching API response ──────────────────────────────────────

interface StockItem {
  ticker: string;
  name: string;
  sector: string;
  industry: string;
  country: string;
  marketValueUSD: number;
  marketValueCLP: number;
  weightPct: number;
  categoryId: string;
  confidence: string;
}

interface FundItem {
  fundName: string;
  securityId: string;
  categoryId: string;
  categoryLabel: string;
  marketValueCLP: number;
  weightPct: number;
  confidence: string;
}

interface BondItem {
  name: string;
  securityId: string;
  couponRate: number;
  maturityDate: string;
  creditRating: string | null;
  bondType: "government" | "corporate" | "em_sovereign";
  marketValueUSD: number;
  marketValueCLP: number;
  weightPct: number;
}

interface EtfItem {
  ticker: string;
  name: string;
  categoryId: string;
  categoryLabel: string;
  marketValueCLP: number;
  weightPct: number;
}

interface CashItem {
  name: string;
  marketValueCLP: number;
  weightPct: number;
  currency: string;
}

interface Observation {
  severity: "alta" | "media" | "info";
  text: string;
}

interface SectorBreakdownItem {
  sector: string;
  sleeveVista: string | null;
  deltaPp: number;
  sleevePct: number | null;
  actualPct: number;
}

interface TradeSuggestion {
  action: "REDUCIR" | "AGREGAR" | "MANTENER";
  reason: string;
  holdings?: string[];
  amountUSD?: number;
  instrument?: string;
  instrumentTicker?: string;
  priority: "alta" | "media" | "baja";
}

interface RadiografiaData {
  clientId: string;
  clientName: string;
  perfilModelo: string;
  perfilCliente: string;
  reportDate: string;
  notaComite: string | null;
  totalValueCLP: number;
  allocation: Record<string, { actual: number; target: number; delta: number }>;
  flags: Array<{ type: string; holdingName: string; message: string }>;
  sectorBreakdown: SectorBreakdownItem[];
  tradeSuggestions: TradeSuggestion[];
  instrumentBreakdown: {
    stocks: StockItem[];
    funds: FundItem[];
    bonds: BondItem[];
    etfs: EtfItem[];
    cash: CashItem[];
  };
  observations: Observation[];
}

interface Props {
  clientId: string;
}

const PROFILE_LABELS: Record<string, string> = {
  conservador: "Conservador",
  moderado_conservador: "Moderado Conservador",
  moderado: "Moderado",
  moderado_agresivo: "Moderado Agresivo",
  agresivo: "Agresivo",
};

function formatCLP(value: number): string {
  if (value >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(0)}M`;
  return `$${(value / 1e3).toFixed(0)}K`;
}

export default function RecomendacionPage({ clientId }: Props) {
  const [data, setData] = useState<RadiografiaData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [narrativeText, setNarrativeText] = useState<string | null>(null);
  const [showSendModal, setShowSendModal] = useState(false);
  const [clientEmail, setClientEmail] = useState<string>("");

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

  const openSendModal = useCallback(async () => {
    if (!clientEmail) {
      try {
        const res = await fetch(`/api/clients/${clientId}`);
        const d = await res.json();
        if (d.success && d.data?.email) {
          setClientEmail(d.data.email);
        }
      } catch { /* ignore */ }
    }
    setShowSendModal(true);
  }, [clientId, clientEmail]);

  useEffect(() => {
    fetchRadiografia();
  }, [fetchRadiografia]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <Loader className="w-6 h-6 animate-spin text-gb-primary mx-auto mb-3" />
          <p className="text-sm text-gb-gray">Generando radiografia...</p>
        </div>
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

  const { instrumentBreakdown: ib } = data;
  const hasStocks = ib.stocks.length > 0;
  const hasFunds = ib.funds.length > 0;
  const hasBonds = ib.bonds.length > 0;
  const hasEtfs = ib.etfs.length > 0;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* ── Section 1: Header ────────────────────────────────────────── */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gb-black">
            Radiografia — {data.clientName}
          </h1>
          <div className="flex items-center gap-3 mt-1.5">
            <span className="text-sm text-gb-gray">
              Perfil: {PROFILE_LABELS[data.perfilCliente] || data.perfilCliente}
              {" → "}
              Modelo: {PROFILE_LABELS[data.perfilModelo] || data.perfilModelo}
            </span>
            <span className="text-xs text-gb-gray bg-slate-100 px-2 py-0.5 rounded">
              Comite: {data.reportDate}
            </span>
            <span className="text-xs font-mono text-gb-black bg-slate-100 px-2 py-0.5 rounded">
              {formatCLP(data.totalValueCLP)}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={openSendModal}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-gb-primary rounded-md hover:bg-gb-primary/90 transition-colors"
          >
            <Mail className="w-3.5 h-3.5" />
            Enviar por Email
          </button>
          <button
            onClick={fetchRadiografia}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gb-border rounded-md hover:bg-slate-50 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Actualizar
          </button>
        </div>
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

      {/* ── Section 2: Macro Allocation ──────────────────────────────── */}
      <MacroAllocationV2
        allocation={data.allocation}
        totalValueCLP={data.totalValueCLP}
      />

      {/* ── Section 3: Instrument Breakdown ──────────────────────────── */}
      {hasStocks && (
        <StocksTreemap
          stocks={ib.stocks}
          sectorBreakdown={data.sectorBreakdown}
        />
      )}

      {hasFunds && (
        <FundsBreakdown
          items={ib.funds}
          title="Fondos por Categoria"
          subtitle={`${ib.funds.length} fondos · Agrupados por categoria del comite`}
        />
      )}

      {hasEtfs && (
        <FundsBreakdown
          items={ib.etfs.map((e) => ({
            fundName: e.name,
            ticker: e.ticker,
            securityId: e.ticker,
            categoryId: e.categoryId,
            categoryLabel: e.categoryLabel,
            marketValueCLP: e.marketValueCLP,
            weightPct: e.weightPct,
          }))}
          title="ETFs"
          subtitle={`${ib.etfs.length} ETFs · Agrupados por categoria del comite`}
        />
      )}

      {hasBonds && <BondsBreakdown bonds={ib.bonds} />}

      {/* ── Section 4: Observations ──────────────────────────────────── */}
      <ObservacionesPanel observations={data.observations} />

      {/* Trade Suggestions (keep existing component) */}
      {data.tradeSuggestions.length > 0 && (
        <TradeSuggestions suggestions={data.tradeSuggestions} />
      )}

      {/* ── Section 5: Narrative Analysis ────────────────────────────── */}
      <NarrativeAnalysis
        clientId={data.clientId}
        clientName={data.clientName}
        allocation={data.allocation}
        observations={data.observations}
        sectorBreakdown={data.sectorBreakdown}
        totalValueCLP={data.totalValueCLP}
        perfilCliente={data.perfilCliente}
        perfilModelo={data.perfilModelo}
        notaComite={data.notaComite}
        onNarrativeGenerated={setNarrativeText}
      />

      {/* Send Report Modal */}
      {data && (
        <SendReportModal
          isOpen={showSendModal}
          onClose={() => setShowSendModal(false)}
          data={data}
          clientEmail={clientEmail}
          narrative={narrativeText}
        />
      )}
    </div>
  );
}
