// components/tax/TaxSimulator.tsx
"use client";

import { useState, useCallback } from "react";
import { AlertTriangle, Info, Loader } from "lucide-react";
import type {
  TaxSimulatorInputs,
  ScenarioResult,
  TaxableHolding,
} from "@/lib/tax/types";
import { RENTABILIDAD_ESPERADA_REAL } from "@/lib/constants/chilean-tax";
import ScenarioTable from "./ScenarioTable";
import TaxMap from "./TaxMap";
import ActionPlan from "./ActionPlan";

export default function TaxSimulator() {
  // Holdings — v1: empty array, future: populated from cartola
  const [holdings] = useState<TaxableHolding[]>([]);

  // Derived flags
  const hasConfianzaBaja = holdings.some((h) => h.confianzaBaja);
  const hasArt107 = holdings.some((h) => h.taxRegime === "107");

  // Input fields
  const [ingresoMensual, setIngresoMensual] = useState(2_000_000);
  const [edad, setEdad] = useState(40);
  const [edadJubilacion, setEdadJubilacion] = useState(65);
  const [apvUsado, setApvUsado] = useState(0);
  const [dcUsado, setDcUsado] = useState(0);
  const [tasaDescuento, setTasaDescuento] = useState(3);
  const [habitual, setHabitual] = useState(false);

  // Results state
  const [loading, setLoading] = useState(false);
  const [scenarios, setScenarios] = useState<ScenarioResult[] | null>(null);
  const [recommended, setRecommended] = useState<ScenarioResult | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [report, setReport] = useState<string | null>(null);

  const handleSimulate = useCallback(async () => {
    setLoading(true);
    setScenarios(null);
    setRecommended(null);
    setReport(null);

    try {
      const inputs: TaxSimulatorInputs = {
        clientId: "",
        ingresoMensualCLP: ingresoMensual,
        edad,
        edadJubilacion,
        apvUsadoEsteAno: apvUsado,
        dcUsadoEsteAno: dcUsado,
        esInversionistaHabitual: habitual,
        tasaDescuentoReal: tasaDescuento / 100,
        rentabilidadesEsperadas: { ...RENTABILIDAD_ESPERADA_REAL },
        holdings,
        perfilRiesgo: "moderado",
        puntajeRiesgo: 50,
      };

      const res = await fetch("/api/tax/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(inputs),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Error desconocido" }));
        throw new Error(err.error || "Error en simulacion");
      }

      const data = await res.json();
      const scenarioList: ScenarioResult[] = data.scenarios ?? [];
      setScenarios(scenarioList);
      setRecommended(scenarioList.find((s) => s.recomendado) ?? null);
    } catch (err) {
      console.error("Simulate error:", err);
      alert(err instanceof Error ? err.message : "Error en simulacion");
    } finally {
      setLoading(false);
    }
  }, [ingresoMensual, edad, edadJubilacion, apvUsado, dcUsado, habitual, tasaDescuento, holdings]);

  const handleGenerateReport = useCallback(async () => {
    if (!scenarios) return;
    setReportLoading(true);

    try {
      const res = await fetch("/api/tax/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenarios, holdings }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Error desconocido" }));
        throw new Error(err.error || "Error generando reporte");
      }

      const data = await res.json();
      setReport(data.report ?? "");
    } catch (err) {
      console.error("Report error:", err);
      alert(err instanceof Error ? err.message : "Error generando reporte");
    } finally {
      setReportLoading(false);
    }
  }, [scenarios, holdings]);

  return (
    <div className="space-y-6">
      {/* Warning banners */}
      {hasConfianzaBaja && (
        <div className="flex items-start gap-3 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <AlertTriangle className="w-5 h-5 text-yellow-600 shrink-0 mt-0.5" />
          <div className="text-sm text-yellow-800">
            <span className="font-medium">Datos estimados:</span> Algunos holdings tienen
            informacion tributaria con baja confianza. Los resultados pueden ser imprecisos.
            Verifique con la informacion del cliente.
          </div>
        </div>
      )}

      {hasArt107 && (
        <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
          <div className="text-sm text-blue-800">
            <span className="font-medium">Art. 107 detectado:</span> Algunos fondos
            califican bajo Art. 107 LIR (tasa unica 10%). El simulador considera este
            regimen especial en los calculos.
          </div>
        </div>
      )}

      {/* Input panel */}
      <div className="bg-white rounded-lg border border-gb-border p-6">
        <h3 className="font-semibold text-gb-black mb-4">Parametros del cliente</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-medium text-gb-gray mb-1">
              Ingreso mensual (CLP)
            </label>
            <input
              type="number"
              value={ingresoMensual}
              onChange={(e) => setIngresoMensual(Number(e.target.value))}
              className="w-full border border-gb-border rounded-md px-3 py-2 text-sm text-gb-black focus:outline-none focus:ring-2 focus:ring-gb-primary/30 focus:border-gb-primary"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gb-gray mb-1">Edad</label>
            <input
              type="number"
              value={edad}
              onChange={(e) => setEdad(Number(e.target.value))}
              min={18}
              max={100}
              className="w-full border border-gb-border rounded-md px-3 py-2 text-sm text-gb-black focus:outline-none focus:ring-2 focus:ring-gb-primary/30 focus:border-gb-primary"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gb-gray mb-1">
              Edad jubilacion
            </label>
            <input
              type="number"
              value={edadJubilacion}
              onChange={(e) => setEdadJubilacion(Number(e.target.value))}
              min={50}
              max={100}
              className="w-full border border-gb-border rounded-md px-3 py-2 text-sm text-gb-black focus:outline-none focus:ring-2 focus:ring-gb-primary/30 focus:border-gb-primary"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gb-gray mb-1">
              APV usado este ano (UF)
            </label>
            <input
              type="number"
              value={apvUsado}
              onChange={(e) => setApvUsado(Number(e.target.value))}
              min={0}
              className="w-full border border-gb-border rounded-md px-3 py-2 text-sm text-gb-black focus:outline-none focus:ring-2 focus:ring-gb-primary/30 focus:border-gb-primary"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gb-gray mb-1">
              DC usado este ano (UF)
            </label>
            <input
              type="number"
              value={dcUsado}
              onChange={(e) => setDcUsado(Number(e.target.value))}
              min={0}
              className="w-full border border-gb-border rounded-md px-3 py-2 text-sm text-gb-black focus:outline-none focus:ring-2 focus:ring-gb-primary/30 focus:border-gb-primary"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gb-gray mb-1">
              Tasa descuento real (%)
            </label>
            <input
              type="number"
              value={tasaDescuento}
              onChange={(e) => setTasaDescuento(Number(e.target.value))}
              min={0}
              max={20}
              step={0.5}
              className="w-full border border-gb-border rounded-md px-3 py-2 text-sm text-gb-black focus:outline-none focus:ring-2 focus:ring-gb-primary/30 focus:border-gb-primary"
            />
          </div>

          <div className="flex items-end">
            <label className="flex items-center gap-2 cursor-pointer py-2">
              <input
                type="checkbox"
                checked={habitual}
                onChange={(e) => setHabitual(e.target.checked)}
                className="w-4 h-4 rounded border-gb-border text-gb-primary focus:ring-gb-primary/30"
              />
              <span className="text-sm text-gb-black">Inversionista habitual</span>
            </label>
          </div>
        </div>

        <div className="mt-6 flex items-center gap-3">
          <button
            onClick={handleSimulate}
            disabled={loading}
            className="px-6 py-2.5 bg-gb-primary text-white rounded-lg font-medium text-sm hover:bg-gb-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {loading && <Loader className="w-4 h-4 animate-spin" />}
            {loading ? "Simulando..." : "Simular escenarios"}
          </button>
          <span className="text-xs text-gb-gray">
            Los holdings se populan automaticamente desde la cartola del cliente.
          </span>
        </div>
      </div>

      {/* Tax Map */}
      <TaxMap holdings={holdings} />

      {/* Results */}
      {scenarios && scenarios.length > 0 && (
        <>
          <ScenarioTable scenarios={scenarios} />

          {recommended && <ActionPlan scenario={recommended} />}

          {/* Report generation */}
          <div className="bg-white rounded-lg border border-gb-border p-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-gb-black">Reporte para el cliente</h3>
                <p className="text-xs text-gb-gray mt-0.5">
                  Genera un resumen ejecutivo con la estrategia recomendada
                </p>
              </div>
              <button
                onClick={handleGenerateReport}
                disabled={reportLoading}
                className="px-5 py-2 bg-gb-primary text-white rounded-lg font-medium text-sm hover:bg-gb-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {reportLoading && <Loader className="w-4 h-4 animate-spin" />}
                {reportLoading ? "Generando..." : "Generar reporte"}
              </button>
            </div>

            {report && (
              <div className="mt-4 p-4 bg-gb-light rounded-lg border border-gb-border">
                <div className="prose prose-sm max-w-none text-gb-black whitespace-pre-wrap">
                  {report}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
