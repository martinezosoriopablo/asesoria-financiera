"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAdvisor } from "@/lib/hooks/useAdvisor";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { getBenchmarkFromScore, type AssetAllocation } from "@/lib/risk/benchmarks";
import {
  Loader,
  Send,
  CheckCircle,
  Shield,
  TrendingUp,
  AlertTriangle,
  Layers,
  ArrowRight,
} from "lucide-react";
import ClientSelector, { type ClientOption } from "@/components/shared/ClientSelector";

interface ClientRiskProfile {
  id: string;
  nombre: string;
  apellido: string;
  email: string;
  perfil_riesgo: string;
  puntaje_riesgo: number;
}

interface SnapshotHolding {
  fundName?: string;
  nombre?: string;
  ticker?: string;
  securityId?: string;  // fo_run (matched by seguimiento)
  serie?: string;       // fm_serie (matched by seguimiento)
  marketValue?: number;
  quantity?: number;
  marketPrice?: number;
  costBasis?: number;
  assetClass?: string;
  currency?: string;
  market?: string;
  tipo?: string;
  fo_run?: number;
  [key: string]: unknown;
}

interface FichaData {
  tac_serie?: number | null;
  nombre_fondo_pdf?: string | null;
  rent_1m?: number | null;
  rent_3m?: number | null;
  rent_6m?: number | null;
  rent_12m?: number | null;
  horizonte_inversion?: string | null;
  tolerancia_riesgo?: string | null;
  objetivo?: string | null;
  rescatable?: boolean | null;
  plazo_rescate?: string | null;
}

interface FondoData {
  nombre_fondo?: string;
  nombre_agf?: string;
  familia_estudios?: string;
  clase_inversionista?: string;
  tac_sintetica?: number | null;
  rent_30d_nominal?: number | null;
  rent_3m_nominal?: number | null;
  rent_12m_nominal?: number | null;
  pat_total?: number | null;
}

interface FichaEntry {
  ficha: FichaData | null;
  fondo: FondoData | null;
}

interface InitialSnapshot {
  id: string;
  snapshot_date: string;
  total_value: number;
  equity_percent: number;
  fixed_income_percent: number;
  alternatives_percent: number;
  cash_percent: number;
  equity_value: number;
  fixed_income_value: number;
  alternatives_value: number;
  cash_value: number;
  holdings: SnapshotHolding[] | null;
  source: string;
  created_at: string;
}

const ASSET_CLASS_LABELS: Record<string, string> = {
  RV: "Renta Variable",
  RF: "Renta Fija",
  Alternativo: "Alternativos",
  Cash: "Liquidez / MM",
};

const ASSET_CLASS_COLORS: Record<string, string> = {
  RV: "#6366f1",
  RF: "#64748b",
  Alternativo: "#8b5cf6",
  Cash: "#14b8a6",
};

const COLORS = ["#6366f1", "#14b8a6", "#64748b", "#8b5cf6", "#0d9488", "#475569"];

function AnalisisCartolaContent() {
  const { advisor } = useAdvisor();
  const searchParams = useSearchParams();
  const clientEmailParam = searchParams.get("client") || "";

  const [email, setEmail] = useState(clientEmailParam);
  const [sendingQuestionnaire, setSendingQuestionnaire] = useState(false);
  const [questionnaireSent, setQuestionnaireSent] = useState(false);

  // Client profile
  const [clientProfile, setClientProfile] = useState<ClientRiskProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [recommendedAllocation, setRecommendedAllocation] = useState<AssetAllocation | null>(null);

  // Initial snapshot from seguimiento
  const [snapshot, setSnapshot] = useState<InitialSnapshot | null>(null);
  const [loadingPortfolio, setLoadingPortfolio] = useState(false);

  // Fichas data for enriching holdings
  const [fichasMap, setFichasMap] = useState<Record<number, FichaEntry>>({});

  // Fetch client profile when email changes
  useEffect(() => {
    async function fetchFichas(holdingsList: SnapshotHolding[]) {
      const holdingsForApi: { run: number; serie?: string }[] = [];
      const seen = new Set<number>();
      for (const h of holdingsList) {
        const run = h.fo_run || (h.securityId ? parseInt(h.securityId) : NaN);
        if (!isNaN(run) && run > 0 && !seen.has(run)) {
          seen.add(run);
          holdingsForApi.push({ run, serie: h.serie || undefined });
        }
      }
      if (holdingsForApi.length === 0) {
        setFichasMap({});
        return;
      }
      try {
        const res = await fetch("/api/fondos/fichas-batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ holdings: holdingsForApi }),
        });
        const data = await res.json();
        if (data.success) {
          setFichasMap(data.fichas || {});
        }
      } catch (error) {
        console.error("Error fetching fichas:", error);
      }
    }

    async function fetchInitialSnapshot(clientId: string) {
      setLoadingPortfolio(true);
      try {
        const res = await fetch(`/api/clients/${clientId}/seguimiento?period=ALL`);
        const data = await res.json();
        if (data.success && data.data?.snapshots?.length > 0) {
          const snapshots = data.data.snapshots;
          const cartolaSnap = snapshots.find((s: InitialSnapshot) => s.source !== "api-prices") || snapshots[0];
          setSnapshot(cartolaSnap);
          await fetchFichas(cartolaSnap.holdings || []);
        } else {
          setSnapshot(null);
          setFichasMap({});
        }
      } catch (error) {
        console.error("Error fetching snapshot:", error);
        setSnapshot(null);
      } finally {
        setLoadingPortfolio(false);
      }
    }

    async function fetchClientProfile() {
      if (!email || !email.includes("@")) {
        setClientProfile(null);
        setRecommendedAllocation(null);
        setSnapshot(null);
        return;
      }

      setLoadingProfile(true);
      try {
        const res = await fetch(`/api/clients?search=${encodeURIComponent(email)}`);
        const data = await res.json();

        if (data.success && data.clients.length > 0) {
          const client = data.clients.find((c: ClientRiskProfile) => c.email === email);
          if (client) {
            setClientProfile(client);
            if (client.puntaje_riesgo) {
              const allocation = getBenchmarkFromScore(client.puntaje_riesgo, true, "global");
              setRecommendedAllocation(allocation);
            } else {
              setRecommendedAllocation(null);
            }
            // Fetch initial snapshot from seguimiento
            await fetchInitialSnapshot(client.id);
          } else {
            setClientProfile(null);
            setRecommendedAllocation(null);
            setSnapshot(null);
          }
        } else {
          setClientProfile(null);
          setRecommendedAllocation(null);
          setSnapshot(null);
        }
      } catch (error) {
        console.error("Error fetching client profile:", error);
        setClientProfile(null);
        setRecommendedAllocation(null);
      } finally {
        setLoadingProfile(false);
      }
    }

    const debounce = setTimeout(fetchClientProfile, 500);
    return () => clearTimeout(debounce);
  }, [email]);

  async function sendQuestionnaire() {
    if (!email) return;
    setSendingQuestionnaire(true);
    setQuestionnaireSent(false);
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      const res = await fetch("/api/send-questionnaire", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          clientName: clientProfile ? `${clientProfile.nombre} ${clientProfile.apellido}` : undefined,
          advisorEmail: advisor?.email,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const data = await res.json();
      if (!res.ok) {
        alert("Error enviando cuestionario: " + (data.error || res.status));
        return;
      }
      setQuestionnaireSent(true);
    } catch (err) {
      console.error("Error sending questionnaire:", err);
      alert("Error al enviar cuestionario");
    } finally {
      setSendingQuestionnaire(false);
    }
  }

  // Composition from snapshot (already classified by seguimiento)
  const holdings = (snapshot?.holdings || []) as SnapshotHolding[];
  const composition = (() => {
    if (!snapshot) return null;

    // Use the pre-calculated percentages from the snapshot
    const byClass: Record<string, { value: number; percent: number; count: number }> = {};

    if (snapshot.equity_value > 0 || snapshot.equity_percent > 0) {
      byClass["RV"] = { value: snapshot.equity_value, percent: snapshot.equity_percent, count: 0 };
    }
    if (snapshot.fixed_income_value > 0 || snapshot.fixed_income_percent > 0) {
      byClass["RF"] = { value: snapshot.fixed_income_value, percent: snapshot.fixed_income_percent, count: 0 };
    }
    if (snapshot.alternatives_value > 0 || snapshot.alternatives_percent > 0) {
      byClass["Alternativo"] = { value: snapshot.alternatives_value, percent: snapshot.alternatives_percent, count: 0 };
    }
    if (snapshot.cash_value > 0 || snapshot.cash_percent > 0) {
      byClass["Cash"] = { value: snapshot.cash_value, percent: snapshot.cash_percent, count: 0 };
    }

    // Count holdings per class
    for (const h of holdings) {
      const cls = h.assetClass === "Fixed Income" || h.assetClass === "RF" ? "RF"
        : h.assetClass === "Cash" ? "Cash"
        : h.assetClass === "Alternativo" || h.assetClass === "Alternative" ? "Alternativo"
        : "RV";
      if (byClass[cls]) byClass[cls].count += 1;
    }

    return { totalValue: snapshot.total_value, byClass };
  })();

  const assetClassData = composition
    ? Object.entries(composition.byClass).map(([name, d]) => ({
        name: ASSET_CLASS_LABELS[name] || name,
        key: name,
        value: Math.round(d.value * 100) / 100,
        percent: Math.round(d.percent * 10) / 10,
      }))
    : [];

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-5 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-gb-black">Cartola & Perfil de Riesgo</h1>
          <p className="text-sm text-gb-gray mt-0.5">
            Analiza la cartola inicial del cliente y compara con su perfil de riesgo ideal
          </p>
        </div>

        {/* Client selector + questionnaire */}
        <div className="bg-white rounded-lg border border-gb-border border-l-4 border-l-blue-500 p-5 mb-6 shadow-sm">
          <h2 className="text-sm font-semibold text-gb-black mb-3">Cliente</h2>
          <div className="flex items-center gap-3">
            <ClientSelector
              value={clientProfile?.id || null}
              onChange={(client: ClientOption | null) => {
                if (client) {
                  setEmail(client.email);
                  setQuestionnaireSent(false);
                } else {
                  setEmail("");
                  setClientProfile(null);
                  setRecommendedAllocation(null);
                  setSnapshot(null);
                }
              }}
              placeholder="Seleccionar cliente..."
              className="flex-1 max-w-sm"
              showRiskProfile={true}
            />
            {loadingProfile && <Loader className="w-4 h-4 animate-spin text-blue-500" />}
            <button
              onClick={sendQuestionnaire}
              disabled={!email || sendingQuestionnaire}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-gb-primary text-white rounded-md hover:bg-gb-primary-dark disabled:opacity-40 transition-colors"
            >
              {sendingQuestionnaire ? (
                <Loader className="w-4 h-4 animate-spin" />
              ) : questionnaireSent ? (
                <CheckCircle className="w-4 h-4" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              {questionnaireSent ? "Enviado" : "Enviar Cuestionario"}
            </button>
          </div>
        </div>

        {/* Risk Profile */}
        {clientProfile && recommendedAllocation && (
          <div className="bg-white rounded-lg border border-gb-border border-l-4 border-l-indigo-500 p-5 mb-6 shadow-sm">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-sm font-semibold text-gb-black flex items-center gap-2">
                  <Shield className="w-4 h-4 text-indigo-500" />
                  Perfil de Riesgo
                </h2>
                <p className="text-xs text-gb-gray mt-1">
                  {clientProfile.nombre} {clientProfile.apellido}
                </p>
              </div>
              <div className="text-right">
                <span className="inline-block px-3 py-1 bg-indigo-50 text-indigo-700 rounded-full text-sm font-semibold capitalize">
                  {recommendedAllocation.band}
                </span>
                <p className="text-xs text-gb-gray mt-1">Puntaje: {clientProfile.puntaje_riesgo}/100</p>
              </div>
            </div>

            <h3 className="text-xs font-semibold text-gb-gray uppercase tracking-wide mb-3">
              Portafolio Recomendado
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-blue-50 rounded-lg p-3 border border-blue-100">
                <p className="text-xs text-blue-600 font-medium">Renta Variable</p>
                <p className="text-2xl font-bold text-blue-700">{recommendedAllocation.weights.equities}%</p>
              </div>
              <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
                <p className="text-xs text-slate-600 font-medium">Renta Fija</p>
                <p className="text-2xl font-bold text-slate-700">{recommendedAllocation.weights.fixedIncome}%</p>
              </div>
              <div className="bg-indigo-50 rounded-lg p-3 border border-indigo-100">
                <p className="text-xs text-indigo-600 font-medium">Alternativos</p>
                <p className="text-2xl font-bold text-indigo-700">{recommendedAllocation.weights.alternatives}%</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                <p className="text-xs text-gray-600 font-medium">Liquidez</p>
                <p className="text-2xl font-bold text-gray-700">{recommendedAllocation.weights.cash}%</p>
              </div>
            </div>
          </div>
        )}

        {/* No profile warning */}
        {clientProfile && !clientProfile.puntaje_riesgo && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-amber-800">Cliente sin perfil de riesgo</p>
              <p className="text-xs text-amber-700 mt-1">
                {clientProfile.nombre} aun no ha completado el cuestionario de perfil de inversor.
                Enviale el cuestionario para obtener una recomendacion de portafolio personalizada.
              </p>
            </div>
          </div>
        )}

        {/* Portfolio Section */}
        {clientProfile && (
          <>
            {loadingPortfolio ? (
              <div className="flex items-center justify-center py-12">
                <Loader className="w-6 h-6 animate-spin text-teal-500" />
              </div>
            ) : snapshot && composition ? (
              <>
                {/* Portfolio Summary */}
                <div className="bg-white rounded-lg border border-gb-border border-l-4 border-l-teal-500 p-5 mb-6 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-sm font-semibold text-gb-black flex items-center gap-2">
                      <Layers className="w-4 h-4 text-teal-500" />
                      Cartola Inicial
                    </h2>
                    <span className="text-xs text-gb-gray">
                      {new Date(snapshot.snapshot_date).toLocaleDateString("es-CL")}
                    </span>
                  </div>

                  {/* Stats */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                    <div className="bg-teal-50 rounded-lg p-3 border border-teal-100">
                      <p className="text-xs text-teal-600 font-medium">Valor Total</p>
                      <p className="text-xl font-bold text-teal-700">
                        ${composition.totalValue.toLocaleString("es-CL", { minimumFractionDigits: 0 })}
                      </p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                      <p className="text-xs text-gray-600 font-medium">Posiciones</p>
                      <p className="text-xl font-bold text-gray-700">{holdings.length}</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                      <p className="text-xs text-gray-600 font-medium">Fuente</p>
                      <p className="text-xl font-bold text-gray-700 capitalize">{snapshot.source || "cartola"}</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                      <p className="text-xs text-gray-600 font-medium">Clases de Activo</p>
                      <p className="text-xl font-bold text-gray-700">{Object.keys(composition.byClass).length}</p>
                    </div>
                  </div>

                  {/* Asset class breakdown */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {(["RV", "RF", "Alternativo", "Cash"] as const).map((cls) => {
                      const data = composition.byClass[cls];
                      return (
                        <div key={cls} className="bg-gb-light rounded-md p-3">
                          <p className="text-xs text-gb-gray">{ASSET_CLASS_LABELS[cls]}</p>
                          <p className="text-lg font-semibold text-gb-black">
                            {data ? `${data.percent.toFixed(1)}%` : "0%"}
                          </p>
                          {data && (
                            <p className="text-xs text-gb-gray">
                              ${data.value.toLocaleString("es-CL", { minimumFractionDigits: 0 })}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Comparison: Recommended vs Actual */}
                {recommendedAllocation && (
                  <div className="bg-white rounded-lg border border-gb-border border-l-4 border-l-indigo-500 p-5 mb-6 shadow-sm">
                    <h2 className="text-base font-semibold text-gb-black mb-4 flex items-center gap-2">
                      <TrendingUp className="w-5 h-5 text-indigo-500" />
                      Comparacion: Recomendado vs Actual
                    </h2>

                    {(() => {
                      const actualRV = composition.byClass["RV"]?.percent || 0;
                      const actualRF = composition.byClass["RF"]?.percent || 0;
                      const actualAlt = composition.byClass["Alternativo"]?.percent || 0;
                      const actualCash = composition.byClass["Cash"]?.percent || 0;

                      const comparisonData = [
                        {
                          name: "Renta Variable",
                          recomendado: recommendedAllocation.weights.equities,
                          actual: Math.round(actualRV * 10) / 10,
                          diff: Math.round((actualRV - recommendedAllocation.weights.equities) * 10) / 10,
                        },
                        {
                          name: "Renta Fija",
                          recomendado: recommendedAllocation.weights.fixedIncome,
                          actual: Math.round(actualRF * 10) / 10,
                          diff: Math.round((actualRF - recommendedAllocation.weights.fixedIncome) * 10) / 10,
                        },
                        {
                          name: "Alternativos",
                          recomendado: recommendedAllocation.weights.alternatives,
                          actual: Math.round(actualAlt * 10) / 10,
                          diff: Math.round((actualAlt - recommendedAllocation.weights.alternatives) * 10) / 10,
                        },
                        {
                          name: "Liquidez",
                          recomendado: recommendedAllocation.weights.cash,
                          actual: Math.round(actualCash * 10) / 10,
                          diff: Math.round((actualCash - recommendedAllocation.weights.cash) * 10) / 10,
                        },
                      ];

                      return (
                        <>
                          <div className="overflow-x-auto mb-6">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="border-b border-gb-border">
                                  <th className="text-left py-2 pr-4 font-medium text-gb-gray">Clase de Activo</th>
                                  <th className="text-right py-2 px-4 font-medium text-indigo-600">Recomendado</th>
                                  <th className="text-right py-2 px-4 font-medium text-teal-600">Actual</th>
                                  <th className="text-right py-2 pl-4 font-medium text-gb-gray">Diferencia</th>
                                </tr>
                              </thead>
                              <tbody>
                                {comparisonData.map((row) => (
                                  <tr key={row.name} className="border-b border-gb-border last:border-0">
                                    <td className="py-3 pr-4 font-medium text-gb-black">{row.name}</td>
                                    <td className="py-3 px-4 text-right tabular-nums text-indigo-600 font-semibold">
                                      {row.recomendado}%
                                    </td>
                                    <td className="py-3 px-4 text-right tabular-nums text-teal-600 font-semibold">
                                      {row.actual}%
                                    </td>
                                    <td className={`py-3 pl-4 text-right tabular-nums font-semibold ${
                                      Math.abs(row.diff) <= 5 ? "text-emerald-600" :
                                      Math.abs(row.diff) <= 15 ? "text-amber-600" : "text-red-600"
                                    }`}>
                                      {row.diff > 0 ? "+" : ""}{row.diff}%
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>

                          <ResponsiveContainer width="100%" height={200}>
                            <BarChart data={comparisonData} layout="vertical" margin={{ left: 10, right: 10 }}>
                              <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                              <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 10 }} />
                              <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 10 }} />
                              <Tooltip formatter={(value) => `${value}%`} contentStyle={{ fontSize: 11 }} />
                              <Legend wrapperStyle={{ fontSize: 10 }} />
                              <Bar dataKey="recomendado" name="Recomendado" fill="#6366f1" radius={[0, 4, 4, 0]} />
                              <Bar dataKey="actual" name="Actual" fill="#14b8a6" radius={[0, 4, 4, 0]} />
                            </BarChart>
                          </ResponsiveContainer>

                          {/* Recommendations */}
                          {comparisonData.some((d) => Math.abs(d.diff) > 10) && (
                            <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                              <h4 className="text-sm font-semibold text-amber-800 mb-2 flex items-center gap-2">
                                <AlertTriangle className="w-4 h-4" />
                                Ajustes Sugeridos
                              </h4>
                              <ul className="text-sm text-amber-700 space-y-1">
                                {comparisonData.map((d) => {
                                  if (d.diff > 10) {
                                    return (
                                      <li key={d.name}>
                                        - <strong>{d.name}</strong>: Reducir {d.diff.toFixed(1)}pp (actual {d.actual}% → recomendado {d.recomendado}%)
                                      </li>
                                    );
                                  } else if (d.diff < -10) {
                                    return (
                                      <li key={d.name}>
                                        - <strong>{d.name}</strong>: Aumentar {Math.abs(d.diff).toFixed(1)}pp (actual {d.actual}% → recomendado {d.recomendado}%)
                                      </li>
                                    );
                                  }
                                  return null;
                                })}
                              </ul>
                            </div>
                          )}

                          {comparisonData.every((d) => Math.abs(d.diff) <= 10) && (
                            <div className="mt-4 p-4 bg-emerald-50 border border-emerald-200 rounded-lg">
                              <h4 className="text-sm font-semibold text-emerald-800 flex items-center gap-2">
                                <CheckCircle className="w-4 h-4" />
                                Portafolio alineado con el perfil de riesgo
                              </h4>
                              <p className="text-sm text-emerald-700 mt-1">
                                La distribucion actual esta dentro del rango aceptable (+-10%) respecto al benchmark recomendado.
                              </p>
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </div>
                )}

                {/* Holdings table with ficha enrichment */}
                {holdings.length > 0 && (
                  <div className="bg-white rounded-lg border border-gb-border border-l-4 border-l-slate-400 p-5 mb-6 shadow-sm">
                    <h2 className="text-base font-semibold text-gb-black mb-3">Holdings ({holdings.length})</h2>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gb-border text-gb-gray">
                            <th className="text-left py-2 pr-3 font-medium">Instrumento</th>
                            <th className="text-left py-2 pr-3 font-medium hidden lg:table-cell">RUN</th>
                            <th className="text-left py-2 pr-3 font-medium hidden lg:table-cell">Administradora</th>
                            <th className="text-left py-2 pr-3 font-medium">Clase</th>
                            <th className="text-right py-2 pr-3 font-medium">Valor</th>
                            <th className="text-right py-2 pr-3 font-medium hidden md:table-cell">%</th>
                            <th className="text-right py-2 pr-3 font-medium hidden md:table-cell">TAC</th>
                            <th className="text-right py-2 pr-3 font-medium hidden md:table-cell">Rent 12M</th>
                          </tr>
                        </thead>
                        <tbody>
                          {holdings.map((h, i) => {
                            const run = h.fo_run || (h.securityId ? parseInt(h.securityId) : NaN);
                            const serie = h.serie;
                            const fichaEntry = !isNaN(run) ? fichasMap[run] : undefined;
                            const ficha = fichaEntry?.ficha;
                            const fondo = fichaEntry?.fondo;

                            const name = fondo?.nombre_fondo || ficha?.nombre_fondo_pdf || h.fundName || h.nombre || "—";
                            const admin = fondo?.nombre_agf || "—";
                            const value = h.marketValue || 0;
                            const pct = composition!.totalValue > 0 ? (value / composition!.totalValue) * 100 : 0;
                            // Prefer ficha TAC (from PDF, per-serie), fallback to vw TAC sintetica
                            const tac = ficha?.tac_serie ?? fondo?.tac_sintetica;
                            // Prefer ficha rent (from PDF), fallback to vw rent
                            const rent12m = ficha?.rent_12m ?? fondo?.rent_12m_nominal;
                            const assetLabel = h.assetClass === "Fixed Income" || h.assetClass === "RF" ? "RF"
                              : h.assetClass === "Cash" ? "Cash"
                              : h.assetClass === "Alternativo" || h.assetClass === "Alternative" ? "Alt"
                              : "RV";

                            return (
                              <tr key={i} className="border-b border-gb-border last:border-0 group">
                                <td className="py-2 pr-3">
                                  <div className="font-medium text-gb-black">{name}</div>
                                  {serie && (
                                    <div className="text-xs text-gb-gray">Serie {serie}</div>
                                  )}
                                  {fondo?.familia_estudios && (
                                    <div className="text-xs text-gb-gray">{fondo.familia_estudios}</div>
                                  )}
                                </td>
                                <td className="py-2 pr-3 text-xs tabular-nums text-gb-gray hidden lg:table-cell">
                                  {!isNaN(run) ? run : "—"}
                                </td>
                                <td className="py-2 pr-3 text-gb-gray text-xs hidden lg:table-cell">{admin}</td>
                                <td className="py-2 pr-3">
                                  <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                                    assetLabel === "RV" ? "bg-indigo-50 text-indigo-700" :
                                    assetLabel === "RF" ? "bg-slate-100 text-slate-700" :
                                    assetLabel === "Alt" ? "bg-purple-50 text-purple-700" :
                                    "bg-teal-50 text-teal-700"
                                  }`}>
                                    {assetLabel}
                                  </span>
                                </td>
                                <td className="py-2 pr-3 text-right tabular-nums text-gb-black">
                                  ${value.toLocaleString("es-CL", { minimumFractionDigits: 0 })}
                                </td>
                                <td className="py-2 pr-3 text-right tabular-nums text-gb-gray hidden md:table-cell">{pct.toFixed(1)}%</td>
                                <td className="py-2 pr-3 text-right tabular-nums hidden md:table-cell">
                                  {tac != null ? (
                                    <span className={tac > 3 ? "text-red-600 font-medium" : tac > 1.5 ? "text-amber-600" : "text-emerald-600"}>
                                      {Number(tac).toFixed(2)}%
                                    </span>
                                  ) : (
                                    <span className="text-gb-gray">—</span>
                                  )}
                                </td>
                                <td className="py-2 pr-3 text-right tabular-nums hidden md:table-cell">
                                  {rent12m != null ? (
                                    <span className={Number(rent12m) >= 0 ? "text-emerald-600 font-medium" : "text-red-600 font-medium"}>
                                      {Number(rent12m) >= 0 ? "+" : ""}{Number(rent12m).toFixed(1)}%
                                    </span>
                                  ) : (
                                    <span className="text-gb-gray">—</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Charts */}
                {assetClassData.length > 0 && (
                  <div className="bg-white rounded-lg border border-gb-border border-l-4 border-l-blue-500 p-5 mb-6 shadow-sm">
                    <h2 className="text-base font-semibold text-gb-black mb-4">Composicion por Clase de Activo</h2>
                    <ResponsiveContainer width="100%" height={250}>
                      <PieChart>
                        <Pie
                          data={assetClassData}
                          cx="50%"
                          cy="50%"
                          outerRadius={80}
                          dataKey="value"
                          label={({ name, percent }) => `${name} ${percent}%`}
                          labelLine={{ strokeWidth: 1 }}
                          fontSize={10}
                        >
                          {assetClassData.map((entry, i) => (
                            <Cell key={i} fill={ASSET_CLASS_COLORS[entry.key] || COLORS[i % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value) => `$${Number(value).toLocaleString("es-CL")}`} contentStyle={{ fontSize: 11 }} />
                        <Legend wrapperStyle={{ fontSize: 10 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </>
            ) : (
              /* No portfolio - link to seguimiento */
              <div className="bg-white rounded-lg border border-gb-border p-8 mb-6 text-center">
                <Layers className="w-12 h-12 mx-auto mb-3 text-gb-gray opacity-30" />
                <p className="text-sm font-medium text-gb-black mb-1">
                  {clientProfile.nombre} {clientProfile.apellido} no tiene cartola inicial
                </p>
                <p className="text-xs text-gb-gray mb-4">
                  Primero sube la cartola en Seguimiento de Cartolas para poder analizarla aqui.
                </p>
                <Link
                  href={`/clients/${clientProfile.id}/seguimiento`}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-teal-600 text-white rounded-md hover:bg-teal-700 transition-colors"
                >
                  Ir a Seguimiento
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function AnalisisCartolaPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader className="w-8 h-8 text-gb-gray animate-spin" />
      </div>
    }>
      <AnalisisCartolaContent />
    </Suspense>
  );
}
