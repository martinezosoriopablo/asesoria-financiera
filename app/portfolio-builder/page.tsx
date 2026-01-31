// app/portfolio-builder/page.tsx

"use client";

import React, { useState } from "react";
import { ChevronDown, ChevronUp, Check, TrendingUp } from "lucide-react";

// ============================================================
// TIPOS
// ============================================================

interface AssetAllocation {
  region: string;
  regionLabel: string;
  neutralPercent: number;
  modelPercent: number;
  tilt: 'neutral' | 'overweight' | 'underweight';
  benchmark: string;
  selectedFund: string | null;
  availableFunds: string[];
}

interface AssetClass {
  id: string;
  name: string;
  icon: string;
  totalNeutral: number;
  totalModel: number;
  allocations: AssetAllocation[];
  expanded: boolean;
}

// ============================================================
// PERFILES DE BENCHMARK
// ============================================================

const BENCHMARK_PROFILES = {
  conservador: {
    name: "Conservador",
    assetClasses: [
      {
        id: "fixed_income",
        name: "Renta Fija",
        icon: "💰",
        totalNeutral: 60.0,
        allocations: [
          { region: "chile_bonds", regionLabel: "Bonos Chile", neutralPercent: 35.0 },
          { region: "global_bonds", regionLabel: "Bonos Globales", neutralPercent: 20.0 },
          { region: "corp_bonds", regionLabel: "Bonos Corporativos", neutralPercent: 5.0 },
        ],
      },
      {
        id: "money_market",
        name: "Liquidez",
        icon: "💵",
        totalNeutral: 25.0,
        allocations: [
          { region: "money_market", regionLabel: "Money Market Chile", neutralPercent: 25.0 },
        ],
      },
      {
        id: "equity",
        name: "Renta Variable",
        icon: "📈",
        totalNeutral: 15.0,
        allocations: [
          { region: "chile", regionLabel: "Acciones Chile", neutralPercent: 5.0 },
          { region: "global", regionLabel: "Acciones Globales", neutralPercent: 10.0 },
        ],
      },
    ],
  },
  moderado: {
    name: "Moderado",
    assetClasses: [
      {
        id: "equity",
        name: "Renta Variable",
        icon: "📈",
        totalNeutral: 55.0,
        allocations: [
          { region: "chile", regionLabel: "Acciones Chile", neutralPercent: 2.8 },
          { region: "latam_ex_chile", regionLabel: "Acciones LatAm ex Chile", neutralPercent: 2.8 },
          { region: "usa", regionLabel: "Acciones USA", neutralPercent: 30.3 },
          { region: "europe", regionLabel: "Acciones Europa", neutralPercent: 8.3 },
          { region: "asia", regionLabel: "Acciones Asia desarrollada", neutralPercent: 5.5 },
          { region: "emerging", regionLabel: "Acciones mercados emergentes", neutralPercent: 5.5 },
        ],
      },
      {
        id: "fixed_income",
        name: "Renta Fija",
        icon: "💰",
        totalNeutral: 35.0,
        allocations: [
          { region: "chile_bonds", regionLabel: "Bonos Chile", neutralPercent: 15.0 },
          { region: "global_bonds", regionLabel: "Bonos Globales", neutralPercent: 15.0 },
          { region: "corp_bonds", regionLabel: "Bonos Corporativos", neutralPercent: 5.0 },
        ],
      },
      {
        id: "alternative",
        name: "Alternativos",
        icon: "🎯",
        totalNeutral: 10.0,
        allocations: [
          { region: "reits", regionLabel: "Real Estate (REITs)", neutralPercent: 5.0 },
          { region: "commodities", regionLabel: "Commodities", neutralPercent: 5.0 },
        ],
      },
    ],
  },
  agresivo: {
    name: "Agresivo",
    assetClasses: [
      {
        id: "equity",
        name: "Renta Variable",
        icon: "📈",
        totalNeutral: 80.0,
        allocations: [
          { region: "chile", regionLabel: "Acciones Chile", neutralPercent: 5.0 },
          { region: "latam_ex_chile", regionLabel: "Acciones LatAm ex Chile", neutralPercent: 5.0 },
          { region: "usa", regionLabel: "Acciones USA", neutralPercent: 40.0 },
          { region: "europe", regionLabel: "Acciones Europa", neutralPercent: 12.0 },
          { region: "asia", regionLabel: "Acciones Asia desarrollada", neutralPercent: 10.0 },
          { region: "emerging", regionLabel: "Acciones mercados emergentes", neutralPercent: 8.0 },
        ],
      },
      {
        id: "fixed_income",
        name: "Renta Fija",
        icon: "💰",
        totalNeutral: 15.0,
        allocations: [
          { region: "global_bonds", regionLabel: "Bonos Globales", neutralPercent: 10.0 },
          { region: "corp_bonds", regionLabel: "Bonos Corporativos", neutralPercent: 5.0 },
        ],
      },
      {
        id: "alternative",
        name: "Alternativos",
        icon: "🎯",
        totalNeutral: 5.0,
        allocations: [
          { region: "reits", regionLabel: "Real Estate (REITs)", neutralPercent: 3.0 },
          { region: "commodities", regionLabel: "Commodities", neutralPercent: 2.0 },
        ],
      },
    ],
  },
};

// Fondos disponibles por región (ejemplo)
const AVAILABLE_FUNDS: Record<string, string[]> = {
  // Acciones
  chile: [
    "Fondo Acciones Chile A • Banchile",
    "Fondo Acciones Chile B • BCI",
    "ETF iShares MSCI Chile • Stonex",
  ],
  usa: [
    "Fondo USA A • Banchile",
    "ETF S&P 500 • iShares (Stonex)",
    "ETF S&P 500 • Vanguard VTI (Stonex)",
  ],
  europe: [
    "Fondo Europa A • Banchile",
    "ETF MSCI Europe • iShares (Stonex)",
    "ETF Europe • Vanguard VGK (Stonex)",
  ],
  latam_ex_chile: [
    "ETF LatAm ex Chile • iShares (Stonex)",
  ],
  asia: [
    "ETF MSCI Pacific • iShares (Stonex)",
  ],
  emerging: [
    "ETF MSCI EM • iShares (Stonex)",
    "ETF Emerging Markets • Vanguard VWO (Stonex)",
  ],
  // Bonos
  chile_bonds: [
    "Fondo Bonos Chile A • Banchile",
    "ETF Bonos Chile • Stonex",
  ],
  global_bonds: [
    "Fondo Bonos Global A • Banchile",
    "ETF Aggregate Bonds • Vanguard BND (Stonex)",
  ],
  corp_bonds: [
    "ETF Corporate Bonds • iShares (Stonex)",
  ],
  // Otros
  money_market: [
    "Fondo Money Market • Banchile",
    "ETF T-Bills SGOV • iShares (Stonex)",
  ],
  reits: [
    "ETF Real Estate • Vanguard VNQ (Stonex)",
  ],
  commodities: [
    "ETF Commodities • iShares (Stonex)",
  ],
};

// Benchmarks por región
const BENCHMARKS: Record<string, string> = {
  chile: "S&P IPSA TR CLP",
  usa: "MSCI USA NR USD",
  europe: "MSCI Europe NR EUR",
  latam_ex_chile: "MSCI EM Latin America NR USD",
  asia: "MSCI Pacific NR USD",
  emerging: "MSCI Emerging Markets NR USD",
  chile_bonds: "Índice Bonos Chile",
  global_bonds: "Bloomberg Global Aggregate",
  corp_bonds: "Bloomberg Corp Bonds",
  money_market: "Tasa de referencia BCCh",
  reits: "FTSE NAREIT",
  commodities: "Bloomberg Commodity Index",
};

// ============================================================
// COMPONENTE PRINCIPAL
// ============================================================

export default function PortfolioBuilderPage() {
  const [profile, setProfile] = useState<keyof typeof BENCHMARK_PROFILES>("moderado");
  const [totalInvestment, setTotalInvestment] = useState(10000000);
  const [assetClasses, setAssetClasses] = useState<AssetClass[]>([]);

  // Inicializar asset classes desde el perfil
  React.useEffect(() => {
    const benchmarkProfile = BENCHMARK_PROFILES[profile];
    const initialized: AssetClass[] = benchmarkProfile.assetClasses.map((ac) => ({
      ...ac,
      totalModel: ac.totalNeutral,
      expanded: true,
      allocations: ac.allocations.map((alloc) => ({
        ...alloc,
        modelPercent: alloc.neutralPercent,
        tilt: 'neutral' as const,
        benchmark: BENCHMARKS[alloc.region] || "N/A",
        selectedFund: null,
        availableFunds: AVAILABLE_FUNDS[alloc.region] || [],
      })),
    }));
    setAssetClasses(initialized);
  }, [profile]);

  const toggleExpanded = (assetClassId: string) => {
    setAssetClasses((prev) =>
      prev.map((ac) =>
        ac.id === assetClassId ? { ...ac, expanded: !ac.expanded } : ac
      )
    );
  };

  const updateModelPercent = (assetClassId: string, region: string, newPercent: number) => {
    setAssetClasses((prev) =>
      prev.map((ac) => {
        if (ac.id !== assetClassId) return ac;

        const updatedAllocations = ac.allocations.map((alloc) => {
          if (alloc.region !== region) return alloc;

          const diff = newPercent - alloc.neutralPercent;
          let tilt: 'neutral' | 'overweight' | 'underweight' = 'neutral';
          if (Math.abs(diff) < 0.1) tilt = 'neutral';
          else if (diff > 0) tilt = 'overweight';
          else tilt = 'underweight';

          return { ...alloc, modelPercent: newPercent, tilt };
        });

        const totalModel = updatedAllocations.reduce((sum, a) => sum + a.modelPercent, 0);

        return { ...ac, allocations: updatedAllocations, totalModel };
      })
    );
  };

  const selectFund = (assetClassId: string, region: string, fund: string) => {
    setAssetClasses((prev) =>
      prev.map((ac) => {
        if (ac.id !== assetClassId) return ac;

        const updatedAllocations = ac.allocations.map((alloc) =>
          alloc.region === region ? { ...alloc, selectedFund: fund } : alloc
        );

        return { ...ac, allocations: updatedAllocations };
      })
    );
  };

  const isConsistent = assetClasses.every((ac) =>
    Math.abs(ac.totalModel - ac.totalNeutral) < 0.5
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 py-8 px-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-2xl shadow-lg p-8 mb-8">
          <h1 className="text-3xl font-bold text-slate-900 mb-6">
            Constructor de Portafolios
          </h1>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Perfil de Riesgo
              </label>
              <select
                value={profile}
                onChange={(e) => setProfile(e.target.value as keyof typeof BENCHMARK_PROFILES)}
                className="w-full px-4 py-3 border-2 border-slate-200 rounded-lg focus:border-blue-500 focus:outline-none"
              >
                <option value="conservador">Conservador</option>
                <option value="moderado">Moderado</option>
                <option value="agresivo">Agresivo</option>
              </select>
            </div>

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

          {isConsistent && (
            <div className="mt-4 flex items-center gap-2 px-4 py-2 bg-green-50 border-2 border-green-200 rounded-lg">
              <Check className="w-5 h-5 text-green-600" />
              <span className="text-green-800 font-medium">
                Suma consistente con el benchmark
              </span>
            </div>
          )}
        </div>

        {/* Asset Classes */}
        <div className="space-y-4">
          {assetClasses.map((assetClass) => (
            <div key={assetClass.id} className="bg-white rounded-2xl shadow-lg overflow-hidden">
              {/* Asset Class Header */}
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
                      Total modelo: {assetClass.totalModel.toFixed(1)}% (benchmark: {assetClass.totalNeutral.toFixed(1)}%)
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className="text-3xl font-bold text-blue-600">
                      {assetClass.totalNeutral.toFixed(1)}%
                    </div>
                    <div className="text-sm text-slate-500">
                      ${((totalInvestment * assetClass.totalNeutral) / 100).toLocaleString("es-CL")}
                    </div>
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
                  <table className="w-full">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                          Región
                        </th>
                        <th className="px-6 py-3 text-center text-xs font-semibold text-slate-600 uppercase">
                          % Neutral
                        </th>
                        <th className="px-6 py-3 text-center text-xs font-semibold text-slate-600 uppercase">
                          % Modelo
                        </th>
                        <th className="px-6 py-3 text-center text-xs font-semibold text-slate-600 uppercase">
                          Diferencia
                        </th>
                        <th className="px-6 py-3 text-center text-xs font-semibold text-slate-600 uppercase">
                          TILT
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                          Índice
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                          Instrumento
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {assetClass.allocations.map((allocation) => {
                        const diff = allocation.modelPercent - allocation.neutralPercent;
                        return (
                          <tr key={allocation.region} className="hover:bg-blue-50/50 transition-colors">
                            <td className="px-6 py-4">
                              <div>
                                <div className="font-semibold text-slate-900">
                                  {allocation.regionLabel}
                                </div>
                                <div className="text-xs text-slate-500">
                                  {allocation.region}
                                </div>
                              </div>
                            </td>

                            <td className="px-6 py-4 text-center">
                              <div className="text-sm font-medium text-slate-700">
                                {allocation.neutralPercent.toFixed(1)}%
                              </div>
                            </td>

                            <td className="px-6 py-4 text-center">
                              <input
                                type="number"
                                step="0.1"
                                value={allocation.modelPercent}
                                onChange={(e) =>
                                  updateModelPercent(
                                    assetClass.id,
                                    allocation.region,
                                    parseFloat(e.target.value) || 0
                                  )
                                }
                                className="w-20 px-2 py-1 text-center border border-slate-300 rounded focus:border-blue-500 focus:outline-none"
                              />
                            </td>

                            <td className="px-6 py-4 text-center">
                              <span className={`text-sm font-bold ${
                                Math.abs(diff) < 0.1 ? 'text-green-600' :
                                diff > 0 ? 'text-blue-600' : 'text-orange-600'
                              }`}>
                                {diff > 0 ? '+' : ''}{diff.toFixed(1)} pp
                              </span>
                            </td>

                            <td className="px-6 py-4 text-center">
                              <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                allocation.tilt === 'neutral' ? 'bg-green-100 text-green-700' :
                                allocation.tilt === 'overweight' ? 'bg-blue-100 text-blue-700' :
                                'bg-orange-100 text-orange-700'
                              }`}>
                                {allocation.tilt === 'neutral' ? 'Neutral' :
                                 allocation.tilt === 'overweight' ? 'Sobre' : 'Sub'}
                              </span>
                            </td>

                            <td className="px-6 py-4">
                              <div className="text-xs text-slate-600">
                                {allocation.benchmark}
                              </div>
                            </td>

                            <td className="px-6 py-4">
                              <select
                                value={allocation.selectedFund || ""}
                                onChange={(e) =>
                                  selectFund(assetClass.id, allocation.region, e.target.value)
                                }
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:border-blue-500 focus:outline-none"
                              >
                                <option value="">Seleccionar fondo...</option>
                                {allocation.availableFunds.map((fund) => (
                                  <option key={fund} value={fund}>
                                    {fund}
                                  </option>
                                ))}
                              </select>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
