"use client";

import React from "react";
import { Edit, Trash2, TrendingUp, TrendingDown, Plus, Minus, Star } from "lucide-react";
import type { Snapshot } from "./SeguimientoPage";
import { formatNumber, formatCurrency, formatPercent, formatDate } from "@/lib/format";

interface Props {
  snapshots: Snapshot[];
  onEdit: (snapshot: Snapshot) => void;
  onDelete: (snapshotId: string) => void;
  onSetBaseline?: (snapshotId: string) => void;
}

export default function SnapshotsTable({ snapshots, onEdit, onDelete, onSetBaseline }: Props) {
  // Sort snapshots by date descending
  const sortedSnapshots = [...snapshots].sort(
    (a, b) => new Date(b.snapshot_date).getTime() - new Date(a.snapshot_date).getTime()
  );

  // Calculate unit value and period returns
  // Use stored twr_period as the single source of truth (calculated at creation time
  // with full context: cuotas, cash flows, etc.). Only recalculate if not stored.
  const snapshotsWithReturns = sortedSnapshots.map((snapshot, index) => {
    const prevSnapshot = sortedSnapshots[index + 1];
    const currentCuotas = snapshot.total_cuotas || 0;

    // Calculate current unit value (valor cuota) for display
    const unitValue = currentCuotas > 0 ? snapshot.total_value / currentCuotas : null;

    if (!prevSnapshot) {
      return {
        ...snapshot,
        periodReturn: null,
        unitValue,
        prevUnitValue: null,
      };
    }

    const prevCuotas = prevSnapshot.total_cuotas || 0;
    const prevUnitValue = prevCuotas > 0 ? prevSnapshot.total_value / prevCuotas : null;

    // Use stored TWR as primary source — it was calculated with full context at creation time
    let periodReturn: number | null = null;

    if (snapshot.twr_period !== undefined && snapshot.twr_period !== null) {
      periodReturn = snapshot.twr_period;
    } else if (unitValue !== null && prevUnitValue !== null && prevUnitValue > 0) {
      // Fallback: recalculate from unit values if twr_period not stored
      periodReturn = ((unitValue - prevUnitValue) / prevUnitValue) * 100;
    } else if (prevSnapshot.total_value > 0) {
      // Last resort: simple return
      periodReturn = ((snapshot.total_value - prevSnapshot.total_value) / prevSnapshot.total_value) * 100;
    }

    return {
      ...snapshot,
      periodReturn,
      unitValue,
      prevUnitValue,
    };
  });

  if (snapshots.length === 0) {
    return (
      <div className="p-6 text-center text-gb-gray">
        No hay snapshots registrados
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-gb-border bg-slate-50">
            <th className="px-3 py-3 text-left text-xs font-semibold text-gb-gray uppercase">
              Fecha
            </th>
            <th className="px-3 py-3 text-right text-xs font-semibold text-gb-gray uppercase">
              Valor Total
            </th>
            <th className="px-3 py-3 text-right text-xs font-semibold text-gb-gray uppercase">
              Cuotas
            </th>
            <th className="px-3 py-3 text-right text-xs font-semibold text-gb-gray uppercase">
              Valor Cuota
            </th>
            <th className="px-3 py-3 text-right text-xs font-semibold text-gb-gray uppercase">
              Rentab.
            </th>
            <th className="px-3 py-3 text-right text-xs font-semibold text-gb-gray uppercase">
              Flujos
            </th>
            <th className="px-2 py-3 text-center text-xs font-semibold text-gb-gray uppercase">
              RV
            </th>
            <th className="px-2 py-3 text-center text-xs font-semibold text-gb-gray uppercase">
              RF
            </th>
            <th className="px-2 py-3 text-center text-xs font-semibold text-gb-gray uppercase">
              Alt
            </th>
            <th className="px-2 py-3 text-center text-xs font-semibold text-gb-gray uppercase">
              Cash
            </th>
            <th className="px-2 py-3 text-center text-xs font-semibold text-gb-gray uppercase">
              Fuente
            </th>
            <th className="px-2 py-3 text-right text-xs font-semibold text-gb-gray uppercase">

            </th>
          </tr>
        </thead>
        <tbody>
          {snapshotsWithReturns.map((snapshot) => (
            <tr
              key={snapshot.id}
              className={`border-b border-gb-border hover:bg-blue-50 transition-colors ${snapshot.is_baseline ? "bg-amber-50/50" : ""}`}
            >
              {/* Fecha */}
              <td className="px-3 py-3">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-medium text-gb-black">
                    {formatDate(snapshot.snapshot_date)}
                  </span>
                  {snapshot.is_baseline && (
                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-[10px] font-semibold" title="Portafolio Inicial">
                      <Star className="w-2.5 h-2.5 fill-amber-500 text-amber-500" />
                      Inicial
                    </span>
                  )}
                </div>
              </td>

              {/* Valor Total */}
              <td className="px-3 py-3 text-right">
                <span className="text-sm font-semibold text-gb-black">
                  {formatCurrency(snapshot.total_value)}
                </span>
              </td>

              {/* Cuotas */}
              <td className="px-3 py-3 text-right">
                {snapshot.total_cuotas ? (
                  <div>
                    <span className="text-sm text-gb-black">
                      {formatNumber(snapshot.total_cuotas, 2)}
                    </span>
                    {snapshot.cuotas_change !== undefined && snapshot.cuotas_change !== 0 && (
                      <span
                        className={`ml-1 inline-flex items-center text-xs ${
                          snapshot.cuotas_change > 0 ? "text-green-600" : "text-amber-600"
                        }`}
                        title={snapshot.cuotas_change > 0 ? "Compra de cuotas" : "Venta de cuotas"}
                      >
                        {snapshot.cuotas_change > 0 ? (
                          <Plus className="w-3 h-3" />
                        ) : (
                          <Minus className="w-3 h-3" />
                        )}
                        {formatNumber(Math.abs(snapshot.cuotas_change), 2)}
                      </span>
                    )}
                  </div>
                ) : (
                  <span className="text-sm text-gb-gray">-</span>
                )}
              </td>

              {/* Valor Cuota */}
              <td className="px-3 py-3 text-right">
                {snapshot.unitValue !== null ? (
                  <div>
                    <span className="text-sm font-medium text-gb-black">
                      {formatNumber(snapshot.unitValue, 2)}
                    </span>
                    {snapshot.prevUnitValue !== null && (
                      <p className="text-xs text-gb-gray">
                        ant: {formatNumber(snapshot.prevUnitValue, 2)}
                      </p>
                    )}
                  </div>
                ) : (
                  <span className="text-sm text-gb-gray">-</span>
                )}
              </td>

              {/* Rentabilidad */}
              <td className="px-3 py-3 text-right">
                {snapshot.periodReturn !== null ? (
                  <span
                    className={`inline-flex items-center gap-1 text-sm font-semibold ${
                      snapshot.periodReturn >= 0 ? "text-green-600" : "text-red-600"
                    }`}
                  >
                    {snapshot.periodReturn >= 0 ? (
                      <TrendingUp className="w-3 h-3" />
                    ) : (
                      <TrendingDown className="w-3 h-3" />
                    )}
                    {formatPercent(snapshot.periodReturn)}
                  </span>
                ) : (
                  <span className="text-sm text-gb-gray">-</span>
                )}
              </td>

              {/* Flujos */}
              <td className="px-3 py-3 text-right">
                {snapshot.deposits || snapshot.withdrawals ? (
                  <div className="flex flex-col items-end gap-0.5">
                    {snapshot.deposits ? (
                      <span className="text-xs font-medium text-green-600">
                        +{formatCurrency(snapshot.deposits)}
                      </span>
                    ) : null}
                    {snapshot.withdrawals ? (
                      <span className="text-xs font-medium text-red-600">
                        -{formatCurrency(snapshot.withdrawals)}
                      </span>
                    ) : null}
                  </div>
                ) : (
                  <span className="text-sm text-gb-gray">-</span>
                )}
              </td>

              {/* Composición */}
              <td className="px-2 py-3 text-center">
                <span className="text-xs text-gb-black">
                  {formatNumber(snapshot.equity_percent || 0, 0)}%
                </span>
              </td>
              <td className="px-2 py-3 text-center">
                <span className="text-xs text-gb-black">
                  {formatNumber(snapshot.fixed_income_percent || 0, 0)}%
                </span>
              </td>
              <td className="px-2 py-3 text-center">
                <span className="text-xs text-gb-black">
                  {formatNumber(snapshot.alternatives_percent || 0, 0)}%
                </span>
              </td>
              <td className="px-2 py-3 text-center">
                <span className="text-xs text-gb-black">
                  {formatNumber(snapshot.cash_percent || 0, 0)}%
                </span>
              </td>

              {/* Fuente */}
              <td className="px-2 py-3 text-center">
                <span className="text-xs px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded font-medium">
                  {snapshot.source || "manual"}
                </span>
              </td>

              {/* Acciones */}
              <td className="px-2 py-3 text-right">
                <div className="flex items-center justify-end gap-0.5">
                  {onSetBaseline && (
                    <button
                      onClick={() => onSetBaseline(snapshot.id)}
                      className={`p-1 rounded transition-colors ${
                        snapshot.is_baseline
                          ? "text-amber-500"
                          : "text-gb-gray hover:text-amber-500 hover:bg-amber-50"
                      }`}
                      title={snapshot.is_baseline ? "Portafolio inicial" : "Marcar como portafolio inicial"}
                    >
                      <Star className={`w-3.5 h-3.5 ${snapshot.is_baseline ? "fill-amber-500" : ""}`} />
                    </button>
                  )}
                  <button
                    onClick={() => onEdit(snapshot)}
                    className="p-1 text-gb-gray hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                    title="Editar"
                  >
                    <Edit className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => onDelete(snapshot.id)}
                    className="p-1 text-gb-gray hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                    title="Eliminar"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
