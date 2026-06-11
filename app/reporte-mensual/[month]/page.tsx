"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, Loader, Printer } from "lucide-react";

export default function ReporteMensualPage() {
  const { month } = useParams<{ month: string }>();
  const [html, setHtml] = useState<string | null>(null);
  const [title, setTitle] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!month) return;
    setLoading(true);
    fetch(`/api/monthly-reports?month=${month}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.report) {
          setHtml(d.report.html_content);
          setTitle(d.report.title || `Reporte ${month}`);
        } else {
          setError("No hay reporte para este mes.");
        }
      })
      .catch(() => setError("Error al cargar el reporte."))
      .finally(() => setLoading(false));
  }, [month]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <Loader className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }

  if (error || !html) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-slate-500 mb-4">{error || "Reporte no encontrado."}</p>
          <button
            onClick={() => window.close()}
            className="text-blue-600 hover:underline text-sm"
          >
            Cerrar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Sticky top bar */}
      <div className="sticky top-0 z-10 bg-white border-b border-slate-200 shadow-sm print:hidden">
        <div className="max-w-5xl mx-auto px-6 py-3 flex items-center gap-4">
          <button
            onClick={() => window.history.back()}
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Volver
          </button>
          <div className="h-4 w-px bg-slate-200" />
          <span className="text-sm font-semibold text-slate-800 truncate">{title}</span>
          <div className="ml-auto">
            <button
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors"
            >
              <Printer className="w-3.5 h-3.5" />
              Imprimir / PDF
            </button>
          </div>
        </div>
      </div>

      {/* Report content */}
      <div className="max-w-5xl mx-auto px-6 py-8">
        <div
          className="report-content bg-white rounded-xl shadow-sm border border-slate-200 p-8 md:p-12"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>

      <style jsx global>{`
        /* Report content typography */
        .report-content {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          color: #1e293b;
          line-height: 1.7;
          font-size: 15px;
        }
        .report-content h1 {
          font-size: 1.75rem;
          font-weight: 700;
          color: #0f172a;
          margin: 0 0 1rem;
          line-height: 1.3;
        }
        .report-content h2 {
          font-size: 1.35rem;
          font-weight: 600;
          color: #0f172a;
          margin: 2rem 0 0.75rem;
          padding-bottom: 0.5rem;
          border-bottom: 1px solid #e2e8f0;
        }
        .report-content h3 {
          font-size: 1.1rem;
          font-weight: 600;
          color: #1e293b;
          margin: 1.5rem 0 0.5rem;
        }
        .report-content p {
          margin: 0 0 1rem;
        }
        .report-content ul, .report-content ol {
          margin: 0 0 1rem;
          padding-left: 1.5rem;
        }
        .report-content li {
          margin-bottom: 0.4rem;
        }
        .report-content strong, .report-content b {
          font-weight: 600;
          color: #0f172a;
        }
        .report-content a {
          color: #2563eb;
          text-decoration: underline;
          text-underline-offset: 2px;
        }
        .report-content img {
          max-width: 100%;
          height: auto;
          border-radius: 0.5rem;
          margin: 1rem 0;
        }
        .report-content table {
          width: 100%;
          border-collapse: collapse;
          margin: 1.5rem 0;
          font-size: 0.875rem;
        }
        .report-content table th {
          background: #f8fafc;
          font-weight: 600;
          text-align: left;
          padding: 0.625rem 0.75rem;
          border-bottom: 2px solid #e2e8f0;
          color: #475569;
          font-size: 0.75rem;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .report-content table td {
          padding: 0.5rem 0.75rem;
          border-bottom: 1px solid #f1f5f9;
          color: #334155;
        }
        .report-content table tr:hover td {
          background: #f8fafc;
        }
        .report-content blockquote {
          border-left: 3px solid #3b82f6;
          background: #eff6ff;
          padding: 0.75rem 1rem;
          margin: 1rem 0;
          border-radius: 0 0.375rem 0.375rem 0;
          color: #1e40af;
          font-style: italic;
        }
        .report-content hr {
          border: none;
          border-top: 1px solid #e2e8f0;
          margin: 2rem 0;
        }
        .report-content pre {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 0.5rem;
          padding: 1rem;
          overflow-x: auto;
          font-size: 0.85rem;
        }
        .report-content code {
          background: #f1f5f9;
          padding: 0.125rem 0.375rem;
          border-radius: 0.25rem;
          font-size: 0.875em;
        }
        /* Override any inline styles from uploaded HTML that might break layout */
        .report-content > div,
        .report-content > article,
        .report-content > section {
          max-width: 100% !important;
        }

        @media print {
          body { background: white !important; }
          .report-content {
            box-shadow: none !important;
            border: none !important;
            border-radius: 0 !important;
            padding: 0 !important;
          }
        }
      `}</style>
    </div>
  );
}
