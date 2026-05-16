// components/tax/TaxSimulator.tsx
"use client";

import { useState, useCallback, useEffect } from "react";
import { AlertTriangle, Info, Loader, CheckCircle2 } from "lucide-react";
import type {
  TaxSimulatorInputs,
  ScenarioResult,
  TaxableHolding,
} from "@/lib/tax/types";
import { RENTABILIDAD_ESPERADA_REAL } from "@/lib/constants/chilean-tax";
import { convertToTaxHoldings } from "@/lib/tax/bridge";
import ScenarioTable from "./ScenarioTable";
import TaxMap from "./TaxMap";
import ActionPlan from "./ActionPlan";

interface Props {
  initialClientId?: string;
}

export default function TaxSimulator({ initialClientId }: Props) {
  const [holdings, setHoldings] = useState<TaxableHolding[]>([]);
  const [clientName, setClientName] = useState<string>("");
  const [clientId, setClientId] = useState<string>(initialClientId || "");
  const [loaded, setLoaded] = useState(false);
  const [bridgeLoading, setBridgeLoading] = useState(false);
  const [bridgeError, setBridgeError] = useState<string | null>(null);

  // Load holdings: try sessionStorage first, then fetch via API if clientId provided
  useEffect(() => {
    // 1. Try sessionStorage (set by RadiografiaCartola "Ver simulador completo" button)
    try {
      const stored = sessionStorage.getItem("tax-simulator-holdings");
      if (stored) {
        const parsed = JSON.parse(stored);
        const taxHoldings = convertToTaxHoldings(
          parsed.rawHoldings || [],
          parsed.xrayHoldings || [],
          parsed.ufValue || 38000,
          {
            usdRate: parsed.usdRate || 0,
            proposalMap: parsed.proposal,
            quotes: parsed.quotes,
          },
        );
        if (taxHoldings.length > 0) {
          setHoldings(taxHoldings);
          if (parsed.clientName) setClientName(parsed.clientName);
          if (parsed.clientId) setClientId(parsed.clientId);
          setLoaded(true);
          sessionStorage.removeItem("tax-simulator-holdings");
          return;
        }
      }
    } catch (err) {
      console.error("TaxSimulator: sessionStorage read error:", err);
    }

    // 2. If clientId available, fetch snapshot + xray from API
    const cid = initialClientId;
    if (cid) {
      loadFromClient(cid);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialClientId]);

  async function loadFromClient(cid: string) {
    setBridgeLoading(true);
    setBridgeError(null);

    try {
      // Fetch latest snapshot for this client
      const segRes = await fetch(`/api/clients/${cid}/seguimiento?period=ALL&limit=100`);
      if (!segRes.ok) throw new Error("Error cargando datos del cliente");
      const segData = await segRes.json();

      if (!segData.success || !segData.data?.snapshots?.length) {
        setBridgeError("No hay cartola cargada para este cliente.");
        setBridgeLoading(false);
        return;
      }

      // Get latest snapshot with holdings
      const snapshots = segData.data.snapshots;
      const latest = snapshots[snapshots.length - 1];
      const rawHoldings = latest.holdings;

      if (!rawHoldings || rawHoldings.length === 0) {
        setBridgeError("El snapshot mas reciente no tiene posiciones.");
        setBridgeLoading(false);
        return;
      }

      // Set client name
      const client = segData.data.client;
      if (client) {
        setClientName(`${client.nombre} ${client.apellido}`);
      }

      // Fetch exchange rates (UF + USD)
      let ufValue = 38000;
      let usdRate = 0;
      try {
        const ufRes = await fetch("/api/exchange-rates");
        const ufData = await ufRes.json();
        if (ufData.success) {
          if (ufData.uf) ufValue = ufData.uf;
          if (ufData.usd) usdRate = ufData.usd;
        }
      } catch { /* use fallback */ }

      // Run xray to get tax regime info
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let xrayHoldings: any[] = [];
      try {
        const xrayRes = await fetch("/api/portfolio/xray", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ holdings: rawHoldings }),
        });
        if (xrayRes.ok) {
          const xrayData = await xrayRes.json();
          xrayHoldings = xrayData.holdings || [];
        }
      } catch {
        console.warn("TaxSimulator: xray failed, using general regime for all holdings");
      }

      // Fetch historical quotes for cost estimation (funds without costBasis)
      let quotes: Record<string, { today: number | null; prices: { years: number; price: number | null; date: string }[] }> = {};
      const fundsNeedingQuotes = rawHoldings
        .filter((h: { costBasis?: number; securityId?: string; serie?: string }) =>
          !h.costBasis && h.securityId && h.serie
        )
        .map((h: { securityId: string; serie: string }) => ({
          run: parseInt(h.securityId, 10),
          serie: h.serie,
        }))
        .filter((f: { run: number }) => !isNaN(f.run) && f.run > 0);

      if (fundsNeedingQuotes.length > 0) {
        try {
          const qRes = await fetch("/api/tax/historical-quotes", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ funds: fundsNeedingQuotes }),
          });
          if (qRes.ok) {
            const qData = await qRes.json();
            quotes = qData.data?.quotes || {};
          }
        } catch {
          console.warn("TaxSimulator: historical quotes failed, using expected returns fallback");
        }
      }

      // Convert to TaxableHolding[]
      const taxHoldings = convertToTaxHoldings(
        rawHoldings,
        xrayHoldings,
        ufValue,
        { usdRate, quotes },
      );

      if (taxHoldings.length === 0) {
        setBridgeError("No se pudieron convertir las posiciones.");
        setBridgeLoading(false);
        return;
      }

      setHoldings(taxHoldings);
      setClientId(cid);
      setLoaded(true);
    } catch (err) {
      console.error("TaxSimulator: loadFromClient error:", err);
      setBridgeError(err instanceof Error ? err.message : "Error cargando datos");
    } finally {
      setBridgeLoading(false);
    }
  }

  // Derived flags
  const hasConfianzaBaja = holdings.some((h) => h.confianzaBaja);
  const hasArt107 = holdings.some((h) => h.taxRegime === "107");
  const totalValueUF = holdings.reduce((s, h) => s + h.currentValueUF, 0);

  // Input fields
  const [ingresoMensual, setIngresoMensual] = useState(2_000_000);
  const [edad, setEdad] = useState(40);
  const [edadJubilacion, setEdadJubilacion] = useState(65);
  const [apvUsado, setApvUsado] = useState(0);
  const [dcUsado, setDcUsado] = useState(0);
  const [tasaDescuento, setTasaDescuento] = useState(3.5);
  const [habitual, setHabitual] = useState(false);

  // Results state
  const [loading, setLoading] = useState(false);
  const [scenarios, setScenarios] = useState<ScenarioResult[] | null>(null);
  const [recommended, setRecommended] = useState<ScenarioResult | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [report, setReport] = useState<string | null>(null);

  const handleSimulate = useCallback(async () => {
    if (holdings.length === 0) return;
    setLoading(true);
    setScenarios(null);
    setRecommended(null);
    setReport(null);

    try {
      const inputs: TaxSimulatorInputs = {
        clientId,
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
        body: JSON.stringify({ inputs }),
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
  }, [ingresoMensual, edad, edadJubilacion, apvUsado, dcUsado, habitual, tasaDescuento, holdings, clientId]);

  const handleGenerateReport = useCallback(async () => {
    if (!scenarios) return;
    setReportLoading(true);

    try {
      const res = await fetch("/api/tax/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scenarios,
          selectedScenario: recommended?.nombre?.charAt(0) || "D",
          clientName: clientName || undefined,
          totalValueUF,
        }),
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
  }, [scenarios, recommended, clientName, totalValueUF]);

  return (
    <div className="space-y-6">
      {/* Loading from API */}
      {bridgeLoading && (
        <div className="flex items-center gap-3 p-4 bg-gray-50 border border-gb-border rounded-lg">
          <Loader className="w-5 h-5 text-gb-primary animate-spin shrink-0" />
          <div className="text-sm text-gb-gray">
            Cargando posiciones del cliente y analizando regimen tributario...
          </div>
        </div>
      )}

      {/* Bridge error */}
      {bridgeError && (
        <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
          <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div className="text-sm text-red-800">{bridgeError}</div>
        </div>
      )}

      {/* Holdings loaded indicator */}
      {loaded && holdings.length > 0 && (
        <div className="flex items-start gap-3 p-4 bg-green-50 border border-green-200 rounded-lg">
          <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
          <div className="text-sm text-green-800">
            <span className="font-medium">{holdings.length} posiciones cargadas</span>
            {clientName && <> del portafolio de <span className="font-medium">{clientName}</span></>}
            {" — "}valor total {totalValueUF.toFixed(0)} UF.
            {hasConfianzaBaja && (
              <span className="text-yellow-700 ml-1">
                ({holdings.filter(h => h.confianzaBaja).length} sin costo de adquisicion)
              </span>
            )}
          </div>
        </div>
      )}

      {/* No holdings warning */}
      {!loaded && !bridgeLoading && holdings.length === 0 && (
        <div className="flex items-start gap-3 p-4 bg-gray-50 border border-gb-border rounded-lg">
          <Info className="w-5 h-5 text-gb-gray shrink-0 mt-0.5" />
          <div className="text-sm text-gb-gray">
            No hay posiciones cargadas. Para usar el simulador, vaya a{" "}
            <a href="/seguimiento" className="text-gb-primary underline">Seguimiento</a>
            {" "}de un cliente y haga clic en el boton &quot;Simulador Tributario&quot;.
          </div>
        </div>
      )}

      {/* Warning banners */}
      {hasConfianzaBaja && (
        <div className="flex items-start gap-3 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <AlertTriangle className="w-5 h-5 text-yellow-600 shrink-0 mt-0.5" />
          <div className="text-sm text-yellow-800">
            <span className="font-medium">Costo de adquisicion estimado:</span> {holdings.filter(h => h.confianzaBaja).length} fondos
            no tienen costo de compra en la cartola. La ganancia de capital y el impuesto son estimaciones.
            Solicite al cliente los valores de compra originales para mayor precision.
          </div>
        </div>
      )}

      {hasArt107 && (
        <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
          <div className="text-sm text-blue-800">
            <span className="font-medium">Reforma tributaria en discusion:</span> Existe un proyecto de ley
            que podria eliminar el impuesto del 10% sobre ganancias con presencia bursatil (Art. 107).
            Calculos basados en ley vigente (10%).
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
            disabled={loading || holdings.length === 0}
            className="px-6 py-2.5 bg-gb-primary text-white rounded-lg font-medium text-sm hover:bg-gb-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {loading && <Loader className="w-4 h-4 animate-spin" />}
            {loading ? "Simulando..." : "Simular escenarios"}
          </button>
          {holdings.length === 0 && !bridgeLoading && (
            <span className="text-xs text-gb-gray">
              Cargue posiciones desde la Radiografia de un cliente.
            </span>
          )}
        </div>
      </div>

      {/* Tax Map — always show if holdings loaded */}
      {holdings.length > 0 && <TaxMap holdings={holdings} />}

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
