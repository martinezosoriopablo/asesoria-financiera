"use client";

import { useParams } from "next/navigation";
import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { ArrowLeft, Loader, Printer } from "lucide-react";

const DEFAULT_STYLES = `
<style>
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
    color: #1e293b;
    line-height: 1.7;
    font-size: 15px;
    margin: 0;
    padding: 2rem;
    background: #fff;
  }
  h1 { font-size: 1.75rem; font-weight: 700; color: #0f172a; margin: 0 0 1rem; line-height: 1.3; }
  h2 { font-size: 1.35rem; font-weight: 600; color: #0f172a; margin: 2rem 0 0.75rem; padding-bottom: 0.5rem; border-bottom: 1px solid #e2e8f0; }
  h3 { font-size: 1.1rem; font-weight: 600; color: #1e293b; margin: 1.5rem 0 0.5rem; }
  h4 { font-size: 1rem; font-weight: 600; color: #334155; margin: 1.25rem 0 0.4rem; }
  p { margin: 0 0 1rem; }
  ul, ol { margin: 0 0 1rem; padding-left: 1.5rem; }
  li { margin-bottom: 0.4rem; }
  strong, b { font-weight: 600; color: #0f172a; }
  a { color: #2563eb; text-decoration: underline; }
  img { max-width: 100%; height: auto; border-radius: 0.5rem; margin: 1rem 0; }
  table { width: 100%; border-collapse: collapse; margin: 1.5rem 0; font-size: 0.875rem; }
  th { background: #f8fafc; font-weight: 600; text-align: left; padding: 0.625rem 0.75rem; border-bottom: 2px solid #e2e8f0; color: #475569; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; }
  td { padding: 0.5rem 0.75rem; border-bottom: 1px solid #f1f5f9; color: #334155; }
  tr:hover td { background: #f8fafc; }
  blockquote { border-left: 3px solid #3b82f6; background: #eff6ff; padding: 0.75rem 1rem; margin: 1rem 0; border-radius: 0 0.375rem 0.375rem 0; color: #1e40af; }
  hr { border: none; border-top: 1px solid #e2e8f0; margin: 2rem 0; }
  pre { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 0.5rem; padding: 1rem; overflow-x: auto; font-size: 0.85rem; }
  code { background: #f1f5f9; padding: 0.125rem 0.375rem; border-radius: 0.25rem; font-size: 0.875em; }
</style>
`;

export default function ReporteComitePage() {
  const { type } = useParams<{ type: string }>();
  const [html, setHtml] = useState<string | null>(null);
  const [title, setTitle] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (!type) return;
    setLoading(true);
    fetch(`/api/comite/${encodeURIComponent(type)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success && d.report) {
          setHtml(d.report.content);
          setTitle(d.report.title || type.replace(/_/g, " "));
        } else {
          setError(d.error || "No se encontró el reporte.");
        }
      })
      .catch(() => setError("Error al cargar el reporte."))
      .finally(() => setLoading(false));
  }, [type]);

  // Inject default styles if HTML has no <style> tag
  const iframeContent = useMemo(() => {
    if (!html) return null;
    const hasStyles = /<style[\s>]/i.test(html);
    if (hasStyles) return html;
    // Inject default styles — if it's a full document, inject into <head>
    if (/<head[\s>]/i.test(html)) {
      return html.replace(/<head([^>]*)>/i, `<head$1>${DEFAULT_STYLES}`);
    }
    // Fragment HTML — wrap with basic document structure
    return `<!DOCTYPE html><html><head>${DEFAULT_STYLES}</head><body>${html}</body></html>`;
  }, [html]);

  const resizeIframe = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe?.contentDocument?.body) return;
    iframe.style.height = iframe.contentDocument.body.scrollHeight + 40 + "px";
  }, []);

  const handleIframeLoad = useCallback(() => {
    resizeIframe();
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

  if (error || !iframeContent) {
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
          <span className="text-sm font-semibold text-slate-800 truncate capitalize">{title}</span>
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

      <div className="max-w-6xl mx-auto px-6 py-8 print:p-0 print:max-w-none">
        <iframe
          ref={iframeRef}
          srcDoc={iframeContent}
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
