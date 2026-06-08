"use client";

import React, { useState } from "react";
import {
  Plus,
  TrendingUp,
  ChevronDown,
  ChevronRight,
  FileText,
  Trash2,
} from "lucide-react";
import SnapshotsTable from "./SnapshotsTable";
import type { Snapshot } from "./SeguimientoPage";

interface CartolaHistoryProps {
  snapshots: Snapshot[];
  onEdit: (snapshot: Snapshot) => void;
  onDelete: (snapshotId: string) => void;
  onDeleteAll: () => void;
  onSetBaseline: (snapshotId: string) => void;
  onAddFirst: () => void;
}

export default function CartolaHistory({
  snapshots,
  onEdit,
  onDelete,
  onDeleteAll,
  onSetBaseline,
  onAddFirst,
}: CartolaHistoryProps) {
  const [showAllSnapshots, setShowAllSnapshots] = useState(false);

  const cartolas = snapshots.filter(
    (s) => s.source === "statement" || s.source === "manual" || s.source === "excel"
  );
  const apiSnapshots = snapshots.filter(
    (s) => s.source !== "statement" && s.source !== "manual" && s.source !== "excel"
  );

  if (snapshots.length === 0) {
    return (
      <div className="text-center py-12 bg-white rounded-lg border border-gb-border">
        <TrendingUp className="w-12 h-12 text-gb-gray mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-gb-black mb-2">Sin historial de cartolas</h3>
        <p className="text-sm text-gb-gray mb-4">
          Agrega la primera cartola para comenzar a trackear la evolución del portafolio.
        </p>
        <button
          onClick={onAddFirst}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Agregar Primera Cartola
        </button>
      </div>
    );
  }

  return (
    <>
      {cartolas.length > 0 && (
        <div className="bg-white rounded-lg border border-gb-border shadow-sm mb-6">
          <div className="px-6 py-4 border-b border-gb-border flex items-center gap-2">
            <FileText className="w-4 h-4 text-blue-600" />
            <h2 className="text-base font-semibold text-gb-black">
              Cartolas Ingresadas
            </h2>
            <span className="text-xs text-gb-gray ml-1">({cartolas.length})</span>
          </div>
          <SnapshotsTable
            snapshots={cartolas}
            onEdit={onEdit}
            onDelete={onDelete}
            onSetBaseline={onSetBaseline}
          />
        </div>
      )}

      {/* Full snapshot history (collapsible) */}
      {apiSnapshots.length > 0 && (
        <div className="bg-white rounded-lg border border-gb-border shadow-sm">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setShowAllSnapshots(!showAllSnapshots)}
              className="flex-1 px-6 py-4 border-b border-gb-border flex items-center justify-between hover:bg-slate-50 transition-colors"
            >
              <div className="flex items-center gap-2">
                {showAllSnapshots ? (
                  <ChevronDown className="w-4 h-4 text-gb-gray" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-gb-gray" />
                )}
                <h2 className="text-base font-semibold text-gb-black">
                  Historial Completo de Snapshots
                </h2>
                <span className="text-xs text-gb-gray">
                  ({snapshots.length} total — {apiSnapshots.length} interpolados)
                </span>
              </div>
            </button>
            <button
              onClick={onDeleteAll}
              className="px-4 py-4 border-b border-gb-border text-xs text-red-500 hover:text-red-700 hover:bg-red-50 transition-colors flex items-center gap-1"
              title="Eliminar todos los snapshots"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Limpiar todo
            </button>
          </div>
          {showAllSnapshots && (
            <SnapshotsTable
              snapshots={snapshots}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          )}
        </div>
      )}
    </>
  );
}
