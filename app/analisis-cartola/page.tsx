"use client";

import { useState, useRef, useEffect, DragEvent, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useAdvisor } from "@/lib/hooks/useAdvisor";
import AdvisorHeader from "@/components/shared/AdvisorHeader";
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
import {
  classifyPortfolio,
  type PortfolioComposition,
  type ParsedHolding,
} from "@/lib/portfolio/fund_classifier";
import { getBenchmarkFromScore, type AssetAllocation } from "@/lib/risk/benchmarks";
import {
  Upload,
  Plus,
  Trash2,
  Send,
  Loader,
  FileText,
  PenLine,
  CheckCircle,
  Shield,
  TrendingUp,
  AlertTriangle,
  Building2,
  Layers,
  Eye,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

interface ParsedStatement {
  clientName: string;
  accountNumber: string;
  period: string;
  beginningValue: number;
  endingValue: number;
  fees: number;
  cashBalance: number;
  holdings: ParsedHolding[];
}

interface ManualPosition {
  id: string;
  instrument: string;
  type: "RV" | "RF" | "alternativo" | "cash";
  amount: number;
  percent: number;
}

// Cartola guardada en la base de datos
interface ClientCartola {
  id: string;
  client_id: string;
  nombre_agf: string;
  portfolio_data: {
    statement: ParsedStatement;
  } | null;
  composition: Record<string, number> | null;
  total_value: number;
  created_at: string;
}

// Consolidado de todas las cartolas
interface CartolaConsolidado {
  total: number;
  composicion: Record<string, number>;
  porcentajes: Record<string, number>;
}

interface ClientRiskProfile {
  id: string;
  nombre: string;
  apellido: string;
  email: string;
  perfil_riesgo: string;
  puntaje_riesgo: number;
  portfolio_data?: {
    composition: PortfolioComposition;
    statement: ParsedStatement;
    savedAt: string;
  } | null;
}

// AGFs conocidos en Chile
const AGFS_CHILE = [
  "Banchile",
  "BTG Pactual",
  "LarrainVial",
  "Santander",
  "Security",
  "Sura",
  "Itaú",
  "Principal",
  "BICE",
  "Credicorp Capital",
  "Scotia",
  "Compass Group",
  "Moneda",
  "Otro",
];

// Paleta sobria: indigo, teal, slate, con variaciones
const COLORS = ["#6366f1", "#14b8a6", "#64748b", "#8b5cf6", "#0d9488", "#475569", "#a78bfa", "#334155"];
const ASSET_TYPE_LABELS: Record<string, string> = {
  RV: "Renta Variable",
  RF: "Renta Fija",
  alternativo: "Alternativos",
  cash: "Liquidez / MM",
};

function AnalisisCartolaContent() {
  const { advisor } = useAdvisor();
  const searchParams = useSearchParams();
  const clientEmailParam = searchParams.get("client") || "";

  const [mode, setMode] = useState<"upload" | "manual">("upload");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statement, setStatement] = useState<ParsedStatement | null>(null);
  const [composition, setComposition] = useState<PortfolioComposition | null>(null);
  const [email, setEmail] = useState(clientEmailParam);
  const [dragActive, setDragActive] = useState(false);
  const [sendingQuestionnaire, setSendingQuestionnaire] = useState(false);
  const [questionnaireSent, setQuestionnaireSent] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Client risk profile state
  const [clientProfile, setClientProfile] = useState<ClientRiskProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [recommendedAllocation, setRecommendedAllocation] = useState<AssetAllocation | null>(null);

  // Multicartola state
  const [cartolas, setCartolas] = useState<ClientCartola[]>([]);
  const [consolidado, setConsolidado] = useState<CartolaConsolidado | null>(null);
  const [loadingCartolas, setLoadingCartolas] = useState(false);
  const [selectedAgf, setSelectedAgf] = useState<string>("Banchile");
  const [savingCartola, setSavingCartola] = useState(false);
  const [viewMode, setViewMode] = useState<"consolidado" | "detalle">("consolidado");
  const [expandedCartola, setExpandedCartola] = useState<string | null>(null);

  // Fetch cartolas when client changes
  async function fetchCartolas(clientId: string) {
    setLoadingCartolas(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/cartolas`);
      if (!res.ok) {
        console.error("Error fetching cartolas:", res.status);
        return;
      }
      const data = await res.json();
      if (data.success) {
        setCartolas(data.cartolas || []);
        setConsolidado(data.consolidado || null);
      }
    } catch (error) {
      console.error("Error fetching cartolas:", error);
    } finally {
      setLoadingCartolas(false);
    }
  }

  // Save new cartola
  async function saveCartola(stmt: ParsedStatement, comp: PortfolioComposition, agfName: string) {
    if (!clientProfile?.id || !comp.byAssetClass) return;

    // Convert composition to simple values: { "Equity": 1000 } instead of { "Equity": { value: 1000, percent: 50 } }
    const simpleComposition: Record<string, number> = {};
    for (const [key, data] of Object.entries(comp.byAssetClass)) {
      simpleComposition[key] = data.value;
    }

    setSavingCartola(true);
    try {
      const res = await fetch(`/api/clients/${clientProfile.id}/cartolas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre_agf: agfName,
          portfolio_data: { statement: stmt },
          composition: simpleComposition,
          total_value: comp.totalValue,
        }),
      });

      if (res.ok) {
        // Refresh cartolas
        await fetchCartolas(clientProfile.id);
        // Clear current upload
        setStatement(null);
        setComposition(null);
      } else {
        const errorData = await res.json().catch(() => ({}));
        setError(errorData.error || "Error al guardar cartola");
      }
    } catch (error) {
      console.error("Error saving cartola:", error);
      setError("Error de conexión al guardar cartola");
    } finally {
      setSavingCartola(false);
    }
  }

  // Delete cartola
  async function deleteCartola(cartolaId: string) {
    if (!clientProfile?.id) return;
    if (!confirm("¿Eliminar esta cartola?")) return;

    try {
      const res = await fetch(`/api/clients/${clientProfile.id}/cartolas?cartola_id=${cartolaId}`, {
        method: "DELETE",
      });

      if (res.ok) {
        await fetchCartolas(clientProfile.id);
      } else {
        alert("Error al eliminar cartola");
      }
    } catch (error) {
      console.error("Error deleting cartola:", error);
      alert("Error de conexión");
    }
  }

  // Fetch client profile when email changes
  useEffect(() => {
    async function fetchClientProfile() {
      if (!email || !email.includes("@")) {
        setClientProfile(null);
        setRecommendedAllocation(null);
        setStatement(null);
        setComposition(null);
        setCartolas([]);
        setConsolidado(null);
        return;
      }

      setLoadingProfile(true);
      try {
        const res = await fetch(`/api/clients?search=${encodeURIComponent(email)}`);
        const data = await res.json();

        if (data.success && data.clients.length > 0) {
          const client = data.clients.find((c: ClientRiskProfile) => c.email === email);
          if (client && client.puntaje_riesgo) {
            setClientProfile(client);
            const allocation = getBenchmarkFromScore(client.puntaje_riesgo, true, "global");
            setRecommendedAllocation(allocation);

            // Fetch multicartolas
            await fetchCartolas(client.id);
          } else {
            setClientProfile(null);
            setRecommendedAllocation(null);
            setCartolas([]);
            setConsolidado(null);
          }
        } else {
          setClientProfile(null);
          setRecommendedAllocation(null);
          setCartolas([]);
          setConsolidado(null);
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

  // Manual positions
  const [manualPositions, setManualPositions] = useState<ManualPosition[]>([
    { id: crypto.randomUUID(), instrument: "", type: "RV", amount: 0, percent: 0 },
  ]);

  async function sendQuestionnaire() {
    if (!email) return;
    setSendingQuestionnaire(true);
    setQuestionnaireSent(false);
    try {
      const res = await fetch("/api/send-questionnaire", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, advisorEmail: advisor?.email }),
      });
      if (!res.ok) throw new Error();
      setQuestionnaireSent(true);
    } catch {
      alert("Error enviando el cuestionario");
    } finally {
      setSendingQuestionnaire(false);
    }
  }


  async function processFile(file: File) {
    setLoading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/parse-portfolio-statement", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Error al procesar el PDF");
      }
      const data: ParsedStatement = await res.json();
      const comp = classifyPortfolio(data.holdings, data.cashBalance);
      setStatement(data);
      setComposition(comp);
      // No guardamos automáticamente - el usuario debe seleccionar AGF y guardar
    } catch (error) {
      setError(error instanceof Error ? error.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }

  function handleDrag(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") setDragActive(true);
    else if (e.type === "dragleave") setDragActive(false);
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files?.[0]) processFile(e.dataTransfer.files[0]);
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files?.[0]) processFile(e.target.files[0]);
  }

  // Manual position handlers
  function addPosition() {
    setManualPositions((prev) => [
      ...prev,
      { id: crypto.randomUUID(), instrument: "", type: "RV", amount: 0, percent: 0 },
    ]);
  }

  function removePosition(id: string) {
    setManualPositions((prev) => prev.filter((p) => p.id !== id));
  }

  function updatePosition(id: string, field: keyof ManualPosition, value: string | number) {
    setManualPositions((prev) =>
      prev.map((p) => (p.id === id ? { ...p, [field]: value } : p))
    );
  }

  function recalcPercents() {
    const total = manualPositions.reduce((s, p) => s + p.amount, 0);
    if (total === 0) return;
    setManualPositions((prev) =>
      prev.map((p) => ({ ...p, percent: Math.round((p.amount / total) * 1000) / 10 }))
    );
  }

  function processManualPositions() {
    const total = manualPositions.reduce((s, p) => s + p.amount, 0);
    if (total <= 0) return;

    const holdings: ParsedHolding[] = manualPositions
      .filter((p) => p.amount > 0 && p.instrument.trim())
      .map((p) => ({
        fundName: p.instrument,
        securityId: p.type,
        quantity: 0,
        unitCost: p.amount,
        costBasis: p.amount,
        marketPrice: p.amount,
        marketValue: p.amount,
        unrealizedGainLoss: 0,
        percentOfPortfolio: (p.amount / total) * 100,
        assetClass: ASSET_TYPE_LABELS[p.type] || p.type,
        region: "Chile",
      }));

    const cashPos = manualPositions.filter((p) => p.type === "cash");
    const cashTotal = cashPos.reduce((s, p) => s + p.amount, 0);

    const stmt: ParsedStatement = {
      clientName: email || "Ingreso Manual",
      accountNumber: "",
      period: new Date().toISOString().slice(0, 10),
      beginningValue: total,
      endingValue: total,
      fees: 0,
      cashBalance: cashTotal,
      holdings,
    };
    const comp = classifyPortfolio(holdings, cashTotal);

    setStatement(stmt);
    setComposition(comp);
    // No guardamos automáticamente - el usuario debe seleccionar AGF y guardar
  }

  const manualTotal = manualPositions.reduce((s, p) => s + p.amount, 0);
  const manualByType = manualPositions.reduce<Record<string, number>>((acc, p) => {
    acc[p.type] = (acc[p.type] || 0) + p.amount;
    return acc;
  }, {});

  const assetClassData = composition
    ? Object.entries(composition.byAssetClass).map(([name, d]) => ({
        name,
        value: Math.round(d.value * 100) / 100,
        percent: Math.round(d.percent * 10) / 10,
      }))
    : [];

  const regionData = composition
    ? Object.entries(composition.byRegion).map(([name, d]) => ({
        name,
        value: Math.round(d.value * 100) / 100,
        percent: Math.round(d.percent * 10) / 10,
      }))
    : [];

  const totalGainLoss = statement
    ? statement.holdings.reduce((s, h) => s + h.unrealizedGainLoss, 0)
    : 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      {advisor && (
        <AdvisorHeader advisorName={advisor.name} advisorEmail={advisor.email} advisorPhoto={advisor.photo} advisorLogo={advisor.logo} companyName={advisor.companyName} isAdmin={advisor.isAdmin} />
      )}

      <div className="max-w-6xl mx-auto px-5 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-gb-black">Cartola & Perfil de Riesgo</h1>
          <p className="text-sm text-gb-gray mt-0.5">
            Analiza la cartera del cliente desde cartola PDF o ingreso manual
          </p>
        </div>

        {/* Email + questionnaire */}
        <div className="bg-white rounded-lg border border-gb-border border-l-4 border-l-blue-500 p-5 mb-6 shadow-sm">
          <h2 className="text-sm font-semibold text-gb-black mb-3">Cliente</h2>
          <div className="flex items-center gap-3">
            <input
              type="email"
              placeholder="Email del cliente"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setQuestionnaireSent(false); }}
              className="flex-1 max-w-sm px-3 py-2 border border-gb-border rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            {loadingProfile && <Loader className="w-4 h-4 animate-spin text-blue-500" />}
            <button
              onClick={sendQuestionnaire}
              disabled={!email || sendingQuestionnaire || !!clientProfile}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-40 transition-colors"
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

        {/* Client Risk Profile & Recommended Allocation */}
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
            <div className="grid grid-cols-4 gap-3">
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
        {email && !loadingProfile && !clientProfile && email.includes("@") && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-amber-800">Cliente sin perfil de riesgo</p>
              <p className="text-xs text-amber-700 mt-1">
                Este cliente aún no ha completado el cuestionario de perfil de inversor.
                Envíale el cuestionario para obtener una recomendación de portafolio personalizada.
              </p>
            </div>
          </div>
        )}

        {/* Multicartola Section */}
        {clientProfile && (
          <div className="bg-white rounded-lg border border-gb-border border-l-4 border-l-teal-500 p-5 mb-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gb-black flex items-center gap-2">
                <Layers className="w-4 h-4 text-teal-500" />
                Cartolas por AGF
                {loadingCartolas && <Loader className="w-4 h-4 animate-spin text-teal-500" />}
              </h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setViewMode("consolidado")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    viewMode === "consolidado"
                      ? "bg-teal-600 text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" />
                  Consolidado
                </button>
                <button
                  onClick={() => setViewMode("detalle")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    viewMode === "detalle"
                      ? "bg-teal-600 text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  <Eye className="w-3.5 h-3.5" />
                  Detalle por AGF
                </button>
              </div>
            </div>

            {/* Cartolas existentes */}
            {cartolas.length > 0 ? (
              <div className="space-y-2 mb-4">
                {cartolas.map((cartola) => (
                  <div
                    key={cartola.id}
                    className="border border-gb-border rounded-lg overflow-hidden"
                  >
                    <div
                      className="flex items-center justify-between p-3 bg-gray-50 cursor-pointer hover:bg-gray-100 transition-colors"
                      onClick={() => setExpandedCartola(expandedCartola === cartola.id ? null : cartola.id)}
                    >
                      <div className="flex items-center gap-3">
                        <Building2 className="w-4 h-4 text-teal-600" />
                        <span className="font-medium text-sm text-gb-black">{cartola.nombre_agf}</span>
                        <span className="text-xs text-gb-gray">
                          ${cartola.total_value.toLocaleString("es-CL")}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gb-gray">
                          {new Date(cartola.created_at).toLocaleDateString("es-CL")}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteCartola(cartola.id);
                          }}
                          className="p-1 text-gb-gray hover:text-red-600 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                        {expandedCartola === cartola.id ? (
                          <ChevronUp className="w-4 h-4 text-gb-gray" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-gb-gray" />
                        )}
                      </div>
                    </div>

                    {expandedCartola === cartola.id && cartola.composition && (
                      <div className="p-3 border-t border-gb-border bg-white">
                        <div className="grid grid-cols-4 gap-2">
                          {Object.entries(cartola.composition).map(([asset, value]) => (
                            <div key={asset} className="text-center p-2 bg-gray-50 rounded">
                              <p className="text-xs text-gb-gray">{asset}</p>
                              <p className="text-sm font-semibold text-gb-black">
                                ${(value as number).toLocaleString("es-CL")}
                              </p>
                              {cartola.total_value > 0 && (
                                <p className="text-xs text-teal-600">
                                  {((value as number / cartola.total_value) * 100).toFixed(1)}%
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6 text-gb-gray text-sm mb-4">
                <Building2 className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p>No hay cartolas registradas</p>
                <p className="text-xs mt-1">Sube una cartola PDF o ingresa las posiciones manualmente</p>
              </div>
            )}

            {/* Consolidado */}
            {consolidado && consolidado.total > 0 && viewMode === "consolidado" && (
              <div className="border-t border-gb-border pt-4">
                <h3 className="text-xs font-semibold text-gb-gray uppercase tracking-wide mb-3">
                  Vista Consolidada
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  <div className="bg-teal-50 rounded-lg p-3 border border-teal-100 col-span-2 md:col-span-1">
                    <p className="text-xs text-teal-600 font-medium">Total</p>
                    <p className="text-xl font-bold text-teal-700">
                      ${consolidado.total.toLocaleString("es-CL")}
                    </p>
                  </div>
                  {Object.entries(consolidado.porcentajes).map(([asset, pct]) => (
                    <div key={asset} className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                      <p className="text-xs text-gray-600 font-medium truncate">{asset}</p>
                      <p className="text-lg font-bold text-gray-700">{pct}%</p>
                      <p className="text-xs text-gray-500">
                        ${(consolidado.composicion[asset] || 0).toLocaleString("es-CL")}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Mode toggle */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setMode("upload")}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-md border transition-colors ${
              mode === "upload"
                ? "bg-blue-600 text-white border-blue-600"
                : "bg-white text-slate-600 border-slate-300 hover:bg-blue-50 hover:border-blue-300"
            }`}
          >
            <Upload className="w-4 h-4" />
            Subir Cartola PDF
          </button>
          <button
            onClick={() => setMode("manual")}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-md border transition-colors ${
              mode === "manual"
                ? "bg-blue-600 text-white border-blue-600"
                : "bg-white text-slate-600 border-slate-300 hover:bg-blue-50 hover:border-blue-300"
            }`}
          >
            <PenLine className="w-4 h-4" />
            Ingreso Manual
          </button>
        </div>

        {/* Upload mode */}
        {mode === "upload" && (
          <div className="bg-white rounded-lg border border-gb-border border-l-4 border-l-blue-400 p-5 mb-6 shadow-sm">
            <div
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              onClick={() => inputRef.current?.click()}
              className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
                dragActive ? "border-blue-500 bg-blue-50" : "border-slate-300 hover:border-blue-400 hover:bg-blue-50"
              }`}
            >
              <input ref={inputRef} type="file" accept=".pdf" onChange={handleChange} className="hidden" />
              {loading ? (
                <div className="flex items-center justify-center gap-2">
                  <Loader className="w-4 h-4 animate-spin text-blue-500" />
                  <p className="text-sm text-slate-600">Procesando PDF con IA...</p>
                </div>
              ) : (
                <div className="flex items-center justify-center gap-3">
                  <FileText className="w-5 h-5 text-slate-400" />
                  <p className="text-sm text-slate-600">Arrastra la cartola PDF aquí o haz clic para seleccionar</p>
                </div>
              )}
            </div>
            {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
          </div>
        )}

        {/* Manual mode */}
        {mode === "manual" && (
          <div className="bg-white rounded-lg border border-gb-border border-l-4 border-l-blue-400 p-5 mb-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gb-black">Posiciones Manuales</h2>
              <button
                onClick={addPosition}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-gb-light text-gb-accent rounded-md hover:bg-gray-200"
              >
                <Plus className="w-3.5 h-3.5" />
                Agregar
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gb-border">
                    <th className="text-left py-2 pr-3 font-medium text-gb-gray">Instrumento</th>
                    <th className="text-left py-2 pr-3 font-medium text-gb-gray w-40">Tipo</th>
                    <th className="text-right py-2 pr-3 font-medium text-gb-gray w-36">Monto (CLP)</th>
                    <th className="text-right py-2 pr-3 font-medium text-gb-gray w-20">%</th>
                    <th className="py-2 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {manualPositions.map((pos) => (
                    <tr key={pos.id} className="border-b border-gb-border last:border-0">
                      <td className="py-2 pr-3">
                        <input
                          type="text"
                          value={pos.instrument}
                          onChange={(e) => updatePosition(pos.id, "instrument", e.target.value)}
                          placeholder="Ej: Fondo BTG Chile Equity"
                          className="w-full px-2 py-1.5 border border-gb-border rounded text-sm"
                        />
                      </td>
                      <td className="py-2 pr-3">
                        <select
                          value={pos.type}
                          onChange={(e) => updatePosition(pos.id, "type", e.target.value)}
                          className="w-full px-2 py-1.5 border border-gb-border rounded text-sm bg-white"
                        >
                          <option value="RV">Renta Variable</option>
                          <option value="RF">Renta Fija</option>
                          <option value="alternativo">Alternativos</option>
                          <option value="cash">Liquidez / MM</option>
                        </select>
                      </td>
                      <td className="py-2 pr-3">
                        <input
                          type="number"
                          value={pos.amount || ""}
                          onChange={(e) => updatePosition(pos.id, "amount", Number(e.target.value))}
                          onBlur={recalcPercents}
                          placeholder="0"
                          className="w-full px-2 py-1.5 border border-gb-border rounded text-sm text-right tabular-nums"
                        />
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums text-gb-gray">
                        {manualTotal > 0 ? ((pos.amount / manualTotal) * 100).toFixed(1) : "0.0"}%
                      </td>
                      <td className="py-2">
                        {manualPositions.length > 1 && (
                          <button onClick={() => removePosition(pos.id)} className="p-1 text-gb-gray hover:text-red-600">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gb-border">
                    <td className="py-2 pr-3 font-semibold text-gb-black">Total</td>
                    <td></td>
                    <td className="py-2 pr-3 text-right font-semibold tabular-nums text-gb-black">
                      {manualTotal.toLocaleString("es-CL")}
                    </td>
                    <td className="py-2 pr-3 text-right font-semibold text-gb-black">100%</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {manualTotal > 0 && (
              <div className="mt-4 grid grid-cols-4 gap-3">
                {(["RV", "RF", "alternativo", "cash"] as const).map((t) => {
                  const val = manualByType[t] || 0;
                  const pct = manualTotal > 0 ? (val / manualTotal) * 100 : 0;
                  return (
                    <div key={t} className="bg-gb-light rounded-md p-3">
                      <p className="text-xs text-gb-gray">{ASSET_TYPE_LABELS[t]}</p>
                      <p className="text-lg font-semibold text-gb-black">{pct.toFixed(1)}%</p>
                    </div>
                  );
                })}
              </div>
            )}

            <button
              onClick={processManualPositions}
              disabled={manualTotal <= 0}
              className="mt-4 flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-40 transition-colors"
            >
              Analizar Composición
            </button>
          </div>
        )}

        {/* Results */}
        {statement && composition && (
          <>
            {/* Save to AGF selector */}
            {clientProfile && (
              <div className="bg-white rounded-lg border border-gb-border border-l-4 border-l-emerald-500 p-4 mb-6 shadow-sm">
                <h3 className="text-sm font-semibold text-gb-black mb-3 flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-emerald-500" />
                  Guardar Cartola
                </h3>
                <div className="flex items-center gap-3">
                  <select
                    value={selectedAgf}
                    onChange={(e) => setSelectedAgf(e.target.value)}
                    className="flex-1 max-w-xs px-3 py-2 border border-gb-border rounded-md text-sm bg-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  >
                    {AGFS_CHILE.map((agf) => (
                      <option key={agf} value={agf}>{agf}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => saveCartola(statement, composition, selectedAgf)}
                    disabled={savingCartola}
                    className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-emerald-600 text-white rounded-md hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                  >
                    {savingCartola ? (
                      <Loader className="w-4 h-4 animate-spin" />
                    ) : (
                      <CheckCircle className="w-4 h-4" />
                    )}
                    Guardar en {selectedAgf}
                  </button>
                  <button
                    onClick={() => {
                      setStatement(null);
                      setComposition(null);
                    }}
                    className="px-3 py-2 text-sm text-gb-gray hover:text-gb-black transition-colors"
                  >
                    Cancelar
                  </button>
                </div>
                <p className="text-xs text-gb-gray mt-2">
                  Valor total: ${composition.totalValue.toLocaleString("es-CL")} • {statement.holdings.length} posiciones
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              {[
                { label: "Valor Total", value: `$${composition.totalValue.toLocaleString("en-US", { minimumFractionDigits: 0 })}` },
                { label: "Gain/Loss", value: `${totalGainLoss >= 0 ? "+" : ""}$${Math.abs(totalGainLoss).toLocaleString("en-US", { minimumFractionDigits: 0 })}`, color: totalGainLoss >= 0 ? "text-emerald-700" : "text-red-600" },
                { label: "Posiciones", value: String(statement.holdings.length) },
                { label: "Período", value: statement.period || "—" },
              ].map((card) => (
                <div key={card.label} className="bg-white rounded-lg border border-gb-border border-l-4 border-l-blue-500 p-4 shadow-sm">
                  <p className="text-xs font-medium text-gb-gray uppercase tracking-wide">{card.label}</p>
                  <p className={`text-xl font-semibold mt-1 ${card.color || "text-gb-black"}`}>{card.value}</p>
                </div>
              ))}
            </div>

            {/* Comparison: Recommended vs Actual (uses consolidated if available) */}
            {recommendedAllocation && (consolidado?.total || composition) && (
              <div className="bg-white rounded-lg border border-gb-border border-l-4 border-l-indigo-500 p-5 mb-6 shadow-sm">
                <h2 className="text-base font-semibold text-gb-black mb-4 flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-indigo-500" />
                  Comparación: Recomendado vs {consolidado?.total ? "Consolidado" : "Actual"}
                </h2>

                {(() => {
                  // Use consolidated data if available, otherwise use current composition
                  let actualRV = 0;
                  let actualRF = 0;
                  let actualCash = 0;
                  let actualAlt = 0;

                  if (consolidado?.total && consolidado.porcentajes) {
                    // Use consolidated percentages - map keys to our categories
                    actualRV = consolidado.porcentajes["Equity"] || 0;
                    actualRF = consolidado.porcentajes["Fixed Income"] || 0;
                    actualCash = consolidado.porcentajes["Cash"] || 0;
                    actualAlt = consolidado.porcentajes["Alternative"] || 0;
                  } else if (composition) {
                    // Calculate from current composition
                    actualRV = composition.byAssetClass["Equity"]?.percent || 0;
                    actualRF = composition.byAssetClass["Fixed Income"]?.percent || 0;
                    actualCash = composition.byAssetClass["Cash"]?.percent || 0;
                  }

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
                                    • <strong>{d.name}</strong>: Reducir {d.diff.toFixed(1)}pp (actual {d.actual}% → recomendado {d.recomendado}%)
                                  </li>
                                );
                              } else if (d.diff < -10) {
                                return (
                                  <li key={d.name}>
                                    • <strong>{d.name}</strong>: Aumentar {Math.abs(d.diff).toFixed(1)}pp (actual {d.actual}% → recomendado {d.recomendado}%)
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
                            La distribución actual está dentro del rango aceptable (±10%) respecto al benchmark recomendado.
                          </p>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            )}

            <div className="bg-white rounded-lg border border-gb-border border-l-4 border-l-slate-400 p-5 mb-6 shadow-sm">
              <h2 className="text-base font-semibold text-gb-black mb-3">Holdings</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gb-border text-gb-gray">
                      <th className="text-left py-2 pr-3 font-medium">Fondo</th>
                      <th className="text-right py-2 pr-3 font-medium">Valor</th>
                      <th className="text-right py-2 pr-3 font-medium">%</th>
                      <th className="text-left py-2 font-medium">Clase</th>
                    </tr>
                  </thead>
                  <tbody>
                    {composition.holdings.map((h, i) => (
                      <tr key={i} className="border-b border-gb-border last:border-0">
                        <td className="py-2 pr-3">
                          <div className="font-medium text-gb-black">{h.fundName}</div>
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums text-gb-black">
                          ${h.marketValue.toLocaleString("en-US", { minimumFractionDigits: 0 })}
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums text-gb-gray">{h.percentOfPortfolio.toFixed(1)}%</td>
                        <td className="py-2">
                          <span className="text-xs px-2 py-0.5 bg-blue-50 text-blue-700 rounded font-medium">{h.assetClass}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white rounded-lg border border-gb-border border-l-4 border-l-blue-500 p-5 shadow-sm">
                <h2 className="text-base font-semibold text-gb-black mb-4">Por Clase de Activo</h2>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={assetClassData}
                      cx="50%"
                      cy="50%"
                      outerRadius={70}
                      dataKey="value"
                      label={({ name, percent }) => `${name} ${percent}%`}
                      labelLine={{ strokeWidth: 1 }}
                      fontSize={9}
                    >
                      {assetClassData.map((_, i) => (<Cell key={i} fill={COLORS[i % COLORS.length]} />))}
                    </Pie>
                    <Tooltip formatter={(value) => `$${Number(value).toLocaleString("en-US")}`} contentStyle={{ fontSize: 11 }} />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="bg-white rounded-lg border border-gb-border border-l-4 border-l-blue-600 p-5 shadow-sm">
                <h2 className="text-base font-semibold text-gb-black mb-4">Por Región</h2>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={regionData}
                      cx="50%"
                      cy="50%"
                      outerRadius={70}
                      dataKey="value"
                      label={({ name, percent }) => `${name} ${percent}%`}
                      labelLine={{ strokeWidth: 1 }}
                      fontSize={9}
                    >
                      {regionData.map((_, i) => (<Cell key={i} fill={COLORS[i % COLORS.length]} />))}
                    </Pie>
                    <Tooltip formatter={(value) => `$${Number(value).toLocaleString("en-US")}`} contentStyle={{ fontSize: 11 }} />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </>
        )}

        {/* Consolidated Comparison (when there are cartolas but no current statement) */}
        {!statement && consolidado && consolidado.total > 0 && recommendedAllocation && (
          <div className="bg-white rounded-lg border border-gb-border border-l-4 border-l-indigo-500 p-5 mb-6 shadow-sm">
            <h2 className="text-base font-semibold text-gb-black mb-4 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-indigo-500" />
              Análisis Consolidado vs Recomendado
            </h2>

            {(() => {
              const actualRV = consolidado.porcentajes["Equity"] || 0;
              const actualRF = consolidado.porcentajes["Fixed Income"] || 0;
              const actualCash = consolidado.porcentajes["Cash"] || 0;
              const actualAlt = consolidado.porcentajes["Alternative"] || 0;

              const comparisonData = [
                {
                  name: "Renta Variable",
                  recomendado: recommendedAllocation.weights.equities,
                  actual: actualRV,
                  diff: actualRV - recommendedAllocation.weights.equities,
                },
                {
                  name: "Renta Fija",
                  recomendado: recommendedAllocation.weights.fixedIncome,
                  actual: actualRF,
                  diff: actualRF - recommendedAllocation.weights.fixedIncome,
                },
                {
                  name: "Alternativos",
                  recomendado: recommendedAllocation.weights.alternatives,
                  actual: actualAlt,
                  diff: actualAlt - recommendedAllocation.weights.alternatives,
                },
                {
                  name: "Liquidez",
                  recomendado: recommendedAllocation.weights.cash,
                  actual: actualCash,
                  diff: actualCash - recommendedAllocation.weights.cash,
                },
              ];

              return (
                <>
                  <div className="mb-4 p-3 bg-teal-50 rounded-lg border border-teal-100">
                    <p className="text-sm text-teal-700">
                      <strong>Total consolidado:</strong> ${consolidado.total.toLocaleString("es-CL")} en {cartolas.length} cartola{cartolas.length > 1 ? "s" : ""}
                    </p>
                  </div>

                  <div className="overflow-x-auto mb-6">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gb-border">
                          <th className="text-left py-2 pr-4 font-medium text-gb-gray">Clase de Activo</th>
                          <th className="text-right py-2 px-4 font-medium text-indigo-600">Recomendado</th>
                          <th className="text-right py-2 px-4 font-medium text-teal-600">Consolidado</th>
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
                      <Bar dataKey="actual" name="Consolidado" fill="#14b8a6" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>

                  {comparisonData.some((d) => Math.abs(d.diff) > 10) ? (
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
                                • <strong>{d.name}</strong>: Reducir {d.diff.toFixed(1)}pp
                              </li>
                            );
                          } else if (d.diff < -10) {
                            return (
                              <li key={d.name}>
                                • <strong>{d.name}</strong>: Aumentar {Math.abs(d.diff).toFixed(1)}pp
                              </li>
                            );
                          }
                          return null;
                        })}
                      </ul>
                    </div>
                  ) : (
                    <div className="mt-4 p-4 bg-emerald-50 border border-emerald-200 rounded-lg">
                      <h4 className="text-sm font-semibold text-emerald-800 flex items-center gap-2">
                        <CheckCircle className="w-4 h-4" />
                        Portafolio consolidado alineado
                      </h4>
                      <p className="text-sm text-emerald-700 mt-1">
                        La distribución consolidada está dentro del rango aceptable (±10%) respecto al benchmark.
                      </p>
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
}

export default function AnalisisCartolaPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center"><Loader className="w-6 h-6 animate-spin text-blue-600" /></div>}>
      <AnalisisCartolaContent />
    </Suspense>
  );
}
