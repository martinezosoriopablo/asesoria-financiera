"use client";

import { useState, useEffect, useMemo } from "react";
import { useAdvisor } from "@/lib/hooks/useAdvisor";
import { Loader, Search, AlertTriangle, CheckCircle, XCircle, Filter, Upload, X, Eye, Trash2 } from "lucide-react";

interface FichaRow {
  fo_run: number;
  fm_serie: string;
  tipo: "FM" | "FI";
  serie_detectada: string | null;
  tac_serie: number | null;
  nombre_fondo_pdf: string | null;
  rent_1m: number | null;
  rent_3m: number | null;
  rent_6m: number | null;
  rent_12m: number | null;
  horizonte_inversion: string | null;
  tolerancia_riesgo: string | null;
  rescatable: boolean | null;
  updated_at: string | null;
  beneficio_apv: boolean | null;
  beneficio_57bis: boolean | null;
  beneficio_107lir: boolean | null;
  beneficio_108lir: boolean | null;
  notas_tributarias: string | null;
  objetivo: string | null;
  // From vw
  nombre_vw: string | null;
  agf: string | null;
  familia: string | null;
  tac_vw: number | null;
  rent_12m_vw: number | null;
  in_vw: boolean;
}

type FilterMode = "all" | "no_tac" | "no_name" | "no_rent" | "serie_mismatch" | "not_in_vw" | "rent_suspicious";

export default function FichasReviewPage() {
  const { advisor, loading: authLoading } = useAdvisor();
  const [fichas, setFichas] = useState<FichaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterMode>("all");
  const [objetivoModal, setObjetivoModal] = useState<{ nombre: string; objetivo: string } | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [uploadRun, setUploadRun] = useState("");
  const [uploadSerie, setUploadSerie] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{ success: boolean; message: string } | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    if (!advisor) return;
    fetch("/api/admin/fichas-review")
      .then(r => r.json())
      .then(data => {
        if (data.success) setFichas(data.fichas);
      })
      .finally(() => setLoading(false));
  }, [advisor]);

  const reloadFichas = () => {
    setLoading(true);
    fetch("/api/admin/fichas-review")
      .then(r => r.json())
      .then(data => { if (data.success) setFichas(data.fichas); })
      .finally(() => setLoading(false));
  };

  const handleUpload = async () => {
    if (!uploadRun || !uploadSerie || !uploadFile) return;
    setUploading(true);
    setUploadResult(null);
    try {
      const formData = new FormData();
      formData.append("fo_run", uploadRun);
      formData.append("fm_serie", uploadSerie);
      formData.append("file", uploadFile);
      const res = await fetch("/api/admin/fichas-upload", { method: "POST", body: formData });
      const data = await res.json();
      if (data.success) {
        const method = data.gemini_exhausted ? "Regex (Gemini sin cuota)" : data.extracted.extraction_method === "gemini" ? "Gemini AI" : "Regex";
        const ben = data.extracted.notas_tributarias || "ninguno";
        setUploadResult({ success: true, message: `${method} | TAC=${data.extracted.tac_serie ?? "—"}% | Serie=${data.extracted.serie_detectada ?? "—"} | Beneficio=${ben}` });
        reloadFichas();
        setUploadRun("");
        setUploadSerie("");
        setUploadFile(null);
      } else {
        setUploadResult({ success: false, message: data.error || "Error al subir" });
      }
    } catch {
      setUploadResult({ success: false, message: "Error de conexion" });
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (f: FichaRow) => {
    const key = `${f.fo_run}-${f.fm_serie}`;
    if (!confirm(`Eliminar ficha ${f.tipo} ${key} (${f.nombre_fondo_pdf || f.nombre_vw || "sin nombre"})?`)) return;
    setDeleting(key);
    try {
      const body = f.tipo === "FM"
        ? { tipo: "FM", fo_run: f.fo_run, fm_serie: f.fm_serie }
        : { tipo: "FI", fi_rut: String(f.fo_run), fi_serie: f.fm_serie };
      const res = await fetch("/api/admin/fichas-review", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success) {
        setFichas(prev => prev.filter(x => !(x.fo_run === f.fo_run && x.fm_serie === f.fm_serie && x.tipo === f.tipo)));
      }
    } catch { /* ignore */ }
    finally { setDeleting(null); }
  };

  const filtered = useMemo(() => {
    let list = fichas;

    // Apply filter
    switch (filter) {
      case "no_tac":
        list = list.filter(f => f.tac_serie == null && f.tac_vw == null);
        break;
      case "no_name":
        list = list.filter(f => !f.nombre_fondo_pdf);
        break;
      case "no_rent":
        list = list.filter(f => f.rent_12m == null && f.rent_12m_vw == null);
        break;
      case "serie_mismatch":
        list = list.filter(f => f.serie_detectada && f.fm_serie !== f.serie_detectada);
        break;
      case "not_in_vw":
        list = list.filter(f => !f.in_vw);
        break;
      case "rent_suspicious":
        list = list.filter(f => {
          if (f.rent_1m != null && Math.abs(Number(f.rent_1m)) > 30) return true;
          if (f.rent_12m != null && f.rent_12m_vw != null && Math.abs(Number(f.rent_12m) - Number(f.rent_12m_vw)) > 20) return true;
          return false;
        });
        break;
    }

    // Apply search
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(f =>
        String(f.fo_run).includes(q) ||
        (f.nombre_fondo_pdf || "").toLowerCase().includes(q) ||
        (f.nombre_vw || "").toLowerCase().includes(q) ||
        (f.agf || "").toLowerCase().includes(q) ||
        (f.fm_serie || "").toLowerCase().includes(q)
      );
    }

    return list;
  }, [fichas, filter, search]);

  // Stats
  const stats = useMemo(() => {
    const total = fichas.length;
    const noTac = fichas.filter(f => f.tac_serie == null && f.tac_vw == null).length;
    const noName = fichas.filter(f => !f.nombre_fondo_pdf).length;
    const noRent = fichas.filter(f => f.rent_12m == null && f.rent_12m_vw == null).length;
    const serieMismatch = fichas.filter(f => f.serie_detectada && f.fm_serie !== f.serie_detectada).length;
    const notInVw = fichas.filter(f => !f.in_vw).length;
    const suspicious = fichas.filter(f => {
      if (f.rent_1m != null && Math.abs(Number(f.rent_1m)) > 30) return true;
      if (f.rent_12m != null && f.rent_12m_vw != null && Math.abs(Number(f.rent_12m) - Number(f.rent_12m_vw)) > 20) return true;
      return false;
    }).length;
    return { total, noTac, noName, noRent, serieMismatch, notInVw, suspicious };
  }, [fichas]);

  if (authLoading || !advisor) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader className="w-8 h-8 text-gb-gray animate-spin" />
      </div>
    );
  }

  const FILTERS: { key: FilterMode; label: string; count: number; color: string }[] = [
    { key: "all", label: "Todas", count: stats.total, color: "bg-gb-light text-gb-black" },
    { key: "rent_suspicious", label: "Rent sospechosa", count: stats.suspicious, color: "bg-red-50 text-red-700" },
    { key: "no_tac", label: "Sin TAC", count: stats.noTac, color: "bg-amber-50 text-amber-700" },
    { key: "no_name", label: "Sin nombre", count: stats.noName, color: "bg-amber-50 text-amber-700" },
    { key: "no_rent", label: "Sin Rent 12M", count: stats.noRent, color: "bg-amber-50 text-amber-700" },
    { key: "serie_mismatch", label: "Serie mismatch", count: stats.serieMismatch, color: "bg-blue-50 text-blue-700" },
    { key: "not_in_vw", label: "Sin match VW", count: stats.notInVw, color: "bg-slate-100 text-slate-700" },
  ];

  const fmtPct = (v: number | null) => v != null ? `${Number(v).toFixed(1)}%` : "—";
  const fmtTac = (v: number | null) => v != null ? `${Number(v).toFixed(2)}%` : "—";

  const getBeneficio = (f: FichaRow): string => {
    if (f.beneficio_apv) return "APV";
    if (f.beneficio_57bis) return "57 LIR";
    if (f.beneficio_107lir) return "107 LIR";
    if (f.beneficio_108lir) return "108 LIR";
    if (f.notas_tributarias) return f.notas_tributarias;
    return "—";
  };

  return (
    <div className="max-w-[1400px] mx-auto px-5 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-gb-black mb-1">Revision de Fichas</h1>
            <p className="text-sm text-gb-gray">Datos extraidos de PDFs de CMF vs vista AAFM ({stats.total} fichas)</p>
          </div>
          <button
            onClick={() => { setShowUpload(true); setUploadResult(null); }}
            className="flex items-center gap-1.5 px-4 py-2 bg-gb-black text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors"
          >
            <Upload className="w-4 h-4" />
            Subir PDF Manual
          </button>
        </div>

        {/* Upload Modal */}
        {showUpload && (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gb-border">
                <h2 className="text-base font-semibold text-gb-black">Subir Ficha PDF</h2>
                <button onClick={() => setShowUpload(false)} className="p-1.5 rounded-md hover:bg-gray-100 text-gb-gray">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="px-5 py-4 space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gb-gray mb-1">RUN del Fondo</label>
                  <input
                    type="number"
                    value={uploadRun}
                    onChange={e => setUploadRun(e.target.value)}
                    placeholder="Ej: 8987"
                    className="w-full px-3 py-2 text-sm border border-gb-border rounded-lg focus:ring-2 focus:ring-gb-accent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gb-gray mb-1">Serie</label>
                  <input
                    type="text"
                    value={uploadSerie}
                    onChange={e => setUploadSerie(e.target.value.toUpperCase())}
                    placeholder="Ej: B, APV, INSTITUCIONAL"
                    className="w-full px-3 py-2 text-sm border border-gb-border rounded-lg focus:ring-2 focus:ring-gb-accent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gb-gray mb-1">Archivo PDF</label>
                  <input
                    type="file"
                    accept=".pdf"
                    onChange={e => setUploadFile(e.target.files?.[0] || null)}
                    className="w-full text-sm text-gb-gray file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-gb-light file:text-gb-black hover:file:bg-gb-border"
                  />
                </div>
                {uploadResult && (
                  <div className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg ${
                    uploadResult.success ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
                  }`}>
                    {uploadResult.success ? <CheckCircle className="w-3.5 h-3.5 shrink-0" /> : <AlertTriangle className="w-3.5 h-3.5 shrink-0" />}
                    {uploadResult.message}
                  </div>
                )}
              </div>
              <div className="px-5 py-3 border-t border-gb-border flex justify-end gap-2">
                <button onClick={() => setShowUpload(false)} className="px-4 py-2 text-sm text-gb-gray hover:text-gb-black transition-colors">
                  Cerrar
                </button>
                <button
                  onClick={handleUpload}
                  disabled={!uploadRun || !uploadSerie || !uploadFile || uploading}
                  className="px-4 py-2 bg-gb-black text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50 transition-colors"
                >
                  {uploading ? <Loader className="w-4 h-4 animate-spin" /> : "Subir y Procesar"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Objetivo Modal */}
        {objetivoModal && (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gb-border">
                <h2 className="text-sm font-semibold text-gb-black truncate pr-4">{objetivoModal.nombre}</h2>
                <button onClick={() => setObjetivoModal(null)} className="p-1.5 rounded-md hover:bg-gray-100 text-gb-gray shrink-0">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="px-5 py-4">
                <h3 className="text-xs font-medium text-gb-gray mb-2">Objetivo del Fondo</h3>
                <p className="text-sm text-gb-black leading-relaxed">{objetivoModal.objetivo}</p>
              </div>
              <div className="px-5 py-3 border-t border-gb-border flex justify-end">
                <button onClick={() => setObjetivoModal(null)} className="px-4 py-2 text-sm text-gb-gray hover:text-gb-black transition-colors">
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader className="w-8 h-8 text-gb-gray animate-spin" />
          </div>
        ) : (
          <>
            {/* Filters */}
            <div className="flex flex-wrap gap-2 mb-4">
              <Filter className="w-4 h-4 text-gb-gray mt-1.5" />
              {FILTERS.map(f => (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                    filter === f.key
                      ? f.color + " ring-2 ring-offset-1 ring-gb-accent"
                      : "bg-gb-light text-gb-gray hover:bg-gb-border"
                  }`}
                >
                  {f.label} ({f.count})
                </button>
              ))}
            </div>

            {/* Search */}
            <div className="relative mb-4">
              <Search className="w-4 h-4 text-gb-gray absolute left-3 top-2.5" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar por RUN, nombre, AGF, serie..."
                className="w-full pl-9 pr-4 py-2 text-sm border border-gb-border rounded-lg focus:ring-2 focus:ring-gb-accent focus:border-transparent"
              />
            </div>

            <p className="text-xs text-gb-gray mb-2">Mostrando {filtered.length} de {stats.total}</p>

            {/* Table */}
            <div className="bg-white rounded-lg border border-gb-border overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gb-border bg-gb-light text-gb-gray">
                    <th className="text-center py-2 px-1 font-medium w-8 sticky left-0 bg-gb-light z-10"></th>
                    <th className="text-left py-2 px-2 font-medium">RUN</th>
                    <th className="text-left py-2 px-2 font-medium">Serie</th>
                    <th className="text-left py-2 px-2 font-medium">Nombre</th>
                    <th className="text-left py-2 px-2 font-medium">AGF</th>
                    <th className="text-right py-2 px-2 font-medium">TAC</th>
                    <th className="text-right py-2 px-2 font-medium">TAC VW</th>
                    <th className="text-right py-2 px-2 font-medium">R12M</th>
                    <th className="text-left py-2 px-2 font-medium">Horizonte</th>
                    <th className="text-left py-2 px-2 font-medium">Beneficio</th>
                    <th className="text-center py-2 px-2 font-medium">Obj</th>
                    <th className="text-center py-2 px-2 font-medium">OK</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice(0, 200).map((f, i) => {
                    const serieDiff = f.serie_detectada && f.fm_serie !== f.serie_detectada;
                    const noTac = f.tac_serie == null && f.tac_vw == null;
                    const rentSuspicious = (f.rent_1m != null && Math.abs(Number(f.rent_1m)) > 30) ||
                      (f.rent_12m != null && f.rent_12m_vw != null && Math.abs(Number(f.rent_12m) - Number(f.rent_12m_vw)) > 20);
                    const hasIssue = noTac || rentSuspicious || !f.nombre_fondo_pdf;

                    return (
                      <tr key={i} className={`border-b border-gb-border hover:bg-gb-light ${
                        rentSuspicious ? "bg-red-50" : hasIssue ? "bg-amber-50/50" : ""
                      }`}>
                        <td className={`py-1.5 px-1 text-center sticky left-0 z-10 ${
                          rentSuspicious ? "bg-red-50" : hasIssue ? "bg-amber-50" : "bg-white"
                        }`}>
                          <button
                            onClick={() => handleDelete(f)}
                            disabled={deleting === `${f.fo_run}-${f.fm_serie}`}
                            className="p-0.5 rounded hover:bg-red-50 text-gb-gray hover:text-red-500 transition-colors disabled:opacity-40"
                            title="Eliminar ficha"
                          >
                            {deleting === `${f.fo_run}-${f.fm_serie}` ? (
                              <Loader className="w-3.5 h-3.5 animate-spin inline" />
                            ) : (
                              <Trash2 className="w-3.5 h-3.5 inline" />
                            )}
                          </button>
                        </td>
                        <td className="py-1.5 px-2 tabular-nums font-mono">
                          {f.fo_run}
                          <span className={`ml-1 text-[9px] px-1 py-0.5 rounded ${f.tipo === "FI" ? "bg-violet-100 text-violet-600" : "bg-sky-50 text-sky-600"}`}>{f.tipo}</span>
                        </td>
                        <td className="py-1.5 px-2">
                          {f.fm_serie}
                          {serieDiff && <span className="ml-1 text-[9px] text-blue-600" title={`PDF dice: ${f.serie_detectada}`}>!</span>}
                        </td>
                        <td className="py-1.5 px-2 max-w-[220px] truncate" title={f.nombre_fondo_pdf || f.nombre_vw || ""}>
                          {f.nombre_fondo_pdf || f.nombre_vw || <span className="text-amber-500 italic">sin nombre</span>}
                        </td>
                        <td className="py-1.5 px-2 text-gb-gray">{f.agf || "—"}</td>
                        <td className="py-1.5 px-2 text-right tabular-nums">
                          <span className={f.tac_serie == null ? "text-gb-gray" :
                            Number(f.tac_serie) > 3 ? "text-red-600 font-medium" :
                            Number(f.tac_serie) > 1.5 ? "text-amber-600" : "text-emerald-600"
                          }>
                            {fmtTac(f.tac_serie)}
                          </span>
                        </td>
                        <td className="py-1.5 px-2 text-right tabular-nums text-gb-gray">{fmtTac(f.tac_vw)}</td>
                        <td className={`py-1.5 px-2 text-right tabular-nums ${
                          f.rent_12m != null && f.rent_12m_vw != null && Math.abs(Number(f.rent_12m) - Number(f.rent_12m_vw)) > 20
                            ? "text-red-600 font-bold bg-red-100" : ""
                        }`}>
                          {fmtPct(f.rent_12m)}
                        </td>
                        <td className="py-1.5 px-2 text-gb-gray">{f.horizonte_inversion || "—"}</td>
                        <td className="py-1.5 px-2">
                          {(() => {
                            const ben = getBeneficio(f);
                            if (ben === "—") return <span className="text-gb-gray">—</span>;
                            const color = ben === "APV" || ben === "APVC" ? "text-indigo-600 bg-indigo-50" :
                              ben.includes("57") ? "text-teal-600 bg-teal-50" :
                              ben.includes("107") ? "text-amber-600 bg-amber-50" :
                              ben.includes("108") ? "text-blue-600 bg-blue-50" : "text-gb-gray bg-gb-light";
                            return <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${color}`}>{ben}</span>;
                          })()}
                        </td>
                        <td className="py-1.5 px-2 text-center">
                          {f.objetivo ? (
                            <button
                              onClick={() => setObjetivoModal({ nombre: f.nombre_fondo_pdf || `${f.fo_run}/${f.fm_serie}`, objetivo: f.objetivo! })}
                              className="p-0.5 rounded hover:bg-gb-light text-gb-gray hover:text-gb-black transition-colors"
                              title="Ver objetivo"
                            >
                              <Eye className="w-3.5 h-3.5 inline" />
                            </button>
                          ) : (
                            <span className="text-gb-gray">—</span>
                          )}
                        </td>
                        <td className="py-1.5 px-2 text-center">
                          {rentSuspicious ? (
                            <AlertTriangle className="w-3.5 h-3.5 text-red-500 inline" />
                          ) : hasIssue ? (
                            <XCircle className="w-3.5 h-3.5 text-amber-400 inline" />
                          ) : (
                            <CheckCircle className="w-3.5 h-3.5 text-emerald-500 inline" />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {filtered.length > 200 && (
                <div className="p-3 text-center text-xs text-gb-gray bg-gb-light border-t border-gb-border">
                  Mostrando primeras 200 de {filtered.length}. Usa el buscador para filtrar.
                </div>
              )}
            </div>
          </>
        )}
    </div>
  );
}
