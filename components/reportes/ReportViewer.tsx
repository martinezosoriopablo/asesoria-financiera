"use client";
import { useEffect, useState } from "react";

interface ViewReport {
  content_html: string | null;
  pdf_signed_url: string | null;
  audio_url: string | null;
  payload: unknown | null;
}

export default function ReportViewer({ reportId }: { reportId: string }) {
  const [r, setR] = useState<ViewReport | null>(null);
  useEffect(() => {
    fetch(`/api/reports/${reportId}`).then((x) => x.json()).then((d) => setR(d.report));
  }, [reportId]);
  if (!r) return <div className="text-sm text-gb-gray">Cargando…</div>;
  return (
    <div className="space-y-3">
      {r.content_html && <iframe sandbox="allow-same-origin" srcDoc={r.content_html} className="w-full h-[60vh] border rounded" />}
      {r.pdf_signed_url && <iframe src={r.pdf_signed_url} className="w-full h-[60vh] border rounded" />}
      {r.audio_url && <audio controls src={r.audio_url} className="w-full" />}
      {r.payload && !r.content_html && (
        <pre className="text-xs bg-gb-light p-3 rounded overflow-auto max-h-[60vh]">{JSON.stringify(r.payload, null, 2)}</pre>
      )}
    </div>
  );
}
