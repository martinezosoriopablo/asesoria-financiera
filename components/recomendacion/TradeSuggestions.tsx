"use client";

import React from "react";
import { TrendingDown, TrendingUp, Minus } from "lucide-react";

interface Suggestion {
  action: "REDUCIR" | "AGREGAR" | "MANTENER";
  reason: string;
  holdings?: string[];
  amountUSD?: number;
  instrument?: string;
  instrumentTicker?: string;
  priority: "alta" | "media" | "baja";
}

interface Props {
  suggestions: Suggestion[];
}

const ACTION_CONFIG = {
  REDUCIR: { icon: TrendingDown, color: "border-red-200 bg-red-50", iconColor: "text-red-600", label: "Reducir" },
  AGREGAR: { icon: TrendingUp, color: "border-green-200 bg-green-50", iconColor: "text-green-600", label: "Agregar" },
  MANTENER: { icon: Minus, color: "border-slate-200 bg-slate-50", iconColor: "text-slate-500", label: "Mantener" },
};

const PRIORITY_BADGE = {
  alta: "bg-red-100 text-red-700",
  media: "bg-amber-100 text-amber-700",
  baja: "bg-slate-100 text-slate-600",
};

export default function TradeSuggestions({ suggestions }: Props) {
  return (
    <div className="bg-white rounded-lg border border-gb-border shadow-sm mb-6">
      <div className="px-6 py-4 border-b border-gb-border">
        <h2 className="text-base font-semibold text-gb-black">
          Sugerencias de Ajuste
        </h2>
        <p className="text-xs text-gb-gray mt-0.5">
          Basadas en desviaciones vs modelo y vistas del comite
        </p>
      </div>
      <div className="p-4 space-y-3">
        {suggestions.map((s, i) => {
          const config = ACTION_CONFIG[s.action];
          const Icon = config.icon;
          return (
            <div
              key={i}
              className={`rounded-lg border p-4 ${config.color}`}
            >
              <div className="flex items-start gap-3">
                <Icon className={`w-5 h-5 mt-0.5 ${config.iconColor}`} />
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-semibold text-gb-black">
                      {config.label}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PRIORITY_BADGE[s.priority]}`}>
                      {s.priority}
                    </span>
                  </div>
                  <p className="text-sm text-gb-black/80">{s.reason}</p>
                  {s.holdings && s.holdings.length > 0 && (
                    <p className="text-xs text-gb-gray mt-1">
                      Posiciones: {s.holdings.join(", ")}
                    </p>
                  )}
                  {s.instrument && (
                    <p className="text-xs text-gb-gray mt-1">
                      Instrumento sugerido: <span className="font-medium">{s.instrument}</span>
                      {s.instrumentTicker && ` (${s.instrumentTicker})`}
                    </p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
