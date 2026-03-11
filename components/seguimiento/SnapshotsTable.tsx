"use client";

import React from "react";
import { Edit, Trash2, Eye, TrendingUp, TrendingDown } from "lucide-react";
import type { Snapshot } from "./SeguimientoPage";

interface Props {
  snapshots: Snapshot[];
  onEdit: (snapshot: Snapshot) => void;
  onDelete: (snapshotId: string) => void;
}

export default function SnapshotsTable({ snapshots, onEdit, onDelete }: Props) {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("es-CL", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatPercent = (value: number | null | undefined) => {
    if (value === null || value === undefined) return "-";
    const sign = value >= 0 ? "+" : "";
    return `${sign}${value.toFixed(2)}%`;
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("es-CL", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  // Sort snapshots by date descending
  const sortedSnapshots = [...snapshots].sort(
    (a, b) => new Date(b.snapshot_date).getTime() - new Date(a.snapshot_date).getTime()
  );

  // Calculate period returns (change from previous snapshot)
  const snapshotsWithReturns = sortedSnapshots.map((snapshot, index) => {
    const prevSnapshot = sortedSnapshots[index + 1];
    const periodReturn = prevSnapshot
      ? ((snapshot.total_value - prevSnapshot.total_value) / prevSnapshot.total_value) * 100
      : null;
    return { ...snapshot, periodReturn };
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
            <th className="px-4 py-3 text-left text-xs font-semibold text-gb-gray uppercase">
              Fecha
            </th>
            <th className="px-4 py-3 text-right text-xs font-semibold text-gb-gray uppercase">
              Valor Total
            </th>
            <th className="px-4 py-3 text-right text-xs font-semibold text-gb-gray uppercase">
              Cambio
            </th>
            <th className="px-4 py-3 text-center text-xs font-semibold text-gb-gray uppercase">
              Equity
            </th>
            <th className="px-4 py-3 text-center text-xs font-semibold text-gb-gray uppercase">
              RF
            </th>
            <th className="px-4 py-3 text-center text-xs font-semibold text-gb-gray uppercase">
              Alt
            </th>
            <th className="px-4 py-3 text-center text-xs font-semibold text-gb-gray uppercase">
              Cash
            </th>
            <th className="px-4 py-3 text-center text-xs font-semibold text-gb-gray uppercase">
              Fuente
            </th>
            <th className="px-4 py-3 text-right text-xs font-semibold text-gb-gray uppercase">
              Acciones
            </th>
          </tr>
        </thead>
        <tbody>
          {snapshotsWithReturns.map((snapshot) => (
            <tr
              key={snapshot.id}
              className="border-b border-gb-border hover:bg-blue-50 transition-colors"
            >
              <td className="px-4 py-3">
                <span className="text-sm font-medium text-gb-black">
                  {formatDate(snapshot.snapshot_date)}
                </span>
              </td>
              <td className="px-4 py-3 text-right">
                <span className="text-sm font-semibold text-gb-black">
                  {formatCurrency(snapshot.total_value)}
                </span>
              </td>
              <td className="px-4 py-3 text-right">
                {snapshot.periodReturn !== null ? (
                  <span
                    className={`inline-flex items-center gap-1 text-sm font-medium ${
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
              <td className="px-4 py-3 text-center">
                <span className="text-sm text-gb-black">
                  {snapshot.equity_percent?.toFixed(0) || 0}%
                </span>
              </td>
              <td className="px-4 py-3 text-center">
                <span className="text-sm text-gb-black">
                  {snapshot.fixed_income_percent?.toFixed(0) || 0}%
                </span>
              </td>
              <td className="px-4 py-3 text-center">
                <span className="text-sm text-gb-black">
                  {snapshot.alternatives_percent?.toFixed(0) || 0}%
                </span>
              </td>
              <td className="px-4 py-3 text-center">
                <span className="text-sm text-gb-black">
                  {snapshot.cash_percent?.toFixed(0) || 0}%
                </span>
              </td>
              <td className="px-4 py-3 text-center">
                <span className="text-xs px-2 py-0.5 bg-slate-100 text-slate-600 rounded font-medium">
                  {snapshot.source || "manual"}
                </span>
              </td>
              <td className="px-4 py-3 text-right">
                <div className="flex items-center justify-end gap-1">
                  <button
                    onClick={() => onEdit(snapshot)}
                    className="p-1.5 text-gb-gray hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                    title="Editar"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => onDelete(snapshot.id)}
                    className="p-1.5 text-gb-gray hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                    title="Eliminar"
                  >
                    <Trash2 className="w-4 h-4" />
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
