"use client";

import React, { useState } from "react";
import {
  RefreshCw,
  CheckCircle2,
  FileText,
  ChevronDown,
  ChevronRight,
} from "lucide-react";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface RebalancingTableProps {
  recommendation: Record<string, any> | null;
  latestSnapshotHoldings: Array<{
    securityId?: string; fundName?: string; name?: string; nombre?: string;
    assetClass?: string; tipo?: string; marketValue?: number; marketValueCLP?: number;
    valor?: number; percentOfPortfolio?: number;
  }> | null;
  clientId: string;
  executions: Array<{
    id: string; ticker: string; nombre: string; asset_class: string;
    action: string; target_percent: number | null; actual_percent: number | null;
    amount: number | null; units: number | null; notes: string | null;
    executed_at: string; created_at: string;
  }>;
  onExecutionSaved: () => void;
}

export default function RebalancingTable({
  recommendation,
  latestSnapshotHoldings,
  clientId,
  executions,
  onExecutionSaved,
}: RebalancingTableProps) {
  const [savingExecution, setSavingExecution] = useState(false);
  const [showExecutions, setShowExecutions] = useState(false);

  const rec = recommendation as { cartera?: Array<{ ticker: string; nombre: string; clase: string; porcentaje: number }> } | null;
  const cartera = rec?.cartera;

  if (!cartera || cartera.length === 0 || !latestSnapshotHoldings) return null;

  const holdings = latestSnapshotHoldings;

  // Build rebalancing rows
  const rows: Array<{
    nombre: string; ticker: string; clase: string;
    actualPct: number; recomPct: number; diffPct: number;
    action: "comprar" | "vender" | "mantener";
  }> = [];

  // Match recommended positions to actual
  cartera.forEach(pos => {
    const match = holdings.find(h =>
      h.securityId === pos.ticker ||
      (h.fundName || h.name || h.nombre || "").toLowerCase().includes(pos.nombre.toLowerCase().substring(0, 10))
    );
    const actualPct = match?.percentOfPortfolio || 0;
    const diffPct = pos.porcentaje - actualPct;
    rows.push({
      nombre: pos.nombre,
      ticker: pos.ticker,
      clase: pos.clase,
      actualPct,
      recomPct: pos.porcentaje,
      diffPct,
      action: Math.abs(diffPct) < 1 ? "mantener" : diffPct > 0 ? "comprar" : "vender",
    });
  });

  // Holdings in actual but not recommended (sell)
  holdings.forEach(h => {
    const pct = h.percentOfPortfolio || 0;
    if (pct < 0.5) return;
    const name = h.fundName || h.name || h.nombre || "";
    const inRec = cartera.some(pos =>
      pos.ticker === h.securityId ||
      name.toLowerCase().includes(pos.nombre.toLowerCase().substring(0, 10))
    );
    if (!inRec) {
      rows.push({
        nombre: name || "Desconocido",
        ticker: h.securityId || "—",
        clase: h.assetClass || h.tipo || "—",
        actualPct: pct,
        recomPct: 0,
        diffPct: -pct,
        action: "vender",
      });
    }
  });

  if (rows.length === 0) return null;

  const sortedRows = rows.sort((a, b) => Math.abs(b.diffPct) - Math.abs(a.diffPct));

  return (
    <>
      <div className="mb-6">
        <div className="bg-white rounded-lg border border-blue-200 shadow-sm">
          <div className="px-6 py-4 border-b border-blue-200 bg-blue-50 flex items-center justify-between">
            <h2 className="text-base font-semibold text-gb-black flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-blue-500" />
              Rebalanceo por Instrumento
            </h2>
            <div className="flex items-center gap-3 text-xs">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-green-500" />
                {rows.filter(r => r.action === "comprar").length} comprar
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-red-500" />
                {rows.filter(r => r.action === "vender").length} vender
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-gray-400" />
                {rows.filter(r => r.action === "mantener").length} mantener
              </span>
            </div>
          </div>
          <div className="p-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 px-3 text-gb-gray font-medium">Instrumento</th>
                  <th className="text-left py-2 px-3 text-gb-gray font-medium">Clase</th>
                  <th className="text-right py-2 px-3 text-gb-gray font-medium">Actual %</th>
                  <th className="text-right py-2 px-3 text-gb-gray font-medium">Recom. %</th>
                  <th className="text-right py-2 px-3 text-gb-gray font-medium">Diferencia</th>
                  <th className="text-center py-2 px-3 text-gb-gray font-medium">Accion</th>
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((row, idx) => (
                  <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-2.5 px-3">
                      <div className="font-medium text-gb-black text-xs">{row.nombre}</div>
                      <div className="text-xs text-gb-gray">{row.ticker}</div>
                    </td>
                    <td className="py-2.5 px-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        row.clase === "Renta Variable" || row.clase === "Equity" ? "bg-blue-100 text-blue-700" :
                        row.clase === "Renta Fija" || row.clase === "Fixed Income" ? "bg-emerald-100 text-emerald-700" :
                        "bg-amber-100 text-amber-700"
                      }`}>
                        {row.clase === "Renta Variable" || row.clase === "Equity" ? "RV" :
                         row.clase === "Renta Fija" || row.clase === "Fixed Income" ? "RF" : "ALT"}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right font-medium text-gb-black">
                      {row.actualPct.toFixed(1)}%
                    </td>
                    <td className="py-2.5 px-3 text-right font-medium text-gb-black">
                      {row.recomPct.toFixed(1)}%
                    </td>
                    <td className={`py-2.5 px-3 text-right font-bold ${
                      row.diffPct > 0 ? "text-green-600" : row.diffPct < 0 ? "text-red-600" : "text-gb-gray"
                    }`}>
                      {row.diffPct > 0 ? "+" : ""}{row.diffPct.toFixed(1)}pp
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                        row.action === "comprar" ? "bg-green-100 text-green-700" :
                        row.action === "vender" ? "bg-red-100 text-red-700" :
                        "bg-gray-100 text-gray-600"
                      }`}>
                        {row.action === "comprar" ? "Comprar" : row.action === "vender" ? "Vender" : "Mantener"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Register execution button */}
          <div className="px-6 py-3 border-t border-blue-200 bg-blue-50/50 flex items-center justify-between">
            <p className="text-xs text-gb-gray">
              {executions.length > 0
                ? `${executions.length} operaciones registradas`
                : "Registra las operaciones ejecutadas para tracking"}
            </p>
            <button
              disabled={savingExecution}
              onClick={async () => {
                setSavingExecution(true);
                try {
                  const execBatch = sortedRows
                    .filter(r => r.action !== "mantener")
                    .map(r => ({
                      ticker: r.ticker,
                      nombre: r.nombre,
                      asset_class: r.clase,
                      action: r.action === "comprar" ? "buy" : "sell",
                      target_percent: r.recomPct,
                      actual_percent: r.actualPct,
                    }));
                  if (execBatch.length === 0) return;
                  const res = await fetch(`/api/clients/${clientId}/rebalance-executions`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ executions: execBatch }),
                  });
                  if (res.ok) {
                    onExecutionSaved();
                  }
                } catch (err) {
                  console.error("Error saving execution:", err);
                } finally {
                  setSavingExecution(false);
                }
              }}
              className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              {savingExecution ? "Guardando..." : "Registrar ejecucion"}
            </button>
          </div>
        </div>
      </div>

      {/* Execution history */}
      {executions.length > 0 && (
        <div className="mb-6">
          <div className="bg-white rounded-lg border border-gb-border shadow-sm">
            <button
              onClick={() => setShowExecutions(!showExecutions)}
              className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
            >
              <h2 className="text-base font-semibold text-gb-black flex items-center gap-2">
                <FileText className="w-4 h-4 text-green-500" />
                Historial de Ejecuciones ({executions.length})
              </h2>
              {showExecutions ? <ChevronDown className="w-4 h-4 text-gb-gray" /> : <ChevronRight className="w-4 h-4 text-gb-gray" />}
            </button>
            {showExecutions && (
              <div className="px-4 pb-4 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-2 px-3 text-gb-gray font-medium text-xs">Fecha</th>
                      <th className="text-left py-2 px-3 text-gb-gray font-medium text-xs">Instrumento</th>
                      <th className="text-center py-2 px-3 text-gb-gray font-medium text-xs">Accion</th>
                      <th className="text-right py-2 px-3 text-gb-gray font-medium text-xs">Actual</th>
                      <th className="text-right py-2 px-3 text-gb-gray font-medium text-xs">Objetivo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {executions.map(ex => (
                      <tr key={ex.id} className="border-b border-gray-100">
                        <td className="py-2 px-3 text-xs text-gb-gray">
                          {new Date(ex.executed_at).toLocaleDateString("es-CL", { day: "numeric", month: "short" })}
                        </td>
                        <td className="py-2 px-3">
                          <div className="text-xs font-medium text-gb-black">{ex.nombre}</div>
                          <div className="text-xs text-gb-gray">{ex.ticker}</div>
                        </td>
                        <td className="py-2 px-3 text-center">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            ex.action === "buy" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                          }`}>
                            {ex.action === "buy" ? "Compra" : "Venta"}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-right text-xs">{ex.actual_percent?.toFixed(1)}%</td>
                        <td className="py-2 px-3 text-right text-xs">{ex.target_percent?.toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
