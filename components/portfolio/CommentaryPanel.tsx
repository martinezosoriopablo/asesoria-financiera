// components/portfolio/CommentaryPanel.tsx

"use client";

import React, { useState } from "react";
import { FileText, Copy, Check } from "lucide-react";
import { generateModelCommentary, type ConsolidatedRow } from "@/lib/portfolio/commentary";

interface CommentaryPanelProps {
  rows: ConsolidatedRow[];
}

export function CommentaryPanel({ rows }: CommentaryPanelProps) {
  const [copied, setCopied] = useState(false);
  const [showDetailed, setShowDetailed] = useState(false);
  
  const commentary = generateModelCommentary(rows);
  
  const handleCopy = async () => {
    await navigator.clipboard.writeText(commentary.full);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  
  return (
    <div className="bg-white rounded-2xl shadow-lg border-2 border-slate-200 overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-600 to-blue-600 px-6 py-4 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <FileText className="w-5 h-5 text-white" />
          <h3 className="text-lg font-semibold text-white">
            Comentario Automático del Modelo
          </h3>
        </div>
        
        <button
          onClick={handleCopy}
          className="flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg transition-colors text-white text-sm font-medium"
        >
          {copied ? (
            <>
              <Check className="w-4 h-4" />
              ¡Copiado!
            </>
          ) : (
            <>
              <Copy className="w-4 h-4" />
              Copiar texto
            </>
          )}
        </button>
      </div>
      
      {/* Content */}
      <div className="p-6 space-y-4">
        {/* Resumen Ejecutivo */}
        <div className="bg-blue-50 border-l-4 border-blue-600 rounded-lg p-4">
          <p className="text-sm font-semibold text-blue-900 mb-2">
            Resumen Ejecutivo
          </p>
          <p className="text-sm text-slate-700 leading-relaxed text-justify">
            {commentary.brief}
          </p>
        </div>
        
        {/* Toggle para ver detalle */}
        <button
          onClick={() => setShowDetailed(!showDetailed)}
          className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
        >
          {showDetailed ? "Ocultar detalle" : "Ver detalle por clase de activo"}
          <svg 
            className={`w-4 h-4 transition-transform ${showDetailed ? 'rotate-180' : ''}`}
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        
        {/* Detalle por clase de activo */}
        {showDetailed && (
          <div className="space-y-3 pt-2">
            {commentary.byAssetClass.equity && (
              <div className="border-l-4 border-blue-400 bg-blue-50 rounded-r-lg p-4">
                <p className="text-xs font-semibold text-blue-800 mb-2 uppercase tracking-wider">
                  Renta Variable
                </p>
                <p className="text-sm text-slate-700 leading-relaxed text-justify">
                  {commentary.byAssetClass.equity}
                </p>
              </div>
            )}
            
            {commentary.byAssetClass.fixedIncome && (
              <div className="border-l-4 border-slate-400 bg-slate-50 rounded-r-lg p-4">
                <p className="text-xs font-semibold text-slate-800 mb-2 uppercase tracking-wider">
                  Renta Fija
                </p>
                <p className="text-sm text-slate-700 leading-relaxed text-justify">
                  {commentary.byAssetClass.fixedIncome}
                </p>
              </div>
            )}
            
            {commentary.byAssetClass.alternatives && (
              <div className="border-l-4 border-indigo-400 bg-indigo-50 rounded-r-lg p-4">
                <p className="text-xs font-semibold text-indigo-800 mb-2 uppercase tracking-wider">
                  Alternativos
                </p>
                <p className="text-sm text-slate-700 leading-relaxed text-justify">
                  {commentary.byAssetClass.alternatives}
                </p>
              </div>
            )}
          </div>
        )}
        
        {/* Justificación estratégica (último párrafo) */}
        <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
          <p className="text-xs font-semibold text-slate-600 mb-2 uppercase tracking-wider">
            Justificación Estratégica
          </p>
          <p className="text-sm text-slate-700 leading-relaxed text-justify">
            {commentary.full.split('\n\n').pop()}
          </p>
        </div>
        
        {/* Info footer */}
        <div className="flex items-start gap-2 pt-2 border-t border-slate-200">
          <svg 
            className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" 
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              strokeWidth={2} 
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" 
            />
          </svg>
          <p className="text-xs text-slate-500 leading-relaxed">
            Este comentario ha sido generado automáticamente basándose en las desviaciones 
            del modelo respecto al benchmark. Puede editarse o personalizarse antes de 
            presentarlo al cliente.
          </p>
        </div>
      </div>
    </div>
  );
}

// Componente simplificado para mostrar solo el resumen
export function CommentaryBrief({ rows }: CommentaryPanelProps) {
  const commentary = generateModelCommentary(rows);
  
  return (
    <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-4 border-2 border-blue-200">
      <div className="flex items-start gap-3">
        <div className="p-2 bg-blue-600 rounded-lg">
          <FileText className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1">
          <p className="text-xs font-semibold text-blue-900 mb-1 uppercase tracking-wider">
            Resumen del Modelo
          </p>
          <p className="text-sm text-slate-700 leading-relaxed">
            {commentary.brief}
          </p>
        </div>
      </div>
    </div>
  );
}
