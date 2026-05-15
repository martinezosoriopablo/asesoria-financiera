// components/tax/TaxMap.tsx
"use client";

import type { TaxableHolding } from "@/lib/tax/types";

interface Props {
  holdings: TaxableHolding[];
}

const REGIME_LABELS: Record<string, string> = {
  "107": "Art. 107 (10%)",
  "108": "Art. 108/MLT",
  "104": "Art. 104 (4%)",
  apv: "APV",
  "57bis": "57 bis",
  general: "General",
};

const REGIME_COLORS: Record<string, string> = {
  apv: "bg-green-100 text-green-800",
  "107": "bg-blue-100 text-blue-800",
  "108": "bg-purple-100 text-purple-800",
  "104": "bg-cyan-100 text-cyan-800",
  "57bis": "bg-amber-100 text-amber-800",
  general: "bg-gray-100 text-gray-700",
};

function fmtUF(v: number): string {
  return v.toLocaleString("es-CL", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

export default function TaxMap({ holdings }: Props) {
  if (holdings.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gb-border p-6 text-center text-gb-gray text-sm">
        No hay holdings cargados. Los holdings se populan automaticamente desde la cartola del
        cliente.
      </div>
    );
  }

  const totalValueUF = holdings.reduce((sum, h) => sum + h.currentValueUF, 0);
  const totalGainsUF = holdings.reduce((sum, h) => {
    const cost = h.acquisitionCostUF ?? 0;
    return sum + (h.currentValueUF - cost);
  }, 0);

  return (
    <div className="bg-white rounded-lg border border-gb-border overflow-hidden">
      <div className="px-4 py-3 border-b border-gb-border">
        <h3 className="font-semibold text-gb-black">Mapa tributario de holdings</h3>
        <p className="text-xs text-gb-gray mt-0.5">
          Capa 1: Datos basados en ley vigente
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gb-border bg-gray-50">
              <th className="text-left px-4 py-2 font-medium text-gb-gray">Fondo</th>
              <th className="text-right px-4 py-2 font-medium text-gb-gray">Valor (UF)</th>
              <th className="text-center px-4 py-2 font-medium text-gb-gray">Regimen</th>
              <th className="text-right px-4 py-2 font-medium text-gb-gray">Gan. Capital (UF)</th>
              <th className="text-center px-4 py-2 font-medium text-gb-gray">MLT</th>
              <th className="text-center px-4 py-2 font-medium text-gb-gray">DCV</th>
            </tr>
          </thead>
          <tbody>
            {holdings.map((h, i) => {
              const gains = h.acquisitionCostUF != null
                ? h.currentValueUF - h.acquisitionCostUF
                : null;
              const regimeColor = REGIME_COLORS[h.taxRegime] ?? REGIME_COLORS.general;

              return (
                <tr
                  key={`${h.run}-${h.serie}-${i}`}
                  className="border-b border-gb-border last:border-b-0 hover:bg-gray-50"
                >
                  <td className="px-4 py-2 text-gb-black">
                    {h.fundName}
                    {h.confianzaBaja && (
                      <span className="text-yellow-500 ml-1" title="Datos con baja confianza">
                        *
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-gb-black">
                    {fmtUF(h.currentValueUF)}
                  </td>
                  <td className="px-4 py-2 text-center">
                    <span
                      className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${regimeColor}`}
                    >
                      {REGIME_LABELS[h.taxRegime] ?? h.taxRegime}
                    </span>
                  </td>
                  <td
                    className={`px-4 py-2 text-right tabular-nums ${
                      gains !== null && gains < 0 ? "text-red-600" : "text-gb-black"
                    }`}
                  >
                    {gains !== null ? fmtUF(gains) : "-"}
                  </td>
                  <td className="px-4 py-2 text-center text-gb-gray">
                    {h.canMLT ? "Si" : "No"}
                  </td>
                  <td className="px-4 py-2 text-center text-gb-gray">
                    {h.canDCV ? "Si" : "No"}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-gb-border bg-gray-50 font-medium">
              <td className="px-4 py-2 text-gb-black">Total</td>
              <td className="px-4 py-2 text-right tabular-nums text-gb-black">
                {fmtUF(totalValueUF)}
              </td>
              <td />
              <td
                className={`px-4 py-2 text-right tabular-nums ${
                  totalGainsUF < 0 ? "text-red-600" : "text-gb-black"
                }`}
              >
                {fmtUF(totalGainsUF)}
              </td>
              <td />
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      {holdings.some((h) => h.confianzaBaja) && (
        <div className="px-4 py-2 border-t border-gb-border bg-yellow-50 text-xs text-yellow-700">
          * Datos estimados con baja confianza. Verificar con informacion del cliente.
        </div>
      )}
    </div>
  );
}
