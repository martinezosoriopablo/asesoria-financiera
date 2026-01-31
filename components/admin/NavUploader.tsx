// components/admin/NavUploader.tsx

"use client";

import React, { useState } from "react";
import { Upload, FileSpreadsheet, CheckCircle, XCircle, Loader } from "lucide-react";

interface UploadResult {
  success: boolean;
  message: string;
  stats?: {
    totalRecords: number;
    totalFunds: number;
    imported: number;
    updated: number;
    errors: number;
  };
}

export function NavUploader() {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setResult(null);
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    setUploading(true);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/admin/upload-nav-history", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (response.ok) {
        setResult({
          success: true,
          message: "Importación completada exitosamente",
          stats: data.stats,
        });
        setFile(null);
      } else {
        setResult({
          success: false,
          message: data.error || "Error en la importación",
        });
      }
    } catch (error: any) {
      setResult({
        success: false,
        message: error.message || "Error al subir el archivo",
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-lg p-8 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <FileSpreadsheet className="w-8 h-8 text-blue-600" />
        <div>
          <h2 className="text-2xl font-bold text-slate-900">
            Importar Valores Cuota
          </h2>
          <p className="text-sm text-slate-600">
            Sube un archivo Excel o CSV con el historial de valores cuota
          </p>
        </div>
      </div>

      {/* Formato esperado */}
      <div className="mb-6 p-4 bg-blue-50 border-2 border-blue-200 rounded-lg">
        <h3 className="font-semibold text-blue-900 mb-2">Formato esperado:</h3>
        <div className="bg-white rounded p-3 font-mono text-xs">
          <div className="text-slate-600">fecha,cmf_code,valor_cuota</div>
          <div>2024-11-22,8707,2548.50</div>
          <div>2024-11-21,8707,2545.30</div>
          <div>2024-11-20,8707,2543.80</div>
          <div className="text-slate-400">...</div>
        </div>
        <div className="mt-2 text-sm text-blue-800">
          <strong>Columnas requeridas:</strong>
          <ul className="list-disc list-inside mt-1 space-y-1">
            <li><code className="bg-white px-1 rounded">fecha</code> - Formato: YYYY-MM-DD, DD/MM/YYYY o YYYYMMDD</li>
            <li><code className="bg-white px-1 rounded">cmf_code</code> - RUN del fondo (fo_run)</li>
            <li><code className="bg-white px-1 rounded">valor_cuota</code> - Valor de la cuota</li>
          </ul>
        </div>
      </div>

      {/* File input */}
      <div className="mb-6">
        <label
          htmlFor="file-upload"
          className="flex flex-col items-center justify-center w-full h-40 border-2 border-dashed border-slate-300 rounded-lg cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition-colors"
        >
          <div className="flex flex-col items-center justify-center pt-5 pb-6">
            <Upload className="w-10 h-10 mb-3 text-slate-400" />
            <p className="mb-2 text-sm text-slate-600">
              <span className="font-semibold">Click para seleccionar</span> o arrastra un archivo
            </p>
            <p className="text-xs text-slate-500">CSV o Excel (xlsx, xls)</p>
          </div>
          <input
            id="file-upload"
            type="file"
            className="hidden"
            accept=".csv,.xlsx,.xls"
            onChange={handleFileChange}
            disabled={uploading}
          />
        </label>

        {file && (
          <div className="mt-3 flex items-center justify-between p-3 bg-slate-50 rounded-lg">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-blue-600" />
              <span className="text-sm font-medium text-slate-900">{file.name}</span>
              <span className="text-xs text-slate-500">
                ({(file.size / 1024).toFixed(2)} KB)
              </span>
            </div>
            <button
              onClick={() => setFile(null)}
              className="text-sm text-red-600 hover:text-red-800"
              disabled={uploading}
            >
              Quitar
            </button>
          </div>
        )}
      </div>

      {/* Upload button */}
      <button
        onClick={handleUpload}
        disabled={!file || uploading}
        className="w-full px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors disabled:bg-slate-300 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {uploading ? (
          <>
            <Loader className="w-5 h-5 animate-spin" />
            Importando...
          </>
        ) : (
          <>
            <Upload className="w-5 h-5" />
            Importar Valores Cuota
          </>
        )}
      </button>

      {/* Result */}
      {result && (
        <div
          className={`mt-6 p-4 rounded-lg border-2 ${
            result.success
              ? "bg-green-50 border-green-200"
              : "bg-red-50 border-red-200"
          }`}
        >
          <div className="flex items-start gap-3">
            {result.success ? (
              <CheckCircle className="w-6 h-6 text-green-600 flex-shrink-0 mt-0.5" />
            ) : (
              <XCircle className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" />
            )}
            <div className="flex-1">
              <h3
                className={`font-semibold mb-2 ${
                  result.success ? "text-green-900" : "text-red-900"
                }`}
              >
                {result.message}
              </h3>

              {result.success && result.stats && (
                <div className="space-y-2 text-sm text-green-800">
                  <div className="flex justify-between">
                    <span>Registros procesados:</span>
                    <span className="font-semibold">{result.stats.totalRecords}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Fondos únicos:</span>
                    <span className="font-semibold">{result.stats.totalFunds}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Valores cuota importados:</span>
                    <span className="font-semibold">{result.stats.imported}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Fondos actualizados:</span>
                    <span className="font-semibold">{result.stats.updated}</span>
                  </div>
                  {result.stats.errors > 0 && (
                    <div className="flex justify-between text-orange-600">
                      <span>Errores:</span>
                      <span className="font-semibold">{result.stats.errors}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Info adicional */}
      <div className="mt-6 p-4 bg-slate-50 rounded-lg">
        <h4 className="font-semibold text-slate-900 mb-2">ℹ️ Información</h4>
        <ul className="text-sm text-slate-600 space-y-1 list-disc list-inside">
          <li>El sistema calcula automáticamente las rentabilidades (1Y, 3Y, 5Y, 10Y, YTD)</li>
          <li>Si un fondo ya tiene valores cuota, se actualizarán con los nuevos datos</li>
          <li>Solo se procesarán fondos que existan en la base de datos</li>
          <li>El proceso puede tomar varios minutos para archivos grandes</li>
        </ul>
      </div>
    </div>
  );
}
