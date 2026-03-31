"use client";

import { useEffect, useState, useRef } from "react";
import PortalTopbar from "@/components/portal/PortalTopbar";
import {
  Loader,
  Upload,
  FileSpreadsheet,
  FileText,
  CheckCircle,
  AlertTriangle,
  ArrowLeft,
  Building2,
} from "lucide-react";
import Link from "next/link";

const CUSTODIAN_OPTIONS = [
  "BCI",
  "BTG Pactual",
  "LarrainVial",
  "Santander",
  "Itaú",
  "Scotiabank",
  "Credicorp",
  "Stonex",
  "Pershing",
  "Sura",
  "Principal",
  "Security",
  "Bice",
  "Otro",
];

export default function SubirCartolaPage() {
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState("");
  const [customSource, setCustomSource] = useState("");
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  const [uploadCount, setUploadCount] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/portal/me")
      .then(r => r.json())
      .then(data => {
        if (data.client) {
          setClientName(`${data.client.nombre} ${data.client.apellido}`);
          setClientEmail(data.client.email);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleUpload = async (file: File) => {
    const sourceName = source === "Otro" ? customSource : source;
    if (!sourceName) return;

    setUploading(true);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("source", sourceName);
      formData.append("fileType", file.name.match(/\.(xlsx?|csv)$/i) ? "excel" : "pdf");

      const res = await fetch("/api/portal/upload-cartola", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      if (data.success) {
        setResult({ success: true, message: data.message });
        setUploadCount(prev => prev + 1);
        setSource("");
        setCustomSource("");
      } else {
        setResult({ success: false, message: data.error || "Error al subir archivo" });
      }
    } catch {
      setResult({ success: false, message: "Error de conexión" });
    } finally {
      setUploading(false);
    }
  };

  const triggerFileSelect = () => {
    fileInputRef.current?.click();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <PortalTopbar clientName={clientName} clientEmail={clientEmail} />
        <div className="flex items-center justify-center py-32">
          <Loader className="w-8 h-8 text-slate-400 animate-spin" />
        </div>
      </div>
    );
  }

  const sourceName = source === "Otro" ? customSource : source;
  const canUpload = !!sourceName && !uploading;

  return (
    <div className="min-h-screen bg-slate-50">
      <PortalTopbar clientName={clientName} clientEmail={clientEmail} />

      <div className="max-w-2xl mx-auto px-5 py-8">
        <Link
          href="/portal/bienvenida"
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Volver
        </Link>

        <h1 className="text-2xl font-semibold text-slate-900 mb-1">Subir Cartola</h1>
        <p className="text-sm text-slate-500 mb-6">
          Sube el estado de cuenta de tu broker o administradora. Tu asesor lo revisará y analizará.
        </p>

        {/* Result banner */}
        {result && (
          <div className={`mb-6 p-4 rounded-lg flex items-start gap-3 ${
            result.success
              ? "bg-green-50 border border-green-200"
              : "bg-red-50 border border-red-200"
          }`}>
            {result.success ? (
              <CheckCircle className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            )}
            <div>
              <p className={`text-sm font-medium ${result.success ? "text-green-800" : "text-red-800"}`}>
                {result.message}
              </p>
              {result.success && (
                <p className="text-xs text-green-600 mt-1">
                  Puedes subir más archivos si tienes cartolas de otras administradoras.
                </p>
              )}
            </div>
          </div>
        )}

        {uploadCount > 0 && (
          <div className="mb-6 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">
            Has subido {uploadCount} archivo{uploadCount !== 1 ? "s" : ""} en esta sesión.
          </div>
        )}

        {/* Upload form */}
        <div className="bg-white rounded-lg border border-slate-200 p-6 space-y-5">
          {/* Source selection */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              <Building2 className="w-4 h-4 inline mr-1.5 text-slate-400" />
              Administradora / Corredora
            </label>
            <select
              value={source}
              onChange={e => setSource(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
            >
              <option value="">Seleccionar...</option>
              {CUSTODIAN_OPTIONS.map(opt => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          </div>

          {source === "Otro" && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Nombre de la administradora
              </label>
              <input
                type="text"
                value={customSource}
                onChange={e => setCustomSource(e.target.value)}
                placeholder="Ej: Mi Corredora"
                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
              />
            </div>
          )}

          {/* File input (hidden) */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.xlsx,.xls,.csv"
            className="hidden"
            onChange={e => {
              const f = e.target.files?.[0];
              if (f) handleUpload(f);
              e.target.value = "";
            }}
          />

          {/* Upload buttons */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Archivo (PDF o Excel)
            </label>
            <button
              onClick={triggerFileSelect}
              disabled={!canUpload}
              className={`w-full flex flex-col items-center justify-center gap-3 p-8 border-2 border-dashed rounded-lg transition-colors ${
                canUpload
                  ? "border-slate-300 hover:border-blue-400 hover:bg-blue-50 cursor-pointer"
                  : "border-slate-200 bg-slate-50 cursor-not-allowed opacity-60"
              }`}
            >
              {uploading ? (
                <Loader className="w-8 h-8 text-blue-500 animate-spin" />
              ) : (
                <Upload className="w-8 h-8 text-slate-400" />
              )}
              <div className="text-center">
                <p className="text-sm font-medium text-slate-700">
                  {uploading ? "Subiendo..." : "Click para seleccionar archivo"}
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  PDF, Excel (.xlsx, .xls) o CSV — máximo 15MB
                </p>
              </div>
            </button>
          </div>

          {!source && (
            <p className="text-xs text-slate-400 text-center">
              Selecciona primero la administradora para habilitar la subida.
            </p>
          )}
        </div>

        {/* Info */}
        <div className="mt-6 p-4 bg-slate-100 rounded-lg">
          <h3 className="text-xs font-semibold text-slate-600 uppercase mb-2">Qué enviar</h3>
          <ul className="text-xs text-slate-500 space-y-1">
            <li className="flex items-start gap-2">
              <FileText className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
              <span>Estado de cuenta mensual en PDF de tu corredor o administradora</span>
            </li>
            <li className="flex items-start gap-2">
              <FileSpreadsheet className="w-3.5 h-3.5 text-green-500 shrink-0 mt-0.5" />
              <span>Archivo Excel con detalle de posiciones y valores de mercado</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
