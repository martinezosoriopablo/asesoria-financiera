// app/portfolio-comparison/page.tsx

"use client";

import React, { useState } from "react";
import { FundSelector, Fund } from "@/components/portfolio/FundSelector";
import { ProposedFundFormV2 } from "@/components/portfolio/ProposedFundFormV2";
import { supabaseBrowserClient } from "@/lib/supabase/supabaseClient";
import {
  ChevronDown,
  ChevronUp,
  Plus,
  DollarSign,
  TrendingUp,
  Search,
  Calculator,
  FileDown,
  User,
  Loader,
} from "lucide-react";

// ============================================================
// INTERFACES
// ============================================================

interface Client {
  id: string;
  name: string;
  email: string;
  rut?: string;
  risk_profile?: string;
  total_investment?: number;
  created_at?: string;
  updated_at?: string;
}

interface AssetAllocation {
  region: string;
  regionLabel: string;
  subCategory: string;
  neutralPercent: number;
  benchmark: string;
  currentFund: Fund | null;
  proposedFund: Fund | null;
}

interface AssetClass {
  id: string;
  name: string;
  icon: string;
  totalPercent: number;
  allocations: AssetAllocation[];
  expanded: boolean;
}

// ============================================================
// PERFILES DE BENCHMARK
// ============================================================

const BENCHMARK_PROFILES = {
  moderado: {
    name: "Moderado",
    assetClasses: [
      {
        id: "equity",
        name: "Renta Variable",
        icon: "📈",
        totalPercent: 55.0,
        allocations: [
          {
            region: "chile",
            regionLabel: "Acciones Chile",
            subCategory: "Chile",
            neutralPercent: 2.8,
            benchmark: "S&P IPSA TR CLP",
          },
          {
            region: "latam_ex_chile",
            regionLabel: "Acciones LatAm ex Chile",
            subCategory: "LatAm",
            neutralPercent: 2.8,
            benchmark: "MSCI EM Latin America NR USD",
          },
          {
            region: "usa",
            regionLabel: "Acciones USA",
            subCategory: "USA",
            neutralPercent: 30.3,
            benchmark: "MSCI USA NR USD",
          },
          {
            region: "europe",
            regionLabel: "Acciones Europa",
            subCategory: "Europe",
            neutralPercent: 8.3,
            benchmark: "MSCI Europe NR EUR",
          },
          {
            region: "asia",
            regionLabel: "Acciones Asia desarrollada",
            subCategory: "Asia",
            neutralPercent: 5.5,
            benchmark: "MSCI Pacific NR USD",
          },
          {
            region: "emerging",
            regionLabel: "Acciones mercados emergentes",
            subCategory: "Emerging",
            neutralPercent: 5.5,
            benchmark: "MSCI Emerging Markets NR USD",
          },
        ],
      },
      {
        id: "fixed_income",
        name: "Renta Fija",
        icon: "💰",
        totalPercent: 35.0,
        allocations: [
          {
            region: "chile_bonds",
            regionLabel: "Bonos Chile",
            subCategory: "Chile",
            neutralPercent: 15.0,
            benchmark: "Índice Bonos Chile",
          },
          {
            region: "global_bonds",
            regionLabel: "Bonos Globales",
            subCategory: "Global",
            neutralPercent: 15.0,
            benchmark: "Bloomberg Global Aggregate",
          },
          {
            region: "corp_bonds",
            regionLabel: "Bonos Corporativos",
            subCategory: "Corporate",
            neutralPercent: 5.0,
            benchmark: "Bloomberg Corp Bonds",
          },
        ],
      },
      {
        id: "alternative",
        name: "Alternativos",
        icon: "🎯",
        totalPercent: 10.0,
        allocations: [
          {
            region: "reits",
            regionLabel: "Real Estate (REITs)",
            subCategory: "REIT",
            neutralPercent: 5.0,
            benchmark: "FTSE NAREIT",
          },
          {
            region: "commodities",
            regionLabel: "Commodities",
            subCategory: "Commodity",
            neutralPercent: 5.0,
            benchmark: "Bloomberg Commodity Index",
          },
        ],
      },
    ],
  },
};

// ============================================================
// COMPONENTE PRINCIPAL
// ============================================================

export default function PortfolioComparisonPage() {
  // Estado del cliente
  const [clientEmail, setClientEmail] = useState("");
  const [client, setClient] = useState<Client | null>(null);
  const [searchingClient, setSearchingClient] = useState(false);
  const [clientNotFound, setClientNotFound] = useState(false);

  // Estado del portafolio
  const [profile] = useState<keyof typeof BENCHMARK_PROFILES>("moderado");
  const [totalInvestment, setTotalInvestment] = useState(10000000);
  const [assetClasses, setAssetClasses] = useState<AssetClass[]>([]);
  
  // Estado del modal
  const [showProposedFundForm, setShowProposedFundForm] = useState(false);
  const [selectedAssetClassId, setSelectedAssetClassId] = useState("");
  const [selectedRegion, setSelectedRegion] = useState("");
  const [selectedSubCategory, setSelectedSubCategory] = useState("");
  const [exportingPDF, setExportingPDF] = useState(false);

  // Inicializar asset classes
  React.useEffect(() => {
    const benchmarkProfile = BENCHMARK_PROFILES[profile];
    const initialized: AssetClass[] = benchmarkProfile.assetClasses.map((ac) => ({
      ...ac,
      expanded: true,
      allocations: ac.allocations.map((alloc) => ({
        ...alloc,
        currentFund: null,
        proposedFund: null,
      })),
    }));
    setAssetClasses(initialized);
  }, [profile]);

  // ============================================================
  // BÚSQUEDA DE CLIENTE
  // ============================================================

  const searchClient = async () => {
    if (!clientEmail.trim()) return;

    setSearchingClient(true);
    setClientNotFound(false);
    const supabase = supabaseBrowserClient();

    try {
      const { data, error } = await supabase
        .from("clients")
        .select("*")
        .eq("email", clientEmail.toLowerCase().trim())
        .single();

      if (error || !data) {
        setClientNotFound(true);
        setClient(null);
      } else {
        setClient(data);
        setClientNotFound(false);
        // Actualizar inversión total si existe
        if (data.total_investment) {
          setTotalInvestment(data.total_investment);
        }
      }
    } catch (error) {
      console.error("Error buscando cliente:", error);
      setClientNotFound(true);
    } finally {
      setSearchingClient(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      searchClient();
    }
  };

  // ============================================================
  // FUNCIONES DE ACTUALIZACIÓN
  // ============================================================

  const toggleExpanded = (assetClassId: string) => {
    setAssetClasses((prev) =>
      prev.map((ac) =>
        ac.id === assetClassId ? { ...ac, expanded: !ac.expanded } : ac
      )
    );
  };

  const updateCurrentFund = (assetClassId: string, region: string, fund: Fund | null) => {
    setAssetClasses((prev) =>
      prev.map((ac) => {
        if (ac.id !== assetClassId) return ac;
        return {
          ...ac,
          allocations: ac.allocations.map((alloc) =>
            alloc.region === region ? { ...alloc, currentFund: fund } : alloc
          ),
        };
      })
    );
  };

  const updateProposedFund = (assetClassId: string, region: string, fund: Fund | null) => {
    setAssetClasses((prev) =>
      prev.map((ac) => {
        if (ac.id !== assetClassId) return ac;
        return {
          ...ac,
          allocations: ac.allocations.map((alloc) =>
            alloc.region === region ? { ...alloc, proposedFund: fund } : alloc
          ),
        };
      })
    );
  };

  const openProposedFundForm = (assetClassId: string, region: string, subCategory: string) => {
    setSelectedAssetClassId(assetClassId);
    setSelectedRegion(region);
    setSelectedSubCategory(subCategory);
    setShowProposedFundForm(true);
  };

  // ============================================================
  // CÁLCULOS
  // ============================================================

  const calculateTotals = () => {
    let currentCostTotal = 0;
    let proposedCostTotal = 0;
    let currentReturnTotal = 0;
    let proposedReturnTotal = 0;
    let totalAllocatedCurrent = 0;
    let totalAllocatedProposed = 0;

    assetClasses.forEach((ac) => {
      ac.allocations.forEach((alloc) => {
        const amount = (totalInvestment * alloc.neutralPercent) / 100;

        if (alloc.currentFund) {
          const cost = amount * alloc.currentFund.total_expense_ratio;
          const returnAmount = alloc.currentFund.return_1y
            ? amount * alloc.currentFund.return_1y
            : 0;
          currentCostTotal += cost;
          currentReturnTotal += returnAmount;
          totalAllocatedCurrent += amount;
        }

        if (alloc.proposedFund) {
          const cost = amount * alloc.proposedFund.total_expense_ratio;
          const returnAmount = alloc.proposedFund.return_1y
            ? amount * alloc.proposedFund.return_1y
            : 0;
          proposedCostTotal += cost;
          proposedReturnTotal += returnAmount;
          totalAllocatedProposed += amount;
        }
      });
    });

    const costSavings = currentCostTotal - proposedCostTotal;
    const returnImprovement = proposedReturnTotal - currentReturnTotal;
    const totalBenefit = costSavings + returnImprovement;

    return {
      currentCostTotal,
      proposedCostTotal,
      costSavings,
      currentReturnTotal,
      proposedReturnTotal,
      returnImprovement,
      totalBenefit,
      totalAllocatedCurrent,
      totalAllocatedProposed,
    };
  };

  const totals = calculateTotals();

  // ============================================================
  // EXPORTAR PDF
  // ============================================================

  const handleExportPDF = async () => {
    setExportingPDF(true);

    try {
      // Preparar datos para el PDF
      const pdfData = {
        clientName: client?.name,
        clientEmail: client?.email,
        totalInvestment,
        assetClasses: assetClasses.map((ac) => ({
          name: ac.name,
          totalPercent: ac.totalPercent,
          allocations: ac.allocations
            .filter((alloc) => alloc.currentFund || alloc.proposedFund)
            .map((alloc) => {
              const amount = (totalInvestment * alloc.neutralPercent) / 100;
              const currentCost = alloc.currentFund
                ? amount * alloc.currentFund.total_expense_ratio
                : 0;
              const proposedCost = alloc.proposedFund
                ? amount * alloc.proposedFund.total_expense_ratio
                : 0;
              const costSavings = currentCost - proposedCost;

              const currentReturn = alloc.currentFund?.return_1y
                ? amount * alloc.currentFund.return_1y
                : 0;
              const proposedReturn = alloc.proposedFund?.return_1y
                ? amount * alloc.proposedFund.return_1y
                : 0;
              const returnImprovement = proposedReturn - currentReturn;

              return {
                regionLabel: alloc.regionLabel,
                neutralPercent: alloc.neutralPercent,
                amount,
                currentFund: alloc.currentFund,
                proposedFund: alloc.proposedFund,
                costSavings,
                returnImprovement,
              };
            }),
        })),
        totals: {
          costSavings: totals.costSavings,
          returnImprovement: totals.returnImprovement,
          totalBenefit: totals.totalBenefit,
        },
        generatedDate: new Date().toLocaleDateString("es-CL"),
      };

      // Llamar al API para generar PDF
      const response = await fetch("/api/generate-pdf", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(pdfData),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Error desconocido" }));
        console.error("Error del servidor:", errorData);
        throw new Error(errorData.error || "Error al generar PDF");
      }

      // Descargar PDF
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `comparacion-portafolio-${client?.name || "cliente"}-${Date.now()}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error: any) {
      console.error("Error exportando PDF:", error);
      alert(`Error al generar el PDF: ${error.message}\n\nRevisa la consola del navegador para más detalles.`);
    } finally {
      setExportingPDF(false);
    }
  };

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 py-8 px-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-2xl shadow-lg p-8 mb-8">
          <h1 className="text-3xl font-bold text-slate-900 mb-6">
            Comparador de Portafolios
          </h1>

          {/* Búsqueda de Cliente */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Email del Cliente
            </label>
            <div className="flex gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type="email"
                  value={clientEmail}
                  onChange={(e) => {
                    setClientEmail(e.target.value);
                    setClientNotFound(false);
                  }}
                  onKeyPress={handleKeyPress}
                  placeholder="juan.perez@gmail.com"
                  className="w-full pl-10 pr-4 py-3 border-2 border-slate-200 rounded-lg focus:border-blue-500 focus:outline-none"
                />
              </div>
              <button
                onClick={searchClient}
                disabled={searchingClient || !clientEmail.trim()}
                className="px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors disabled:bg-slate-300 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {searchingClient ? (
                  <>
                    <Loader className="w-5 h-5 animate-spin" />
                    Buscando...
                  </>
                ) : (
                  <>
                    <Search className="w-5 h-5" />
                    Buscar
                  </>
                )}
              </button>
            </div>

            {/* Cliente Encontrado */}
            {client && (
              <div className="mt-4 p-4 bg-green-50 border-2 border-green-200 rounded-lg">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <User className="w-6 h-6 text-green-600" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-bold text-green-900 text-lg">{client.name}</h3>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-1 mt-2 text-sm text-green-800">
                      <div>
                        <span className="text-green-600">Email:</span> {client.email}
                      </div>
                      {client.rut && (
                        <div>
                          <span className="text-green-600">RUT:</span> {client.rut}
                        </div>
                      )}
                      {client.risk_profile && (
                        <div>
                          <span className="text-green-600">Perfil:</span>{" "}
                          {client.risk_profile.charAt(0).toUpperCase() +
                            client.risk_profile.slice(1)}
                        </div>
                      )}
                      {client.total_investment && (
                        <div>
                          <span className="text-green-600">Patrimonio:</span> $
                          {client.total_investment.toLocaleString("es-CL")}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Cliente No Encontrado */}
            {clientNotFound && (
              <div className="mt-4 p-4 bg-yellow-50 border-2 border-yellow-200 rounded-lg">
                <p className="text-yellow-800">
                  ⚠️ No se encontró un cliente con ese email. Puedes continuar ingresando los datos manualmente.
                </p>
              </div>
            )}
          </div>

          {/* Inversión Total */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Inversión Total (CLP)
            </label>
            <input
              type="number"
              value={totalInvestment}
              onChange={(e) => setTotalInvestment(parseFloat(e.target.value) || 0)}
              className="w-full px-4 py-3 border-2 border-slate-200 rounded-lg focus:border-blue-500 focus:outline-none"
            />
          </div>
        </div>

        {/* Asset Classes */}
        <div className="space-y-6">
          {assetClasses.map((assetClass) => (
            <div key={assetClass.id} className="bg-white rounded-2xl shadow-lg overflow-hidden">
              {/* Header */}
              <button
                onClick={() => toggleExpanded(assetClass.id)}
                className="w-full p-6 flex items-center justify-between hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <span className="text-3xl">{assetClass.icon}</span>
                  <div className="text-left">
                    <h2 className="text-2xl font-bold text-slate-900">
                      {assetClass.name}
                    </h2>
                    <p className="text-sm text-slate-600">
                      Total: {assetClass.totalPercent.toFixed(1)}% (${((totalInvestment * assetClass.totalPercent) / 100).toLocaleString("es-CL", { maximumFractionDigits: 0 })})
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="text-3xl font-bold text-blue-600">
                    {assetClass.totalPercent.toFixed(1)}%
                  </div>
                  {assetClass.expanded ? (
                    <ChevronUp className="w-6 h-6 text-slate-400" />
                  ) : (
                    <ChevronDown className="w-6 h-6 text-slate-400" />
                  )}
                </div>
              </button>

              {/* Allocations Table */}
              {assetClass.expanded && (
                <div className="border-t border-slate-200">
                  {assetClass.allocations.map((allocation) => {
                    const amount = (totalInvestment * allocation.neutralPercent) / 100;
                    const currentCost = allocation.currentFund
                      ? amount * allocation.currentFund.total_expense_ratio
                      : 0;
                    const proposedCost = allocation.proposedFund
                      ? amount * allocation.proposedFund.total_expense_ratio
                      : 0;
                    const costSavings = currentCost - proposedCost;

                    const currentReturn = allocation.currentFund?.return_1y
                      ? amount * allocation.currentFund.return_1y
                      : 0;
                    const proposedReturn = allocation.proposedFund?.return_1y
                      ? amount * allocation.proposedFund.return_1y
                      : 0;
                    const returnImprovement = proposedReturn - currentReturn;

                    return (
                      <div
                        key={allocation.region}
                        className="p-6 border-b border-slate-100 last:border-b-0"
                      >
                        {/* Header de la región */}
                        <div className="flex items-center justify-between mb-4">
                          <div>
                            <h3 className="text-lg font-bold text-slate-900">
                              {allocation.regionLabel}
                            </h3>
                            <p className="text-sm text-slate-600">
                              {allocation.neutralPercent.toFixed(1)}% •{" "}
                              ${amount.toLocaleString("es-CL", { maximumFractionDigits: 0 })} •{" "}
                              {allocation.benchmark}
                            </p>
                          </div>
                        </div>

                        {/* Grid de comparación */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                          {/* ACTUAL */}
                          <div>
                            <h4 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                              <span className="w-3 h-3 bg-red-500 rounded-full"></span>
                              Fondo Actual
                            </h4>
                            <FundSelector
                              assetClass={assetClass.id}
                              subCategory={allocation.subCategory}
                              type="chilean"
                              value={allocation.currentFund}
                              onSelectFund={(fund) =>
                                updateCurrentFund(assetClass.id, allocation.region, fund)
                              }
                              placeholder={`Buscar fondos de ${allocation.regionLabel}...`}
                            />
                          </div>

                          {/* PROPUESTO */}
                          <div>
                            <h4 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                              <span className="w-3 h-3 bg-green-500 rounded-full"></span>
                              Fondo Propuesto
                            </h4>
                            <FundSelector
                              assetClass={assetClass.id}
                              subCategory={allocation.subCategory}
                              type="proposed"
                              value={allocation.proposedFund}
                              onSelectFund={(fund) =>
                                updateProposedFund(assetClass.id, allocation.region, fund)
                              }
                              placeholder="Buscar fondo propuesto..."
                            />
                            <button
                              onClick={() =>
                                openProposedFundForm(
                                  assetClass.id,
                                  allocation.region,
                                  allocation.subCategory
                                )
                              }
                              className="mt-2 w-full px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
                            >
                              <Plus className="w-4 h-4" />
                              Agregar Nuevo Fondo
                            </button>
                          </div>
                        </div>

                        {/* Comparación de beneficios */}
                        {allocation.currentFund && allocation.proposedFund && (
                          <div className="mt-4 p-4 bg-green-50 border-2 border-green-200 rounded-lg">
                            <div className="grid grid-cols-2 gap-4 text-sm">
                              <div>
                                <div className="flex items-center gap-2 mb-1">
                                  <DollarSign className="w-4 h-4 text-green-600" />
                                  <span className="font-medium text-slate-700">
                                    Ahorro en Costos
                                  </span>
                                </div>
                                <div className="text-xl font-bold text-green-600">
                                  ${costSavings.toLocaleString("es-CL", {
                                    maximumFractionDigits: 0,
                                  })}
                                  /año
                                </div>
                              </div>

                              <div>
                                <div className="flex items-center gap-2 mb-1">
                                  <TrendingUp className="w-4 h-4 text-green-600" />
                                  <span className="font-medium text-slate-700">
                                    Mejor Rentabilidad
                                  </span>
                                </div>
                                <div className="text-xl font-bold text-green-600">
                                  {returnImprovement > 0 ? "+" : ""}
                                  ${returnImprovement.toLocaleString("es-CL", {
                                    maximumFractionDigits: 0,
                                  })}
                                  /año
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Resumen Total */}
        {totals.totalAllocatedCurrent > 0 && totals.totalAllocatedProposed > 0 && (
          <div className="mt-8 bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-200 rounded-2xl shadow-lg p-8">
            <div className="text-center mb-6">
              <h2 className="text-3xl font-bold text-green-900 mb-2">
                💰 Beneficio Total Anual
              </h2>
              <p className="text-green-700">
                Comparación completa entre portafolio actual y propuesto
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
              <div className="bg-white rounded-xl p-6 text-center">
                <div className="flex items-center justify-center gap-2 mb-3">
                  <DollarSign className="w-6 h-6 text-green-600" />
                  <span className="text-sm font-medium text-slate-600">
                    Ahorro en Costos
                  </span>
                </div>
                <div className="text-3xl font-bold text-green-600">
                  ${totals.costSavings.toLocaleString("es-CL", {
                    maximumFractionDigits: 0,
                  })}
                </div>
                <div className="text-xs text-slate-500 mt-1">por año</div>
              </div>

              <div className="bg-white rounded-xl p-6 text-center">
                <div className="flex items-center justify-center gap-2 mb-3">
                  <TrendingUp className="w-6 h-6 text-green-600" />
                  <span className="text-sm font-medium text-slate-600">
                    Mejor Rentabilidad
                  </span>
                </div>
                <div className="text-3xl font-bold text-green-600">
                  {totals.returnImprovement > 0 ? "+" : ""}
                  ${totals.returnImprovement.toLocaleString("es-CL", {
                    maximumFractionDigits: 0,
                  })}
                </div>
                <div className="text-xs text-slate-500 mt-1">por año</div>
              </div>

              <div className="bg-white rounded-xl p-6 text-center border-4 border-green-400">
                <div className="flex items-center justify-center gap-2 mb-3">
                  <Calculator className="w-6 h-6 text-green-600" />
                  <span className="text-sm font-medium text-slate-600">
                    Beneficio Total
                  </span>
                </div>
                <div className="text-4xl font-bold text-green-600">
                  ${totals.totalBenefit.toLocaleString("es-CL", {
                    maximumFractionDigits: 0,
                  })}
                </div>
                <div className="text-xs text-slate-500 mt-1">por año</div>
              </div>
            </div>

            <div className="bg-white rounded-xl p-6 mb-6">
              <h3 className="font-semibold text-slate-900 mb-4">
                Proyección a 10 años
              </h3>
              <div className="text-5xl font-bold text-green-600 text-center">
                ${(totals.totalBenefit * 10).toLocaleString("es-CL", {
                  maximumFractionDigits: 0,
                })}
              </div>
              <p className="text-center text-slate-600 mt-2">
                Beneficio acumulado en una década
              </p>
            </div>

            <button 
              onClick={handleExportPDF}
              disabled={exportingPDF}
              className="w-full px-8 py-4 bg-green-600 text-white font-bold text-lg rounded-xl hover:bg-green-700 transition-colors flex items-center justify-center gap-3 shadow-lg disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {exportingPDF ? (
                <>
                  <Loader className="w-6 h-6 animate-spin" />
                  Generando PDF...
                </>
              ) : (
                <>
                  <FileDown className="w-6 h-6" />
                  Exportar Comparación a PDF
                </>
              )}
            </button>
          </div>
        )}

        {/* Modal Agregar Fondo */}
        {showProposedFundForm && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
            <ProposedFundFormV2
              assetClass={assetClasses.find((ac) => ac.id === selectedAssetClassId)?.id || ""}
              subCategory={selectedSubCategory}
              onSuccess={(fund) => {
                updateProposedFund(selectedAssetClassId, selectedRegion, {
                  ...fund,
                  type: "proposed",
                  total_expense_ratio: fund.total_cost,
                });
                setShowProposedFundForm(false);
              }}
              onCancel={() => setShowProposedFundForm(false)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
