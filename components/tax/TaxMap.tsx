// components/tax/TaxMap.tsx
"use client";

import { useState, useCallback } from "react";
import { Loader } from "lucide-react";
import type { TaxableHolding } from "@/lib/tax/types";

interface Props {
  holdings: TaxableHolding[];
  onHoldingsChange?: (updated: TaxableHolding[]) => void;
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

export default function TaxMap({ holdings, onHoldingsChange }: Props) {
  // Track selected years per holding (index → years chosen)
  const [selectedYears, setSelectedYears] = useState<Record<number, number>>(() => {
    const initial: Record<number, number> = {};
    holdings.forEach((h, i) => {
      if (h.confianzaBaja && h.estimatedCosts.length > 0) {
        initial[i] = 2;
      }
    });
    return initial;
  });

  const [globalYears, setGlobalYears] = useState<number>(2);

  // Custom date inputs per holding
  const [customDates, setCustomDates] = useState<Record<number, string>>({});
  const [dateLoading, setDateLoading] = useState<Record<number, boolean>>({});

  const hasAnyEstimated = holdings.some(h => h.confianzaBaja && h.estimatedCosts.length > 0);

  function applyYearsSelection(holdingIndex: number, years: number) {
    const h = holdings[holdingIndex];
    const estimate = h.estimatedCosts.find(e => e.years === years);
    if (!estimate) return;

    setSelectedYears(prev => ({ ...prev, [holdingIndex]: years }));
    setCustomDates(prev => { const n = { ...prev }; delete n[holdingIndex]; return n; });

    if (onHoldingsChange) {
      const updated = [...holdings];
      updated[holdingIndex] = {
        ...h,
        acquisitionCostUF: estimate.costUF,
        ufAtPurchase: estimate.ufAtDate,
      };
      onHoldingsChange(updated);
    }
  }

  function applyGlobalYears(years: number) {
    setGlobalYears(years);
    const newSelected: Record<number, number> = { ...selectedYears };
    const updated = [...holdings];
    const newDates: Record<number, string> = {};

    holdings.forEach((h, i) => {
      if (h.confianzaBaja && h.estimatedCosts.length > 0) {
        const estimate = h.estimatedCosts.find(e => e.years === years);
        if (estimate) {
          newSelected[i] = years;
          updated[i] = { ...h, acquisitionCostUF: estimate.costUF, ufAtPurchase: estimate.ufAtDate };
        }
      }
    });

    setSelectedYears(newSelected);
    setCustomDates(newDates);
    if (onHoldingsChange) onHoldingsChange(updated);
  }

  const lookupExactDate = useCallback(async (holdingIndex: number, date: string) => {
    const h = holdings[holdingIndex];
    if (!date || !h.run || !h.serie) return;

    setDateLoading(prev => ({ ...prev, [holdingIndex]: true }));
    setCustomDates(prev => ({ ...prev, [holdingIndex]: date }));

    try {
      const res = await fetch("/api/tax/quote-at-date", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ run: h.run, serie: h.serie, date }),
      });

      if (!res.ok) throw new Error("Error buscando precio");

      const data = await res.json();
      const todayPrice = data.data?.todayPrice;
      const historicalPrice = data.data?.historicalPrice;
      const ufAtDate = data.data?.ufAtDate;
      const ufToday = data.data?.ufToday;

      if (todayPrice && historicalPrice && todayPrice > 0 && ufAtDate > 0 && ufToday > 0) {
        // costCLP = currentValueCLP * (historicalPrice / todayPrice)
        // costUF = costCLP / ufAtDate (corrección monetaria)
        const ratio = historicalPrice / todayPrice;
        const costCLP = h.currentValueCLP * ratio;
        const costUF = costCLP / ufAtDate;

        if (onHoldingsChange) {
          const updated = [...holdings];
          updated[holdingIndex] = {
            ...h,
            acquisitionCostUF: costUF,
            ufAtPurchase: ufAtDate,
            acquisitionDate: data.data?.historicalDate ?? date,
            confianzaBaja: false, // now we have a real reference date
          };
          onHoldingsChange(updated);
        }
      }
    } catch (err) {
      console.error("Quote lookup error:", err);
    } finally {
      setDateLoading(prev => ({ ...prev, [holdingIndex]: false }));
    }
  }, [holdings, onHoldingsChange]);

  if (holdings.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gb-border p-6 text-center text-gb-gray text-sm">
        No hay holdings cargados.
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
      <div className="px-4 py-3 border-b border-gb-border flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-gb-black">Mapa tributario de holdings</h3>
          <p className="text-xs text-gb-gray mt-0.5">
            Regimen tributario y ganancia de capital por posicion
          </p>
        </div>
        {hasAnyEstimated && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-gb-gray">Antiguedad global:</span>
            <select
              value={globalYears}
              onChange={(e) => applyGlobalYears(Number(e.target.value))}
              className="text-xs border border-gb-border rounded px-2 py-1 text-gb-black focus:outline-none focus:ring-1 focus:ring-gb-primary/30"
            >
              <option value={1}>1 ano</option>
              <option value={2}>2 anos</option>
              <option value={3}>3 anos</option>
              <option value={4}>4 anos</option>
              <option value={5}>5 anos</option>
            </select>
          </div>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gb-border bg-gray-50">
              <th className="text-left px-4 py-2 font-medium text-gb-gray">Fondo</th>
              <th className="text-right px-4 py-2 font-medium text-gb-gray">Valor (UF)</th>
              <th className="text-center px-4 py-2 font-medium text-gb-gray">Regimen</th>
              <th className="text-right px-4 py-2 font-medium text-gb-gray">Gan. Capital (UF)</th>
              {hasAnyEstimated && (
                <th className="text-center px-4 py-2 font-medium text-gb-gray">Fecha compra</th>
              )}
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
              const isEstimated = h.confianzaBaja && h.estimatedCosts.length > 0;
              const hasCustomDate = customDates[i] != null;

              return (
                <tr
                  key={`${h.run}-${h.serie}-${i}`}
                  className="border-b border-gb-border last:border-b-0 hover:bg-gray-50"
                >
                  <td className="px-4 py-2 text-gb-black">
                    {h.fundName}
                    {isEstimated && !hasCustomDate && (
                      <span className="text-yellow-500 ml-1" title="Sin costo de compra — estimado">*</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-gb-black">
                    {fmtUF(h.currentValueUF)}
                  </td>
                  <td className="px-4 py-2 text-center">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${regimeColor}`}>
                      {REGIME_LABELS[h.taxRegime] ?? h.taxRegime}
                    </span>
                  </td>
                  <td className={`px-4 py-2 text-right tabular-nums ${
                    gains !== null && gains < 0 ? "text-red-600" : isEstimated && !hasCustomDate ? "text-yellow-700" : "text-gb-black"
                  }`}>
                    {gains !== null ? fmtUF(gains) : "-"}
                    {isEstimated && !hasCustomDate && <span className="text-[10px] ml-0.5">~</span>}
                    {dateLoading[i] && <Loader className="w-3 h-3 inline ml-1 animate-spin text-gb-gray" />}
                  </td>
                  {hasAnyEstimated && (
                    <td className="px-4 py-2 text-center">
                      {isEstimated || hasCustomDate ? (
                        <div className="flex flex-col items-center gap-1">
                          <select
                            value={hasCustomDate ? "custom" : (selectedYears[i] ?? 2)}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val === "custom") return; // handled by date input
                              applyYearsSelection(i, Number(val));
                            }}
                            className="text-xs border border-yellow-300 bg-yellow-50 rounded px-1.5 py-0.5 text-yellow-800 focus:outline-none focus:ring-1 focus:ring-yellow-400"
                          >
                            {h.estimatedCosts.map(est => (
                              <option key={est.years} value={est.years}>
                                ~{est.years} anos → {fmtUF(est.gainsUF)} UF
                              </option>
                            ))}
                            <option value="custom">Fecha exacta...</option>
                          </select>
                          {(hasCustomDate || (!hasCustomDate && false)) && null}
                          <input
                            type="date"
                            value={customDates[i] || ""}
                            onChange={(e) => {
                              if (e.target.value) lookupExactDate(i, e.target.value);
                            }}
                            max={new Date().toISOString().split("T")[0]}
                            min="2010-01-01"
                            className="text-[10px] border border-gb-border rounded px-1 py-0.5 w-[120px] text-gb-black focus:outline-none focus:ring-1 focus:ring-gb-primary/30"
                            placeholder="Fecha compra"
                          />
                        </div>
                      ) : (
                        <span className="text-xs text-green-600">cartola</span>
                      )}
                    </td>
                  )}
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
              <td className={`px-4 py-2 text-right tabular-nums ${totalGainsUF < 0 ? "text-red-600" : "text-gb-black"}`}>
                {fmtUF(totalGainsUF)}
              </td>
              {hasAnyEstimated && <td />}
              <td />
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      {hasAnyEstimated && (
        <div className="px-4 py-2 border-t border-gb-border bg-yellow-50 text-xs text-yellow-700">
          * Sin costo de compra en cartola. Seleccione antiguedad aproximada o ingrese la fecha exacta de compra para calcular la ganancia con el valor cuota real de ese dia.
        </div>
      )}
    </div>
  );
}
