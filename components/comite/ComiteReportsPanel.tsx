// components/comite/ComiteReportsPanel.tsx

"use client";

import React, { useState, useRef, useEffect } from "react";
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
} from "lucide-react";

interface ReportStatus {
  id: string;
  type: "macro" | "rv" | "rf" | "asset_allocation";
  label: string;
  icon: React.ElementType;
  uploaded: boolean;
  filename?: string;
  uploadedAt?: string;
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
          setReports((prev) =>
            prev.map((r) => {
              const serverReport = data.reports.find((sr: any) => sr.type === r.type);
              if (serverReport) {
                return {
                  ...r,
                  uploaded: true,
                  filename: serverReport.filename,
                  uploadedAt: serverReport.uploaded_at,
                };
              }
              return r;
            })
          );
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
    fileInputRef.current?.click();
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
        setReports((prev) =>
          prev.map((r) =>
            r.type === selectedType
              ? {
                  ...r,
                  uploaded: true,
                  filename: file.name,
                  uploadedAt: new Date().toISOString(),
                }
              : r
          )
        );
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

  const uploadedCount = reports.filter((r) => r.uploaded).length;
  const allUploaded = uploadedCount === 4;

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
                <button
                  onClick={() => handleUploadClick(report.type)}
                  className="text-xs text-gb-gray hover:text-gb-accent transition-colors"
                >
                  Actualizar
                </button>
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

      {/* Progress */}
      <div className="mt-4 pt-3 border-t border-gb-border">
        <div className="flex items-center justify-between text-xs text-gb-gray mb-1.5">
          <span>Progreso</span>
          <span className="font-medium">{uploadedCount}/4 reportes</span>
        </div>
        <div className="w-full h-1.5 bg-gb-light rounded-full overflow-hidden">
          <div
            className="h-full bg-gb-accent rounded-full transition-all duration-300"
            style={{ width: `${(uploadedCount / 4) * 100}%` }}
          />
        </div>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".html,text/html"
        onChange={handleFileChange}
        className="hidden"
      />
    </div>
  );
}
