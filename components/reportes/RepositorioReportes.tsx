"use client";
import { useEffect, useState, useCallback } from "react";
import UploadReportModal from "./UploadReportModal";
import ReportHistoryModal from "./ReportHistoryModal";
import NewTypeModal from "./NewTypeModal";

interface TypeRow { id: string; label: string; scope_key: string; default_usos: string[]; formatos: string[]; }
interface Vigente { id: string; type: string; report_date: string; usos_efectivos: string[]; }

const USO_LABEL: Record<string, string> = {
  distribucion: "Distribución",
  insumo_cartera: "Insumo cartera",
  insumo_cierre: "Insumo cierre",
};

export default function RepositorioReportes() {
  const [types, setTypes] = useState<TypeRow[]>([]);
  const [vig, setVig] = useState<Record<string, Vigente>>({});
  const [uploadType, setUploadType] = useState<TypeRow | null>(null);
  const [historyType, setHistoryType] = useState<TypeRow | null>(null);
  const [newType, setNewType] = useState(false);

  const load = useCallback(async () => {
    const [t, v] = await Promise.all([
      fetch("/api/report-types").then((r) => r.json()),
      fetch("/api/reports?vigente=true").then((r) => r.json()),
    ]);
    setTypes(t.types || []);
    const map: Record<string, Vigente> = {};
    for (const r of (v.reports || []) as Vigente[]) if (!map[r.type]) map[r.type] = r;
    setVig(map);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <div className="flex justify-end mb-3">
        <button onClick={() => setNewType(true)} className="text-sm text-gb-info underline">
          ＋ Nuevo tipo
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {types.map((t) => {
          const usos = vig[t.id]?.usos_efectivos ?? t.default_usos;
          return (
            <div key={t.id} className="bg-white border border-gb-border rounded-lg p-4">
              <div className="font-medium text-gb-black">{t.label}</div>
              <div className="flex flex-wrap gap-1 my-2">
                {usos.map((u) => (
                  <span key={u} className="text-xs px-2 py-0.5 rounded-full bg-gb-primary/10 text-gb-primary">
                    {USO_LABEL[u] ?? u}
                  </span>
                ))}
              </div>
              <div className="text-xs text-gb-gray mb-3">
                {vig[t.id] ? `Vigente: ${vig[t.id].report_date}` : "Sin versión"}
              </div>
              <div className="flex gap-2">
                <button onClick={() => setUploadType(t)} className="text-sm px-3 py-1.5 rounded bg-gb-primary text-white">
                  Subir
                </button>
                <button onClick={() => setHistoryType(t)} className="text-sm px-3 py-1.5 rounded border border-gb-border">
                  Historial
                </button>
              </div>
            </div>
          );
        })}
      </div>
      {uploadType && (
        <UploadReportModal type={uploadType} onClose={() => setUploadType(null)} onDone={() => { setUploadType(null); load(); }} />
      )}
      {historyType && (
        <ReportHistoryModal type={historyType} onClose={() => setHistoryType(null)} onChanged={load} />
      )}
      {newType && <NewTypeModal onClose={() => setNewType(false)} onDone={() => { setNewType(false); load(); }} />}
    </div>
  );
}
