// components/tax/TaxMap.tsx
"use client";

import { useState, useCallback } from "react";
import { Loader, ChevronDown, ChevronUp, Info } from "lucide-react";
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

function fmtCLP(v: number): string {
  return "$" + Math.round(v).toLocaleString("es-CL");
}

function fmtPct(v: number): string {
  return (v * 100).toFixed(1) + "%";
}

export default function TaxMap({ holdings, onHoldingsChange }: Props) {
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
  const [customDates, setCustomDates] = useState<Record<number, string>>({});
  const [dateLoading, setDateLoading] = useState<Record<number, boolean>>({});
  const [expandedRow, setExpandedRow] = useState<number | null>(null);

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
            confianzaBaja: false,
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

  // Computed totals
  const totalValueCLP = holdings.reduce((s, h) => s + h.currentValueCLP, 0);
  const totalValueUF = holdings.reduce((s, h) => s + h.currentValueUF, 0);
  const totalGainsUF = holdings.reduce((s, h) => {
    const cost = h.acquisitionCostUF ?? 0;
    return s + (h.currentValueUF - cost);
  }, 0);
  const totalCostUF = holdings.reduce((s, h) => s + (h.acquisitionCostUF ?? 0), 0);

  // Group by regime for summary
  const regimeSummary: Record<string, { count: number; valueUF: number; gainsUF: number }> = {};
  for (const h of holdings) {
    const key = h.taxRegime;
    if (!regimeSummary[key]) regimeSummary[key] = { count: 0, valueUF: 0, gainsUF: 0 };
    regimeSummary[key].count++;
    regimeSummary[key].valueUF += h.currentValueUF;
    regimeSummary[key].gainsUF += h.currentValueUF - (h.acquisitionCostUF ?? 0);
  }

  // Gains bar max for proportional bars
  const maxGainAbs = Math.max(
    ...holdings.map(h => Math.abs(h.currentValueUF - (h.acquisitionCostUF ?? 0))),
    1
  );

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white rounded-lg border border-gb-border p-3">
          <div className="text-xs text-gb-gray">Valor total</div>
          <div className="text-lg font-semibold text-gb-black tabular-nums">{fmtUF(totalValueUF)} UF</div>
          <div className="text-xs text-gb-gray tabular-nums">{fmtCLP(totalValueCLP)}</div>
        </div>
        <div className="bg-white rounded-lg border border-gb-border p-3">
          <div className="text-xs text-gb-gray">Costo adquisicion (CM)</div>
          <div className="text-lg font-semibold text-gb-black tabular-nums">{fmtUF(totalCostUF)} UF</div>
          <div className="text-[10px] text-gb-gray">Con correccion monetaria (UF compra)</div>
        </div>
        <div className="bg-white rounded-lg border border-gb-border p-3">
          <div className="text-xs text-gb-gray">Ganancia de capital</div>
          <div className={`text-lg font-semibold tabular-nums ${totalGainsUF >= 0 ? "text-green-700" : "text-red-600"}`}>
            {totalGainsUF >= 0 ? "+" : ""}{fmtUF(totalGainsUF)} UF
          </div>
          <div className="text-xs text-gb-gray tabular-nums">
            {totalValueUF > 0 ? fmtPct(totalGainsUF / totalCostUF) : "0%"} rentabilidad
          </div>
        </div>
        <div className="bg-white rounded-lg border border-gb-border p-3">
          <div className="text-xs text-gb-gray">Regimenes</div>
          <div className="flex flex-wrap gap-1 mt-1">
            {Object.entries(regimeSummary).map(([regime, data]) => (
              <span key={regime} className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${REGIME_COLORS[regime] ?? REGIME_COLORS.general}`}>
                {REGIME_LABELS[regime] ?? regime} ({data.count})
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Methodology note */}
      <div className="flex items-start gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg">
        <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
        <div className="text-xs text-blue-800">
          <span className="font-medium">Correccion monetaria:</span> El costo se divide por la UF de la fecha de compra
          (no la de hoy), segun Art. 41 N°8 LIR. Ganancia = Valor/UF<sub>hoy</sub> − Costo/UF<sub>compra</sub>.
          {holdings.some(h => h.acquisitionDate) && " Fechas detectadas automaticamente desde valor cuota historico."}
        </div>
      </div>

      {/* Holdings table */}
      <div className="bg-white rounded-lg border border-gb-border overflow-hidden">
        <div className="px-4 py-3 border-b border-gb-border flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-gb-black">Detalle por posicion</h3>
            <p className="text-xs text-gb-gray mt-0.5">
              Haga clic en una fila para ver el detalle del calculo
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
                <th className="text-right px-4 py-2 font-medium text-gb-gray">Costo (UF)</th>
                <th className="text-center px-4 py-2 font-medium text-gb-gray">Regimen</th>
                <th className="text-right px-4 py-2 font-medium text-gb-gray">Ganancia</th>
                <th className="px-4 py-2 font-medium text-gb-gray w-32">Visual</th>
                {hasAnyEstimated && (
                  <th className="text-center px-4 py-2 font-medium text-gb-gray">Fecha compra</th>
                )}
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {holdings.map((h, i) => {
                const cost = h.acquisitionCostUF ?? 0;
                const gains = h.currentValueUF - cost;
                const gainPct = cost > 0 ? gains / cost : 0;
                const regimeColor = REGIME_COLORS[h.taxRegime] ?? REGIME_COLORS.general;
                const isEstimated = h.confianzaBaja && h.estimatedCosts.length > 0;
                const hasCustomDate = customDates[i] != null;
                const isExpanded = expandedRow === i;
                const barWidth = maxGainAbs > 0 ? Math.abs(gains) / maxGainAbs * 100 : 0;

                return (
                  <>
                    <tr
                      key={`${h.run}-${h.serie}-${i}`}
                      className="border-b border-gb-border last:border-b-0 hover:bg-gray-50 cursor-pointer"
                      onClick={() => setExpandedRow(isExpanded ? null : i)}
                    >
                      <td className="px-4 py-2 text-gb-black">
                        <div className="font-medium">{h.fundName}</div>
                        {h.acquisitionDate && (
                          <div className="text-[10px] text-gb-gray">Compra: {h.acquisitionDate}</div>
                        )}
                        {isEstimated && !hasCustomDate && (
                          <span className="text-[10px] text-yellow-600">costo estimado</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-gb-black">
                        {fmtUF(h.currentValueUF)}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-gb-gray">
                        {fmtUF(cost)}
                      </td>
                      <td className="px-4 py-2 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${regimeColor}`}>
                          {REGIME_LABELS[h.taxRegime] ?? h.taxRegime}
                        </span>
                      </td>
                      <td className={`px-4 py-2 text-right tabular-nums ${
                        gains < 0 ? "text-red-600" : isEstimated && !hasCustomDate ? "text-yellow-700" : "text-green-700"
                      }`}>
                        <div>{gains >= 0 ? "+" : ""}{fmtUF(gains)}</div>
                        <div className="text-[10px] text-gb-gray">{fmtPct(gainPct)}</div>
                        {dateLoading[i] && <Loader className="w-3 h-3 inline ml-1 animate-spin text-gb-gray" />}
                      </td>
                      <td className="px-4 py-2">
                        <div className="w-full h-3 bg-gray-100 rounded overflow-hidden">
                          <div
                            className={`h-full rounded ${gains >= 0 ? "bg-green-400" : "bg-red-400"}`}
                            style={{ width: `${barWidth}%` }}
                          />
                        </div>
                      </td>
                      {hasAnyEstimated && (
                        <td className="px-4 py-2 text-center">
                          {isEstimated || hasCustomDate ? (
                            <div className="flex flex-col items-center gap-1" onClick={(e) => e.stopPropagation()}>
                              <select
                                value={hasCustomDate ? "custom" : (selectedYears[i] ?? 2)}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  if (val === "custom") return;
                                  applyYearsSelection(i, Number(val));
                                }}
                                className="text-xs border border-yellow-300 bg-yellow-50 rounded px-1.5 py-0.5 text-yellow-800 focus:outline-none focus:ring-1 focus:ring-yellow-400"
                              >
                                {h.estimatedCosts.map(est => (
                                  <option key={est.years} value={est.years}>
                                    ~{est.years}Y → {fmtUF(est.gainsUF)} UF
                                  </option>
                                ))}
                                <option value="custom">Fecha exacta...</option>
                              </select>
                              <input
                                type="date"
                                value={customDates[i] || ""}
                                onChange={(e) => {
                                  if (e.target.value) lookupExactDate(i, e.target.value);
                                }}
                                max={new Date().toISOString().split("T")[0]}
                                min="2010-01-01"
                                className="text-[10px] border border-gb-border rounded px-1 py-0.5 w-[120px] text-gb-black focus:outline-none focus:ring-1 focus:ring-gb-primary/30"
                              />
                            </div>
                          ) : (
                            <span className="text-xs text-green-600">cartola</span>
                          )}
                        </td>
                      )}
                      <td className="px-2 py-2 text-gb-gray">
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr key={`detail-${i}`} className="border-b border-gb-border bg-gray-50/50">
                        <td colSpan={hasAnyEstimated ? 8 : 7} className="px-4 py-3">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                            <div>
                              <div className="text-gb-gray font-medium mb-1">Valor actual</div>
                              <div className="tabular-nums">{fmtCLP(h.currentValueCLP)}</div>
                              <div className="tabular-nums text-gb-gray">{fmtUF(h.currentValueUF)} UF</div>
                              <div className="text-gb-gray">{h.quantity?.toLocaleString("es-CL")} cuotas</div>
                            </div>
                            <div>
                              <div className="text-gb-gray font-medium mb-1">Costo adquisicion</div>
                              {h.acquisitionCostUF != null ? (
                                <>
                                  <div className="tabular-nums">{fmtUF(h.acquisitionCostUF)} UF</div>
                                  {h.ufAtPurchase && (
                                    <div className="text-gb-gray">UF compra: {h.ufAtPurchase.toLocaleString("es-CL", { maximumFractionDigits: 2 })}</div>
                                  )}
                                  {h.confianzaBaja ? (
                                    <div className="text-yellow-600">Estimado (sin dato cartola)</div>
                                  ) : (
                                    <div className="text-green-600">Dato de cartola</div>
                                  )}
                                </>
                              ) : (
                                <div className="text-yellow-600">No disponible</div>
                              )}
                            </div>
                            <div>
                              <div className="text-gb-gray font-medium mb-1">Correccion monetaria</div>
                              {h.ufAtPurchase ? (
                                <>
                                  <div className="tabular-nums">
                                    UF compra: {h.ufAtPurchase.toLocaleString("es-CL", { maximumFractionDigits: 2 })}
                                  </div>
                                  <div className="text-gb-gray">
                                    Costo / UF<sub>compra</sub> = {h.acquisitionCostUF != null ? fmtUF(h.acquisitionCostUF) : "-"} UF
                                  </div>
                                  <div className="text-gb-gray">
                                    Valor / UF<sub>hoy</sub> = {fmtUF(h.currentValueUF)} UF
                                  </div>
                                </>
                              ) : (
                                <div className="text-gb-gray">Sin datos de UF</div>
                              )}
                            </div>
                            <div>
                              <div className="text-gb-gray font-medium mb-1">Regimen tributario</div>
                              <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${regimeColor}`}>
                                {REGIME_LABELS[h.taxRegime] ?? h.taxRegime}
                              </span>
                              <div className="mt-1 text-gb-gray">
                                {h.taxRegime === "107" && "10% unico sobre ganancia"}
                                {h.taxRegime === "apv" && "Exento (APV)"}
                                {h.taxRegime === "108" && "Traspaso diferido"}
                                {h.taxRegime === "general" && "Global Complementario / 1a cat."}
                              </div>
                              <div className="mt-1 text-gb-gray">
                                MLT: {h.canMLT ? "Si" : "No"} · DCV: {h.canDCV ? "Si" : "No"}
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gb-border bg-gray-50 font-medium">
                <td className="px-4 py-2 text-gb-black">Total ({holdings.length} posiciones)</td>
                <td className="px-4 py-2 text-right tabular-nums text-gb-black">{fmtUF(totalValueUF)}</td>
                <td className="px-4 py-2 text-right tabular-nums text-gb-gray">{fmtUF(totalCostUF)}</td>
                <td />
                <td className={`px-4 py-2 text-right tabular-nums ${totalGainsUF < 0 ? "text-red-600" : "text-green-700"}`}>
                  {totalGainsUF >= 0 ? "+" : ""}{fmtUF(totalGainsUF)}
                </td>
                <td />
                {hasAnyEstimated && <td />}
                <td />
              </tr>
            </tfoot>
          </table>
        </div>

        {hasAnyEstimated && (
          <div className="px-4 py-2 border-t border-gb-border bg-yellow-50 text-xs text-yellow-700">
            Posiciones marcadas como &quot;costo estimado&quot; no tienen costo de compra en la cartola. Seleccione antiguedad aproximada o ingrese la fecha exacta.
          </div>
        )}
      </div>

      {/* Regime breakdown */}
      <div className="bg-white rounded-lg border border-gb-border p-4">
        <h4 className="text-sm font-semibold text-gb-black mb-3">Ganancia por regimen tributario</h4>
        <div className="space-y-2">
          {Object.entries(regimeSummary)
            .sort((a, b) => b[1].gainsUF - a[1].gainsUF)
            .map(([regime, data]) => {
              const pct = totalValueUF > 0 ? data.valueUF / totalValueUF : 0;
              return (
                <div key={regime} className="flex items-center gap-3">
                  <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium w-28 text-center ${REGIME_COLORS[regime] ?? REGIME_COLORS.general}`}>
                    {REGIME_LABELS[regime] ?? regime}
                  </span>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-5 bg-gray-100 rounded overflow-hidden">
                        <div
                          className={`h-full rounded ${data.gainsUF >= 0 ? "bg-green-300" : "bg-red-300"}`}
                          style={{ width: `${pct * 100}%` }}
                        />
                      </div>
                      <span className="text-xs text-gb-gray tabular-nums w-12 text-right">{fmtPct(pct)}</span>
                    </div>
                  </div>
                  <span className={`text-xs tabular-nums w-24 text-right font-medium ${data.gainsUF >= 0 ? "text-green-700" : "text-red-600"}`}>
                    {data.gainsUF >= 0 ? "+" : ""}{fmtUF(data.gainsUF)} UF
                  </span>
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
}
