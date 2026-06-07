"use client";

import React, { useState, useEffect, useRef } from "react";
import { FileText, Upload, ExternalLink, Check, Loader } from "lucide-react";

interface Props {
  /** Current month in view, e.g. "2026-05" */
  currentMonth?: string;
}

export default function MonthlyReportSection({ currentMonth }: Props) {
  const [reports, setReports] = useState<Array<{ month: string; title: string }>>([]);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth || "");
  const [uploading, setUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Fetch available reports list
  useEffect(() => {
    fetch("/api/monthly-reports")
      .then((r) => r.json())
      .then((d) => {
        if (d.reports) setReports(d.reports);
      })
      .catch((e) => console.error("[MonthlyReport] List error:", e));
  }, [uploadSuccess]);

  // Update selected month when currentMonth changes
  useEffect(() => {
    if (currentMonth) setSelectedMonth(currentMonth);
  }, [currentMonth]);

  const hasReport = reports.some((r) => r.month === selectedMonth);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadSuccess(false);

    try {
      const htmlContent = await file.text();

      // Auto-detect month from filename or HTML content
      let month = selectedMonth;
      const filenameMatch = file.name.match(/(\d{4}-\d{2})/);
      if (filenameMatch) month = filenameMatch[1];

      if (!month) {
        // Try to detect from HTML title
        const titleMatch = htmlContent.match(/(?:ENERO|FEBRERO|MARZO|ABRIL|MAYO|JUNIO|JULIO|AGOSTO|SEPTIEMBRE|OCTUBRE|NOVIEMBRE|DICIEMBRE)\s+(\d{4})/i);
        if (titleMatch) {
          const monthNames: Record<string, string> = {
            enero: "01", febrero: "02", marzo: "03", abril: "04",
            mayo: "05", junio: "06", julio: "07", agosto: "08",
            septiembre: "09", octubre: "10", noviembre: "11", diciembre: "12",
          };
          const mName = titleMatch[0].split(/\s+/)[0].toLowerCase();
          const mNum = monthNames[mName];
          if (mNum) month = `${titleMatch[1]}-${mNum}`;
        }
      }

      if (!month) {
        alert("No se pudo detectar el mes. Nombre el archivo como monthly_report_YYYY-MM.html");
        setUploading(false);
        return;
      }

      const res = await fetch("/api/monthly-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month, html_content: htmlContent }),
      });

      if (res.ok) {
        setUploadSuccess(true);
        setSelectedMonth(month);
        setTimeout(() => setUploadSuccess(false), 3000);
      } else {
        const err = await res.json();
        console.error("[MonthlyReport] Upload error:", err);
        alert(`Error: ${err.error || "No se pudo subir el reporte"}`);
      }
    } catch {
      alert("Error al leer el archivo");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="bg-white rounded-lg border border-gb-border shadow-sm mb-6">
      <div className="px-6 py-4 border-b border-gb-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-amber-600" />
          <h2 className="text-base font-semibold text-gb-black">
            Reporte Mensual de Mercados
          </h2>
        </div>

        <div className="flex items-center gap-3">
          {/* Month selector */}
          {reports.length > 0 && (
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="text-sm border border-gb-border rounded-md px-2 py-1 bg-white"
            >
              {!reports.some((r) => r.month === selectedMonth) && selectedMonth && (
                <option value={selectedMonth}>{selectedMonth} (sin reporte)</option>
              )}
              {reports.map((r) => (
                <option key={r.month} value={r.month}>
                  {r.month} — {r.title?.replace(/Greybark Research\s*[–—-]\s*/i, "")}
                </option>
              ))}
            </select>
          )}

          {/* Upload button */}
          <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gb-border rounded-md hover:bg-slate-50 transition-colors">
            {uploading ? (
              <Loader className="w-3.5 h-3.5 animate-spin" />
            ) : uploadSuccess ? (
              <Check className="w-3.5 h-3.5 text-green-600" />
            ) : (
              <Upload className="w-3.5 h-3.5" />
            )}
            {uploading ? "Subiendo..." : uploadSuccess ? "Subido" : "Subir HTML"}
            <input
              ref={fileRef}
              type="file"
              accept=".html,.htm"
              onChange={handleUpload}
              className="hidden"
            />
          </label>

          {/* View report link */}
          {hasReport && (
            <a
              href={`/reporte-mensual/${selectedMonth}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-gb-primary text-white rounded-md hover:bg-gb-primary/90 transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Ver Reporte
            </a>
          )}
        </div>
      </div>

      {/* Status */}
      <div className="px-6 py-3">
        {hasReport ? (
          <p className="text-sm text-gb-gray">
            Reporte de <strong className="text-gb-black">{selectedMonth}</strong> disponible.
            Haga clic en &quot;Ver Reporte&quot; para abrirlo en nueva pestaña.
          </p>
        ) : (
          <p className="text-sm text-gb-gray">
            No hay reporte para <strong className="text-gb-black">{selectedMonth || "este mes"}</strong>.
            Suba un archivo HTML con el reporte mensual.
          </p>
        )}
      </div>
    </div>
  );
}
