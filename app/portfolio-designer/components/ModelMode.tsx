// app/portfolio-designer/components/ModelMode.tsx
// Modo Modelo Cliente: Crear modelos de cartera vinculados a clientes

"use client";

import React, { useState } from "react";
import { supabaseBrowserClient } from "@/lib/supabase/supabaseClient";
import {
  getBenchmarkFromScore,
  AssetAllocation,
  BenchmarkUniverse,
} from "@/lib/risk/benchmarks";

import {
  EQUITY_BENCHMARKS,
  FIXED_INCOME_BENCHMARKS,
  ALTERNATIVE_BENCHMARKS,
  EquityBlockId,
  FixedIncomeBlockId,
  AlternativeBlockId,
  EquityBenchmarkDefinition,
  FixedIncomeBenchmarkDefinition,
  AlternativeBenchmarkDefinition,
} from "@/lib/risk/benchmark_map";

import { classifyTilt, tiltLabel, TiltInfo } from "@/lib/risk/tilt";
import {
  ChevronDown,
  ChevronUp,
  FileText,
  TrendingUp,
  Shield,
  Landmark,
  Save,
  History,
} from "lucide-react";
import { CommentaryPanel, CommentaryBrief } from "@/components/portfolio/CommentaryPanel";
import { SavedModels } from "@/components/portfolio/SavedModels";

// -------------------- Tipos auxiliares --------------------

interface RiskProfileRow {
  id: string;
  client_id: string;
  capacity_score: number | null;
  tolerance_score: number | null;
  perception_score: number | null;
  composure_score: number | null;
  global_score: number | null;
  profile_label: string | null;
  created_at: string;
}

interface ClientBasic {
  id: string;
  email: string;
  full_name: string | null;
}

type EquityModelWeights = Record<EquityBlockId, number>;
type FixedIncomeModelWeights = Record<FixedIncomeBlockId, number>;
type AlternativeModelWeights = Record<AlternativeBlockId, number>;

type EquitySelectedFunds = Record<EquityBlockId, string>;
type FixedIncomeSelectedFunds = Record<FixedIncomeBlockId, string>;
type AlternativeSelectedFunds = Record<AlternativeBlockId, string>;

type ConsolidatedRow = {
  assetClass: "Renta variable" | "Renta fija" | "Alternativos";
  blockId: string;
  label: string;
  neutral: number;
  model: number;
  tilt: TiltInfo;
};

// Tolerancia para considerar consistente la suma de pesos vs benchmark (en pp)
const TOLERANCIA_PESOS_PORC = 0.1;

// -------------------- Helper functions --------------------

function getEquityNeutralWeightForBlock(
  blockId: EquityBlockId,
  allocation: AssetAllocation
): number {
  const totalEquity = allocation.weights.equities;
  const regions = allocation.equityRegions;

  switch (blockId) {
    case "equity_chile":
      return (regions.chile * totalEquity) / 100;
    case "equity_latam_ex_chile":
      return (regions.latamExChile * totalEquity) / 100;
    case "equity_usa":
      return (regions.usa * totalEquity) / 100;
    case "equity_europe":
      return (regions.europe * totalEquity) / 100;
    case "equity_asia_dev":
      return (regions.asiaDev * totalEquity) / 100;
    case "equity_emergentes":
      return (regions.emergentes * totalEquity) / 100;
    default:
      return 0;
  }
}

function getFixedIncomeNeutralWeightForBlock(
  blockId: FixedIncomeBlockId,
  allocation: AssetAllocation
): number {
  const totalFI = allocation.weights.fixedIncome;
  const buckets = allocation.fixedIncomeBuckets;

  switch (blockId) {
    case "fi_chile_short":
      return (buckets.localShort * totalFI) / 100;
    case "fi_chile_long":
      return (buckets.localLong * totalFI) / 100;
    case "fi_global_ig":
      return (buckets.globalIG * totalFI) / 100;
    case "fi_global_hy":
      return (buckets.globalHY * totalFI) / 100;
    case "fi_inflation_linked":
      return (buckets.inflationLinked * totalFI) / 100;
    default:
      return 0;
  }
}

function getAlternativeNeutralWeightForBlock(
  blockId: AlternativeBlockId,
  allocation: AssetAllocation
): number {
  const totalAlt = allocation.weights.alternatives;
  const buckets = allocation.alternativeBuckets;

  switch (blockId) {
    case "alt_real_estate":
      return (buckets.realEstate * totalAlt) / 100;
    case "alt_infrastructure":
      return (buckets.infrastructure * totalAlt) / 100;
    case "alt_others":
      return (buckets.others * totalAlt) / 100;
    default:
      return 0;
  }
}

// -------------------- Componente principal --------------------

export default function ModelMode() {
  const [email, setEmail] = useState("");
  const [includeAlternatives, setIncludeAlternatives] = useState(false);
  const [universe, setUniverse] = useState<BenchmarkUniverse>("global");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [client, setClient] = useState<ClientBasic | null>(null);
  const [profile, setProfile] = useState<RiskProfileRow | null>(null);
  const [allocation, setAllocation] = useState<AssetAllocation | null>(null);

  const [equityWeights, setEquityWeights] = useState<EquityModelWeights>(
    {} as EquityModelWeights
  );
  const [fixedIncomeWeights, setFixedIncomeWeights] =
    useState<FixedIncomeModelWeights>({} as FixedIncomeModelWeights);
  const [alternativeWeights, setAlternativeWeights] =
    useState<AlternativeModelWeights>({} as AlternativeModelWeights);

  const [equityFunds, setEquityFunds] = useState<EquitySelectedFunds>(
    {} as EquitySelectedFunds
  );
  const [fixedIncomeFunds, setFixedIncomeFunds] =
    useState<FixedIncomeSelectedFunds>({} as FixedIncomeSelectedFunds);
  const [alternativeFunds, setAlternativeFunds] =
    useState<AlternativeSelectedFunds>({} as AlternativeSelectedFunds);

  // Estado para controlar qué secciones están expandidas
  const [expandedSections, setExpandedSections] = useState({
    equity: true,
    fixedIncome: false,
    alternatives: false,
  });

  // Estado para mostrar el resumen final
  const [showSummary, setShowSummary] = useState(false);
  const [showSavedModels, setShowSavedModels] = useState(false);

  // Estado para el monto del portafolio
  const [portfolioAmount, setPortfolioAmount] = useState<number | null>(null);
  const [portfolioAmountStr, setPortfolioAmountStr] = useState<string>("");

  // Estado para guardar modelo
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [saveErrorMsg, setSaveErrorMsg] = useState<string | null>(null);

  // ----------- Cargar datos desde Supabase -----------

  const handleLoad = async () => {
    setLoading(true);
    setErrorMsg(null);
    setProfile(null);
    setAllocation(null);
    setClient(null);
    setSaveMsg(null);
    setSaveErrorMsg(null);

    setEquityWeights({} as EquityModelWeights);
    setFixedIncomeWeights({} as FixedIncomeModelWeights);
    setAlternativeWeights({} as AlternativeModelWeights);

    setEquityFunds({} as EquitySelectedFunds);
    setFixedIncomeFunds({} as FixedIncomeSelectedFunds);
    setAlternativeFunds({} as AlternativeSelectedFunds);

    try {
      if (!email) {
        setErrorMsg("Ingresa un correo para buscar el cliente.");
        return;
      }

      const supabase = supabaseBrowserClient();

      // 1. Buscar cliente
      const { data: clientRow, error: clientError } = await supabase
        .from("clients")
        .select("id, email, full_name")
        .eq("email", email)
        .single();

      if (clientError || !clientRow) {
        setErrorMsg("No se encontró el cliente con ese correo.");
        return;
      }

      const clientData: ClientBasic = {
        id: clientRow.id,
        email: clientRow.email,
        full_name: clientRow.full_name,
      };
      setClient(clientData);

      // 2. Buscar perfil de riesgo
      const { data: profileRows, error: profileError } = await supabase
        .from("risk_profiles")
        .select("*")
        .eq("client_id", clientRow.id)
        .order("created_at", { ascending: false })
        .limit(1);

      if (profileError || !profileRows || profileRows.length === 0) {
        setErrorMsg("No se encontró un perfil de riesgo para este cliente.");
        return;
      }

      const profileData = profileRows[0] as RiskProfileRow;
      setProfile(profileData);

      // 3. Generar allocation basado en el score
      const alloc = getBenchmarkFromScore(
        profileData.global_score,
        includeAlternatives,
        universe
      );
      setAllocation(alloc);

      // 4. Inicializar pesos del modelo = neutral
      const eqWeights: Partial<EquityModelWeights> = {};
      EQUITY_BENCHMARKS.forEach((block) => {
        eqWeights[block.id] = getEquityNeutralWeightForBlock(block.id, alloc);
      });
      setEquityWeights(eqWeights as EquityModelWeights);

      const fiWeights: Partial<FixedIncomeModelWeights> = {};
      FIXED_INCOME_BENCHMARKS.forEach((block) => {
        fiWeights[block.id] = getFixedIncomeNeutralWeightForBlock(
          block.id,
          alloc
        );
      });
      setFixedIncomeWeights(fiWeights as FixedIncomeModelWeights);

      const altWeights: Partial<AlternativeModelWeights> = {};
      ALTERNATIVE_BENCHMARKS.forEach((block) => {
        altWeights[block.id] = getAlternativeNeutralWeightForBlock(
          block.id,
          alloc
        );
      });
      setAlternativeWeights(altWeights as AlternativeModelWeights);

      // 5. Inicializar fondos seleccionados (primer fondo de cada bloque si hay)
      const eqFunds: Partial<EquitySelectedFunds> = {};
      EQUITY_BENCHMARKS.forEach((block) => {
        if (block.compatibleFunds && block.compatibleFunds.length > 0) {
          eqFunds[block.id] = block.compatibleFunds[0].id;
        }
      });
      setEquityFunds(eqFunds as EquitySelectedFunds);

      const fiFunds: Partial<FixedIncomeSelectedFunds> = {};
      FIXED_INCOME_BENCHMARKS.forEach((block) => {
        if (block.compatibleFunds && block.compatibleFunds.length > 0) {
          fiFunds[block.id] = block.compatibleFunds[0].id;
        }
      });
      setFixedIncomeFunds(fiFunds as FixedIncomeSelectedFunds);

      const altFunds: Partial<AlternativeSelectedFunds> = {};
      ALTERNATIVE_BENCHMARKS.forEach((block) => {
        if (block.compatibleFunds && block.compatibleFunds.length > 0) {
          altFunds[block.id] = block.compatibleFunds[0].id;
        }
      });
      setAlternativeFunds(altFunds as AlternativeSelectedFunds);
    } catch (err) {
      console.error(err);
      setErrorMsg("Ocurrió un error inesperado al cargar el modelo de cartera.");
    } finally {
      setLoading(false);
    }
  };

  // ----------- Guardar modelo en Supabase -----------
  const handleSaveModel = async () => {
    if (!client || !profile || !allocation) {
      setSaveErrorMsg(
        "No hay un modelo completo para guardar. Carga un cliente y su perfil primero."
      );
      return;
    }

    if (!equityRows || !fixedIncomeRows) {
      setSaveErrorMsg(
        "Faltan datos de renta variable o renta fija para guardar el modelo."
      );
      return;
    }

    if (includeAlternatives && !alternativeRows) {
      setSaveErrorMsg(
        "Faltan datos de alternativos para guardar el modelo con alternativos."
      );
      return;
    }

    setSaving(true);
    setSaveMsg(null);
    setSaveErrorMsg(null);

    try {
      const supabase = supabaseBrowserClient();

      const equityBlocksPayload =
        equityRows?.map(({ block, neutral }) => ({
          block_id: block.id,
          label: block.label,
          neutral_weight: neutral,
          model_weight: equityWeights[block.id] ?? neutral,
          selected_fund_id: equityFunds[block.id] ?? null,
        })) ?? [];

      const fixedIncomeBlocksPayload =
        fixedIncomeRows?.map(({ block, neutral }) => ({
          block_id: block.id,
          label: block.label,
          neutral_weight: neutral,
          model_weight: fixedIncomeWeights[block.id] ?? neutral,
          selected_fund_id: fixedIncomeFunds[block.id] ?? null,
        })) ?? [];

      const alternativeBlocksPayload =
        (includeAlternatives && alternativeRows
          ? alternativeRows.map(({ block, neutral }) => ({
              block_id: block.id,
              label: block.label,
              neutral_weight: neutral,
              model_weight: alternativeWeights[block.id] ?? neutral,
              selected_fund_id: alternativeFunds[block.id] ?? null,
            }))
          : []) ?? [];

      const payload = {
        client_id: client.id,
        risk_profile_id: profile.id,
        universe,
        include_alternatives: includeAlternatives,
        portfolio_amount: portfolioAmount,
        weights: allocation.weights,
        equity_blocks: equityBlocksPayload,
        fixed_income_blocks: fixedIncomeBlocksPayload,
        alternative_blocks: alternativeBlocksPayload,
      };

      const { error } = await supabase.from("portfolio_models").insert(payload);

      if (error) {
        // OJO: nada de console.error para que no aparezca el overlay rojo
        setSaveErrorMsg(
          error.message ||
            "No se pudo guardar el modelo en la base de datos. Revisa el esquema de la tabla o las políticas de Supabase."
        );
        return;
      }

      setSaveMsg("Modelo de cartera guardado correctamente.");
    } catch (err: any) {
      setSaveErrorMsg(
        err?.message ||
          "Ocurrió un error inesperado al guardar el modelo de cartera."
      );
    } finally {
      setSaving(false);
    }
  };

  const handleLoadModel = async (model: any) => {
    try {
      // Establecer universo y alternatives
      setUniverse(model.universe);
      setIncludeAlternatives(model.include_alternatives);

      // Restaurar monto del portafolio si existe
      if (model.portfolio_amount) {
        setPortfolioAmount(model.portfolio_amount);
        setPortfolioAmountStr(model.portfolio_amount.toLocaleString("es-CL"));
      } else {
        setPortfolioAmount(null);
        setPortfolioAmountStr("");
      }

      // Cargar allocation desde el modelo guardado
      const alloc = getBenchmarkFromScore(
        profile?.global_score || 50,
        model.include_alternatives,
        model.universe
      );
      setAllocation(alloc);

      // Reconstruir pesos de equity
      const eqWeights: Partial<EquityModelWeights> = {};
      model.equity_blocks.forEach((block: any) => {
        eqWeights[block.block_id as EquityBlockId] = block.model_weight;
      });
      setEquityWeights(eqWeights as EquityModelWeights);

      // Reconstruir fondos de equity
      const eqFunds: Partial<EquitySelectedFunds> = {};
      model.equity_blocks.forEach((block: any) => {
        if (block.selected_fund_id) {
          eqFunds[block.block_id as EquityBlockId] = block.selected_fund_id;
        }
      });
      setEquityFunds(eqFunds as EquitySelectedFunds);

      // Reconstruir pesos de fixed income
      const fiWeights: Partial<FixedIncomeModelWeights> = {};
      model.fixed_income_blocks.forEach((block: any) => {
        fiWeights[block.block_id as FixedIncomeBlockId] = block.model_weight;
      });
      setFixedIncomeWeights(fiWeights as FixedIncomeModelWeights);

      // Reconstruir fondos de fixed income
      const fiFunds: Partial<FixedIncomeSelectedFunds> = {};
      model.fixed_income_blocks.forEach((block: any) => {
        if (block.selected_fund_id) {
          fiFunds[block.block_id as FixedIncomeBlockId] = block.selected_fund_id;
        }
      });
      setFixedIncomeFunds(fiFunds as FixedIncomeSelectedFunds);

      // Reconstruir pesos de alternatives si aplica
      if (model.include_alternatives && model.alternative_blocks) {
        const altWeights: Partial<AlternativeModelWeights> = {};
        model.alternative_blocks.forEach((block: any) => {
          altWeights[block.block_id as AlternativeBlockId] = block.model_weight;
        });
        setAlternativeWeights(altWeights as AlternativeModelWeights);

        const altFunds: Partial<AlternativeSelectedFunds> = {};
        model.alternative_blocks.forEach((block: any) => {
          if (block.selected_fund_id) {
            altFunds[block.block_id as AlternativeBlockId] = block.selected_fund_id;
          }
        });
        setAlternativeFunds(altFunds as AlternativeSelectedFunds);
      }

      // Cerrar modal y mostrar mensaje de éxito
      setShowSavedModels(false);
      setSaveMsg("Modelo cargado correctamente.");

      // Limpiar mensaje después de 3 segundos
      setTimeout(() => setSaveMsg(null), 3000);
    } catch (err) {
      console.error("Error cargando modelo:", err);
      setSaveErrorMsg("Error al cargar el modelo guardado.");
    }
  };

  // ----------- Handlers de cambios en pesos y fondos -----------

  const handleChangeEquityWeight = (blockId: EquityBlockId, value: string) => {
    const num = Number(value.replace(",", "."));
    if (isNaN(num)) return;
    setEquityWeights((prev) => ({ ...prev, [blockId]: num }));
    setSaveMsg(null);
    setSaveErrorMsg(null);
  };

  const handleChangeFixedIncomeWeight = (
    blockId: FixedIncomeBlockId,
    value: string
  ) => {
    const num = Number(value.replace(",", "."));
    if (isNaN(num)) return;
    setFixedIncomeWeights((prev) => ({ ...prev, [blockId]: num }));
    setSaveMsg(null);
    setSaveErrorMsg(null);
  };

  const handleChangeAlternativeWeight = (
    blockId: AlternativeBlockId,
    value: string
  ) => {
    const num = Number(value.replace(",", "."));
    if (isNaN(num)) return;
    setAlternativeWeights((prev) => ({ ...prev, [blockId]: num }));
    setSaveMsg(null);
    setSaveErrorMsg(null);
  };

  const handleChangeEquityFund = (blockId: EquityBlockId, fundId: string) => {
    setEquityFunds((prev) => ({ ...prev, [blockId]: fundId }));
    setSaveMsg(null);
    setSaveErrorMsg(null);
  };

  const handleChangeFixedIncomeFund = (
    blockId: FixedIncomeBlockId,
    fundId: string
  ) => {
    setFixedIncomeFunds((prev) => ({ ...prev, [blockId]: fundId }));
    setSaveMsg(null);
    setSaveErrorMsg(null);
  };

  const handleChangeAlternativeFund = (
    blockId: AlternativeBlockId,
    fundId: string
  ) => {
    setAlternativeFunds((prev) => ({ ...prev, [blockId]: fundId }));
    setSaveMsg(null);
    setSaveErrorMsg(null);
  };

  // Toggle de secciones expandidas
  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  // ----------- Construcción de filas para cada sección -----------

  const equityRows =
    allocation &&
    (EQUITY_BENCHMARKS.map((block) => {
      const neutral = getEquityNeutralWeightForBlock(block.id, allocation);
      const model = equityWeights[block.id] ?? neutral;
      const tilt = classifyTilt(neutral, model);
      return { block, neutral, model, tilt };
    }) as {
      block: EquityBenchmarkDefinition;
      neutral: number;
      model: number;
      tilt: TiltInfo;
    }[]);

  const fixedIncomeRows =
    allocation &&
    (FIXED_INCOME_BENCHMARKS.map((block) => {
      const neutral = getFixedIncomeNeutralWeightForBlock(block.id, allocation);
      const model = fixedIncomeWeights[block.id] ?? neutral;
      const tilt = classifyTilt(neutral, model);
      return { block, neutral, model, tilt };
    }) as {
      block: FixedIncomeBenchmarkDefinition;
      neutral: number;
      model: number;
      tilt: TiltInfo;
    }[]);

  const alternativeRows =
    allocation &&
    (ALTERNATIVE_BENCHMARKS.map((block) => {
      const neutral = getAlternativeNeutralWeightForBlock(block.id, allocation);
      const model = alternativeWeights[block.id] ?? neutral;
      const tilt = classifyTilt(neutral, model);
      return { block, neutral, model, tilt };
    }) as {
      block: AlternativeBenchmarkDefinition;
      neutral: number;
      model: number;
      tilt: TiltInfo;
    }[]);

  // -------------------- Vista consolidada de tilts --------------------
  const consolidatedRows: ConsolidatedRow[] = [];

  if (equityRows) {
    equityRows.forEach(({ block, neutral, model, tilt }) => {
      consolidatedRows.push({
        assetClass: "Renta variable",
        blockId: block.id,
        label: block.label,
        neutral,
        model,
        tilt,
      });
    });
  }

  if (fixedIncomeRows) {
    fixedIncomeRows.forEach(({ block, neutral, model, tilt }) => {
      consolidatedRows.push({
        assetClass: "Renta fija",
        blockId: block.id,
        label: block.label,
        neutral,
        model,
        tilt,
      });
    });
  }

  if (alternativeRows) {
    alternativeRows.forEach(({ block, neutral, model, tilt }) => {
      consolidatedRows.push({
        assetClass: "Alternativos",
        blockId: block.id,
        label: block.label,
        neutral,
        model,
        tilt,
      });
    });
  }

  const canSaveModel =
    !!allocation &&
    !!client &&
    !!profile &&
    !!equityRows &&
    !!fixedIncomeRows &&
    (!includeAlternatives || !!alternativeRows);

  // -------------------- Render --------------------

  return (
    <div className="space-y-6">
      {/* Panel de busqueda */}
        <section className="bg-white border border-gb-border rounded-lg p-6">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-5 h-5 text-gb-black" />
            <h2 className="text-lg font-semibold text-gb-black">
              Configuracion del Cliente
            </h2>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gb-dark mb-2">
                  Correo del cliente
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="cliente@ejemplo.com"
                  className="w-full border border-gb-border rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-gb-accent transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gb-dark mb-2">
                  Monto del Portafolio (opcional)
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gb-gray font-medium text-sm">
                    $
                  </span>
                  <input
                    type="text"
                    value={portfolioAmountStr}
                    onChange={(e) => {
                      const value = e.target.value.replace(/[^0-9.,]/g, "");
                      setPortfolioAmountStr(value);
                      const num = parseFloat(value.replace(/,/g, "").replace(/\./g, ""));
                      setPortfolioAmount(isNaN(num) ? null : num);
                    }}
                    placeholder="10.000.000"
                    className="w-full border border-gb-border rounded-lg pl-8 pr-20 py-2.5 text-sm focus:outline-none focus:border-gb-accent transition-all"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-gb-gray font-medium">
                    USD/CLP
                  </span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-3">
                <label className="block text-xs font-medium text-gb-dark mb-2">
                  Universo de inversion
                </label>
                <div className="flex gap-3">
                  <label
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 border rounded-lg cursor-pointer transition-all"
                    style={{
                      borderColor:
                        universe === "global" ? "var(--gb-black)" : "var(--gb-border)",
                      backgroundColor:
                        universe === "global" ? "var(--gb-light)" : "white",
                    }}
                  >
                    <input
                      type="radio"
                      checked={universe === "global"}
                      onChange={() => setUniverse("global")}
                      className="text-gb-black"
                    />
                    <span className="text-sm font-medium">Global</span>
                  </label>

                  <label
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 border rounded-lg cursor-pointer transition-all"
                    style={{
                      borderColor:
                        universe === "solo_chile" ? "var(--gb-black)" : "var(--gb-border)",
                      backgroundColor:
                        universe === "solo_chile" ? "var(--gb-light)" : "white",
                    }}
                  >
                    <input
                      type="radio"
                      checked={universe === "solo_chile"}
                      onChange={() => setUniverse("solo_chile")}
                      className="text-gb-black"
                    />
                    <span className="text-sm font-medium">Solo Chile</span>
                  </label>
                </div>
              </div>
            </div>

            <label className="flex items-center gap-2 px-4 py-3 bg-gb-light rounded-lg border border-gb-border">
              <input
                type="checkbox"
                checked={includeAlternatives}
                onChange={(e) => setIncludeAlternatives(e.target.checked)}
                className="w-4 h-4 rounded"
              />
              <span className="text-sm text-gb-dark">
                Incluir activos alternativos en el benchmark
              </span>
            </label>

            <button
              onClick={handleLoad}
              disabled={loading || !email}
              className="w-full bg-gb-black text-white font-semibold py-3 px-6 rounded-lg hover:bg-gb-dark disabled:bg-gray-300 disabled:cursor-not-allowed transition-all"
            >
              {loading ? "Cargando..." : "Cargar Perfil y Generar Modelo"}
            </button>
          </div>

          {errorMsg && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-800">{errorMsg}</p>
            </div>
          )}

          {client && (
            <div className="mt-4 p-3 bg-gb-light border border-gb-border rounded-lg text-sm text-gb-dark">
              <span className="font-semibold">Cliente:</span>{" "}
              {client.full_name || client.email}
            </div>
          )}
        </section>

        {/* Informacion del perfil de riesgo */}
        {profile && allocation && (
          <section className="bg-white border border-gb-border rounded-lg p-6">
            <div className="flex items-center gap-2 mb-4">
              <Shield className="w-5 h-5 text-gb-black" />
              <h3 className="text-lg font-semibold text-gb-black">
                Perfil de Riesgo del Cliente
              </h3>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <ScoreCard label="Capacidad" score={profile.capacity_score} />
              <ScoreCard label="Tolerancia" score={profile.tolerance_score} />
              <ScoreCard label="Percepcion" score={profile.perception_score} />
              <ScoreCard label="Compostura" score={profile.composure_score} />
              <ScoreCard
                label="Score Global"
                score={profile.global_score}
                highlight
              />
            </div>

            <div className="mt-4 p-4 bg-gb-light rounded-lg border border-gb-border">
              <p className="text-sm text-gb-dark mb-2">
                <span className="font-semibold">Perfil:</span>{" "}
                {profile.profile_label || "N/A"}
              </p>
              <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div>
                  <span className="text-gb-gray font-medium">
                    Renta Variable:
                  </span>
                  <span className="ml-2 font-bold text-gb-black">
                    {allocation.weights.equities.toFixed(1)}%
                  </span>
                </div>
                <div>
                  <span className="text-gb-gray font-medium">Renta Fija:</span>
                  <span className="ml-2 font-bold text-gb-dark">
                    {allocation.weights.fixedIncome.toFixed(1)}%
                  </span>
                </div>
                <div>
                  <span className="text-gb-gray font-medium">
                    Alternativos:
                  </span>
                  <span className="ml-2 font-bold text-gb-dark">
                    {allocation.weights.alternatives.toFixed(1)}%
                  </span>
                </div>
                <div>
                  <span className="text-gb-gray font-medium">Efectivo:</span>
                  <span className="ml-2 font-bold text-gb-dark">
                    {allocation.weights.cash.toFixed(1)}%
                  </span>
                </div>
              </div>
            </div>

            {/* Mostrar monto del portafolio si existe */}
            {portfolioAmount && (
              <div className="mt-4 p-4 bg-gb-light rounded-lg border border-gb-border">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-2 bg-gb-black rounded-lg">
                      <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <span className="text-sm font-semibold text-gb-dark">
                      Monto del Portafolio:
                    </span>
                  </div>
                  <span className="text-2xl font-bold text-gb-black">
                    ${portfolioAmount.toLocaleString("es-CL", {
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 0,
                    })}
                  </span>
                </div>
              </div>
            )}
          </section>
        )}

        {/* Secciones de Asset Classes con Acordeones */}
        {allocation && equityRows && (
          <div className="space-y-4">
            {/* Renta Variable */}
            <AssetClassSection
              title="Renta Variable"
              icon={<TrendingUp className="w-5 h-5" />}
              color="emerald"
              isExpanded={expandedSections.equity}
              onToggle={() => toggleSection("equity")}
              totalWeight={allocation.weights.equities}
            >
              <EquityTable
                rows={equityRows}
                modelWeights={equityWeights}
                selectedFunds={equityFunds}
                benchmarkTotal={allocation.weights.equities}
                onChangeWeight={handleChangeEquityWeight}
                onChangeFund={handleChangeEquityFund}
              />

              {/* Tabla de valores absolutos */}
              {portfolioAmount && (
                <AbsoluteValuesTable
                  rows={equityRows}
                  portfolioAmount={portfolioAmount}
                  assetClass="Renta Variable"
                  color="blue"
                />
              )}
            </AssetClassSection>

            {/* Renta Fija */}
            {fixedIncomeRows && (
              <AssetClassSection
                title="Renta Fija"
                icon={<Shield className="w-5 h-5" />}
                color="blue"
                isExpanded={expandedSections.fixedIncome}
                onToggle={() => toggleSection("fixedIncome")}
                totalWeight={allocation.weights.fixedIncome}
              >
                <FixedIncomeTable
                  rows={fixedIncomeRows}
                  modelWeights={fixedIncomeWeights}
                  selectedFunds={fixedIncomeFunds}
                  benchmarkTotal={allocation.weights.fixedIncome}
                  onChangeWeight={handleChangeFixedIncomeWeight}
                  onChangeFund={handleChangeFixedIncomeFund}
                />

                {/* Tabla de valores absolutos */}
                {portfolioAmount && (
                  <AbsoluteValuesTable
                    rows={fixedIncomeRows}
                    portfolioAmount={portfolioAmount}
                    assetClass="Renta Fija"
                    color="slate"
                  />
                )}
              </AssetClassSection>
            )}

            {/* Alternativos */}
            {includeAlternatives && alternativeRows && (
              <AssetClassSection
                title="Activos Alternativos"
                icon={<Landmark className="w-5 h-5" />}
                color="purple"
                isExpanded={expandedSections.alternatives}
                onToggle={() => toggleSection("alternatives")}
                totalWeight={allocation.weights.alternatives}
              >
                <AlternativeTable
                  rows={alternativeRows}
                  modelWeights={alternativeWeights}
                  selectedFunds={alternativeFunds}
                  benchmarkTotal={allocation.weights.alternatives}
                  onChangeWeight={handleChangeAlternativeWeight}
                  onChangeFund={handleChangeAlternativeFund}
                />

                {/* Tabla de valores absolutos */}
                {portfolioAmount && (
                  <AbsoluteValuesTable
                    rows={alternativeRows}
                    portfolioAmount={portfolioAmount}
                    assetClass="Alternativos"
                    color="indigo"
                  />
                )}
              </AssetClassSection>
            )}
          </div>
        )}

        {/* Panel de Comentarios Automaticos */}
        {allocation && consolidatedRows.length > 0 && (
          <CommentaryPanel rows={consolidatedRows} />
        )}

        {/* Botones de guardar y resumen final */}
        {allocation && (
          <div className="flex flex-col md:flex-row justify-center gap-3 mt-8">
            <button
              onClick={handleSaveModel}
              disabled={!canSaveModel || saving}
              className="flex items-center justify-center gap-2 bg-gb-black text-white font-semibold py-3 px-6 rounded-lg hover:bg-gb-dark disabled:bg-gray-300 disabled:cursor-not-allowed transition-all"
            >
              <Save className="w-5 h-5" />
              {saving ? "Guardando modelo..." : "Guardar Modelo de Cartera"}
            </button>

            <button
              onClick={() => setShowSavedModels(true)}
              disabled={!client}
              className="flex items-center justify-center gap-2 bg-gb-black text-white font-semibold py-3 px-6 rounded-lg hover:bg-gb-dark disabled:bg-gray-300 disabled:cursor-not-allowed transition-all"
            >
              <History className="w-5 h-5" />
              Ver Modelos Guardados
            </button>

            <button
              onClick={() => setShowSummary(!showSummary)}
              className="flex items-center justify-center gap-2 bg-gb-black text-white font-semibold py-3 px-6 rounded-lg hover:bg-gb-dark transition-all"
            >
              <FileText className="w-5 h-5" />
              {showSummary
                ? "Ocultar Resumen Final"
                : "Ver Resumen Final del Modelo"}
            </button>
          </div>
        )}

        {/* Mensajes de guardado */}
        {(saveMsg || saveErrorMsg) && (
          <div className="max-w-3xl mx-auto">
            {saveMsg && (
              <div className="mt-4 p-4 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-800">
                {saveMsg}
              </div>
            )}
            {saveErrorMsg && (
              <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
                {saveErrorMsg}
              </div>
            )}
          </div>
        )}

        {/* Modal/Panel de Resumen Final */}
        {showSummary && allocation && (
          <FinalSummary
            profile={profile}
            allocation={allocation}
            equityRows={equityRows}
            fixedIncomeRows={fixedIncomeRows}
            alternativeRows={alternativeRows}
            equityFunds={equityFunds}
            fixedIncomeFunds={fixedIncomeFunds}
            alternativeFunds={alternativeFunds}
            consolidatedRows={consolidatedRows}
            onClose={() => setShowSummary(false)}
          />
        )}

        {/* Modal de Modelos Guardados */}
        {showSavedModels && client && (
          <SavedModels
            clientId={client.id}
            clientEmail={client.email}
            onLoadModel={handleLoadModel}
            onClose={() => setShowSavedModels(false)}
          />
        )}
    </div>
  );
}

// ========== COMPONENTES AUXILIARES ==========

// Absolute Values Table Component
interface AbsoluteValuesTableProps {
  rows: any[];
  portfolioAmount: number;
  assetClass: string;
  color: "blue" | "slate" | "indigo";
}

function AbsoluteValuesTable({
  rows,
  portfolioAmount,
  assetClass,
}: AbsoluteValuesTableProps) {
  return (
    <div
      className="mt-4 rounded-lg border p-4 bg-gb-light border-gb-border"
    >
      <h4
        className="text-xs font-semibold mb-3 flex items-center gap-2 text-gb-black"
      >
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        Valores Absolutos - {assetClass}
      </h4>
      <div className="space-y-2">
        {rows.map(({ block, model }: any) => {
          const absoluteValue = (model / 100) * portfolioAmount;
          return (
            <div
              key={block.id}
              className="flex justify-between items-center bg-white rounded-lg px-4 py-2.5 border border-gb-border"
            >
              <span className="text-sm font-medium text-gb-dark">
                {block.label}
              </span>
              <div className="text-right">
                <div className="text-sm font-bold text-gb-black">
                  $
                  {absoluteValue.toLocaleString("es-CL", {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 0,
                  })}
                </div>
                <div className="text-xs text-gb-gray">
                  {model.toFixed(1)}%
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-3 pt-3 border-t border-gb-border">
        <div className="flex justify-between items-center font-bold bg-white rounded-lg px-4 py-2.5">
          <span className="text-sm text-gb-dark">Total {assetClass}:</span>
          <span className="text-base text-gb-black">
            $
            {rows
              .reduce(
                (sum: number, { model }: any) => sum + (model / 100) * portfolioAmount,
                0
              )
              .toLocaleString("es-CL", {
                minimumFractionDigits: 0,
                maximumFractionDigits: 0,
              })}
          </span>
        </div>
      </div>
    </div>
  );
}

// Score Card Component
function ScoreCard({
  label,
  score,
  highlight = false,
}: {
  label: string;
  score: number | null;
  highlight?: boolean;
}) {
  return (
    <div
      className={`p-4 rounded-lg ${
        highlight
          ? "bg-gb-black text-white"
          : "bg-white border border-gb-border"
      }`}
    >
      <p
        className={`text-xs font-semibold mb-1 ${
          highlight ? "text-gray-300" : "text-gb-gray"
        }`}
      >
        {label}
      </p>
      <p
        className={`text-3xl font-bold ${
          highlight ? "text-white" : "text-gb-black"
        }`}
      >
        {score !== null ? score.toFixed(0) : "N/A"}
      </p>
    </div>
  );
}

// Asset Class Section Component
interface AssetClassSectionProps {
  title: string;
  icon: React.ReactNode;
  color: "emerald" | "blue" | "purple";
  isExpanded: boolean;
  onToggle: () => void;
  totalWeight: number;
  children: React.ReactNode;
}

function AssetClassSection({
  title,
  icon,
  isExpanded,
  onToggle,
  totalWeight,
  children,
}: AssetClassSectionProps) {
  return (
    <div
      className="bg-white border border-gb-border rounded-lg overflow-hidden"
    >
      <button
        onClick={onToggle}
        className="w-full px-6 py-4 flex items-center justify-between hover:bg-gb-light transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="text-gb-black">{icon}</div>
          <h3 className="text-sm font-semibold text-gb-black">{title}</h3>
          <span
            className="px-3 py-1 rounded-full text-xs font-bold bg-gb-light text-gb-black border border-gb-border"
          >
            {totalWeight.toFixed(1)}%
          </span>
        </div>
        {isExpanded ? (
          <ChevronUp className="w-5 h-5 text-gb-gray" />
        ) : (
          <ChevronDown className="w-5 h-5 text-gb-gray" />
        )}
      </button>

      {isExpanded && <div className="px-6 pb-6">{children}</div>}
    </div>
  );
}

// Tilt Badge Component
function TiltBadge({ tilt }: { tilt: TiltInfo }) {
  const label = tiltLabel(tilt.level);

  let colorClasses = "bg-slate-100 text-slate-700 border border-slate-200";
  if (tilt.level === "underweight" || tilt.level === "underweight_strong") {
    colorClasses =
      tilt.level === "underweight_strong"
        ? "bg-red-100 text-red-800 border border-red-300"
        : "bg-orange-100 text-orange-800 border border-orange-300";
  } else if (
    tilt.level === "overweight" ||
    tilt.level === "overweight_strong"
  ) {
    colorClasses =
      tilt.level === "overweight_strong"
        ? "bg-blue-100 text-blue-800 border border-blue-300"
        : "bg-cyan-100 text-cyan-800 border border-cyan-300";
  }

  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${colorClasses}`}
    >
      {label}
    </span>
  );
}

// Tables Components
interface EquityRow {
  block: EquityBenchmarkDefinition;
  neutral: number;
  model: number;
  tilt: TiltInfo;
}

interface EquityTableProps {
  rows: EquityRow[];
  modelWeights: EquityModelWeights;
  selectedFunds: EquitySelectedFunds;
  benchmarkTotal: number;
  onChangeWeight: (id: EquityBlockId, value: string) => void;
  onChangeFund: (id: EquityBlockId, fundId: string) => void;
}

function EquityTable({
  rows,
  modelWeights,
  selectedFunds,
  benchmarkTotal,
  onChangeWeight,
  onChangeFund,
}: EquityTableProps) {
  const totalModelo = rows.reduce((sum, { block, neutral }) => {
    const w = modelWeights[block.id] ?? neutral;
    return sum + w;
  }, 0);

  const diff = totalModelo - benchmarkTotal;
  const hayDescuadre = Math.abs(diff) > TOLERANCIA_PESOS_PORC;

  return (
    <>
      <div className="mb-3 flex items-center justify-between text-xs md:text-sm">
        <div>
          <span className="font-semibold text-gb-dark">
            Total modelo renta variable:
          </span>
          <span className="ml-2 font-bold text-gb-black">
            {totalModelo.toFixed(1)}%
          </span>
          <span className="ml-2 text-gb-gray">
            (benchmark: {benchmarkTotal.toFixed(1)}%)
          </span>
        </div>

        {hayDescuadre ? (
          <span className="inline-flex items-center px-2 py-1 rounded-full bg-red-50 border border-red-200 text-[11px] md:text-xs font-semibold text-red-700">
            Descuadre de{" "}
            {(diff >= 0 ? "+" : "") + diff.toFixed(1)} pp vs benchmark
          </span>
        ) : (
          <span className="inline-flex items-center px-2 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-[11px] md:text-xs font-semibold text-emerald-700">
            Suma consistente con el benchmark
          </span>
        )}
      </div>

      <div className="bg-white rounded-lg border border-gb-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gb-light border-b border-gb-border">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gb-dark uppercase tracking-wider">
                  Region
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gb-dark uppercase tracking-wider">
                  % Neutral
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gb-dark uppercase tracking-wider">
                  % Modelo
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gb-dark uppercase tracking-wider">
                  Diferencia
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gb-dark uppercase tracking-wider">
                  Tilt
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gb-dark uppercase tracking-wider">
                  Indice
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gb-dark uppercase tracking-wider">
                  Instrumento
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gb-border">
              {rows.map(({ block, neutral, model, tilt }) => {
                const fundOptions = block.compatibleFunds;
                const selectedFundId = selectedFunds[block.id] ?? "";

                return (
                  <tr
                    key={block.id}
                    className="hover:bg-gb-light transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="flex flex-col">
                        <span className="font-medium text-gb-black">
                          {block.label}
                        </span>
                        <span className="text-xs text-gb-gray">
                          {block.region}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-gb-dark font-medium">
                      {neutral.toFixed(1)}%
                    </td>
                    <td className="px-4 py-3 text-right">
                      <input
                        type="number"
                        step="0.1"
                        value={modelWeights[block.id] ?? neutral}
                        onChange={(e) => onChangeWeight(block.id, e.target.value)}
                        className="w-20 border border-gb-border rounded-lg px-2 py-1 text-right text-sm bg-white focus:outline-none focus:border-gb-accent transition-all"
                      />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span
                        className={`font-semibold ${
                          tilt.diff >= 0 ? "text-blue-700" : "text-red-700"
                        }`}
                      >
                        {tilt.diff >= 0 ? "+" : ""}
                        {tilt.diff.toFixed(1)} pp
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <TiltBadge tilt={tilt} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col">
                        <span className="text-gb-dark text-xs font-medium">
                          {block.indexName}
                        </span>
                        <span className="text-xs text-gb-gray">
                          {block.indexProvider}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {fundOptions && fundOptions.length > 0 ? (
                        <select
                          className="w-full border border-gb-border rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:border-gb-accent transition-all"
                          value={selectedFundId}
                          onChange={(e) =>
                            onChangeFund(block.id, e.target.value)
                          }
                        >
                          {fundOptions.map((f) => (
                            <option key={f.id} value={f.id}>
                              {f.name} - {f.provider}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-xs text-gb-gray italic">
                          Sin fondos disponibles
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

interface FixedIncomeRow {
  block: FixedIncomeBenchmarkDefinition;
  neutral: number;
  model: number;
  tilt: TiltInfo;
}

interface FixedIncomeTableProps {
  rows: FixedIncomeRow[];
  modelWeights: FixedIncomeModelWeights;
  selectedFunds: FixedIncomeSelectedFunds;
  benchmarkTotal: number;
  onChangeWeight: (id: FixedIncomeBlockId, value: string) => void;
  onChangeFund: (id: FixedIncomeBlockId, fundId: string) => void;
}

function FixedIncomeTable({
  rows,
  modelWeights,
  selectedFunds,
  benchmarkTotal,
  onChangeWeight,
  onChangeFund,
}: FixedIncomeTableProps) {
  const totalModelo = rows.reduce((sum, { block, neutral }) => {
    const w = modelWeights[block.id] ?? neutral;
    return sum + w;
  }, 0);

  const diff = totalModelo - benchmarkTotal;
  const hayDescuadre = Math.abs(diff) > TOLERANCIA_PESOS_PORC;

  return (
    <>
      <div className="mb-3 flex items-center justify-between text-xs md:text-sm">
        <div>
          <span className="font-semibold text-gb-dark">
            Total modelo renta fija:
          </span>
          <span className="ml-2 font-bold text-gb-black">
            {totalModelo.toFixed(1)}%
          </span>
          <span className="ml-2 text-gb-gray">
            (benchmark: {benchmarkTotal.toFixed(1)}%)
          </span>
        </div>

        {hayDescuadre ? (
          <span className="inline-flex items-center px-2 py-1 rounded-full bg-red-50 border border-red-200 text-[11px] md:text-xs font-semibold text-red-700">
            Descuadre de{" "}
            {(diff >= 0 ? "+" : "") + diff.toFixed(1)} pp vs benchmark
          </span>
        ) : (
          <span className="inline-flex items-center px-2 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-[11px] md:text-xs font-semibold text-emerald-700">
            Suma consistente con el benchmark
          </span>
        )}
      </div>

      <div className="bg-white rounded-lg border border-gb-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gb-light border-b border-gb-border">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gb-dark uppercase tracking-wider">
                  Segmento
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gb-dark uppercase tracking-wider">
                  % Neutral
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gb-dark uppercase tracking-wider">
                  % Modelo
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gb-dark uppercase tracking-wider">
                  Diferencia
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gb-dark uppercase tracking-wider">
                  Tilt
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gb-dark uppercase tracking-wider">
                  Indice
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gb-dark uppercase tracking-wider">
                  Instrumento
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gb-border">
              {rows.map(({ block, neutral, model, tilt }) => {
                const fundOptions = block.compatibleFunds;
                const selectedFundId = selectedFunds[block.id] ?? "";

                return (
                  <tr
                    key={block.id}
                    className="hover:bg-gb-light transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="flex flex-col">
                        <span className="font-medium text-gb-black">
                          {block.label}
                        </span>
                        <span className="text-xs text-gb-gray">
                          {block.description}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-gb-dark font-medium">
                      {neutral.toFixed(1)}%
                    </td>
                    <td className="px-4 py-3 text-right">
                      <input
                        type="number"
                        step="0.1"
                        value={modelWeights[block.id] ?? neutral}
                        onChange={(e) => onChangeWeight(block.id, e.target.value)}
                        className="w-20 border border-gb-border rounded-lg px-2 py-1 text-right text-sm bg-white focus:outline-none focus:border-gb-accent transition-all"
                      />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span
                        className={`font-semibold ${
                          tilt.diff >= 0 ? "text-blue-700" : "text-red-700"
                        }`}
                      >
                        {tilt.diff >= 0 ? "+" : ""}
                        {tilt.diff.toFixed(1)} pp
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <TiltBadge tilt={tilt} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col">
                        <span className="text-gb-dark text-xs font-medium">
                          {block.indexName}
                        </span>
                        <span className="text-xs text-gb-gray">
                          {block.indexProvider}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {fundOptions && fundOptions.length > 0 ? (
                        <select
                          className="w-full border border-gb-border rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:border-gb-accent transition-all"
                          value={selectedFundId}
                          onChange={(e) =>
                            onChangeFund(block.id, e.target.value)
                          }
                        >
                          {fundOptions.map((f) => (
                            <option key={f.id} value={f.id}>
                              {f.name} - {f.provider}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-xs text-gb-gray italic">
                          Sin fondos disponibles
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

interface AlternativeRow {
  block: AlternativeBenchmarkDefinition;
  neutral: number;
  model: number;
  tilt: TiltInfo;
}

interface AlternativeTableProps {
  rows: AlternativeRow[];
  modelWeights: AlternativeModelWeights;
  selectedFunds: AlternativeSelectedFunds;
  benchmarkTotal: number;
  onChangeWeight: (id: AlternativeBlockId, value: string) => void;
  onChangeFund: (id: AlternativeBlockId, fundId: string) => void;
}

function AlternativeTable({
  rows,
  modelWeights,
  selectedFunds,
  benchmarkTotal,
  onChangeWeight,
  onChangeFund,
}: AlternativeTableProps) {
  const totalModelo = rows.reduce((sum, { block, neutral }) => {
    const w = modelWeights[block.id] ?? neutral;
    return sum + w;
  }, 0);

  const diff = totalModelo - benchmarkTotal;
  const hayDescuadre = Math.abs(diff) > TOLERANCIA_PESOS_PORC;

  return (
    <>
      <div className="mb-3 flex items-center justify-between text-xs md:text-sm">
        <div>
          <span className="font-semibold text-gb-dark">
            Total modelo alternativos:
          </span>
          <span className="ml-2 font-bold text-gb-black">
            {totalModelo.toFixed(1)}%
          </span>
          <span className="ml-2 text-gb-gray">
            (benchmark: {benchmarkTotal.toFixed(1)}%)
          </span>
        </div>

        {hayDescuadre ? (
          <span className="inline-flex items-center px-2 py-1 rounded-full bg-red-50 border border-red-200 text-[11px] md:text-xs font-semibold text-red-700">
            Descuadre de{" "}
            {(diff >= 0 ? "+" : "") + diff.toFixed(1)} pp vs benchmark
          </span>
        ) : (
          <span className="inline-flex items-center px-2 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-[11px] md:text-xs font-semibold text-emerald-700">
            Suma consistente con el benchmark
          </span>
        )}
      </div>

      <div className="bg-white rounded-lg border border-gb-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gb-light border-b border-gb-border">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gb-dark uppercase tracking-wider">
                  Categoria
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gb-dark uppercase tracking-wider">
                  % Neutral
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gb-dark uppercase tracking-wider">
                  % Modelo
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gb-dark uppercase tracking-wider">
                  Diferencia
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gb-dark uppercase tracking-wider">
                  Tilt
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gb-dark uppercase tracking-wider">
                  Indice
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gb-dark uppercase tracking-wider">
                  Instrumento
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gb-border">
              {rows.map(({ block, neutral, model, tilt }) => {
                const fundOptions = block.compatibleFunds;
                const selectedFundId = selectedFunds[block.id] ?? "";

                return (
                  <tr
                    key={block.id}
                    className="hover:bg-gb-light transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="flex flex-col">
                        <span className="font-medium text-gb-black">
                          {block.label}
                        </span>
                        <span className="text-xs text-gb-gray">
                          {block.description}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-gb-dark font-medium">
                      {neutral.toFixed(1)}%
                    </td>
                    <td className="px-4 py-3 text-right">
                      <input
                        type="number"
                        step="0.1"
                        value={modelWeights[block.id] ?? neutral}
                        onChange={(e) => onChangeWeight(block.id, e.target.value)}
                        className="w-20 border border-gb-border rounded-lg px-2 py-1 text-right text-sm bg-white focus:outline-none focus:border-gb-accent transition-all"
                      />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span
                        className={`font-semibold ${
                          tilt.diff >= 0 ? "text-blue-700" : "text-red-700"
                        }`}
                      >
                        {tilt.diff >= 0 ? "+" : ""}
                        {tilt.diff.toFixed(1)} pp
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <TiltBadge tilt={tilt} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col">
                        <span className="text-gb-dark text-xs font-medium">
                          {block.indexName}
                        </span>
                        <span className="text-xs text-gb-gray">
                          {block.indexProvider}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {fundOptions && fundOptions.length > 0 ? (
                        <select
                          className="w-full border border-gb-border rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:border-gb-accent transition-all"
                          value={selectedFundId}
                          onChange={(e) =>
                            onChangeFund(block.id, e.target.value)
                          }
                        >
                          {fundOptions.map((f) => (
                            <option key={f.id} value={f.id}>
                              {f.name} - {f.provider}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-xs text-gb-gray italic">
                          Sin fondos disponibles
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

// Final Summary Component
interface FinalSummaryProps {
  profile: RiskProfileRow | null;
  allocation: AssetAllocation;
  equityRows: EquityRow[] | null;
  fixedIncomeRows: FixedIncomeRow[] | null;
  alternativeRows: AlternativeRow[] | null;
  equityFunds: EquitySelectedFunds;
  fixedIncomeFunds: FixedIncomeSelectedFunds;
  alternativeFunds: AlternativeSelectedFunds;
  consolidatedRows: ConsolidatedRow[];
  onClose: () => void;
}

function FinalSummary({
  profile,
  allocation,
  equityRows,
  fixedIncomeRows,
  alternativeRows,
  equityFunds,
  fixedIncomeFunds,
  alternativeFunds,
  consolidatedRows,
  onClose,
}: FinalSummaryProps) {
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white border border-gb-border rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-gb-black text-white px-6 py-4 flex justify-between items-center rounded-t-lg">
          <div className="flex items-center gap-3">
            <FileText className="w-6 h-6" />
            <h2 className="text-xl font-bold">Resumen Final del Modelo</h2>
          </div>
          <button
            onClick={onClose}
            className="text-white hover:bg-white/20 rounded-lg p-2 transition-colors"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Client Info */}
          {profile && (
            <section className="bg-gb-light rounded-lg p-6 border border-gb-border">
              <h3 className="text-sm font-semibold text-gb-black mb-4">
                Perfil del Cliente
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                <div>
                  <span className="text-gb-gray">Score Global:</span>
                  <span className="ml-2 font-bold text-gb-black">
                    {profile.global_score?.toFixed(0) || "N/A"}
                  </span>
                </div>
                <div>
                  <span className="text-gb-gray">Perfil:</span>
                  <span className="ml-2 font-semibold text-gb-black">
                    {profile.profile_label || "N/A"}
                  </span>
                </div>
                <div>
                  <span className="text-gb-gray">Capacidad:</span>
                  <span className="ml-2 font-semibold text-gb-black">
                    {profile.capacity_score?.toFixed(0) || "N/A"}
                  </span>
                </div>
              </div>
            </section>
          )}

          {/* Asset Allocation Summary */}
          <section className="bg-white rounded-lg border border-gb-border p-6">
            <h3 className="text-sm font-semibold text-gb-black mb-4">
              Resumen de Allocacion
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-gb-light rounded-lg p-4 border border-gb-border">
                <p className="text-xs text-gb-dark font-semibold mb-1">
                  Renta Variable
                </p>
                <p className="text-2xl font-bold text-gb-black">
                  {allocation.weights.equities.toFixed(1)}%
                </p>
              </div>
              <div className="bg-gb-light rounded-lg p-4 border border-gb-border">
                <p className="text-xs text-gb-dark font-semibold mb-1">
                  Renta Fija
                </p>
                <p className="text-2xl font-bold text-gb-black">
                  {allocation.weights.fixedIncome.toFixed(1)}%
                </p>
              </div>
              <div className="bg-gb-light rounded-lg p-4 border border-gb-border">
                <p className="text-xs text-gb-dark font-semibold mb-1">
                  Alternativos
                </p>
                <p className="text-2xl font-bold text-gb-black">
                  {allocation.weights.alternatives.toFixed(1)}%
                </p>
              </div>
              <div className="bg-gb-light rounded-lg p-4 border border-gb-border">
                <p className="text-xs text-gb-dark font-semibold mb-1">
                  Efectivo
                </p>
                <p className="text-2xl font-bold text-gb-black">
                  {allocation.weights.cash.toFixed(1)}%
                </p>
              </div>
            </div>
          </section>

          {/* Comentario del Modelo */}
          <CommentaryBrief rows={consolidatedRows} />

          {/* Detailed Holdings */}
          {equityRows && equityRows.length > 0 && (
            <section className="bg-white rounded-lg border border-gb-border p-6">
              <h3 className="text-sm font-semibold text-gb-black mb-4">
                Renta Variable - Posiciones
              </h3>
              <div className="space-y-3">
                {equityRows.map(({ block, model }) => {
                  const selectedFundId = equityFunds[block.id];
                  const selectedFund = block.compatibleFunds?.find(
                    (f) => f.id === selectedFundId
                  );

                  return (
                    <div
                      key={block.id}
                      className="flex justify-between items-center p-3 bg-gb-light rounded-lg border border-gb-border"
                    >
                      <div>
                        <p className="font-medium text-sm text-gb-black">
                          {block.label}
                        </p>
                        {selectedFund && (
                          <p className="text-xs text-gb-gray">
                            {selectedFund.name} - {selectedFund.provider}
                          </p>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-gb-black">
                          {model.toFixed(1)}%
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {fixedIncomeRows && fixedIncomeRows.length > 0 && (
            <section className="bg-white rounded-lg border border-gb-border p-6">
              <h3 className="text-sm font-semibold text-gb-black mb-4">
                Renta Fija - Posiciones
              </h3>
              <div className="space-y-3">
                {fixedIncomeRows.map(({ block, model }) => {
                  const selectedFundId = fixedIncomeFunds[block.id];
                  const selectedFund = block.compatibleFunds?.find(
                    (f) => f.id === selectedFundId
                  );

                  return (
                    <div
                      key={block.id}
                      className="flex justify-between items-center p-3 bg-gb-light rounded-lg border border-gb-border"
                    >
                      <div>
                        <p className="font-medium text-sm text-gb-black">
                          {block.label}
                        </p>
                        {selectedFund && (
                          <p className="text-xs text-gb-gray">
                            {selectedFund.name} - {selectedFund.provider}
                          </p>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-gb-black">
                          {model.toFixed(1)}%
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {alternativeRows && alternativeRows.length > 0 && (
            <section className="bg-white rounded-lg border border-gb-border p-6">
              <h3 className="text-sm font-semibold text-gb-black mb-4">
                Alternativos - Posiciones
              </h3>
              <div className="space-y-3">
                {alternativeRows.map(({ block, model }) => {
                  const selectedFundId = alternativeFunds[block.id];
                  const selectedFund = block.compatibleFunds?.find(
                    (f) => f.id === selectedFundId
                  );

                  return (
                    <div
                      key={block.id}
                      className="flex justify-between items-center p-3 bg-gb-light rounded-lg border border-gb-border"
                    >
                      <div>
                        <p className="font-medium text-sm text-gb-black">
                          {block.label}
                        </p>
                        {selectedFund && (
                          <p className="text-xs text-gb-gray">
                            {selectedFund.name} - {selectedFund.provider}
                          </p>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-gb-black">
                          {model.toFixed(1)}%
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <button
              onClick={() => window.print()}
              className="flex-1 bg-gb-black text-white font-semibold py-3 px-6 rounded-lg hover:bg-gb-dark transition-all"
            >
              Imprimir Resumen
            </button>
            <button
              onClick={onClose}
              className="flex-1 bg-gb-light text-gb-dark font-semibold py-3 px-6 rounded-lg hover:bg-gray-200 border border-gb-border transition-all"
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
