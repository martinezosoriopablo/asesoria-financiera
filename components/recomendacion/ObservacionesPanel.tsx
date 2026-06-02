// components/recomendacion/ObservacionesPanel.tsx
"use client";

import React from "react";
import { AlertTriangle, AlertCircle, Info } from "lucide-react";

interface Observation {
  severity: "alta" | "media" | "info";
  text: string;
}

interface Props {
  observations: Observation[];
}

const SEVERITY_CONFIG = {
  alta: {
    icon: AlertTriangle,
    border: "border-l-red-500",
    bg: "bg-red-50",
    iconColor: "text-red-500",
    label: "Alta",
    labelColor: "bg-red-100 text-red-700",
  },
  media: {
    icon: AlertCircle,
    border: "border-l-amber-500",
    bg: "bg-amber-50",
    iconColor: "text-amber-500",
    label: "Media",
    labelColor: "bg-amber-100 text-amber-700",
  },
  info: {
    icon: Info,
    border: "border-l-blue-500",
    bg: "bg-blue-50",
    iconColor: "text-blue-500",
    label: "Info",
    labelColor: "bg-blue-100 text-blue-700",
  },
};

export default function ObservacionesPanel({ observations }: Props) {
  if (observations.length === 0) return null;

  return (
    <div className="bg-white rounded-lg border border-gb-border shadow-sm mb-6">
      <div className="px-6 py-4 border-b border-gb-border">
        <h2 className="text-base font-semibold text-gb-black">Observaciones</h2>
        <p className="text-xs text-gb-gray mt-0.5">
          Diagnostico automatico basado en la composicion del portafolio
        </p>
      </div>
      <div className="p-4 space-y-2">
        {observations.map((obs, i) => {
          const config = SEVERITY_CONFIG[obs.severity];
          const Icon = config.icon;
          return (
            <div
              key={i}
              className={`flex items-start gap-3 p-3 rounded-r-lg border-l-4 ${config.border} ${config.bg}`}
            >
              <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${config.iconColor}`} />
              <p className="text-sm text-gb-black/80 flex-1">{obs.text}</p>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold shrink-0 ${config.labelColor}`}>
                {config.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
