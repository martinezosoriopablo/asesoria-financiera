// components/recomendacion/NarrativeAnalysis.tsx
"use client";

import React, { useState } from "react";
import { Sparkles, Loader } from "lucide-react";

interface Props {
  clientId: string;
  clientName: string;
  allocation: Record<string, { actual: number; target: number; delta: number }>;
  observations: Array<{ severity: string; text: string }>;
  sectorBreakdown: Array<{
    sector: string;
    actualPct: number;
    sleevePct: number | null;
    deltaPp: number;
  }>;
  totalValueCLP: number;
  perfilCliente: string;
  perfilModelo: string;
  notaComite: string | null;
}

export default function NarrativeAnalysis({
  clientName,
  allocation,
  observations,
  sectorBreakdown,
  totalValueCLP,
  perfilCliente,
  perfilModelo,
  notaComite,
}: Props) {
  const [narrative, setNarrative] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [model, setModel] = useState<string | null>(null);

  const generateNarrative = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/portfolio/radiografia/narrative", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientName,
          allocation,
          observations,
          sectorBreakdown,
          totalValueCLP,
          perfilCliente,
          perfilModelo,
          notaComite,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setNarrative(data.narrative);
        setModel(data.model);
      } else {
        setError(data.error || "Error al generar analisis");
      }
    } catch {
      setError("Error de conexion");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-lg border border-gb-border shadow-sm mb-6">
      <div className="px-6 py-4 border-b border-gb-border flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-gb-black">Analisis Narrativo</h2>
          <p className="text-xs text-gb-gray mt-0.5">Diagnostico profesional generado por IA</p>
        </div>
        {!narrative && (
          <button
            onClick={generateNarrative}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-gb-primary rounded-lg hover:bg-gb-primary/90 disabled:opacity-50 transition-colors"
          >
            {loading ? (
              <>
                <Loader className="w-4 h-4 animate-spin" />
                Generando...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                Generar Analisis
              </>
            )}
          </button>
        )}
      </div>

      {error && (
        <div className="px-6 py-3 bg-red-50 text-sm text-red-700">
          {error}
        </div>
      )}

      {narrative && (
        <div className="px-6 py-5">
          <div className="prose prose-sm max-w-none text-gb-black/85 leading-relaxed">
            {narrative.split("\n\n").map((paragraph, i) => (
              <p key={i} className="mb-3 last:mb-0">{paragraph}</p>
            ))}
          </div>
          {model && (
            <p className="text-[10px] text-gb-gray mt-4 pt-3 border-t border-gb-border">
              Generado con {model.includes("opus") ? "Claude Opus" : "Claude Sonnet"}
            </p>
          )}
          <button
            onClick={generateNarrative}
            disabled={loading}
            className="mt-3 text-xs text-gb-primary hover:underline disabled:opacity-50"
          >
            {loading ? "Regenerando..." : "Regenerar analisis"}
          </button>
        </div>
      )}

      {!narrative && !error && !loading && (
        <div className="px-6 py-8 text-center">
          <Sparkles className="w-8 h-8 text-gb-gray/30 mx-auto mb-2" />
          <p className="text-sm text-gb-gray">
            Presiona el boton para generar un diagnostico profesional
          </p>
        </div>
      )}
    </div>
  );
}
