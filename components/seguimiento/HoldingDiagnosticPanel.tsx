"use client";

import React, { useState, useCallback } from "react";
import {
  Search,
  Save,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Edit3,
  X,
  ChevronDown,
  ChevronRight,
  Database,
  Globe,
  HelpCircle,
} from "lucide-react";
import { formatNumber, formatCurrency } from "@/lib/format";

interface Holding {
  fundName: string;
  securityId?: string | null;
  quantity?: number;
  unitCost?: number;
  costBasis?: number;
  marketPrice?: number;
  marketValue: number;
  unrealizedGainLoss?: number;
  assetClass?: string;
  currency?: string;
  source?: string;
}

interface Snapshot {
  id: string;
  client_id: string;
  snapshot_date: string;
  total_value: number;
  holdings: Holding[] | null;
  source: string;
  equity_percent: number;
  fixed_income_percent: number;
  alternatives_percent: number;
  cash_percent: number;
  equity_value: number;
  fixed_income_value: number;
  alternatives_value: number;
  cash_value: number;
}

interface PriceResult {
  fundName: string;
  fintualId: string | null;
  fintualName: string | null;
  serieName: string | null;
  currentPrice: number | null;
  lastPriceDate: string | null;
  currency: string;
  source: string;
}

interface Props {
  snapshot: Snapshot;
  onUpdate: () => void;
}

const SOURCE_LABELS: Record<string, { label: string; color: string; icon: typeof Globe }> = {
  aafm: { label: "AAFM", color: "text-green-700 bg-green-50 border-green-200", icon: CheckCircle2 },
  fintual_api: { label: "Fintual API", color: "text-green-700 bg-green-50 border-green-200", icon: Globe },
  fintual_db: { label: "Fintual DB", color: "text-blue-700 bg-blue-50 border-blue-200", icon: Database },
  cmf: { label: "CMF/AAFM", color: "text-purple-700 bg-purple-50 border-purple-200", icon: Database },
  none: { label: "Sin fuente", color: "text-red-700 bg-red-50 border-red-200", icon: AlertTriangle },
  manual: { label: "Manual", color: "text-amber-700 bg-amber-50 border-amber-200", icon: Edit3 },
  snapshot: { label: "Último snapshot", color: "text-cyan-700 bg-cyan-50 border-cyan-200", icon: Database },
  cartola: { label: "Cartola original", color: "text-slate-700 bg-slate-50 border-slate-200", icon: CheckCircle2 },
};

const ASSET_CLASS_LABELS: Record<string, { label: string; color: string }> = {
  equity: { label: "RV", color: "bg-blue-100 text-blue-800" },
  fixedIncome: { label: "RF", color: "bg-green-100 text-green-800" },
  balanced: { label: "Bal", color: "bg-purple-100 text-purple-800" },
  alternatives: { label: "Alt", color: "bg-orange-100 text-orange-800" },
  cash: { label: "Cash", color: "bg-gray-100 text-gray-800" },
  "Fixed Income": { label: "RF", color: "bg-green-100 text-green-800" },
  "Equity": { label: "RV", color: "bg-blue-100 text-blue-800" },
};

export default function HoldingDiagnosticPanel({ snapshot, onUpdate }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [holdings, setHoldings] = useState<Holding[]>(
    (snapshot.holdings as Holding[]) || []
  );
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editPrice, setEditPrice] = useState("");
  const [editAssetClass, setEditAssetClass] = useState("");
  const [lookupResults, setLookupResults] = useState<PriceResult[] | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupIndex, setLookupIndex] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Lookup current price for a holding
  const lookupPrice = useCallback(async (index: number) => {
    const holding = holdings[index];
    setLookupIndex(index);
    setLookupLoading(true);
    setLookupResults(null);

    try {
      const res = await fetch("/api/portfolio/current-prices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          holdings: [{
            fundName: holding.fundName,
            securityId: holding.securityId,
            cartolaPrice: holding.marketPrice || ((holding.quantity ?? 0) > 0 ? holding.marketValue / (holding.quantity ?? 1) : 0),
          }],
          clientId: snapshot.client_id,
        }),
      });
      const data = await res.json();
      if (data.success && data.prices) {
        setLookupResults(data.prices);
      }
    } catch (err) {
      console.error("Error looking up price:", err);
    } finally {
      setLookupLoading(false);
    }
  }, [holdings]);

  // Start editing a holding
  const startEdit = (index: number) => {
    const h = holdings[index];
    setEditingIndex(index);
    setEditPrice(h.marketPrice?.toString() || "");
    setEditAssetClass(h.assetClass || "equity");
    setLookupResults(null);
    setLookupIndex(null);
  };

  // Apply price from lookup
  const applyLookupPrice = (price: number, source: string) => {
    if (lookupIndex === null) return;
    const updated = [...holdings];
    const h = updated[lookupIndex];
    const newValue = (h.quantity || 0) * price;
    updated[lookupIndex] = {
      ...h,
      marketPrice: price,
      marketValue: newValue > 0 ? newValue : h.marketValue,
    };
    setHoldings(updated);
    setHasChanges(true);
    setLookupResults(null);
    setLookupIndex(null);
    setEditingIndex(null);
  };

  // Save edited price
  const saveEdit = (index: number) => {
    const newPrice = parseFloat(editPrice);
    if (isNaN(newPrice) || newPrice <= 0) return;

    const updated = [...holdings];
    const h = updated[index];
    const newValue = (h.quantity || 0) * newPrice;
    updated[index] = {
      ...h,
      marketPrice: newPrice,
      marketValue: newValue > 0 ? newValue : h.marketValue,
      assetClass: editAssetClass || h.assetClass,
    };
    setHoldings(updated);
    setHasChanges(true);
    setEditingIndex(null);
  };

  // Change asset class without entering full edit mode
  const changeAssetClass = (index: number, newClass: string) => {
    const updated = [...holdings];
    updated[index] = { ...updated[index], assetClass: newClass };
    setHoldings(updated);
    setHasChanges(true);
  };

  // Save all changes to the snapshot
  const saveAll = async () => {
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      // Recalculate totals and composition
      const totalValue = holdings.reduce((sum, h) => sum + (h.marketValue || 0), 0);

      const comp: Record<string, number> = { equity: 0, fixedIncome: 0, alternatives: 0, cash: 0 };
      for (const h of holdings) {
        const cls = h.assetClass || "equity";
        const val = h.marketValue || 0;
        if (cls === "balanced") {
          comp.equity += val * 0.5;
          comp.fixedIncome += val * 0.5;
        } else if (cls === "Fixed Income" || cls === "fixedIncome") {
          comp.fixedIncome += val;
        } else if (cls === "Equity" || cls === "equity") {
          comp.equity += val;
        } else if (comp[cls] !== undefined) {
          comp[cls] += val;
        } else {
          comp.equity += val;
        }
      }

      const res = await fetch(`/api/portfolio/snapshots/${snapshot.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: snapshot.client_id,
          snapshotDate: snapshot.snapshot_date,
          totalValue,
          composition: {
            equity: { value: comp.equity, percent: totalValue > 0 ? (comp.equity / totalValue) * 100 : 0 },
            fixedIncome: { value: comp.fixedIncome, percent: totalValue > 0 ? (comp.fixedIncome / totalValue) * 100 : 0 },
            alternatives: { value: comp.alternatives, percent: totalValue > 0 ? (comp.alternatives / totalValue) * 100 : 0 },
            cash: { value: comp.cash, percent: totalValue > 0 ? (comp.cash / totalValue) * 100 : 0 },
          },
          holdings,
          source: snapshot.source,
        }),
      });

      const result = await res.json();
      if (result.success) {
        setSaveSuccess(true);
        setHasChanges(false);
        setTimeout(() => setSaveSuccess(false), 3000);
        onUpdate();
      } else {
        setSaveError(result.error || "Error al guardar");
      }
    } catch {
      setSaveError("Error de conexión");
    } finally {
      setSaving(false);
    }
  };

  // Calculate diagnostics
  const totalFromHoldings = holdings.reduce((sum, h) => sum + (h.marketValue || 0), 0);
  const valueDiff = Math.abs(totalFromHoldings - snapshot.total_value);
  const valueDiffPercent = snapshot.total_value > 0 ? (valueDiff / snapshot.total_value) * 100 : 0;

  if (!snapshot.holdings || (snapshot.holdings as Holding[]).length === 0) {
    return null;
  }

  return (
    <div className="bg-white rounded-lg border border-gb-border shadow-sm mb-6">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-6 py-4 border-b border-gb-border flex items-center justify-between hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          {expanded ? (
            <ChevronDown className="w-4 h-4 text-gb-gray" />
          ) : (
            <ChevronRight className="w-4 h-4 text-gb-gray" />
          )}
          <Database className="w-4 h-4 text-indigo-500" />
          <h2 className="text-base font-semibold text-gb-black">
            Diagnóstico de Holdings
          </h2>
          <span className="text-xs text-gb-gray ml-1">
            ({holdings.length} posiciones — {snapshot.snapshot_date})
          </span>
        </div>
        <div className="flex items-center gap-2">
          {hasChanges && (
            <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded font-medium">
              Sin guardar
            </span>
          )}
          {valueDiffPercent > 1 && (
            <span className="text-xs text-red-600 bg-red-50 px-2 py-0.5 rounded font-medium flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              Diff: {formatNumber(valueDiffPercent, 1)}%
            </span>
          )}
        </div>
      </button>

      {expanded && (
        <div className="p-4">
          {/* Summary row */}
          <div className="mb-4 grid grid-cols-4 gap-3 text-xs">
            <div className="p-2 bg-slate-50 rounded border border-slate-200">
              <p className="text-gb-gray">Total Snapshot</p>
              <p className="font-bold text-gb-black">{formatCurrency(snapshot.total_value)}</p>
            </div>
            <div className="p-2 bg-slate-50 rounded border border-slate-200">
              <p className="text-gb-gray">Suma Holdings</p>
              <p className="font-bold text-gb-black">{formatCurrency(totalFromHoldings)}</p>
            </div>
            <div className={`p-2 rounded border ${valueDiffPercent > 1 ? "bg-red-50 border-red-200" : "bg-green-50 border-green-200"}`}>
              <p className="text-gb-gray">Diferencia</p>
              <p className={`font-bold ${valueDiffPercent > 1 ? "text-red-600" : "text-green-600"}`}>
                {formatCurrency(valueDiff)} ({formatNumber(valueDiffPercent, 2)}%)
              </p>
            </div>
            <div className="p-2 bg-slate-50 rounded border border-slate-200">
              <p className="text-gb-gray">Fuente</p>
              <p className="font-bold text-gb-black">{snapshot.source}</p>
            </div>
          </div>

          {/* Holdings table */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gb-border bg-slate-50">
                  <th className="px-2 py-2 text-left font-semibold text-gb-gray">#</th>
                  <th className="px-2 py-2 text-left font-semibold text-gb-gray">Fondo</th>
                  <th className="px-2 py-2 text-left font-semibold text-gb-gray">Clase</th>
                  <th className="px-2 py-2 text-right font-semibold text-gb-gray">Cantidad</th>
                  <th className="px-2 py-2 text-right font-semibold text-gb-gray">Precio</th>
                  <th className="px-2 py-2 text-right font-semibold text-gb-gray">Valor</th>
                  <th className="px-2 py-2 text-center font-semibold text-gb-gray">Moneda</th>
                  <th className="px-2 py-2 text-center font-semibold text-gb-gray">% Total</th>
                  <th className="px-2 py-2 text-center font-semibold text-gb-gray">Custodio</th>
                  <th className="px-2 py-2 text-center font-semibold text-gb-gray">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {holdings.map((h, i) => {
                  const pctOfTotal = totalFromHoldings > 0 ? ((h.marketValue || 0) / totalFromHoldings) * 100 : 0;
                  const acLabel = ASSET_CLASS_LABELS[h.assetClass || "equity"] || { label: h.assetClass || "?", color: "bg-gray-100 text-gray-800" };
                  const isEditing = editingIndex === i;
                  const isLooking = lookupIndex === i;

                  return (
                    <React.Fragment key={i}>
                      <tr className={`border-b border-slate-100 hover:bg-blue-50/50 ${isEditing ? "bg-amber-50" : ""}`}>
                        <td className="px-2 py-2 text-gb-gray">{i + 1}</td>
                        <td className="px-2 py-2">
                          <div className="max-w-[250px]">
                            <p className="font-medium text-gb-black truncate" title={h.fundName}>
                              {h.fundName}
                            </p>
                            {h.securityId && (
                              <p className="text-[10px] text-gb-gray">ID: {h.securityId}</p>
                            )}
                          </div>
                        </td>
                        <td className="px-2 py-2">
                          {isEditing ? (
                            <select
                              value={editAssetClass}
                              onChange={(e) => setEditAssetClass(e.target.value)}
                              className="text-[10px] px-1 py-0.5 border border-slate-300 rounded"
                            >
                              <option value="equity">RV</option>
                              <option value="fixedIncome">RF</option>
                              <option value="balanced">Bal</option>
                              <option value="alternatives">Alt</option>
                              <option value="cash">Cash</option>
                            </select>
                          ) : (
                            <span
                              className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium cursor-pointer ${acLabel.color}`}
                              onClick={() => {
                                const classes = ["equity", "fixedIncome", "balanced", "alternatives", "cash"];
                                const current = classes.indexOf(h.assetClass || "equity");
                                const next = classes[(current + 1) % classes.length];
                                changeAssetClass(i, next);
                              }}
                              title="Click para cambiar clase"
                            >
                              {acLabel.label}
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-2 text-right font-mono">
                          {h.quantity ? formatNumber(h.quantity, 4) : "-"}
                        </td>
                        <td className="px-2 py-2 text-right">
                          {isEditing ? (
                            <input
                              type="number"
                              value={editPrice}
                              onChange={(e) => setEditPrice(e.target.value)}
                              className="w-24 px-1 py-0.5 border border-amber-300 rounded text-right text-xs bg-white"
                              step="0.0001"
                            />
                          ) : (
                            <span className="font-mono font-medium">
                              {h.marketPrice ? formatNumber(h.marketPrice, 4) : "-"}
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-2 text-right font-semibold text-gb-black">
                          {formatCurrency(h.marketValue || 0)}
                        </td>
                        <td className="px-2 py-2 text-center">
                          <span className="text-[10px] px-1 py-0.5 bg-slate-100 rounded">
                            {h.currency || "-"}
                          </span>
                        </td>
                        <td className="px-2 py-2 text-center font-mono">
                          {formatNumber(pctOfTotal, 1)}%
                        </td>
                        <td className="px-2 py-2 text-center">
                          <span className="text-[10px] text-gb-gray">{h.source || "-"}</span>
                        </td>
                        <td className="px-2 py-2 text-center">
                          <div className="flex items-center justify-center gap-1">
                            {isEditing ? (
                              <>
                                <button
                                  onClick={() => saveEdit(i)}
                                  className="p-1 text-green-600 hover:bg-green-50 rounded"
                                  title="Guardar precio"
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => setEditingIndex(null)}
                                  className="p-1 text-slate-400 hover:bg-slate-50 rounded"
                                  title="Cancelar"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  onClick={() => startEdit(i)}
                                  className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                                  title="Editar precio"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => lookupPrice(i)}
                                  disabled={lookupLoading}
                                  className="p-1 text-indigo-600 hover:bg-indigo-50 rounded disabled:opacity-50"
                                  title="Buscar precio actual"
                                >
                                  <Search className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>

                      {/* Lookup results row */}
                      {isLooking && lookupResults && (
                        <tr className="border-b border-slate-100">
                          <td colSpan={10} className="px-4 py-3 bg-indigo-50">
                            <div className="flex items-start gap-3">
                              <HelpCircle className="w-4 h-4 text-indigo-500 mt-0.5 shrink-0" />
                              <div className="flex-1">
                                <p className="text-xs font-semibold text-indigo-800 mb-2">
                                  Resultado de búsqueda de precio:
                                </p>
                                {lookupResults.map((r, ri) => {
                                  const srcInfo = SOURCE_LABELS[r.source] || SOURCE_LABELS.none;
                                  return (
                                    <div key={ri} className="flex items-center justify-between p-2 bg-white rounded border border-indigo-100 mb-1">
                                      <div>
                                        <p className="text-xs font-medium text-gb-black">
                                          {r.fintualName || r.fundName}
                                        </p>
                                        <div className="flex items-center gap-2 mt-0.5">
                                          {r.fintualId && (
                                            <span className="text-[10px] text-gb-gray">ID: {r.fintualId}</span>
                                          )}
                                          {r.serieName && (
                                            <span className="text-[10px] text-gb-gray">Serie: {r.serieName}</span>
                                          )}
                                          <span className={`text-[10px] px-1.5 py-0.5 rounded border ${srcInfo.color}`}>
                                            {srcInfo.label}
                                          </span>
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-3">
                                        <div className="text-right">
                                          <p className="text-sm font-bold text-gb-black">
                                            {r.currentPrice ? formatNumber(r.currentPrice, 4) : "N/A"}
                                          </p>
                                          <p className="text-[10px] text-gb-gray">
                                            {r.currency} — {r.lastPriceDate || "sin fecha"}
                                          </p>
                                        </div>
                                        {r.currentPrice && (
                                          <button
                                            onClick={() => applyLookupPrice(r.currentPrice!, r.source)}
                                            className="px-2 py-1 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700"
                                          >
                                            Usar
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                                {lookupResults.length === 0 && (
                                  <p className="text-xs text-gb-gray">No se encontraron precios</p>
                                )}
                                <button
                                  onClick={() => { setLookupIndex(null); setLookupResults(null); }}
                                  className="mt-2 text-[10px] text-indigo-600 hover:underline"
                                >
                                  Cerrar
                                </button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}

                      {/* Loading row */}
                      {isLooking && lookupLoading && (
                        <tr className="border-b border-slate-100">
                          <td colSpan={10} className="px-4 py-3 bg-indigo-50">
                            <div className="flex items-center gap-2 text-xs text-indigo-600">
                              <RefreshCw className="w-3 h-3 animate-spin" />
                              Buscando precio para &quot;{h.fundName.substring(0, 40)}&quot;...
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Save bar */}
          <div className="mt-4 flex items-center justify-between pt-3 border-t border-slate-200">
            <div className="flex items-center gap-2">
              {saveError && (
                <span className="text-xs text-red-600 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  {saveError}
                </span>
              )}
              {saveSuccess && (
                <span className="text-xs text-green-600 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  Guardado correctamente
                </span>
              )}
            </div>
            <button
              onClick={saveAll}
              disabled={saving || !hasChanges}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              {saving ? "Guardando..." : "Guardar Cambios"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
