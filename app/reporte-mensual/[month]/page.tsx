"use client";

import { useParams } from "next/navigation";
import { useEffect, useState, useRef, useCallback } from "react";
import { ArrowLeft, Loader, Printer } from "lucide-react";

export default function ReporteMensualPage() {
  const { month } = useParams<{ month: string }>();
  const [html, setHtml] = useState<string | null>(null);
  const [title, setTitle] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

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

  // Auto-resize iframe to fit content
  const resizeIframe = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe?.contentDocument?.body) return;
    iframe.style.height = iframe.contentDocument.body.scrollHeight + 40 + "px";
  }, []);

  const handleIframeLoad = useCallback(() => {
    resizeIframe();
    // Observe for dynamic content changes
    const iframe = iframeRef.current;
    if (!iframe?.contentDocument?.body) return;
    const observer = new ResizeObserver(() => resizeIframe());
    observer.observe(iframe.contentDocument.body);
    return () => observer.disconnect();
  }, [resizeIframe]);

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
            onClick={() => window.history.back()}
            className="text-blue-600 hover:underline text-sm"
          >
            Volver
          </button>
        </div>
      </div>
    );
  }

  const handlePrint = () => {
    const iframe = iframeRef.current;
    if (iframe?.contentWindow) {
      iframe.contentWindow.print();
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Sticky top bar */}
      <div className="sticky top-0 z-10 bg-white border-b border-slate-200 shadow-sm print:hidden">
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-center gap-4">
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
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors"
            >
              <Printer className="w-3.5 h-3.5" />
              Imprimir / PDF
            </button>
          </div>
        </div>
      </div>

      {/* Report rendered in iframe for full style isolation */}
      <div className="max-w-6xl mx-auto px-6 py-8 print:p-0 print:max-w-none">
        <iframe
          ref={iframeRef}
          srcDoc={html}
          onLoad={handleIframeLoad}
          className="w-full border-0 bg-white rounded-xl shadow-sm border border-slate-200 print:shadow-none print:rounded-none"
          style={{ minHeight: "80vh" }}
          title={title}
          sandbox="allow-same-origin"
        />
      </div>
    </div>
  );
}
