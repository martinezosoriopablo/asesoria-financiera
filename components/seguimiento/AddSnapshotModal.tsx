"use client";

import React, { useState, useRef } from "react";
import { X, Upload, FileSpreadsheet, Edit3, Loader, AlertTriangle } from "lucide-react";
import ManualEntryForm from "./ManualEntryForm";

interface Props {
  clientId: string;
  onClose: () => void;
  onSuccess: () => void;
}

type Mode = "select" | "pdf" | "excel" | "manual";

export default function AddSnapshotModal({ clientId, onClose, onSuccess }: Props) {
  const [mode, setMode] = useState<Mode>("select");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fechaCartola, setFechaCartola] = useState(new Date().toISOString().split("T")[0]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (file: File, type: "pdf" | "excel") => {
    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      // Parse the file
      const parseEndpoint = type === "pdf"
        ? "/api/parse-portfolio-statement"
        : "/api/parse-portfolio-excel";

      const parseRes = await fetch(parseEndpoint, {
        method: "POST",
        body: formData,
      });

      const parseResult = await parseRes.json();

      if (!parseResult.success) {
        setError(parseResult.error || `Error al procesar archivo ${type.toUpperCase()}`);
        return;
      }

      // Extract data from parsed result
      const parsedData = parseResult.data;
      const totalValue = parsedData.totalValue || parsedData.statement?.endingValue || 0;

      // Create snapshot with parsed data
      const composition = parsedData.composition?.byAssetClass || parsedData.byAssetClass || {};

      const snapshotRes = await fetch("/api/portfolio/snapshots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          snapshotDate: fechaCartola,
          totalValue,
          composition: {
            equity: composition.Equity || composition.equity || { value: 0, percent: 0 },
            fixedIncome: composition["Fixed Income"] || composition.fixedIncome || { value: 0, percent: 0 },
            alternatives: composition.Alternatives || composition.alternatives || { value: 0, percent: 0 },
            cash: composition.Cash || composition.cash || { value: 0, percent: 0 },
          },
          holdings: parsedData.composition?.holdings || parsedData.holdings || [],
          source: type,
        }),
      });

      const snapshotResult = await snapshotRes.json();

      if (snapshotResult.success) {
        onSuccess();
      } else {
        setError(snapshotResult.error || "Error al guardar snapshot");
      }
    } catch (err) {
      console.error("Error uploading file:", err);
      setError("Error al procesar el archivo");
    } finally {
      setUploading(false);
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const fileType = mode === "pdf" ? "pdf" : "excel";
    handleFileUpload(file, fileType);
  };

  const triggerFileSelect = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-lg w-full mx-4 shadow-xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-gb-black">
            {mode === "select" && "Agregar Cartola"}
            {mode === "pdf" && "Subir PDF"}
            {mode === "excel" && "Subir Excel"}
            {mode === "manual" && "Entrada Manual"}
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 text-gb-gray hover:text-gb-black hover:bg-slate-100 rounded transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* Mode selection */}
        {mode === "select" && (
          <div className="space-y-3">
            <p className="text-sm text-gb-gray mb-4">
              Selecciona cómo deseas agregar la información de la cartola:
            </p>

            {/* PDF option */}
            <button
              onClick={() => setMode("pdf")}
              className="w-full flex items-center gap-4 p-4 border border-slate-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 transition-colors text-left"
            >
              <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <Upload className="w-6 h-6 text-red-600" />
              </div>
              <div>
                <p className="font-medium text-gb-black">Subir PDF</p>
                <p className="text-sm text-gb-gray">
                  Cargar estado de cuenta en PDF para análisis automático con IA
                </p>
              </div>
            </button>

            {/* Excel option */}
            <button
              onClick={() => setMode("excel")}
              className="w-full flex items-center gap-4 p-4 border border-slate-200 rounded-lg hover:border-green-300 hover:bg-green-50 transition-colors text-left"
            >
              <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                <FileSpreadsheet className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <p className="font-medium text-gb-black">Subir Excel</p>
                <p className="text-sm text-gb-gray">
                  Cargar archivo Excel con posiciones (formato BCI/AGF)
                </p>
              </div>
            </button>

            {/* Manual option */}
            <button
              onClick={() => setMode("manual")}
              className="w-full flex items-center gap-4 p-4 border border-slate-200 rounded-lg hover:border-purple-300 hover:bg-purple-50 transition-colors text-left"
            >
              <div className="w-12 h-12 rounded-full bg-purple-100 flex items-center justify-center shrink-0">
                <Edit3 className="w-6 h-6 text-purple-600" />
              </div>
              <div>
                <p className="font-medium text-gb-black">Entrada Manual</p>
                <p className="text-sm text-gb-gray">
                  Ingresar manualmente el valor total y la composición
                </p>
              </div>
            </button>
          </div>
        )}

        {/* PDF upload mode */}
        {mode === "pdf" && (
          <div className="space-y-4">
            <button
              onClick={() => setMode("select")}
              className="text-sm text-blue-600 hover:underline"
            >
              &larr; Volver
            </button>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Fecha de la Cartola
              </label>
              <input
                type="date"
                value={fechaCartola}
                onChange={(e) => setFechaCartola(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              onChange={handleFileSelect}
              className="hidden"
            />

            <button
              onClick={triggerFileSelect}
              disabled={uploading}
              className="w-full flex flex-col items-center justify-center gap-3 p-8 border-2 border-dashed border-slate-300 rounded-lg hover:border-blue-400 hover:bg-blue-50 transition-colors"
            >
              {uploading ? (
                <>
                  <Loader className="w-8 h-8 text-blue-600 animate-spin" />
                  <p className="text-sm text-gb-gray">Procesando PDF...</p>
                </>
              ) : (
                <>
                  <Upload className="w-8 h-8 text-gb-gray" />
                  <p className="text-sm text-gb-gray">
                    Haz clic para seleccionar un archivo PDF
                  </p>
                </>
              )}
            </button>
          </div>
        )}

        {/* Excel upload mode */}
        {mode === "excel" && (
          <div className="space-y-4">
            <button
              onClick={() => setMode("select")}
              className="text-sm text-blue-600 hover:underline"
            >
              &larr; Volver
            </button>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Fecha de la Cartola
              </label>
              <input
                type="date"
                value={fechaCartola}
                onChange={(e) => setFechaCartola(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileSelect}
              className="hidden"
            />

            <button
              onClick={triggerFileSelect}
              disabled={uploading}
              className="w-full flex flex-col items-center justify-center gap-3 p-8 border-2 border-dashed border-slate-300 rounded-lg hover:border-green-400 hover:bg-green-50 transition-colors"
            >
              {uploading ? (
                <>
                  <Loader className="w-8 h-8 text-green-600 animate-spin" />
                  <p className="text-sm text-gb-gray">Procesando Excel...</p>
                </>
              ) : (
                <>
                  <FileSpreadsheet className="w-8 h-8 text-gb-gray" />
                  <p className="text-sm text-gb-gray">
                    Haz clic para seleccionar un archivo Excel (.xlsx, .xls, .csv)
                  </p>
                </>
              )}
            </button>
          </div>
        )}

        {/* Manual entry mode */}
        {mode === "manual" && (
          <div className="space-y-4">
            <button
              onClick={() => setMode("select")}
              className="text-sm text-blue-600 hover:underline"
            >
              &larr; Volver
            </button>

            <ManualEntryForm
              clientId={clientId}
              onSuccess={onSuccess}
              onCancel={onClose}
            />
          </div>
        )}
      </div>
    </div>
  );
}
