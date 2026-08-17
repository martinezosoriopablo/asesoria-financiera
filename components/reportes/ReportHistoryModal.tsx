"use client";
import { useEffect, useState, useCallback } from "react";
import ReportViewer from "./ReportViewer";

interface HistRow { id: string; report_date: string; period: string | null; perfil: string | null; }

export default function ReportHistoryModal({ type, onClose, onChanged }: {
  type: { id: string; label: string }; onClose: () => void; onChanged: () => void;
}) {
  const [rows, setRows] = useState<HistRow[]>([]);
  const [viewing, setViewing] = useState<string | null>(null);
  const load = useCallback(() => {
    fetch(`/api/reports?type=${type.id}`).then((r) => r.json()).then((d) => setRows(d.reports || []));
  }, [type.id]);
  useEffect(() => {
    load();
  }, [load]);
  const del = async (id: string) => {
    await fetch(`/api/reports/${id}`, { method: "DELETE" });
    load();
    onChanged();
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-lg p-5 w-full max-w-2xl max-h-[85vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-semibold mb-3">Historial · {type.label}</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gb-gray">
              <th>Fecha</th>
              <th>Clave</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id} className="border-t">
                <td className="py-1">
                  {r.report_date}
                  {i === 0 && <span className="ml-2 text-xs text-gb-success">vigente</span>}
                </td>
                <td>{r.period || r.perfil || "—"}</td>
                <td className="text-right">
                  <button onClick={() => setViewing(viewing === r.id ? null : r.id)} className="text-gb-info underline mr-3">
                    Ver
                  </button>
                  <button onClick={() => del(r.id)} className="text-gb-danger underline">
                    Eliminar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {viewing && (
          <div className="mt-4">
            <ReportViewer reportId={viewing} />
          </div>
        )}
        <div className="flex justify-end mt-4">
          <button onClick={onClose} className="px-3 py-1.5 text-sm border rounded">Cerrar</button>
        </div>
      </div>
    </div>
  );
}
