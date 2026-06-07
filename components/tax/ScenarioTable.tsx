// components/tax/ScenarioTable.tsx
"use client";

import { useState } from "react";
import { CheckCircle2, ChevronDown, ChevronUp, TrendingDown, TrendingUp, Scale } from "lucide-react";
import type { ScenarioResult } from "@/lib/tax/types";

interface Props {
  scenarios: ScenarioResult[];
  totalValueUF?: number;
}

function fmtUF(v: number): string {
  return v.toLocaleString("es-CL", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function fmtPct(v: number): string {
  return (v * 100).toFixed(2) + "%";
}

// Color for scenario bars
const SCENARIO_COLORS = [
  { bg: "bg-blue-500", light: "bg-blue-100", text: "text-blue-700" },
  { bg: "bg-emerald-500", light: "bg-emerald-100", text: "text-emerald-700" },
  { bg: "bg-amber-500", light: "bg-amber-100", text: "text-amber-700" },
  { bg: "bg-purple-500", light: "bg-purple-100", text: "text-purple-700" },
];

export default function ScenarioTable({ scenarios, totalValueUF = 0 }: Props) {
  const [expanded, setExpanded] = useState(false);

  if (scenarios.length === 0) return null;

  const rec = scenarios.find((s) => s.recomendado);
  const maxBenefit = Math.max(...scenarios.map((s) => s.beneficioNetoVPN_UF));
  const minBenefit = Math.min(...scenarios.map((s) => s.beneficioNetoVPN_UF));
  const range = Math.max(Math.abs(maxBenefit), Math.abs(minBenefit)) || 1;

  return (
    <div className="space-y-4">
      {/* Visual comparison chart */}
      <div className="bg-white rounded-lg border border-gb-border overflow-hidden">
        <div className="px-4 py-3 border-b border-gb-border">
          <h3 className="font-semibold text-gb-black">Comparacion de escenarios</h3>
          <p className="text-xs text-gb-gray mt-0.5">
            Beneficio neto VPN a 10 anos (ahorro TAC + alpha - impuesto)
          </p>
        </div>

        <div className="px-4 py-4 space-y-3">
          {scenarios.map((s, i) => {
            const color = SCENARIO_COLORS[i % SCENARIO_COLORS.length];
            const barPct = range > 0 ? Math.abs(s.beneficioNetoVPN_UF) / range * 50 : 0;
            const isPositive = s.beneficioNetoVPN_UF >= 0;

            return (
              <div key={s.nombre} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    {s.recomendado && <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />}
                    <span className={s.recomendado ? "font-semibold text-gb-black" : "text-gb-gray"}>
                      {s.nombre}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`font-mono font-semibold ${isPositive ? "text-green-700" : "text-red-600"}`}>
                      {isPositive ? "+" : ""}{fmtUF(s.beneficioNetoVPN_UF)} UF
                    </span>
                    {totalValueUF > 0 && (
                      <span className="text-xs text-gb-gray">
                        ({fmtPct(s.beneficioNetoVPN_UF / totalValueUF)})
                      </span>
                    )}
                  </div>
                </div>
                {/* Horizontal bar */}
                <div className="relative h-6 bg-gray-100 rounded overflow-hidden">
                  {/* Center line */}
                  <div className="absolute left-1/2 top-0 bottom-0 w-px bg-gray-300 z-10" />
                  {isPositive ? (
                    <div
                      className={`absolute top-0 bottom-0 left-1/2 ${color.bg} rounded-r transition-all`}
                      style={{ width: `${barPct}%` }}
                    />
                  ) : (
                    <div
                      className="absolute top-0 bottom-0 bg-red-400 rounded-l transition-all"
                      style={{ width: `${barPct}%`, right: "50%" }}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Breakdown: stacked bars showing impuesto vs TAC vs alpha */}
        <div className="px-4 pb-4">
          <p className="text-xs text-gb-gray mb-3 font-medium">Desglose por componente</p>
          <div className="space-y-2">
            {scenarios.map((s, i) => {
              const color = SCENARIO_COLORS[i % SCENARIO_COLORS.length];
              // Max value across all components for scaling
              const maxComp = Math.max(
                ...scenarios.map((sc) => Math.max(sc.impuestoTotal_UF, sc.ahorroTAC_10Y_UF, sc.alphaReasignacion_10Y_UF))
              ) || 1;

              const taxW = (s.impuestoTotal_UF / maxComp) * 100;
              const tacW = (s.ahorroTAC_10Y_UF / maxComp) * 100;
              const alphaW = (s.alphaReasignacion_10Y_UF / maxComp) * 100;

              return (
                <div key={s.nombre} className="flex items-center gap-3">
                  <span className="text-xs text-gb-gray w-32 truncate flex-shrink-0">{s.nombre}</span>
                  <div className="flex-1 flex items-center gap-1 h-5">
                    {/* Tax (cost — red) */}
                    {taxW > 0 && (
                      <div
                        className="h-full bg-red-400 rounded-sm flex items-center justify-center"
                        style={{ width: `${taxW}%`, minWidth: taxW > 0 ? "4px" : 0 }}
                        title={`Impuesto: ${fmtUF(s.impuestoTotal_UF)} UF`}
                      />
                    )}
                    {/* TAC savings (green) */}
                    {tacW > 0 && (
                      <div
                        className="h-full bg-green-400 rounded-sm"
                        style={{ width: `${tacW}%`, minWidth: tacW > 0 ? "4px" : 0 }}
                        title={`Ahorro TAC: ${fmtUF(s.ahorroTAC_10Y_UF)} UF`}
                      />
                    )}
                    {/* Alpha (blue) */}
                    {alphaW > 0 && (
                      <div
                        className={`h-full ${color.bg} rounded-sm`}
                        style={{ width: `${alphaW}%`, minWidth: alphaW > 0 ? "4px" : 0 }}
                        title={`Alpha: ${fmtUF(s.alphaReasignacion_10Y_UF)} UF`}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {/* Legend */}
          <div className="flex items-center gap-4 mt-2 text-[10px] text-gb-gray">
            <div className="flex items-center gap-1"><div className="w-3 h-2 bg-red-400 rounded-sm" /> Impuesto</div>
            <div className="flex items-center gap-1"><div className="w-3 h-2 bg-green-400 rounded-sm" /> Ahorro TAC</div>
            <div className="flex items-center gap-1"><div className="w-3 h-2 bg-blue-500 rounded-sm" /> Alpha reasignacion</div>
          </div>
        </div>
      </div>

      {/* Summary cards for recommended scenario */}
      {rec && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard
            icon={<TrendingDown className="w-4 h-4 text-red-500" />}
            label="Impuesto"
            value={`${fmtUF(rec.impuestoTotal_UF)} UF`}
            subvalue={totalValueUF > 0 ? fmtPct(rec.impuestoTotal_UF / totalValueUF) + " del portafolio" : undefined}
            color="red"
          />
          <SummaryCard
            icon={<TrendingUp className="w-4 h-4 text-green-500" />}
            label="Ahorro TAC 10Y"
            value={`${fmtUF(rec.ahorroTAC_10Y_UF)} UF`}
            subvalue={totalValueUF > 0 ? fmtPct(rec.ahorroTAC_10Y_UF / totalValueUF) + " del portafolio" : undefined}
            color="green"
          />
          <SummaryCard
            icon={<TrendingUp className="w-4 h-4 text-blue-500" />}
            label="Alpha 10Y"
            value={`${fmtUF(rec.alphaReasignacion_10Y_UF)} UF`}
            subvalue={totalValueUF > 0 ? fmtPct(rec.alphaReasignacion_10Y_UF / totalValueUF) + " del portafolio" : undefined}
            color="blue"
          />
          <SummaryCard
            icon={<Scale className="w-4 h-4 text-emerald-600" />}
            label="Beneficio neto VPN"
            value={`${rec.beneficioNetoVPN_UF >= 0 ? "+" : ""}${fmtUF(rec.beneficioNetoVPN_UF)} UF`}
            subvalue={rec.puntoEquilibrioAnos != null
              ? `Recuperas en ${rec.puntoEquilibrioAnos.toFixed(1)} anos`
              : undefined}
            color="emerald"
          />
        </div>
      )}

      {/* Detailed table (collapsible) */}
      <div className="bg-white rounded-lg border border-gb-border overflow-hidden">
        <button
          className="w-full px-4 py-3 flex items-center justify-between border-b border-gb-border hover:bg-gray-50 transition-colors"
          onClick={() => setExpanded(!expanded)}
        >
          <span className="font-medium text-sm text-gb-black">Tabla detallada por escenario</span>
          {expanded ? <ChevronUp className="w-4 h-4 text-gb-gray" /> : <ChevronDown className="w-4 h-4 text-gb-gray" />}
        </button>

        {expanded && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gb-border bg-gray-50">
                  <th className="text-left px-4 py-2 font-medium text-gb-gray">Metrica</th>
                  {scenarios.map((s) => (
                    <th
                      key={s.nombre}
                      className={`text-right px-4 py-2 font-medium ${
                        s.recomendado ? "bg-green-50 text-green-800" : "text-gb-gray"
                      }`}
                    >
                      <div className="flex items-center justify-end gap-1.5">
                        {s.recomendado && <CheckCircle2 className="w-4 h-4 text-green-600" />}
                        <span>{s.nombre}</span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {DETAIL_ROWS.map((row) => (
                  <tr key={row.key} className="border-b border-gb-border last:border-b-0">
                    <td className={`px-4 py-2 text-gb-black ${row.bold ? "font-semibold" : ""}`}>
                      {row.label}
                    </td>
                    {scenarios.map((s) => {
                      const val = s[row.key as keyof ScenarioResult];
                      let display: string;
                      let pctDisplay: string | null = null;

                      if (row.key === "puntoEquilibrioAnos") {
                        display = val === null ? "N/A" : `${(val as number).toFixed(1)} anos`;
                      } else {
                        const num = val as number;
                        display = fmtUF(num) + " UF";
                        if (totalValueUF > 0 && row.showPct) {
                          pctDisplay = fmtPct(num / totalValueUF);
                        }
                      }

                      return (
                        <td
                          key={s.nombre}
                          className={`px-4 py-2 text-right tabular-nums ${
                            s.recomendado ? "bg-green-50" : ""
                          } ${row.bold ? "font-semibold text-gb-black" : "text-gb-gray"}`}
                        >
                          <div>{display}</div>
                          {pctDisplay && (
                            <div className="text-[10px] text-gb-gray">{pctDisplay}</div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Scenario descriptions */}
        <div className="px-4 py-3 border-t border-gb-border bg-gray-50">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {scenarios.map((s) => (
              <div key={s.nombre} className="text-xs text-gb-gray">
                <span className="font-medium text-gb-black">{s.nombre}:</span>{" "}
                {s.descripcion}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// Summary card subcomponent
function SummaryCard({
  icon,
  label,
  value,
  subvalue,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  subvalue?: string;
  color: string;
}) {
  const borderColors: Record<string, string> = {
    red: "border-l-red-400",
    green: "border-l-green-400",
    blue: "border-l-blue-400",
    emerald: "border-l-emerald-500",
  };

  return (
    <div className={`bg-white rounded-lg border border-gb-border border-l-4 ${borderColors[color] || "border-l-gray-300"} p-3`}>
      <div className="flex items-center gap-1.5 mb-1">
        {icon}
        <span className="text-xs text-gb-gray">{label}</span>
      </div>
      <div className="font-semibold text-gb-black text-sm">{value}</div>
      {subvalue && <div className="text-[10px] text-gb-gray mt-0.5">{subvalue}</div>}
    </div>
  );
}

// Detail row definitions
const DETAIL_ROWS = [
  { label: "Impuesto total", key: "impuestoTotal_UF", showPct: true },
  { label: "Ahorro TAC 10Y", key: "ahorroTAC_10Y_UF", showPct: true },
  { label: "Alpha reasignacion 10Y", key: "alphaReasignacion_10Y_UF", showPct: true },
  { label: "Beneficio neto VPN", key: "beneficioNetoVPN_UF", showPct: true, bold: true },
  { label: "Punto de equilibrio", key: "puntoEquilibrioAnos" },
];
