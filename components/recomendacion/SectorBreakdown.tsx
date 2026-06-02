"use client";

import React from "react";

interface SectorItem {
  sector: string;
  sleeveId: string | null;
  actualPct: number;
  sleevePct: number | null;
  deltaPp: number;
  sleeveVista: "OW" | "UW" | "N" | null;
  sleeveConviction: "ALTA" | "MEDIA" | "BAJA" | null;
  holdings: Array<{
    fundName: string;
    ticker: string;
    marketValueUSD: number;
    weightInSector: number;
  }>;
}

interface Props {
  sectors: SectorItem[];
}

function vistaLabel(vista: string | null): { text: string; className: string } {
  switch (vista) {
    case "OW": return { text: "Overweight", className: "text-green-700 bg-green-100" };
    case "UW": return { text: "Underweight", className: "text-red-700 bg-red-100" };
    case "N": return { text: "Neutral", className: "text-slate-600 bg-slate-100" };
    default: return { text: "—", className: "text-slate-400 bg-slate-50" };
  }
}

function deltaColor(delta: number): string {
  if (Math.abs(delta) <= 3) return "text-green-600";
  if (Math.abs(delta) <= 10) return "text-amber-600";
  return "text-red-600";
}

export default function SectorBreakdown({ sectors }: Props) {
  return (
    <div className="bg-white rounded-lg border border-gb-border shadow-sm mb-6">
      <div className="px-6 py-4 border-b border-gb-border">
        <h2 className="text-base font-semibold text-gb-black">
          Desglose Sectorial — Renta Variable
        </h2>
        <p className="text-xs text-gb-gray mt-0.5">
          Normalizado al 100% de la exposicion en RV
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-gb-border">
              <th className="text-left px-6 py-2 font-medium text-gb-gray">Sector</th>
              <th className="text-right px-4 py-2 font-medium text-gb-gray">Actual</th>
              <th className="text-right px-4 py-2 font-medium text-gb-gray">Sleeve</th>
              <th className="text-right px-4 py-2 font-medium text-gb-gray">Delta</th>
              <th className="text-center px-4 py-2 font-medium text-gb-gray">Vista</th>
              <th className="text-center px-4 py-2 font-medium text-gb-gray">Conviction</th>
            </tr>
          </thead>
          <tbody>
            {sectors.map((s) => {
              const vista = vistaLabel(s.sleeveVista);
              return (
                <tr key={s.sector} className="border-b border-gb-border last:border-0 hover:bg-slate-50">
                  <td className="px-6 py-3">
                    <span className="font-medium text-gb-black">{s.sector}</span>
                    <span className="text-xs text-gb-gray ml-2">
                      ({s.holdings.length} posicion{s.holdings.length !== 1 ? "es" : ""})
                    </span>
                  </td>
                  <td className="text-right px-4 py-3 font-mono text-gb-black">
                    {s.actualPct.toFixed(1)}%
                  </td>
                  <td className="text-right px-4 py-3 font-mono text-gb-gray">
                    {s.sleevePct != null ? `${s.sleevePct.toFixed(1)}%` : "—"}
                  </td>
                  <td className={`text-right px-4 py-3 font-mono font-medium ${deltaColor(s.deltaPp)}`}>
                    {s.sleevePct != null
                      ? `${s.deltaPp > 0 ? "+" : ""}${s.deltaPp.toFixed(1)}pp`
                      : "—"}
                  </td>
                  <td className="text-center px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${vista.className}`}>
                      {vista.text}
                    </span>
                  </td>
                  <td className="text-center px-4 py-3 text-xs text-gb-gray">
                    {s.sleeveConviction || "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
