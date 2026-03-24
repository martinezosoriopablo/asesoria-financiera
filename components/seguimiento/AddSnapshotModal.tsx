"use client";

import React, { useState, useRef } from "react";
import { X, Upload, FileSpreadsheet, Edit3, Loader, AlertTriangle, Plus, Trash2, Building2 } from "lucide-react";
import ManualEntryForm from "./ManualEntryForm";
import ReviewSnapshotModal from "./ReviewSnapshotModal";

interface ParsedHolding {
  fundName: string;
  securityId?: string | null;
  quantity?: number;
  unitCost?: number;
  costBasis?: number;
  marketPrice?: number;
  marketValue: number;
  unrealizedGainLoss?: number;
  assetClass?: string;
  currency?: string;
  source?: string; // Custodian/source name
}

interface ParsedData {
  clientName?: string;
  accountNumber?: string;
  period?: string;
  beginningValue?: number;
  endingValue?: number;
  totalValue?: number;
  holdings?: ParsedHolding[];
  detectedCurrency?: string;
  currencyConfidence?: string;
  currencyReason?: string;
}

interface UploadedFile {
  id: string;
  fileName: string;
  source: string; // Custodian name (e.g., "BCI", "Stonex", "LarrainVial")
  type: "pdf" | "excel";
  data: ParsedData;
}

interface Props {
  clientId: string;
  onClose: () => void;
  onSuccess: () => void;
}

type Mode = "select" | "upload" | "manual" | "review";

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

export default function AddSnapshotModal({ clientId, onClose, onSuccess }: Props) {
  const [mode, setMode] = useState<Mode>("select");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [currentSource, setCurrentSource] = useState("");
  const [customSource, setCustomSource] = useState("");
  const [uploadType, setUploadType] = useState<"pdf" | "excel">("pdf");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (file: File, type: "pdf" | "excel") => {
    const sourceName = currentSource === "Otro" ? customSource : currentSource;

    if (!sourceName) {
      setError("Selecciona o ingresa el nombre de la administradora/custodio");
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const parseEndpoint = type === "pdf"
        ? "/api/parse-portfolio-statement"
        : "/api/parse-portfolio-excel";

      const parseRes = await fetch(parseEndpoint, {
        method: "POST",
        body: formData,
      });

      const parseResult = await parseRes.json();

      if (parseResult.error) {
        setError(parseResult.error || `Error al procesar archivo ${type.toUpperCase()}`);
        return;
      }

      const data = parseResult.data || parseResult;

      const totalValue = data.totalValue || data.endingValue ||
        (data.holdings?.reduce((sum: number, h: { marketValue?: number }) => sum + (h.marketValue || 0), 0) || 0);

      if (!totalValue || totalValue === 0) {
        setError("No se pudo extraer el valor total del archivo.");
        return;
      }

      // Add source to each holding
      const holdingsWithSource = (data.holdings || []).map((h: ParsedHolding) => ({
        ...h,
        source: sourceName,
      }));

      const newFile: UploadedFile = {
        id: crypto.randomUUID(),
        fileName: file.name,
        source: sourceName,
        type,
        data: {
          ...data,
          totalValue,
          holdings: holdingsWithSource,
        },
      };

      setUploadedFiles([...uploadedFiles, newFile]);
      setCurrentSource("");
      setCustomSource("");
      setError(null);

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
    handleFileUpload(file, uploadType);
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const triggerFileSelect = (type: "pdf" | "excel") => {
    setUploadType(type);
    setTimeout(() => fileInputRef.current?.click(), 0);
  };

  const removeFile = (id: string) => {
    setUploadedFiles(uploadedFiles.filter(f => f.id !== id));
  };

  const handleReviewClose = () => {
    setUploadedFiles([]);
    setMode("select");
  };

  // Consolidate all holdings from uploaded files
  // Find the first file that has a period, or use the first file's period
  const consolidatedPeriod = uploadedFiles.find(f => f.data.period)?.data.period || uploadedFiles[0]?.data.period;

  const consolidatedData: ParsedData = {
    holdings: uploadedFiles.flatMap(f => f.data.holdings || []),
    totalValue: uploadedFiles.reduce((sum, f) => sum + (f.data.totalValue || 0), 0),
    period: consolidatedPeriod,
    detectedCurrency: uploadedFiles[0]?.data.detectedCurrency,
  };

  // Show review modal if we're in review mode
  if (mode === "review" && uploadedFiles.length > 0) {
    return (
      <ReviewSnapshotModal
        clientId={clientId}
        parsedData={consolidatedData}
        sources={uploadedFiles.map(f => f.source)}
        onClose={handleReviewClose}
        onSuccess={onSuccess}
        onAddMore={() => setMode("upload")}
      />
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 shadow-xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-gb-black">
            {mode === "select" && "Agregar Cartola"}
            {mode === "upload" && "Subir Archivos"}
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

            {/* Upload option */}
            <button
              onClick={() => setMode("upload")}
              className="w-full flex items-center gap-4 p-4 border border-slate-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 transition-colors text-left"
            >
              <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                <Upload className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <p className="font-medium text-gb-black">Subir Archivos</p>
                <p className="text-sm text-gb-gray">
                  Cargar PDF o Excel de una o múltiples administradoras
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

        {/* Upload mode */}
        {mode === "upload" && (
          <div className="space-y-4">
            <button
              onClick={() => {
                if (uploadedFiles.length === 0) {
                  setMode("select");
                } else {
                  setMode("review");
                }
              }}
              className="text-sm text-blue-600 hover:underline"
            >
              &larr; {uploadedFiles.length > 0 ? "Continuar a revisión" : "Volver"}
            </button>

            {/* Info */}
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-700">
                Puedes subir archivos de múltiples administradoras (BCI, Stonex, etc.)
                y se consolidarán en un solo snapshot.
              </p>
            </div>

            {/* Uploaded files list */}
            {uploadedFiles.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-gb-black">
                  Archivos cargados ({uploadedFiles.length})
                </h4>
                {uploadedFiles.map((file) => (
                  <div
                    key={file.id}
                    className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <Building2 className="w-5 h-5 text-green-600" />
                      <div>
                        <p className="text-sm font-medium text-green-800">{file.source}</p>
                        <p className="text-xs text-green-600">{file.fileName}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-green-800">
                        {file.data.holdings?.length || 0} posiciones
                      </span>
                      <button
                        onClick={() => removeFile(file.id)}
                        className="p-1 text-red-500 hover:bg-red-100 rounded"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Add new file */}
            <div className="border border-slate-200 rounded-lg p-4 space-y-3">
              <h4 className="text-sm font-semibold text-gb-black flex items-center gap-2">
                <Plus className="w-4 h-4" />
                Agregar archivo
              </h4>

              {/* Source selection */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Administradora / Custodio
                </label>
                <select
                  value={currentSource}
                  onChange={(e) => setCurrentSource(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Seleccionar...</option>
                  {CUSTODIAN_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>

              {currentSource === "Otro" && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Nombre de la administradora
                  </label>
                  <input
                    type="text"
                    value={customSource}
                    onChange={(e) => setCustomSource(e.target.value)}
                    placeholder="Ej: Mi Corredora"
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}

              {/* File input */}
              <input
                ref={fileInputRef}
                type="file"
                accept={uploadType === "pdf" ? ".pdf" : ".xlsx,.xls,.csv"}
                onChange={handleFileSelect}
                className="hidden"
              />

              {/* Upload buttons */}
              <div className="flex gap-2">
                <button
                  onClick={() => triggerFileSelect("pdf")}
                  disabled={uploading || (!currentSource || (currentSource === "Otro" && !customSource))}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-slate-300 rounded-lg hover:border-red-400 hover:bg-red-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {uploading && uploadType === "pdf" ? (
                    <Loader className="w-5 h-5 text-red-600 animate-spin" />
                  ) : (
                    <Upload className="w-5 h-5 text-red-600" />
                  )}
                  <span className="text-sm font-medium text-slate-700">PDF</span>
                </button>
                <button
                  onClick={() => triggerFileSelect("excel")}
                  disabled={uploading || (!currentSource || (currentSource === "Otro" && !customSource))}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-slate-300 rounded-lg hover:border-green-400 hover:bg-green-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {uploading && uploadType === "excel" ? (
                    <Loader className="w-5 h-5 text-green-600 animate-spin" />
                  ) : (
                    <FileSpreadsheet className="w-5 h-5 text-green-600" />
                  )}
                  <span className="text-sm font-medium text-slate-700">Excel</span>
                </button>
              </div>
            </div>

            {/* Continue button */}
            {uploadedFiles.length > 0 && (
              <button
                onClick={() => setMode("review")}
                className="w-full py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors"
              >
                Continuar a revisión ({uploadedFiles.length} archivo{uploadedFiles.length > 1 ? "s" : ""})
              </button>
            )}
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
