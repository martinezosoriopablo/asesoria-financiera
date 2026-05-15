// components/tax/ScenarioTable.tsx
"use client";

import { CheckCircle2 } from "lucide-react";
import type { ScenarioResult } from "@/lib/tax/types";

interface Props {
  scenarios: ScenarioResult[];
}

function fmtUF(v: number): string {
  return v.toLocaleString("es-CL", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

export default function ScenarioTable({ scenarios }: Props) {
  if (scenarios.length === 0) return null;

  const rows: {
    label: string;
    key: keyof Pick<
      ScenarioResult,
      | "impuestoTotal_UF"
      | "ahorroTAC_10Y_UF"
      | "alphaReasignacion_10Y_UF"
      | "beneficioNetoVPN_UF"
      | "puntoEquilibrioAnos"
    >;
    bold?: boolean;
  }[] = [
    { label: "Impuesto total (UF)", key: "impuestoTotal_UF" },
    { label: "Ahorro TAC 10Y (UF)", key: "ahorroTAC_10Y_UF" },
    { label: "Alpha reasignacion 10Y (UF)", key: "alphaReasignacion_10Y_UF" },
    { label: "Beneficio neto VPN (UF)", key: "beneficioNetoVPN_UF", bold: true },
    { label: "Punto de equilibrio (anos)", key: "puntoEquilibrioAnos" },
  ];

  return (
    <div className="bg-white rounded-lg border border-gb-border overflow-hidden">
      <div className="px-4 py-3 border-b border-gb-border">
        <h3 className="font-semibold text-gb-black">Comparacion de escenarios</h3>
        <p className="text-xs text-gb-gray mt-0.5">
          Capa 2: Proyeccion con supuestos del asesor
        </p>
      </div>

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
            {rows.map((row) => (
              <tr key={row.key} className="border-b border-gb-border last:border-b-0">
                <td
                  className={`px-4 py-2 text-gb-black ${row.bold ? "font-semibold" : ""}`}
                >
                  {row.label}
                </td>
                {scenarios.map((s) => {
                  const val = s[row.key];
                  const display =
                    row.key === "puntoEquilibrioAnos"
                      ? val === null
                        ? "N/A"
                        : `${val} anos`
                      : fmtUF(val as number);

                  return (
                    <td
                      key={s.nombre}
                      className={`px-4 py-2 text-right tabular-nums ${
                        s.recomendado ? "bg-green-50" : ""
                      } ${row.bold ? "font-semibold text-gb-black" : "text-gb-gray"}`}
                    >
                      {display}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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
  );
}
