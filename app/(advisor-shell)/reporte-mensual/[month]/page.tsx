"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, Loader } from "lucide-react";
import Link from "next/link";

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
        if (d.data?.report) {
          setHtml(d.data.report.html_content);
          setTitle(d.data.report.title || `Reporte ${month}`);
        } else {
          setError("No hay reporte para este mes.");
        }
      })
      .catch(() => setError("Error al cargar el reporte."))
      .finally(() => setLoading(false));
  }, [month]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader className="w-6 h-6 animate-spin text-gb-gray" />
      </div>
    );
  }

  if (error || !html) {
    return (
      <div className="max-w-3xl mx-auto py-12 text-center">
        <p className="text-gb-gray mb-4">{error || "Reporte no encontrado."}</p>
        <Link href="/dashboard" className="text-blue-600 hover:underline text-sm">
          Volver al Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Sticky nav bar */}
      <div className="sticky top-0 z-10 bg-white border-b border-gb-border px-6 py-3 flex items-center gap-4 print:hidden">
        <button
          onClick={() => window.history.back()}
          className="flex items-center gap-1.5 text-sm text-gb-gray hover:text-gb-black transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Volver
        </button>
        <span className="text-sm font-medium text-gb-black">{title}</span>
        <div className="ml-auto">
          <button
            onClick={() => window.print()}
            className="px-3 py-1.5 text-xs font-medium bg-gb-primary text-white rounded-md hover:bg-gb-primary/90 transition-colors"
          >
            Imprimir / PDF
          </button>
        </div>
      </div>

      {/* Rendered HTML report */}
      <div
        className="report-container"
        dangerouslySetInnerHTML={{ __html: html }}
      />

      <style jsx global>{`
        @media print {
          .report-container { padding: 0 !important; }
        }
      `}</style>
    </div>
  );
}
