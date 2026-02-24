// components/comite/CarteraRecomendada.tsx

"use client";

import React, { useState } from "react";
import { pdf } from "@react-pdf/renderer";
import {
  TrendingUp,
  DollarSign,
  BarChart3,
  Coins,
  Wallet,
  AlertTriangle,
  Eye,
  FileText,
  CheckCircle,
  Loader,
  Sparkles,
  X,
  Download,
  Shield,
  Info,
} from "lucide-react";
import CarteraComitePDF from "@/components/pdf/CarteraComitePDF";

interface CarteraPosition {
  clase: string;
  ticker: string;
  nombre: string;
  descripcionSimple?: string;
  porcentaje: number;
  justificacion: string;
}

interface CambioSugerido {
  tipo: "vender" | "reducir" | "mantener" | "aumentar" | "comprar";
  instrumento: string;
  razon: string;
}

interface CarteraData {
  contextoPerfil?: string;
  resumenEjecutivo: string;
  cartera: CarteraPosition[];
  cambiosSugeridos?: CambioSugerido[];
  riesgos: string[];
  proximosMonitorear: string[];
}

interface ClienteInfo {
  nombre: string;
  perfil: string;
  puntaje: number;
  monto?: number;
}

interface CarteraRecomendadaProps {
  cliente: ClienteInfo;
  recomendacion: CarteraData;
  generadoEn: string;
  onAplicar?: () => void | Promise<void>;
  onCerrar?: () => void;
  aplicando?: boolean;
}

const CLASE_ICONS: Record<string, React.ElementType> = {
  "Renta Variable": TrendingUp,
  "Renta Fija": DollarSign,
  Commodities: Coins,
  Cash: Wallet,
  Alternativos: BarChart3,
};

const CLASE_COLORS: Record<string, string> = {
  "Renta Variable": "bg-blue-50 text-blue-700 border-blue-200",
  "Renta Fija": "bg-green-50 text-green-700 border-green-200",
  Commodities: "bg-amber-50 text-amber-700 border-amber-200",
  Cash: "bg-slate-50 text-slate-700 border-slate-200",
  Alternativos: "bg-purple-50 text-purple-700 border-purple-200",
};

export default function CarteraRecomendada({
  cliente,
  recomendacion,
  generadoEn,
  onAplicar,
  onCerrar,
  aplicando = false,
}: CarteraRecomendadaProps) {
  const [expandedPosition, setExpandedPosition] = useState<string | null>(null);
  const [generatingPDF, setGeneratingPDF] = useState(false);

  const handleExportPDF = async () => {
    setGeneratingPDF(true);
    try {
      const blob = await pdf(
        <CarteraComitePDF
          cliente={cliente}
          recomendacion={recomendacion}
          generadoEn={generadoEn}
        />
      ).toBlob();

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `cartera_${cliente.nombre.replace(/\s+/g, "_")}_${new Date().toISOString().split("T")[0]}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Error generating PDF:", error);
    } finally {
      setGeneratingPDF(false);
    }
  };

  // Agrupar posiciones por clase
  const posicionesPorClase = recomendacion.cartera.reduce(
    (acc, pos) => {
      if (!acc[pos.clase]) acc[pos.clase] = [];
      acc[pos.clase].push(pos);
      return acc;
    },
    {} as Record<string, CarteraPosition[]>
  );

  // Calcular totales por clase
  const totalesPorClase = Object.entries(posicionesPorClase).map(([clase, positions]) => ({
    clase,
    total: positions.reduce((sum, p) => sum + p.porcentaje, 0),
    count: positions.length,
  }));

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("es-CL", {
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="bg-white rounded-xl border border-gb-border shadow-sm overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-gb-black to-gb-dark px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-gb-accent" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Cartera Recomendada</h2>
              <p className="text-sm text-white/70">
                {cliente.nombre} · Perfil {cliente.perfil}
              </p>
            </div>
          </div>
          {onCerrar && (
            <button
              onClick={onCerrar}
              className="text-white/70 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Contexto del Perfil de Riesgo */}
      {recomendacion.contextoPerfil && (
        <div className="px-6 py-5 border-b border-gb-border bg-blue-50/50">
          <h3 className="text-sm font-semibold text-gb-black uppercase tracking-wide mb-3 flex items-center gap-2">
            <Shield className="w-4 h-4 text-blue-600" />
            Su Perfil de Inversionista
          </h3>
          <div className="prose prose-sm max-w-none text-gb-dark leading-relaxed">
            {recomendacion.contextoPerfil.split("\n").map((paragraph, i) => (
              <p key={i} className="mb-2 last:mb-0">
                {paragraph}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* Resumen Ejecutivo */}
      <div className="px-6 py-5 border-b border-gb-border bg-gb-light/30">
        <h3 className="text-sm font-semibold text-gb-black uppercase tracking-wide mb-3">
          Visión de Mercado y Recomendación
        </h3>
        <div className="prose prose-sm max-w-none text-gb-dark leading-relaxed">
          {recomendacion.resumenEjecutivo.split("\n").map((paragraph, i) => (
            <p key={i} className="mb-2 last:mb-0">
              {paragraph}
            </p>
          ))}
        </div>
      </div>

      {/* Asset Allocation Summary */}
      <div className="px-6 py-4 border-b border-gb-border">
        <div className="flex items-center gap-6 flex-wrap">
          {totalesPorClase.map(({ clase, total }) => {
            const Icon = CLASE_ICONS[clase] || BarChart3;
            return (
              <div key={clase} className="flex items-center gap-2">
                <Icon className="w-4 h-4 text-gb-gray" />
                <span className="text-sm text-gb-gray">{clase}:</span>
                <span className="text-sm font-semibold text-gb-black">{total}%</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Cartera Detallada */}
      <div className="px-6 py-5">
        <h3 className="text-sm font-semibold text-gb-black uppercase tracking-wide mb-4">
          Composición de Cartera
        </h3>

        <div className="space-y-3">
          {recomendacion.cartera.map((position) => {
            const Icon = CLASE_ICONS[position.clase] || BarChart3;
            const colorClass = CLASE_COLORS[position.clase] || CLASE_COLORS["Alternativos"];
            const isExpanded = expandedPosition === position.ticker;

            return (
              <div
                key={position.ticker}
                className={`border rounded-lg overflow-hidden transition-all ${
                  isExpanded ? "border-gb-accent" : "border-gb-border"
                }`}
              >
                <div
                  className="flex items-center gap-4 p-4 cursor-pointer hover:bg-gb-light/50 transition-colors"
                  onClick={() => setExpandedPosition(isExpanded ? null : position.ticker)}
                >
                  {/* Clase Badge */}
                  <div
                    className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${colorClass}`}
                  >
                    <Icon className="w-5 h-5" />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold text-gb-black">
                        {position.ticker}
                      </span>
                      <span className="text-xs text-gb-gray px-2 py-0.5 bg-gb-light rounded">
                        {position.clase}
                      </span>
                    </div>
                    <p className="text-sm text-gb-gray truncate">{position.nombre}</p>
                  </div>

                  {/* Porcentaje */}
                  <div className="text-right shrink-0">
                    <p className="text-xl font-semibold text-gb-black">{position.porcentaje}%</p>
                    {cliente.monto && (
                      <p className="text-xs text-gb-gray">
                        ${((cliente.monto * position.porcentaje) / 100).toLocaleString()}
                      </p>
                    )}
                  </div>

                  {/* Expand indicator */}
                  <Eye
                    className={`w-4 h-4 text-gb-gray transition-transform ${
                      isExpanded ? "rotate-180" : ""
                    }`}
                  />
                </div>

                {/* Descripción y Justificación expandida */}
                {isExpanded && (
                  <div className="px-4 pb-4 pt-0 space-y-3">
                    {/* Descripción simple del instrumento */}
                    {position.descripcionSimple && (
                      <div className="bg-blue-50/70 rounded-lg p-3 border-l-3 border-blue-400">
                        <p className="text-sm text-gb-dark leading-relaxed flex items-start gap-2">
                          <Info className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
                          <span>
                            <span className="font-medium text-blue-700">¿Qué es {position.ticker}? </span>
                            {position.descripcionSimple}
                          </span>
                        </p>
                      </div>
                    )}
                    {/* Justificación */}
                    <div className="bg-gb-light/50 rounded-lg p-3 border-l-3 border-gb-accent">
                      <p className="text-sm text-gb-dark leading-relaxed">
                        <span className="font-medium text-gb-black">¿Por qué lo recomendamos? </span>
                        {position.justificacion}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Cambios Sugeridos (si existen) */}
      {recomendacion.cambiosSugeridos && recomendacion.cambiosSugeridos.length > 0 && (
        <div className="px-6 py-5 border-t border-gb-border bg-blue-50/30">
          <h3 className="text-sm font-semibold text-gb-black uppercase tracking-wide mb-3 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-blue-600" />
            Cambios Sugeridos vs Cartera Actual
          </h3>
          <div className="space-y-2">
            {recomendacion.cambiosSugeridos.map((cambio, i) => {
              const colorMap: Record<string, string> = {
                vender: "text-red-600 bg-red-100",
                reducir: "text-orange-600 bg-orange-100",
                mantener: "text-gray-600 bg-gray-100",
                aumentar: "text-green-600 bg-green-100",
                comprar: "text-emerald-600 bg-emerald-100",
              };
              const colorClass = colorMap[cambio.tipo] || colorMap.mantener;

              return (
                <div key={i} className="flex items-start gap-3 p-3 bg-white rounded-lg border border-gb-border">
                  <span className={`text-xs font-semibold px-2 py-1 rounded uppercase ${colorClass}`}>
                    {cambio.tipo}
                  </span>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gb-black">{cambio.instrumento}</p>
                    <p className="text-xs text-gb-gray mt-0.5">{cambio.razon}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Riesgos */}
      <div className="px-6 py-5 border-t border-gb-border bg-red-50/30">
        <h3 className="text-sm font-semibold text-gb-black uppercase tracking-wide mb-3 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-red-500" />
          Riesgos a Monitorear
        </h3>
        <ul className="space-y-2">
          {recomendacion.riesgos.map((riesgo, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-gb-dark">
              <span className="text-red-500 mt-0.5">•</span>
              {riesgo}
            </li>
          ))}
        </ul>
      </div>

      {/* Próximos a Monitorear */}
      <div className="px-6 py-5 border-t border-gb-border bg-amber-50/30">
        <h3 className="text-sm font-semibold text-gb-black uppercase tracking-wide mb-3 flex items-center gap-2">
          <Eye className="w-4 h-4 text-amber-600" />
          Eventos a Monitorear
        </h3>
        <ul className="space-y-2">
          {recomendacion.proximosMonitorear.map((evento, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-gb-dark">
              <span className="text-amber-600 mt-0.5">•</span>
              {evento}
            </li>
          ))}
        </ul>
      </div>

      {/* Footer */}
      <div className="px-6 py-4 border-t border-gb-border bg-gb-light/30 flex items-center justify-between">
        <p className="text-xs text-gb-gray">Generado el {formatDate(generadoEn)}</p>

        <div className="flex items-center gap-3">
          <button
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gb-gray hover:text-gb-black transition-colors disabled:opacity-50"
            onClick={handleExportPDF}
            disabled={generatingPDF}
          >
            {generatingPDF ? (
              <Loader className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            {generatingPDF ? "Generando..." : "Exportar PDF"}
          </button>

          {onAplicar && (
            <button
              onClick={onAplicar}
              disabled={aplicando}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-gb-accent text-white rounded-lg hover:bg-gb-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {aplicando ? (
                <>
                  <Loader className="w-4 h-4 animate-spin" />
                  Aplicando...
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4" />
                  Aplicar Propuesta
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// Componente para el botón de generar
interface GenerarCarteraButtonProps {
  clientId: string;
  montoInversion?: number;
  onCarteraGenerada: (data: any) => void;
  disabled?: boolean;
}

export function GenerarCarteraButton({
  clientId,
  montoInversion,
  onCarteraGenerada,
  disabled,
}: GenerarCarteraButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerar = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/comite/generar-cartera", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, montoInversion }),
      });

      const data = await res.json();

      if (data.success) {
        onCarteraGenerada(data);
      } else {
        setError(data.error || "Error al generar cartera");
      }
    } catch (err) {
      setError("Error de conexión");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <button
        onClick={handleGenerar}
        disabled={loading || disabled}
        className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-gb-accent to-orange-500 text-white font-medium rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
      >
        {loading ? (
          <>
            <Loader className="w-4 h-4 animate-spin" />
            Generando con IA...
          </>
        ) : (
          <>
            <Sparkles className="w-4 h-4" />
            Generar Cartera con Visión Comité
          </>
        )}
      </button>

      {error && (
        <p className="mt-2 text-sm text-red-600 flex items-center gap-1">
          <AlertTriangle className="w-3 h-3" />
          {error}
        </p>
      )}
    </div>
  );
}
