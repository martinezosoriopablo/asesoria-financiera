// components/tax/ActionPlan.tsx
"use client";

import type { ScenarioResult } from "@/lib/tax/types";

interface Props {
  scenario: ScenarioResult;
}

function fmtUF(v: number): string {
  return v.toLocaleString("es-CL", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

export default function ActionPlan({ scenario }: Props) {
  const { planAnual } = scenario;

  if (!planAnual || planAnual.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gb-border p-6 text-center text-gb-gray text-sm">
        No hay plan de accion disponible para este escenario.
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gb-border overflow-hidden">
      <div className="px-4 py-3 border-b border-gb-border">
        <h3 className="font-semibold text-gb-black">
          Plan de accion: {scenario.nombre}
        </h3>
        <p className="text-xs text-gb-gray mt-0.5">{scenario.descripcion}</p>
      </div>

      <div className="px-4 py-4">
        <div className="relative">
          {planAnual.map((year, idx) => {
            const isLast = idx === planAnual.length - 1;

            return (
              <div key={year.ano} className="relative flex gap-4">
                {/* Timeline connector */}
                <div className="flex flex-col items-center">
                  <div className="w-8 h-8 rounded-full bg-gb-primary text-white flex items-center justify-center text-xs font-semibold shrink-0">
                    {year.ano}
                  </div>
                  {!isLast && (
                    <div className="w-0.5 bg-gray-200 flex-1 min-h-[16px]" />
                  )}
                </div>

                {/* Year content */}
                <div className={`pb-6 flex-1 ${isLast ? "" : ""}`}>
                  <div className="space-y-1.5">
                    {/* MLT movements */}
                    {year.fondosMLT.map((m, i) => (
                      <div key={`mlt-${i}`} className="text-sm text-purple-700">
                        MLT: {m.fundName} → {m.destinoFund}
                        {m.comisionRescateUF > 0 && (
                          <span className="text-xs text-gb-gray ml-1">
                            (comision: {fmtUF(m.comisionRescateUF)} UF)
                          </span>
                        )}
                      </div>
                    ))}

                    {/* Loss harvesting */}
                    {year.fondosConPerdida.map((f, i) => (
                      <div key={`loss-${i}`} className="text-sm text-red-600">
                        Venta con perdida: {f.fundName} ({fmtUF(f.perdidaUF)} UF)
                      </div>
                    ))}

                    {/* Regular sales */}
                    {year.fondosAVender.map((f, i) => (
                      <div key={`sell-${i}`} className="text-sm text-gb-black">
                        Venta: {f.fundName} ({f.porcentaje}%)
                        {f.impuestoUF > 0 && (
                          <span className="text-gb-gray ml-1">
                            — impuesto: {fmtUF(f.impuestoUF)} UF
                          </span>
                        )}
                      </div>
                    ))}

                    {/* APV/DC contributions */}
                    {(year.mitigacion.aporteAPV_UF > 0 ||
                      year.mitigacion.aporteDC_UF > 0) && (
                      <div className="text-sm text-green-700">
                        {year.mitigacion.aporteAPV_UF > 0 && (
                          <span>
                            APV Reg. {year.mitigacion.regimenAPV}:{" "}
                            {fmtUF(year.mitigacion.aporteAPV_UF)} UF
                            <span className="text-xs text-gb-gray ml-1">
                              (ahorro: {fmtUF(year.mitigacion.ahorroTributarioAPV_UF)} UF)
                            </span>
                          </span>
                        )}
                        {year.mitigacion.aporteAPV_UF > 0 &&
                          year.mitigacion.aporteDC_UF > 0 && <span> | </span>}
                        {year.mitigacion.aporteDC_UF > 0 && (
                          <span>
                            DC: {fmtUF(year.mitigacion.aporteDC_UF)} UF
                            <span className="text-xs text-gb-gray ml-1">
                              (ahorro: {fmtUF(year.mitigacion.ahorroTributarioDC_UF)} UF)
                            </span>
                          </span>
                        )}
                      </div>
                    )}

                    {/* Loss compensation */}
                    {year.compensacionPerdidas_UF > 0 && (
                      <div className="text-xs text-gb-gray">
                        Compensacion de perdidas: {fmtUF(year.compensacionPerdidas_UF)} UF
                      </div>
                    )}

                    {/* Art 17 N8 exemption */}
                    {year.exencion17N8_UF > 0 && (
                      <div className="text-xs text-gb-gray">
                        Exencion 17 N8: {fmtUF(year.exencion17N8_UF)} UF
                      </div>
                    )}

                    {/* Summary line */}
                    <div className="text-xs text-gb-gray border-t border-dashed border-gray-200 pt-1 mt-1">
                      Tramo: {year.tramoResultante}% | Impuesto neto:{" "}
                      {fmtUF(year.mitigacion.impuestoNeto_UF)} UF
                      {year.alphaGanado_UF > 0 && (
                        <span> | Alpha: +{fmtUF(year.alphaGanado_UF)} UF</span>
                      )}
                    </div>

                    {/* Empty year fallback */}
                    {year.fondosMLT.length === 0 &&
                      year.fondosConPerdida.length === 0 &&
                      year.fondosAVender.length === 0 &&
                      year.mitigacion.aporteAPV_UF === 0 &&
                      year.mitigacion.aporteDC_UF === 0 && (
                        <div className="text-sm text-gb-gray italic">
                          Sin movimientos planificados
                        </div>
                      )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
