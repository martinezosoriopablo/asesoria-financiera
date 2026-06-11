// components/comite/ComiteReportsPanel.tsx

"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  FileText,
  Upload,
  CheckCircle,
  AlertCircle,
  Loader,
  TrendingUp,
  DollarSign,
  Globe,
  PieChart,
  X,
  Calendar,
  Eye,
  RefreshCw,
  Trash2,
  Plus,
} from "lucide-react";

interface ReportStatus {
  id: string;
  type: string;
  label: string;
  icon: React.ElementType;
  uploaded: boolean;
  filename?: string;
  uploadedAt?: string;
  isCustom?: boolean;
}

const REPORT_TYPES: Omit<ReportStatus, "uploaded" | "filename" | "uploadedAt">[] = [
  { id: "macro", type: "macro", label: "Macro", icon: Globe },
  { id: "rv", type: "rv", label: "Renta Variable", icon: TrendingUp },
  { id: "rf", type: "rf", label: "Renta Fija", icon: DollarSign },
  { id: "asset_allocation", type: "asset_allocation", label: "Asset Allocation", icon: PieChart },
];

export default function ComiteReportsPanel() {
  const [reports, setReports] = useState<ReportStatus[]>(
    REPORT_TYPES.map((r) => ({ ...r, uploaded: false }))
  );
  const [uploading, setUploading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [customLabel, setCustomLabel] = useState("");

  // Model portfolios state
  const [modelUploading, setModelUploading] = useState(false);
  const [modelError, setModelError] = useState("");
  const [modelSuccess, setModelSuccess] = useState("");
  const modelFileRef = useRef<HTMLInputElement>(null);
  const [activeModels, setActiveModels] = useState<Array<{
    id: string;
    perfil: string;
    posiciones: Array<{
      categoria: string;
      description?: string;
      modelo_pct: number;
      bench_pct?: number;
      delta_pp?: number;
      vista?: string;
      etf_us?: string | null;
    }>;
    sleeves: Array<{
      region: string;
      sector: string;
      peso_pct: number;
      vista?: string;
    }>;
    nota_comite: string | null;
    report_date: string;
  }>>([]);
  const [modelReportDate, setModelReportDate] = useState<string | null>(null);
  const [expandedPerfil, setExpandedPerfil] = useState<string | null>(null);

  // Cargar estado actual de reportes
  useEffect(() => {
    fetchReportStatus();
  }, []);

  const fetchReportStatus = async () => {
    try {
      const res = await fetch("/api/comite/status");
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.reports) {
          const fixedTypes = REPORT_TYPES.map((r) => r.type);
          // Update fixed reports
          const updatedFixed = REPORT_TYPES.map((r) => {
            const serverReport = data.reports.find((sr: { type: string; filename?: string; uploaded_at?: string }) => sr.type === r.type);
            if (serverReport) {
              return { ...r, uploaded: true, filename: serverReport.filename, uploadedAt: serverReport.uploaded_at };
            }
            return { ...r, uploaded: false };
          });
          // Add custom reports from server
          const customReports: ReportStatus[] = data.reports
            .filter((sr: { type: string }) => !fixedTypes.includes(sr.type))
            .map((sr: { type: string; filename?: string; uploaded_at?: string }) => ({
              id: sr.type,
              type: sr.type,
              label: sr.type.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()),
              icon: FileText,
              uploaded: true,
              filename: sr.filename,
              uploadedAt: sr.uploaded_at,
              isCustom: true,
            }));
          setReports([...updatedFixed, ...customReports]);
          if (data.lastUpdate) {
            setLastUpdate(data.lastUpdate);
          }
        }
      }
    } catch {
      // Silencioso - mostrará como no subidos
    }
  };

  const handleUploadClick = (type: string) => {
    setSelectedType(type);
    setError(null);
    // Usar setTimeout para asegurar que el state se actualice antes del click
    setTimeout(() => {
      fileInputRef.current?.click();
    }, 0);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedType) return;

    // Validar que sea HTML
    if (!file.name.endsWith(".html") && !file.type.includes("html")) {
      setError("Por favor sube un archivo HTML");
      return;
    }

    setUploading(selectedType);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("type", selectedType);

      const res = await fetch("/api/comite/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (data.success) {
        const existsInList = reports.some((r) => r.type === selectedType);
        if (existsInList) {
          setReports((prev) =>
            prev.map((r) =>
              r.type === selectedType
                ? { ...r, uploaded: true, filename: file.name, uploadedAt: new Date().toISOString() }
                : r
            )
          );
        } else {
          // Custom report — add to list
          setReports((prev) => [
            ...prev,
            {
              id: selectedType,
              type: selectedType,
              label: selectedType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
              icon: FileText,
              uploaded: true,
              filename: file.name,
              uploadedAt: new Date().toISOString(),
              isCustom: true,
            },
          ]);
        }
        setLastUpdate(new Date().toISOString());
      } else {
        setError(data.error || "Error al subir el archivo");
      }
    } catch {
      setError("Error de conexión al subir el archivo");
    } finally {
      setUploading(null);
      setSelectedType(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleDelete = async (type: string) => {
    if (!confirm("¿Eliminar este reporte?")) return;
    setDeleting(type);
    setError(null);
    try {
      const res = await fetch(`/api/comite/${encodeURIComponent(type)}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        setReports((prev) =>
          prev
            .map((r) => (r.type === type && !r.isCustom ? { ...r, uploaded: false, filename: undefined, uploadedAt: undefined } : r))
            .filter((r) => !(r.type === type && r.isCustom))
        );
      } else {
        setError(data.error || "Error al eliminar");
      }
    } catch {
      setError("Error de conexión al eliminar");
    } finally {
      setDeleting(null);
    }
  };

  const pendingCustomSlug = useRef<string | null>(null);

  const handleAddCustomReport = () => {
    if (!customLabel.trim()) return;
    const slug = customLabel.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
    if (!slug) return;
    pendingCustomSlug.current = slug;
    setSelectedType(slug);
    setShowAddForm(false);
    setCustomLabel("");
  };

  // Open file dialog after selectedType is set from custom report
  useEffect(() => {
    if (pendingCustomSlug.current && selectedType === pendingCustomSlug.current) {
      pendingCustomSlug.current = null;
      setTimeout(() => fileInputRef.current?.click(), 50);
    }
  }, [selectedType]);

  const handleViewReport = (type: string) => {
    window.open(`/reporte-comite/${encodeURIComponent(type)}`, "_blank");
  };

  const fetchActiveModels = useCallback(async () => {
    try {
      const res = await fetch("/api/comite/model-portfolios");
      const data = await res.json();
      if (data.success) {
        setActiveModels(data.models || []);
        setModelReportDate(data.report_date);
      }
    } catch { /* silent */ }
  }, []);

  useEffect(() => { fetchActiveModels(); }, [fetchActiveModels]);

  const handleModelFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setModelError("");
    setModelSuccess("");
    setModelUploading(true);

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);

      const res = await fetch("/api/comite/upload-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed),
      });
      const data = await res.json();

      if (!data.success) {
        setModelError(data.error || "Error al subir");
      } else {
        const warnings = data.warnings ? ` (${data.warnings.join(", ")})` : "";
        setModelSuccess(
          `${data.profiles_count} perfiles cargados para ${data.report_date}${warnings}`
        );
        fetchActiveModels();
      }
    } catch (err) {
      setModelError(
        err instanceof SyntaxError ? "JSON inválido" : "Error al procesar el archivo"
      );
    } finally {
      setModelUploading(false);
      if (modelFileRef.current) modelFileRef.current.value = "";
    }
  };

  const uploadedCount = reports.filter((r) => r.uploaded).length;
  const totalCount = reports.length;
  const allUploaded = uploadedCount === totalCount && totalCount > 0;

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("es-CL", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  return (
    <div className="bg-white rounded-lg border border-gb-border p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-gb-black flex items-center gap-2">
          <FileText className="w-4 h-4 text-gb-accent" />
          Reportes del Comité
        </h2>
        {allUploaded && (
          <span className="flex items-center gap-1 text-xs font-medium text-green-600 bg-green-50 px-2 py-1 rounded-full">
            <CheckCircle className="w-3 h-3" />
            Completo
          </span>
        )}
      </div>

      {lastUpdate && (
        <div className="flex items-center gap-1.5 text-xs text-gb-gray mb-3">
          <Calendar className="w-3 h-3" />
          Última actualización: {formatDate(lastUpdate)}
        </div>
      )}

      {/* Lista de reportes */}
      <div className="space-y-2">
        {reports.map((report) => {
          const Icon = report.icon;
          const isUploading = uploading === report.type;

          return (
            <div
              key={report.id}
              className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                report.uploaded
                  ? "border-green-200 bg-green-50/50"
                  : "border-gb-border bg-gb-light/30 hover:border-gb-accent"
              }`}
            >
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                  report.uploaded ? "bg-green-100 text-green-600" : "bg-gb-light text-gb-gray"
                }`}
              >
                <Icon className="w-4 h-4" />
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gb-black">{report.label}</p>
                {report.uploaded && report.uploadedAt && (
                  <p className="text-xs text-gb-gray truncate">
                    {report.filename || `${report.type}_report.html`}
                  </p>
                )}
              </div>

              {isUploading ? (
                <Loader className="w-4 h-4 text-gb-accent animate-spin" />
              ) : report.uploaded ? (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleViewReport(report.type)}
                    className="flex items-center gap-1 text-xs font-medium text-gb-accent hover:text-gb-dark transition-colors"
                  >
                    <Eye className="w-3 h-3" />
                    Ver
                  </button>
                  <button
                    onClick={() => handleUploadClick(report.type)}
                    className="flex items-center gap-1 text-xs text-gb-gray hover:text-gb-accent transition-colors"
                    title="Reemplazar"
                  >
                    <RefreshCw className="w-3 h-3" />
                  </button>
                  {deleting === report.type ? (
                    <Loader className="w-3 h-3 text-red-400 animate-spin" />
                  ) : (
                    <button
                      onClick={() => handleDelete(report.type)}
                      className="flex items-center gap-1 text-xs text-gb-gray hover:text-red-500 transition-colors"
                      title="Eliminar"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ) : (
                <button
                  onClick={() => handleUploadClick(report.type)}
                  className="flex items-center gap-1 text-xs font-medium text-gb-accent hover:text-gb-dark transition-colors"
                >
                  <Upload className="w-3 h-3" />
                  Subir
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Error */}
      {error && (
        <div className="mt-3 flex items-center gap-2 text-xs text-red-600 bg-red-50 p-2 rounded-md">
          <AlertCircle className="w-3 h-3 shrink-0" />
          {error}
          <button onClick={() => setError(null)} className="ml-auto">
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Add custom report */}
      <div className="mt-3">
        {showAddForm ? (
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={customLabel}
              onChange={(e) => setCustomLabel(e.target.value)}
              placeholder="Nombre del informe"
              className="flex-1 px-3 py-1.5 text-sm border border-gb-border rounded-lg focus:ring-1 focus:ring-gb-accent focus:border-transparent"
              onKeyDown={(e) => e.key === "Enter" && handleAddCustomReport()}
              autoFocus
            />
            <button
              onClick={handleAddCustomReport}
              disabled={!customLabel.trim()}
              className="px-3 py-1.5 text-xs font-medium bg-gb-accent text-white rounded-lg hover:bg-gb-dark disabled:opacity-50 transition-colors"
            >
              Subir
            </button>
            <button
              onClick={() => { setShowAddForm(false); setCustomLabel(""); }}
              className="p-1.5 text-gb-gray hover:text-gb-black transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowAddForm(true)}
            className="flex items-center gap-1.5 text-xs font-medium text-gb-accent hover:text-gb-dark transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Agregar otro informe
          </button>
        )}
      </div>

      {/* Progress */}
      <div className="mt-4 pt-3 border-t border-gb-border">
        <div className="flex items-center justify-between text-xs text-gb-gray mb-1.5">
          <span>Progreso</span>
          <span className="font-medium">{uploadedCount}/{totalCount} reportes</span>
        </div>
        <div className="w-full h-1.5 bg-gb-light rounded-full overflow-hidden">
          <div
            className="h-full bg-gb-accent rounded-full transition-all duration-300"
            style={{ width: `${totalCount > 0 ? (uploadedCount / totalCount) * 100 : 0}%` }}
          />
        </div>
      </div>

      {/* Hidden file input - using sr-only for better browser compatibility */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".html,.htm,text/html"
        onChange={handleFileChange}
        className="sr-only"
        aria-hidden="true"
      />

      {/* Model Portfolios Section */}
      <div className="mt-8 border-t border-gb-border pt-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-gb-black">Carteras Modelo</h3>
            {modelReportDate && (
              <span className="text-xs text-gb-gray">
                Sesion: {modelReportDate}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {modelUploading && <Loader className="w-4 h-4 text-gb-accent animate-spin" />}
            <button
              onClick={() => modelFileRef.current?.click()}
              disabled={modelUploading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-gb-primary text-white rounded hover:bg-gb-primary/90 disabled:opacity-50"
            >
              <Upload className="w-3.5 h-3.5" />
              Subir JSON
            </button>
            <input
              ref={modelFileRef}
              type="file"
              accept=".json,application/json"
              onChange={handleModelFileUpload}
              className="sr-only"
            />
          </div>
        </div>

        {modelError && (
          <div className="mb-3 flex items-center gap-2 text-xs text-red-600 bg-red-50 p-2 rounded-md">
            <AlertCircle className="w-3 h-3 shrink-0" />
            {modelError}
            <button onClick={() => setModelError("")} className="ml-auto">
              <X className="w-3 h-3" />
            </button>
          </div>
        )}

        {modelSuccess && (
          <div className="mb-3 flex items-center gap-2 text-xs text-green-700 bg-green-50 p-2 rounded-md">
            <CheckCircle className="w-3 h-3 shrink-0" />
            {modelSuccess}
            <button onClick={() => setModelSuccess("")} className="ml-auto">
              <X className="w-3 h-3" />
            </button>
          </div>
        )}

        {activeModels.length > 0 ? (
          <div className="space-y-2">
            {activeModels.map((m) => {
              const isExpanded = expandedPerfil === m.id;
              const rvTotal = m.posiciones
                .filter((p) => p.categoria?.startsWith("usa") || p.categoria?.startsWith("desarrollados") || p.categoria?.startsWith("emergentes") || p.categoria === "chile" || p.categoria === "rv_small_cap_us")
                .reduce((s, p) => s + (p.modelo_pct || 0), 0);
              const rfTotal = m.posiciones
                .filter((p) => ["ust_belly", "ust_short", "ig_corp", "tips", "high_yield", "em_sovereign", "rf_chile"].includes(p.categoria))
                .reduce((s, p) => s + (p.modelo_pct || 0), 0);
              const altTotal = m.posiciones
                .filter((p) => ["gold", "reits"].includes(p.categoria))
                .reduce((s, p) => s + (p.modelo_pct || 0), 0);
              const cashTotal = m.posiciones
                .filter((p) => p.categoria === "tbills")
                .reduce((s, p) => s + (p.modelo_pct || 0), 0);

              return (
                <div key={m.id} className="border border-gb-border rounded-lg overflow-hidden">
                  <button
                    onClick={() => setExpandedPerfil(isExpanded ? null : m.id)}
                    className="w-full flex items-center justify-between p-3 hover:bg-gb-light/30 transition-colors"
                  >
                    <span className="text-sm font-medium text-gb-black capitalize">
                      {m.perfil.replace(/_/g, " ")}
                    </span>
                    <div className="flex items-center gap-3 text-xs text-gb-gray">
                      <span className="text-blue-600">RV {rvTotal.toFixed(1)}%</span>
                      <span className="text-green-600">RF {rfTotal.toFixed(1)}%</span>
                      <span className="text-amber-600">Alt {altTotal.toFixed(1)}%</span>
                      <span className="text-gray-500">Cash {cashTotal.toFixed(1)}%</span>
                      <span className="text-gb-gray">{isExpanded ? "▲" : "▼"}</span>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-gb-border">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-gb-light/50">
                            <th className="text-left py-1.5 px-3 font-medium text-gb-gray">Categoria</th>
                            <th className="text-right py-1.5 px-3 font-medium text-gb-gray">Bench</th>
                            <th className="text-right py-1.5 px-3 font-medium text-gb-gray">Modelo</th>
                            <th className="text-right py-1.5 px-3 font-medium text-gb-gray">Delta</th>
                            <th className="text-center py-1.5 px-3 font-medium text-gb-gray">Vista</th>
                            <th className="text-left py-1.5 px-3 font-medium text-gb-gray">ETF</th>
                          </tr>
                        </thead>
                        <tbody>
                          {m.posiciones.map((p, i) => (
                            <tr key={i} className="border-t border-gb-border/30 hover:bg-gray-50">
                              <td className="py-1.5 px-3 text-gb-black">
                                {p.description || p.categoria}
                              </td>
                              <td className="py-1.5 px-3 text-right text-gb-gray">
                                {(p.bench_pct ?? 0).toFixed(1)}%
                              </td>
                              <td className="py-1.5 px-3 text-right font-medium text-gb-black">
                                {p.modelo_pct.toFixed(1)}%
                              </td>
                              <td className={`py-1.5 px-3 text-right font-medium ${
                                (p.delta_pp ?? 0) > 0.5 ? "text-green-600" :
                                (p.delta_pp ?? 0) < -0.5 ? "text-red-600" : "text-gb-gray"
                              }`}>
                                {(p.delta_pp ?? 0) > 0 ? "+" : ""}{(p.delta_pp ?? 0).toFixed(1)}
                              </td>
                              <td className="py-1.5 px-3 text-center">
                                {p.vista && p.vista !== "N" && (
                                  <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                    p.vista === "OW" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                                  }`}>
                                    {p.vista}
                                  </span>
                                )}
                              </td>
                              <td className="py-1.5 px-3 text-gb-gray font-mono">
                                {p.etf_us || "—"}
                              </td>
                            </tr>
                          ))}
                          {m.sleeves && m.sleeves.length > 0 && (
                            <>
                              <tr>
                                <td colSpan={6} className="py-1.5 px-3 text-[10px] font-semibold text-gb-gray uppercase bg-gb-light/30 border-t border-gb-border">
                                  Sleeves Sectoriales
                                </td>
                              </tr>
                              {m.sleeves.map((s, i) => (
                                <tr key={`s-${i}`} className="border-t border-gb-border/20 hover:bg-gray-50">
                                  <td className="py-1.5 px-3 text-gb-black pl-6">
                                    {s.sector} <span className="text-gb-gray">({s.region.toUpperCase()})</span>
                                  </td>
                                  <td className="py-1.5 px-3 text-right text-gb-gray">—</td>
                                  <td className="py-1.5 px-3 text-right font-medium text-gb-black">
                                    {s.peso_pct.toFixed(2)}%
                                  </td>
                                  <td className="py-1.5 px-3 text-right text-gb-gray">—</td>
                                  <td className="py-1.5 px-3 text-center">
                                    {s.vista && s.vista !== "N" && (
                                      <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                        s.vista === "OW" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                                      }`}>
                                        {s.vista}
                                      </span>
                                    )}
                                  </td>
                                  <td className="py-1.5 px-3 text-gb-gray">—</td>
                                </tr>
                              ))}
                            </>
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-gb-gray">No hay carteras modelo cargadas.</p>
        )}
      </div>

    </div>
  );
}
