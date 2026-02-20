// app/portfolio-designer/components/ComparisonMode.tsx
// Modo Comparación: Actual vs Ideal

"use client";

import React, { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { FundSelector, Fund } from "@/components/portfolio/FundSelector";
import { supabaseBrowserClient } from "@/lib/supabase/supabaseClient";
import { getBenchmarkFromScore, type AssetAllocation } from "@/lib/risk/benchmarks";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, Legend,
  LineChart, Line, CartesianGrid,
} from "recharts";
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
  AlertTriangle,
  CheckCircle,
  ArrowRight,
  Trash2,
  PlusCircle,
  Sparkles,
  X,
} from "lucide-react";
import CarteraRecomendada, { GenerarCarteraButton } from "@/components/comite/CarteraRecomendada";

// ============================================================
// INTERFACES
// ============================================================

interface Client {
  id: string;
  nombre: string;
  apellido: string;
  email: string;
  rut?: string;
}

interface RiskProfile {
  global_score: number;
  profile_label: string;
  capacity_score: number;
  tolerance_score: number;
  perception_score: number;
  composure_score: number;
}

interface ActualPosition {
  type: "RV" | "RF" | "alternativo" | "cash";
  amount: number;
  percent: number;
}

interface AssetClassAllocation {
  region: string;
  regionLabel: string;
  subCategory: string;
  neutralPercent: number;
  benchmark: string;
  currentFund: Fund | null;
  proposedFund: Fund | null;
}

interface AssetClassSection {
  id: string;
  name: string;
  totalPercent: number;
  allocations: AssetClassAllocation[];
  expanded: boolean;
}

// ============================================================
// HELPERS
// ============================================================

const ASSET_TYPE_LABELS: Record<string, string> = {
  equities: "Renta Variable",
  fixedIncome: "Renta Fija",
  alternatives: "Alternativos",
  cash: "Efectivo",
};

const TYPE_MAP: Record<string, string> = {
  RV: "equities",
  RF: "fixedIncome",
  alternativo: "alternatives",
  cash: "cash",
};

// ============================================================
// SUBCATEGORÍAS DISPONIBLES
// ============================================================

interface SubcategoryOption {
  key: string;
  label: string;
  benchmark?: string;
}

const EQUITY_SUBCATEGORIES: SubcategoryOption[] = [
  // Por geografía/mercado
  { key: "chile", label: "RV Local (Chile)", benchmark: "S&P IPSA TR CLP" },
  { key: "usa", label: "RV USA", benchmark: "S&P 500 TR USD" },
  { key: "usaLarge", label: "RV USA Large Cap", benchmark: "S&P 500 TR USD" },
  { key: "usaMid", label: "RV USA Mid Cap", benchmark: "S&P 400 MidCap TR USD" },
  { key: "usaSmall", label: "RV USA Small Cap", benchmark: "Russell 2000 TR USD" },
  { key: "europe", label: "RV Europa", benchmark: "MSCI Europe NR EUR" },
  { key: "japan", label: "RV Japón", benchmark: "MSCI Japan NR JPY" },
  { key: "asiaPacific", label: "RV Asia Pacífico (ex-Japón)", benchmark: "MSCI Pacific ex Japan NR USD" },
  { key: "china", label: "RV China / Greater China", benchmark: "MSCI China NR USD" },
  { key: "emergentes", label: "RV Mercados Emergentes", benchmark: "MSCI Emerging Markets NR USD" },
  { key: "latam", label: "RV Latinoamérica", benchmark: "MSCI EM Latin America NR USD" },
  { key: "global", label: "RV Global / Internacional", benchmark: "MSCI ACWI NR USD" },
  { key: "globalExUsa", label: "RV Global (ex-USA)", benchmark: "MSCI ACWI ex USA NR USD" },
  { key: "frontier", label: "RV Frontier Markets", benchmark: "MSCI Frontier Markets NR USD" },
  // Por estilo
  { key: "growth", label: "RV Growth", benchmark: "MSCI World Growth NR USD" },
  { key: "value", label: "RV Value", benchmark: "MSCI World Value NR USD" },
  { key: "blend", label: "RV Blend / Core", benchmark: "MSCI World NR USD" },
  { key: "dividend", label: "RV Dividendos / Income", benchmark: "MSCI World High Dividend Yield NR USD" },
  { key: "quality", label: "RV Quality / Low Volatility", benchmark: "MSCI World Quality NR USD" },
  // Por sector
  { key: "tech", label: "RV Tecnología", benchmark: "MSCI World IT NR USD" },
  { key: "health", label: "RV Salud / Healthcare", benchmark: "MSCI World Healthcare NR USD" },
  { key: "financials", label: "RV Financiero", benchmark: "MSCI World Financials NR USD" },
  { key: "energy", label: "RV Energía", benchmark: "MSCI World Energy NR USD" },
  { key: "consDisc", label: "RV Consumo Discrecional", benchmark: "MSCI World Cons Disc NR USD" },
  { key: "consStaples", label: "RV Consumo Básico / Staples", benchmark: "MSCI World Cons Staples NR USD" },
  { key: "industrials", label: "RV Industrial", benchmark: "MSCI World Industrials NR USD" },
  { key: "reits", label: "RV Inmobiliario / REITs", benchmark: "FTSE NAREIT All Equity REITs" },
  { key: "materials", label: "RV Materiales / Recursos Naturales", benchmark: "MSCI World Materials NR USD" },
  { key: "utilities", label: "RV Utilities", benchmark: "MSCI World Utilities NR USD" },
  { key: "comms", label: "RV Comunicaciones", benchmark: "MSCI World Comm Services NR USD" },
  // Por temática
  { key: "esg", label: "RV ESG / Sostenible", benchmark: "MSCI World ESG Leaders NR USD" },
  { key: "ai", label: "RV Inteligencia Artificial / Robótica", benchmark: "" },
  { key: "cleanEnergy", label: "RV Energía Limpia / Transición Energética", benchmark: "S&P Global Clean Energy" },
  { key: "infrastructure", label: "RV Infraestructura", benchmark: "S&P Global Infrastructure" },
  { key: "water", label: "RV Agua", benchmark: "S&P Global Water" },
  { key: "cyber", label: "RV Ciberseguridad", benchmark: "" },
  { key: "biotech", label: "RV Biotecnología", benchmark: "NASDAQ Biotechnology" },
  { key: "blockchain", label: "RV Blockchain / Crypto Equity", benchmark: "" },
];

const FIXED_INCOME_SUBCATEGORIES: SubcategoryOption[] = [
  // Por geografía/mercado
  { key: "localShort", label: "RF Local Corto Plazo", benchmark: "LVA Índices RF CP" },
  { key: "localLong", label: "RF Local Largo Plazo", benchmark: "LVA Índices RF LP" },
  { key: "usaCore", label: "RF USA Core / Core Plus", benchmark: "Bloomberg US Aggregate" },
  { key: "europe", label: "RF Europa", benchmark: "Bloomberg Euro Aggregate" },
  { key: "asia", label: "RF Asia", benchmark: "Bloomberg Asian USD IG" },
  { key: "emergingDebt", label: "RF Mercados Emergentes", benchmark: "JPM EMBI Global" },
  { key: "global", label: "RF Global", benchmark: "Bloomberg Global Aggregate" },
  // Por calidad crediticia
  { key: "globalIG", label: "RF Global Investment Grade", benchmark: "Bloomberg Global Aggregate" },
  { key: "globalHY", label: "RF Global High Yield", benchmark: "Bloomberg Global HY" },
  { key: "corporateLocal", label: "RF Corporativa Local", benchmark: "" },
  { key: "corporateIG", label: "RF Corporativa Investment Grade", benchmark: "Bloomberg Global Corp IG" },
  { key: "corporateHY", label: "RF Corporativa High Yield", benchmark: "Bloomberg Global Corp HY" },
  // Por tipo de instrumento
  { key: "govDeveloped", label: "RF Gobierno Desarrollado", benchmark: "Bloomberg Global Treasury" },
  { key: "govLocal", label: "RF Gobierno Local", benchmark: "" },
  { key: "securitized", label: "RF Securitizada / MBS / ABS", benchmark: "Bloomberg US MBS" },
  { key: "inflationLinked", label: "RF Indexada a Inflación", benchmark: "Bloomberg TIPS" },
  { key: "convertible", label: "RF Convertible", benchmark: "ICE BofA Global Convertible" },
  // Por estrategia
  { key: "flexible", label: "RF Flexible / Multisector", benchmark: "" },
  { key: "aggregate", label: "RF Aggregate", benchmark: "Bloomberg Global Aggregate" },
  { key: "unconstrained", label: "RF Unconstrained / Total Return", benchmark: "" },
  { key: "moneyMarket", label: "RF Money Market / Cash", benchmark: "" },
  // Específicas Chile
  { key: "ufShort", label: "RF UF Corto Plazo", benchmark: "LVA Índices UF CP" },
  { key: "ufLong", label: "RF UF Largo Plazo", benchmark: "LVA Índices UF LP" },
  { key: "nominalPesos", label: "RF Pesos Nominales", benchmark: "" },
  { key: "timeDeposits", label: "RF Depósitos a Plazo", benchmark: "" },
];

const ALTERNATIVE_SUBCATEGORIES: SubcategoryOption[] = [
  // Hedge Funds / Estrategias
  { key: "longShort", label: "Alt Long/Short Equity", benchmark: "HFRI Equity Hedge" },
  { key: "marketNeutral", label: "Alt Market Neutral", benchmark: "HFRI EH: Equity Market Neutral" },
  { key: "globalMacro", label: "Alt Global Macro", benchmark: "HFRI Macro" },
  { key: "eventDriven", label: "Alt Event Driven / Merger Arbitrage", benchmark: "HFRI Event Driven" },
  { key: "multiStrategy", label: "Alt Multi-Strategy", benchmark: "HFRI Fund Weighted Composite" },
  { key: "managedFutures", label: "Alt Managed Futures / CTA", benchmark: "SG CTA Index" },
  { key: "relativeValue", label: "Alt Relative Value / Arbitraje", benchmark: "HFRI Relative Value" },
  // Activos Reales
  { key: "realEstate", label: "Alt Real Estate / Inmobiliario", benchmark: "NCREIF Property Index" },
  { key: "infrastructure", label: "Alt Infraestructura", benchmark: "S&P Global Infrastructure" },
  { key: "commodities", label: "Alt Commodities General", benchmark: "Bloomberg Commodity" },
  { key: "gold", label: "Alt Oro / Metales Preciosos", benchmark: "Gold Spot" },
  { key: "energy", label: "Alt Energía / Petróleo", benchmark: "S&P GSCI Energy" },
  { key: "agriculture", label: "Alt Agricultura", benchmark: "S&P GSCI Agriculture" },
  { key: "timber", label: "Alt Timber / Forestal", benchmark: "NCREIF Timberland" },
  // Private Markets
  { key: "privateEquity", label: "Alt Private Equity", benchmark: "Cambridge Associates PE" },
  { key: "privateDebt", label: "Alt Private Debt / Direct Lending", benchmark: "Cliffwater Direct Lending" },
  { key: "ventureCapital", label: "Alt Venture Capital", benchmark: "Cambridge Associates VC" },
  { key: "privateCredit", label: "Alt Private Credit", benchmark: "" },
  // Otros
  { key: "crypto", label: "Alt Crypto / Digital Assets", benchmark: "Bitcoin" },
  { key: "collectibles", label: "Alt Coleccionables (arte, vino, etc.)", benchmark: "" },
  { key: "catBonds", label: "Alt Insurance-Linked / Cat Bonds", benchmark: "Swiss Re Cat Bond" },
  { key: "volatility", label: "Alt Volatilidad", benchmark: "CBOE VIX" },
  { key: "multiAsset", label: "Alt Multi-Asset Alternativo", benchmark: "" },
];

const SUBCATEGORIES_BY_ASSET_CLASS: Record<string, SubcategoryOption[]> = {
  equity: EQUITY_SUBCATEGORIES,
  fixed_income: FIXED_INCOME_SUBCATEGORIES,
  alternative: ALTERNATIVE_SUBCATEGORIES,
};

function buildBenchmarkProfile(benchmark: AssetAllocation) {
  const assetClasses: AssetClassSection[] = [];

  // Equity - Inicia SIN subcategorías (el usuario las agrega)
  if (benchmark.weights.equities > 0) {
    assetClasses.push({
      id: "equity",
      name: "Renta Variable",
      totalPercent: benchmark.weights.equities,
      expanded: true,
      allocations: [], // Vacío - usuario agrega subcategorías
    });
  }

  // Fixed Income - Inicia SIN subcategorías
  if (benchmark.weights.fixedIncome > 0) {
    assetClasses.push({
      id: "fixed_income",
      name: "Renta Fija",
      totalPercent: benchmark.weights.fixedIncome,
      expanded: true,
      allocations: [], // Vacío
    });
  }

  // Alternatives - Inicia SIN subcategorías
  if (benchmark.weights.alternatives > 0) {
    assetClasses.push({
      id: "alternative",
      name: "Alternativos",
      totalPercent: benchmark.weights.alternatives,
      expanded: true,
      allocations: [], // Vacío
    });
  }

  // Cash - Este sí tiene una subcategoría fija
  if (benchmark.weights.cash > 0) {
    assetClasses.push({
      id: "cash",
      name: "Efectivo",
      totalPercent: benchmark.weights.cash,
      expanded: false,
      allocations: [{
        region: "cash",
        regionLabel: "Money Market / Depósitos",
        subCategory: "cash",
        neutralPercent: benchmark.weights.cash,
        benchmark: "",
        currentFund: null,
        proposedFund: null,
      }],
    });
  }

  return assetClasses;
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export default function ComparisonMode() {
  const searchParams = useSearchParams();

  // Client state
  const [clientEmail, setClientEmail] = useState(searchParams.get("client") || "");
  const [client, setClient] = useState<Client | null>(null);
  const [riskProfile, setRiskProfile] = useState<RiskProfile | null>(null);
  const [actualPositions, setActualPositions] = useState<ActualPosition[]>([]);
  const [searchingClient, setSearchingClient] = useState(false);
  const [clientNotFound, setClientNotFound] = useState(false);

  // Portfolio state
  const [totalInvestment, setTotalInvestment] = useState(10000000);
  const [benchmark, setBenchmark] = useState<AssetAllocation | null>(null);
  const [assetClasses, setAssetClasses] = useState<AssetClassSection[]>([]);

  // Modal state
  const [exportingPDF, setExportingPDF] = useState(false);

  // AI Cartera state
  const [carteraIA, setCarteraIA] = useState<any>(null);
  const [showCarteraIA, setShowCarteraIA] = useState(false);

  // Currency state
  type Currency = "CLP" | "USD" | "UF";
  const [currency, setCurrency] = useState<Currency>("CLP");
  const [exchangeRates, setExchangeRates] = useState<{ usd: number; uf: number }>({
    usd: 980,
    uf: 38500,
  });
  const [ratesLoading, setRatesLoading] = useState(true);

  // Manager override state (adjustments to benchmark, e.g., +3% means 65% -> 68%)
  const [managerOverrides, setManagerOverrides] = useState<Record<string, number>>({});
  const [showOverrideControls, setShowOverrideControls] = useState(false);

  // Fetch exchange rates from Banco Central de Chile
  useEffect(() => {
    const fetchRates = async () => {
      try {
        const res = await fetch("/api/exchange-rates");
        const data = await res.json();
        if (data.success) {
          setExchangeRates({ usd: data.usd, uf: data.uf });
        }
      } catch (error) {
        console.error("Error fetching exchange rates:", error);
      } finally {
        setRatesLoading(false);
      }
    };
    fetchRates();
  }, []);

  // Exchange rates from Banco Central de Chile
  const EXCHANGE_RATES: Record<Currency, number> = {
    CLP: 1,
    USD: exchangeRates.usd,
    UF: exchangeRates.uf,
  };

  // Convert displayed value to CLP for internal calculations
  const displayInvestment = currency === "CLP"
    ? totalInvestment
    : totalInvestment / EXCHANGE_RATES[currency];

  const handleInvestmentChange = (value: number) => {
    // Convert from display currency to CLP
    const clpValue = currency === "CLP" ? value : value * EXCHANGE_RATES[currency];
    setTotalInvestment(clpValue);
  };

  // Historical comparison state
  interface HistoricalDataPoint {
    date: string;
    current?: number;
    proposed?: number;
  }
  const [historicalData, setHistoricalData] = useState<HistoricalDataPoint[]>([]);
  const [loadingHistorical, setLoadingHistorical] = useState(false);
  const [historicalError, setHistoricalError] = useState<string | null>(null);
  const [selectedComparisonRegion, setSelectedComparisonRegion] = useState<string | null>(null);

  // Fetch historical data for a fund
  const fetchFundHistorical = async (ticker: string): Promise<{ date: string; value: number }[]> => {
    try {
      const res = await fetch(`/api/etf/${ticker}?period=1y`);
      if (!res.ok) throw new Error("Error fetching data");
      const data = await res.json();
      return data.historical || [];
    } catch (error) {
      console.error("Error fetching historical:", error);
      return [];
    }
  };

  // Compare historical performance
  const compareHistorical = async (currentTicker: string, proposedTicker: string, regionKey: string) => {
    setLoadingHistorical(true);
    setHistoricalError(null);
    setSelectedComparisonRegion(regionKey);

    try {
      // Fetch both series (with delay between to avoid rate limit)
      const currentData = await fetchFundHistorical(currentTicker);
      await new Promise(resolve => setTimeout(resolve, 15000)); // Wait 15s for rate limit
      const proposedData = await fetchFundHistorical(proposedTicker);

      if (currentData.length === 0 && proposedData.length === 0) {
        setHistoricalError("No se pudieron obtener datos históricos. Intenta más tarde.");
        setHistoricalData([]);
        return;
      }

      // Normalize both series to start at 100 for comparison
      const normalizeToBase100 = (data: { date: string; value: number }[]) => {
        if (data.length === 0) return [];
        const baseValue = data[0].value;
        return data.map(d => ({ date: d.date, value: (d.value / baseValue) * 100 }));
      };

      const normalizedCurrent = normalizeToBase100(currentData);
      const normalizedProposed = normalizeToBase100(proposedData);

      // Merge into single dataset
      const dateMap = new Map<string, HistoricalDataPoint>();
      normalizedCurrent.forEach(d => {
        dateMap.set(d.date, { date: d.date, current: d.value });
      });
      normalizedProposed.forEach(d => {
        const existing = dateMap.get(d.date);
        if (existing) {
          existing.proposed = d.value;
        } else {
          dateMap.set(d.date, { date: d.date, proposed: d.value });
        }
      });

      const merged = Array.from(dateMap.values())
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      setHistoricalData(merged);
    } catch (error) {
      setHistoricalError("Error al cargar datos históricos");
      console.error(error);
    } finally {
      setLoadingHistorical(false);
    }
  };

  // Auto-search on load if client param present
  useEffect(() => {
    if (clientEmail.trim()) {
      searchClient();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update asset classes when benchmark changes
  useEffect(() => {
    if (benchmark) {
      setAssetClasses(buildBenchmarkProfile(benchmark));
    }
  }, [benchmark]);

  // ============================================================
  // CLIENT SEARCH
  // ============================================================

  const searchClient = async () => {
    if (!clientEmail.trim()) return;
    setSearchingClient(true);
    setClientNotFound(false);
    const supabase = supabaseBrowserClient();

    try {
      // Find client including portfolio_data
      const { data: clientData, error: clientError } = await supabase
        .from("clients")
        .select("id, nombre, apellido, email, rut, portfolio_data")
        .eq("email", clientEmail.toLowerCase().trim())
        .maybeSingle();

      if (clientError || !clientData) {
        setClientNotFound(true);
        setClient(null);
        // Default benchmark: moderado
        setBenchmark(getBenchmarkFromScore(45, true, "global"));
        return;
      }

      setClient(clientData);

      // Get risk profile
      const { data: profileData } = await supabase
        .from("risk_profiles")
        .select("global_score, profile_label, capacity_score, tolerance_score, perception_score, composure_score")
        .eq("client_id", clientData.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (profileData) {
        setRiskProfile(profileData);
        setBenchmark(getBenchmarkFromScore(profileData.global_score, true, "global"));
      } else {
        setRiskProfile(null);
        setBenchmark(getBenchmarkFromScore(45, true, "global"));
      }

      // Get positions from portfolio_data (saved from cartola analysis)
      if (clientData.portfolio_data?.composition?.byAssetClass) {
        const byAssetClass = clientData.portfolio_data.composition.byAssetClass;
        const totalValue = clientData.portfolio_data.composition.totalValue || 0;

        // Map from English keys to our type format
        const keyMap: Record<string, "RV" | "RF" | "alternativo" | "cash"> = {
          "Equity": "RV",
          "Fixed Income": "RF",
          "Cash": "cash",
        };

        const positions: ActualPosition[] = Object.entries(byAssetClass).map(([key, data]: [string, any]) => ({
          type: keyMap[key] || "alternativo",
          amount: data.value || 0,
          percent: data.percent || 0,
        }));

        if (positions.length > 0) {
          setActualPositions(positions);
          if (totalValue > 0) setTotalInvestment(totalValue);
        }
      } else {
        // Fallback: try to get from client_positions table
        const { data: positionsData } = await supabase
          .from("client_positions")
          .select("type, amount, percent")
          .eq("client_id", clientData.id);

        if (positionsData && positionsData.length > 0) {
          setActualPositions(positionsData as ActualPosition[]);
          const total = positionsData.reduce((s: number, p: { amount: number }) => s + p.amount, 0);
          if (total > 0) setTotalInvestment(total);
        }
      }
    } catch (error) {
      console.error("Error buscando cliente:", error);
      setClientNotFound(true);
    } finally {
      setSearchingClient(false);
    }
  };

  // ============================================================
  // COMPARISON DATA
  // ============================================================

  const baseWeights = benchmark?.weights || { equities: 45, fixedIncome: 45, alternatives: 10, cash: 0 };

  // Apply manager overrides to base weights
  const idealWeights = {
    equities: Math.max(0, Math.min(100, baseWeights.equities + (managerOverrides.equities || 0))),
    fixedIncome: Math.max(0, Math.min(100, baseWeights.fixedIncome + (managerOverrides.fixedIncome || 0))),
    alternatives: Math.max(0, Math.min(100, baseWeights.alternatives + (managerOverrides.alternatives || 0))),
    cash: Math.max(0, Math.min(100, baseWeights.cash + (managerOverrides.cash || 0))),
  };

  // Normalize to 100% if overrides cause imbalance
  const totalOverrideWeight = Object.values(idealWeights).reduce((s, v) => s + v, 0);
  if (totalOverrideWeight !== 100 && totalOverrideWeight > 0) {
    const factor = 100 / totalOverrideWeight;
    idealWeights.equities = Math.round(idealWeights.equities * factor * 10) / 10;
    idealWeights.fixedIncome = Math.round(idealWeights.fixedIncome * factor * 10) / 10;
    idealWeights.alternatives = Math.round(idealWeights.alternatives * factor * 10) / 10;
    idealWeights.cash = Math.round((100 - idealWeights.equities - idealWeights.fixedIncome - idealWeights.alternatives) * 10) / 10;
  }

  const handleOverrideChange = (key: string, delta: number) => {
    setManagerOverrides((prev) => ({
      ...prev,
      [key]: Math.max(-15, Math.min(15, (prev[key] || 0) + delta)),
    }));
  };

  const resetOverrides = () => setManagerOverrides({});

  // Calculate actual weights from positions
  const actualWeights = { equities: 0, fixedIncome: 0, alternatives: 0, cash: 0 };
  if (actualPositions.length > 0) {
    actualPositions.forEach((p) => {
      const key = TYPE_MAP[p.type] as keyof typeof actualWeights;
      if (key) actualWeights[key] += p.percent;
    });
  }

  const hasActualData = actualPositions.length > 0;

  const comparisonData = Object.entries(idealWeights).map(([key, idealPct]) => ({
    name: ASSET_TYPE_LABELS[key] || key,
    ideal: idealPct,
    actual: hasActualData ? (actualWeights[key as keyof typeof actualWeights] || 0) : 0,
    deviation: hasActualData ? ((actualWeights[key as keyof typeof actualWeights] || 0) - idealPct) : 0,
  }));

  // ============================================================
  // FUND MANAGEMENT
  // ============================================================

  const toggleExpanded = (id: string) => {
    setAssetClasses((prev) => prev.map((ac) => ac.id === id ? { ...ac, expanded: !ac.expanded } : ac));
  };

  const updateCurrentFund = (assetClassId: string, region: string, fund: Fund | null) => {
    setAssetClasses((prev) =>
      prev.map((ac) => ac.id !== assetClassId ? ac : {
        ...ac,
        allocations: ac.allocations.map((alloc) => alloc.region === region ? { ...alloc, currentFund: fund } : alloc),
      })
    );
  };

  const updateProposedFund = (assetClassId: string, region: string, fund: Fund | null) => {
    setAssetClasses((prev) =>
      prev.map((ac) => ac.id !== assetClassId ? ac : {
        ...ac,
        allocations: ac.allocations.map((alloc) => alloc.region === region ? { ...alloc, proposedFund: fund } : alloc),
      })
    );
  };

  // ============================================================
  // SUBCATEGORY MANAGEMENT
  // ============================================================

  const addSubcategory = (assetClassId: string, subcategoryKey: string, percent: number) => {
    const subcategories = SUBCATEGORIES_BY_ASSET_CLASS[assetClassId];
    if (!subcategories) return;

    const subcategory = subcategories.find((s) => s.key === subcategoryKey);
    if (!subcategory) return;

    setAssetClasses((prev) =>
      prev.map((ac) => {
        if (ac.id !== assetClassId) return ac;

        // Verificar si ya existe
        if (ac.allocations.some((a) => a.region === subcategoryKey)) return ac;

        return {
          ...ac,
          allocations: [
            ...ac.allocations,
            {
              region: subcategoryKey,
              regionLabel: subcategory.label,
              subCategory: subcategoryKey,
              neutralPercent: percent,
              benchmark: subcategory.benchmark || "",
              currentFund: null,
              proposedFund: null,
            },
          ],
        };
      })
    );
  };

  const removeSubcategory = (assetClassId: string, region: string) => {
    setAssetClasses((prev) =>
      prev.map((ac) => {
        if (ac.id !== assetClassId) return ac;
        return {
          ...ac,
          allocations: ac.allocations.filter((a) => a.region !== region),
        };
      })
    );
  };

  const updateSubcategoryPercent = (assetClassId: string, region: string, percent: number) => {
    setAssetClasses((prev) =>
      prev.map((ac) => {
        if (ac.id !== assetClassId) return ac;
        return {
          ...ac,
          allocations: ac.allocations.map((a) =>
            a.region === region ? { ...a, neutralPercent: percent } : a
          ),
        };
      })
    );
  };

  const getAvailableSubcategories = (assetClassId: string) => {
    const subcategories = SUBCATEGORIES_BY_ASSET_CLASS[assetClassId] || [];
    const assetClass = assetClasses.find((ac) => ac.id === assetClassId);
    const usedKeys = assetClass?.allocations.map((a) => a.region) || [];
    return subcategories.filter((s) => !usedKeys.includes(s.key));
  };

  const getAllocatedPercent = (assetClassId: string) => {
    const assetClass = assetClasses.find((ac) => ac.id === assetClassId);
    return assetClass?.allocations.reduce((sum, a) => sum + a.neutralPercent, 0) || 0;
  };

  // ============================================================
  // TOTALS
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
          currentCostTotal += amount * (alloc.currentFund.total_expense_ratio ?? 0);
          currentReturnTotal += alloc.currentFund.return_1y ? amount * alloc.currentFund.return_1y : 0;
          totalAllocatedCurrent += amount;
        }
        if (alloc.proposedFund) {
          proposedCostTotal += amount * (alloc.proposedFund.total_expense_ratio ?? 0);
          proposedReturnTotal += alloc.proposedFund.return_1y ? amount * alloc.proposedFund.return_1y : 0;
          totalAllocatedProposed += amount;
        }
      });
    });

    return {
      currentCostTotal,
      proposedCostTotal,
      costSavings: currentCostTotal - proposedCostTotal,
      currentReturnTotal,
      proposedReturnTotal,
      returnImprovement: proposedReturnTotal - currentReturnTotal,
      totalBenefit: (currentCostTotal - proposedCostTotal) + (proposedReturnTotal - currentReturnTotal),
      totalAllocatedCurrent,
      totalAllocatedProposed,
    };
  };

  const totals = calculateTotals();

  // ============================================================
  // PDF EXPORT
  // ============================================================

  const handleExportPDF = async () => {
    setExportingPDF(true);
    try {
      const pdfData = {
        clientName: client ? `${client.nombre} ${client.apellido}`.trim() : undefined,
        clientEmail: client?.email,
        totalInvestment,
        assetClasses: assetClasses.map((ac) => ({
          name: ac.name,
          totalPercent: ac.totalPercent,
          allocations: ac.allocations
            .filter((alloc) => alloc.currentFund || alloc.proposedFund)
            .map((alloc) => {
              const amount = (totalInvestment * alloc.neutralPercent) / 100;
              const currentCost = alloc.currentFund ? amount * (alloc.currentFund.total_expense_ratio ?? 0) : 0;
              const proposedCost = alloc.proposedFund ? amount * (alloc.proposedFund.total_expense_ratio ?? 0) : 0;
              const currentReturn = alloc.currentFund?.return_1y ? amount * alloc.currentFund.return_1y : 0;
              const proposedReturn = alloc.proposedFund?.return_1y ? amount * alloc.proposedFund.return_1y : 0;
              return {
                regionLabel: alloc.regionLabel,
                neutralPercent: alloc.neutralPercent,
                amount,
                currentFund: alloc.currentFund,
                proposedFund: alloc.proposedFund,
                costSavings: currentCost - proposedCost,
                returnImprovement: proposedReturn - currentReturn,
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

      const response = await fetch("/api/generate-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pdfData),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Error desconocido" }));
        throw new Error(errorData.error || "Error al generar PDF");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `comparacion-${client?.nombre || "portafolio"}-${Date.now()}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error: any) {
      console.error("Error exportando PDF:", error);
      alert(`Error al generar el PDF: ${error.message}`);
    } finally {
      setExportingPDF(false);
    }
  };

  // ============================================================
  // RENDER
  // ============================================================

  const fmt = (n: number) => n.toLocaleString("es-CL", { maximumFractionDigits: 0 });

  return (
    <div className="space-y-6">
      {/* Client Search */}
        <div className="bg-white border border-gb-border border-l-4 border-l-blue-500 rounded-lg p-6 mb-6 shadow-sm">
          <label className="block text-sm font-medium text-gb-dark mb-2">
            Email del Cliente
          </label>
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gb-gray" />
              <input
                type="email"
                value={clientEmail}
                onChange={(e) => { setClientEmail(e.target.value); setClientNotFound(false); }}
                onKeyDown={(e) => e.key === "Enter" && searchClient()}
                placeholder="cliente@email.com"
                className="w-full pl-10 pr-4 py-2.5 border border-gb-border rounded-lg text-sm focus:border-gb-accent focus:outline-none"
              />
            </div>
            <button
              onClick={searchClient}
              disabled={searchingClient || !clientEmail.trim()}
              className="px-5 py-2.5 bg-gb-black text-white text-sm font-medium rounded-lg hover:bg-gb-dark transition-colors disabled:bg-gb-border disabled:text-gb-gray disabled:cursor-not-allowed flex items-center gap-2"
            >
              {searchingClient ? <Loader className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              {searchingClient ? "Buscando..." : "Buscar"}
            </button>
          </div>

          {/* Client Found */}
          {client && (
            <div className="mt-4 p-4 bg-gb-light border border-gb-border rounded-lg">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-white border border-gb-border rounded-full flex items-center justify-center">
                  <User className="w-5 h-5 text-gb-gray" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-gb-black">
                    {client.nombre} {client.apellido}
                  </h3>
                  <p className="text-sm text-gb-gray">{client.email}</p>
                </div>
                {riskProfile && (
                  <div className="text-right">
                    <div className="text-sm font-medium text-gb-black">
                      {riskProfile.profile_label}
                    </div>
                    <div className="text-xs text-gb-gray">
                      Score: {Math.round(riskProfile.global_score)}/100
                    </div>
                  </div>
                )}
              </div>

              {/* Botón Generar Cartera con IA */}
              {riskProfile && (
                <div className="mt-4 pt-4 border-t border-gb-border">
                  <GenerarCarteraButton
                    clientId={client.id}
                    montoInversion={totalInvestment}
                    onCarteraGenerada={(data) => {
                      setCarteraIA(data);
                      setShowCarteraIA(true);
                    }}
                  />
                </div>
              )}
            </div>
          )}

          {clientNotFound && (
            <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-sm text-amber-800">
                No se encontró un cliente con ese email. Se usa perfil moderado por defecto.
              </p>
            </div>
          )}
        </div>

        {/* Ideal vs Actual Comparison */}
        {benchmark && (
          <div className="bg-white border border-gb-border border-l-4 border-l-indigo-500 rounded-lg p-6 mb-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-gb-black">
                Asignación por Clase de Activo
              </h2>
              <button
                onClick={() => setShowOverrideControls(!showOverrideControls)}
                className="text-xs font-medium text-gb-accent hover:underline flex items-center gap-1"
              >
                {showOverrideControls ? "Ocultar" : "Ajuste Comité"} ▸
              </button>
            </div>

            {/* Manager Override Controls */}
            {showOverrideControls && (
              <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-amber-800">
                    Sesgo del Comité de Asset Allocation
                  </h3>
                  {Object.keys(managerOverrides).length > 0 && (
                    <button
                      onClick={resetOverrides}
                      className="text-xs text-amber-700 hover:underline"
                    >
                      Restablecer
                    </button>
                  )}
                </div>
                <p className="text-xs text-amber-700 mb-3">
                  Ajusta la distribución según el criterio del comité (±15% máximo por clase)
                </p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {Object.entries(ASSET_TYPE_LABELS).map(([key, label]) => {
                    const override = managerOverrides[key] || 0;
                    const baseValue = baseWeights[key as keyof typeof baseWeights] || 0;
                    return (
                      <div key={key} className="bg-white rounded-lg p-3 border border-amber-200">
                        <div className="text-xs font-medium text-gb-gray mb-1">{label}</div>
                        <div className="flex items-center justify-between">
                          <button
                            onClick={() => handleOverrideChange(key, -1)}
                            disabled={override <= -15}
                            className="w-6 h-6 flex items-center justify-center rounded bg-amber-100 text-amber-800 hover:bg-amber-200 disabled:opacity-40 text-sm font-medium"
                          >
                            −
                          </button>
                          <div className="text-center">
                            <div className="text-sm font-semibold text-gb-black">
                              {idealWeights[key as keyof typeof idealWeights].toFixed(1)}%
                            </div>
                            {override !== 0 && (
                              <div className={`text-xs ${override > 0 ? "text-emerald-600" : "text-red-600"}`}>
                                ({override > 0 ? "+" : ""}{override}%)
                              </div>
                            )}
                          </div>
                          <button
                            onClick={() => handleOverrideChange(key, 1)}
                            disabled={override >= 15}
                            className="w-6 h-6 flex items-center justify-center rounded bg-amber-100 text-amber-800 hover:bg-amber-200 disabled:opacity-40 text-sm font-medium"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Comparison Chart */}
            <div className="h-64 mb-6">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={comparisonData} barGap={4}>
                  <XAxis dataKey="name" tick={{ fontSize: 12, fill: "#6b7280" }} />
                  <YAxis tick={{ fontSize: 12, fill: "#6b7280" }} unit="%" />
                  <Tooltip
                    formatter={(value) => `${Number(value).toFixed(1)}%`}
                    contentStyle={{ fontSize: 13, borderRadius: 8, border: "1px solid #e5e7eb" }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="ideal" name="Benchmark Ideal" fill="#6366f1" radius={[4, 4, 0, 0]} />
                  {hasActualData && (
                    <Bar dataKey="actual" name="Cartera Actual" fill="#14b8a6" radius={[4, 4, 0, 0]} />
                  )}
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Comparison Table */}
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gb-border">
                  <th className="text-left py-2 font-medium text-gb-gray">Clase de Activo</th>
                  <th className="text-right py-2 font-medium text-gb-gray">Ideal</th>
                  {hasActualData && (
                    <>
                      <th className="text-right py-2 font-medium text-gb-gray">Actual</th>
                      <th className="text-right py-2 font-medium text-gb-gray">Desviación</th>
                      <th className="text-right py-2 font-medium text-gb-gray">Estado</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {comparisonData.map((row) => (
                  <tr key={row.name} className="border-b border-gb-border last:border-b-0">
                    <td className="py-2.5 font-medium text-gb-black">{row.name}</td>
                    <td className="py-2.5 text-right text-gb-dark">{row.ideal.toFixed(1)}%</td>
                    {hasActualData && (
                      <>
                        <td className="py-2.5 text-right text-gb-dark">{row.actual.toFixed(1)}%</td>
                        <td className={`py-2.5 text-right font-medium ${
                          Math.abs(row.deviation) > 5 ? "text-red-600" : "text-gb-gray"
                        }`}>
                          {row.deviation > 0 ? "+" : ""}{row.deviation.toFixed(1)}%
                        </td>
                        <td className="py-2.5 text-right">
                          {Math.abs(row.deviation) <= 5 ? (
                            <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
                              <CheckCircle className="w-3.5 h-3.5" /> OK
                            </span>
                          ) : row.deviation > 0 ? (
                            <span className="inline-flex items-center gap-1 text-xs text-amber-700">
                              <AlertTriangle className="w-3.5 h-3.5" /> Sobre-expuesto
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs text-red-700">
                              <AlertTriangle className="w-3.5 h-3.5" /> Sub-expuesto
                            </span>
                          )}
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>

            {!hasActualData && (
              <p className="mt-4 text-sm text-gb-gray text-center py-4 bg-gb-light rounded-lg">
                No hay datos de cartera actual. Ingresa posiciones en{" "}
                <a href={`/analisis-cartola${client ? `?client=${client.email}` : ""}`} className="underline font-medium text-gb-dark">
                  Cartola & Riesgo
                </a>{" "}
                para ver la comparación.
              </p>
            )}

            {/* Recommendations */}
            {hasActualData && comparisonData.some((r) => Math.abs(r.deviation) > 5) && (
              <div className="mt-6 p-4 bg-gb-light border border-gb-border rounded-lg">
                <h3 className="text-sm font-semibold text-gb-black mb-2">Recomendaciones de Ajuste</h3>
                <ul className="space-y-1.5">
                  {comparisonData.filter((r) => Math.abs(r.deviation) > 5).map((r) => (
                    <li key={r.name} className="text-sm text-gb-dark flex items-start gap-2">
                      <ArrowRight className="w-4 h-4 mt-0.5 text-gb-gray flex-shrink-0" />
                      <span>
                        <strong>{r.name}</strong>:{" "}
                        {r.deviation > 0
                          ? `Reducir ${Math.abs(r.deviation).toFixed(1)}pp — reasignar a clases sub-expuestas`
                          : `Aumentar ${Math.abs(r.deviation).toFixed(1)}pp — actualmente por debajo del benchmark`
                        }
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Investment Amount */}
        <div className="bg-white border border-gb-border border-l-4 border-l-blue-400 rounded-lg p-6 mb-6 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-bold text-gb-black">
              Inversión Total
            </label>
            <div className="flex items-center gap-1 bg-gb-light rounded-lg p-1">
              {(["CLP", "USD", "UF"] as const).map((cur) => (
                <button
                  key={cur}
                  onClick={() => setCurrency(cur)}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                    currency === cur
                      ? "bg-white text-gb-black shadow-sm"
                      : "text-gb-gray hover:text-gb-dark"
                  }`}
                >
                  {cur}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gb-gray">
              {currency === "CLP" ? "$" : currency === "USD" ? "US$" : "UF"}
            </span>
            <input
              type="number"
              value={displayInvestment}
              onChange={(e) => handleInvestmentChange(parseFloat(e.target.value) || 0)}
              className="flex-1 px-4 py-2.5 border border-gb-border rounded-lg text-sm focus:border-gb-accent focus:outline-none"
            />
          </div>
          {currency !== "CLP" && (
            <p className="text-xs text-gb-gray mt-2">
              ≈ ${fmt(totalInvestment)} CLP (1 {currency === "USD" ? "USD" : "UF"} = ${fmt(EXCHANGE_RATES[currency])} CLP)
              <span className="ml-1 text-gb-accent">
                {ratesLoading ? " • Cargando tasas..." : " • Banco Central"}
              </span>
            </p>
          )}
        </div>

        {/* Asset Classes - Fund Selection */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gb-black">
            Detalle por Subcategoría
          </h2>
          <p className="text-xs text-gb-gray">
            Agrega las subcategorías que necesites comparar
          </p>
        </div>
        <div className="space-y-4">
          {assetClasses.map((assetClass) => (
            <div key={assetClass.id} className="bg-white border border-gb-border rounded-lg overflow-hidden">
              <button
                onClick={() => toggleExpanded(assetClass.id)}
                className="w-full px-6 py-4 flex items-center justify-between hover:bg-gb-light transition-colors"
              >
                <div className="text-left">
                  <h2 className="text-base font-semibold text-gb-black">{assetClass.name}</h2>
                  <p className="text-xs text-gb-gray">
                    {assetClass.totalPercent.toFixed(1)}% — ${fmt((totalInvestment * assetClass.totalPercent) / 100)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-lg font-semibold text-gb-black">
                    {assetClass.totalPercent.toFixed(1)}%
                  </span>
                  {assetClass.expanded ? <ChevronUp className="w-5 h-5 text-gb-gray" /> : <ChevronDown className="w-5 h-5 text-gb-gray" />}
                </div>
              </button>

              {assetClass.expanded && (
                <div className="border-t border-gb-border">
                  {assetClass.allocations.map((allocation) => {
                    const amount = (totalInvestment * allocation.neutralPercent) / 100;
                    const currentCost = allocation.currentFund ? amount * (allocation.currentFund.total_expense_ratio ?? 0) : 0;
                    const proposedCost = allocation.proposedFund ? amount * (allocation.proposedFund.total_expense_ratio ?? 0) : 0;
                    const costSavings = currentCost - proposedCost;
                    const currentReturn = allocation.currentFund?.return_1y ? amount * allocation.currentFund.return_1y : 0;
                    const proposedReturn = allocation.proposedFund?.return_1y ? amount * allocation.proposedFund.return_1y : 0;
                    const returnImprovement = proposedReturn - currentReturn;

                    return (
                      <div key={allocation.region} className="p-6 border-b border-gb-border last:border-b-0">
                        {/* Header con título, % editable y botón eliminar */}
                        <div className="mb-4 flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <h3 className="text-sm font-semibold text-gb-black">
                              {allocation.regionLabel}
                            </h3>
                            <p className="text-xs text-gb-gray">
                              ${fmt(amount)}
                              {allocation.benchmark && ` — ${allocation.benchmark}`}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            {/* Input para editar % */}
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                value={allocation.neutralPercent}
                                onChange={(e) => updateSubcategoryPercent(assetClass.id, allocation.region, parseFloat(e.target.value) || 0)}
                                className="w-16 px-2 py-1 text-sm text-right border border-gb-border rounded focus:border-gb-accent focus:outline-none"
                                min="0"
                                max="100"
                                step="0.5"
                              />
                              <span className="text-sm text-gb-gray">%</span>
                            </div>
                            {/* Botón eliminar */}
                            {assetClass.id !== "cash" && (
                              <button
                                onClick={() => removeSubcategory(assetClass.id, allocation.region)}
                                className="p-1.5 text-red-500 hover:bg-red-50 rounded transition-colors"
                                title="Eliminar subcategoría"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                          <div>
                            <h4 className="text-xs font-medium text-gb-gray mb-2 flex items-center gap-2">
                              <span className="w-2 h-2 bg-gb-dark rounded-full"></span>
                              Fondo Actual
                            </h4>
                            <FundSelector
                              assetClass={assetClass.id}
                              subCategory={allocation.subCategory}
                              type="chilean"
                              value={allocation.currentFund}
                              onSelectFund={(fund) => updateCurrentFund(assetClass.id, allocation.region, fund)}
                              placeholder={`Buscar fondos de ${allocation.regionLabel}...`}
                            />
                          </div>

                          <div>
                            <h4 className="text-xs font-medium text-gb-gray mb-2 flex items-center gap-2">
                              <span className="w-2 h-2 bg-gb-accent rounded-full"></span>
                              Fondo Propuesto
                            </h4>
                            <FundSelector
                              assetClass={assetClass.id}
                              subCategory={allocation.subCategory}
                              type="proposed"
                              value={allocation.proposedFund}
                              onSelectFund={(fund) => updateProposedFund(assetClass.id, allocation.region, fund)}
                              placeholder="Buscar fondo propuesto..."
                            />
                          </div>
                        </div>

                        {allocation.currentFund && allocation.proposedFund && (
                          <div className="mt-4 p-3 bg-gb-light border border-gb-border rounded-lg">
                            <div className="grid grid-cols-2 gap-4 text-sm mb-3">
                              <div>
                                <div className="flex items-center gap-1.5 mb-1">
                                  <DollarSign className="w-3.5 h-3.5 text-emerald-600" />
                                  <span className="text-xs text-gb-gray">Ahorro en Costos</span>
                                </div>
                                <div className="text-base font-semibold text-emerald-700">
                                  ${fmt(costSavings)}/año
                                </div>
                              </div>
                              <div>
                                <div className="flex items-center gap-1.5 mb-1">
                                  <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
                                  <span className="text-xs text-gb-gray">Mejor Rentabilidad</span>
                                </div>
                                <div className="text-base font-semibold text-emerald-700">
                                  {returnImprovement > 0 ? "+" : ""}${fmt(returnImprovement)}/año
                                </div>
                              </div>
                            </div>
                            {/* Compare Historical Button */}
                            {allocation.currentFund.ticker && allocation.proposedFund.ticker && (
                              <button
                                onClick={() => compareHistorical(
                                  allocation.currentFund!.ticker!,
                                  allocation.proposedFund!.ticker!,
                                  allocation.region
                                )}
                                disabled={loadingHistorical}
                                className="w-full mt-2 px-3 py-2 bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-medium rounded-lg hover:bg-indigo-100 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                              >
                                {loadingHistorical && selectedComparisonRegion === allocation.region ? (
                                  <><Loader className="w-3.5 h-3.5 animate-spin" /> Cargando histórico...</>
                                ) : (
                                  <><TrendingUp className="w-3.5 h-3.5" /> Comparar Histórico (1 año)</>
                                )}
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Agregar nueva subcategoría */}
                  {assetClass.id !== "cash" && getAvailableSubcategories(assetClass.id).length > 0 && (
                    <div className="p-4 bg-gb-light border-t border-gb-border">
                      <div className="flex items-center gap-3">
                        <select
                          id={`add-subcategory-${assetClass.id}`}
                          className="flex-1 px-3 py-2 text-sm border border-gb-border rounded-lg bg-white focus:border-gb-accent focus:outline-none"
                          defaultValue=""
                          onChange={(e) => {
                            if (e.target.value) {
                              const remaining = assetClass.totalPercent - getAllocatedPercent(assetClass.id);
                              const defaultPercent = Math.min(remaining, 10);
                              addSubcategory(assetClass.id, e.target.value, defaultPercent > 0 ? defaultPercent : 5);
                              e.target.value = "";
                            }
                          }}
                        >
                          <option value="">+ Agregar subcategoría...</option>
                          {getAvailableSubcategories(assetClass.id).map((sub) => (
                            <option key={sub.key} value={sub.key}>
                              {sub.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      {/* Mostrar % asignado vs total */}
                      <div className="mt-2 flex items-center justify-between text-xs">
                        <span className="text-gb-gray">
                          Asignado: {getAllocatedPercent(assetClass.id).toFixed(1)}% de {assetClass.totalPercent.toFixed(1)}%
                        </span>
                        {getAllocatedPercent(assetClass.id) !== assetClass.totalPercent && (
                          <span className={getAllocatedPercent(assetClass.id) > assetClass.totalPercent ? "text-red-600" : "text-amber-600"}>
                            {getAllocatedPercent(assetClass.id) > assetClass.totalPercent ? "Excede" : "Pendiente"}: {Math.abs(assetClass.totalPercent - getAllocatedPercent(assetClass.id)).toFixed(1)}%
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Mensaje cuando no hay subcategorías */}
                  {assetClass.allocations.length === 0 && assetClass.id !== "cash" && (
                    <div className="p-6 text-center">
                      <PlusCircle className="w-8 h-8 text-gb-gray mx-auto mb-2" />
                      <p className="text-sm text-gb-gray mb-3">
                        No hay subcategorías agregadas
                      </p>
                      <select
                        className="px-4 py-2 text-sm border border-gb-border rounded-lg bg-white focus:border-gb-accent focus:outline-none"
                        defaultValue=""
                        onChange={(e) => {
                          if (e.target.value) {
                            addSubcategory(assetClass.id, e.target.value, 10);
                            e.target.value = "";
                          }
                        }}
                      >
                        <option value="">Selecciona una subcategoría...</option>
                        {getAvailableSubcategories(assetClass.id).map((sub) => (
                          <option key={sub.key} value={sub.key}>
                            {sub.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Historical Comparison Chart */}
        {historicalData.length > 0 && (
          <div className="mt-6 bg-white border border-gb-border border-l-4 border-l-purple-500 rounded-lg p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-gb-black">
                Comparación Histórica (Último Año)
              </h2>
              <button
                onClick={() => setHistoricalData([])}
                className="text-xs text-gb-gray hover:underline"
              >
                Cerrar
              </button>
            </div>
            <p className="text-xs text-gb-gray mb-4">
              Rendimiento normalizado (base 100) para comparar evolución de ambos fondos
            </p>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={historicalData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10, fill: "#6b7280" }}
                    tickFormatter={(d) => new Date(d).toLocaleDateString("es-CL", { month: "short", day: "numeric" })}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: "#6b7280" }}
                    domain={["auto", "auto"]}
                    tickFormatter={(v) => `${v.toFixed(0)}`}
                  />
                  <Tooltip
                    formatter={(value) => typeof value === "number" ? value.toFixed(2) : value}
                    labelFormatter={(d) => new Date(d as string).toLocaleDateString("es-CL", { year: "numeric", month: "long", day: "numeric" })}
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line
                    type="monotone"
                    dataKey="current"
                    name="Fondo Actual"
                    stroke="#6b7280"
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                  />
                  <Line
                    type="monotone"
                    dataKey="proposed"
                    name="Fondo Propuesto"
                    stroke="#6366f1"
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            {/* Performance Summary */}
            <div className="mt-4 grid grid-cols-2 gap-4">
              <div className="p-3 bg-gray-50 rounded-lg text-center">
                <div className="text-xs text-gb-gray mb-1">Fondo Actual (1 año)</div>
                <div className="text-lg font-semibold text-gb-dark">
                  {historicalData.length > 0 && historicalData[historicalData.length - 1].current
                    ? `${((historicalData[historicalData.length - 1].current! - 100)).toFixed(2)}%`
                    : "N/A"}
                </div>
              </div>
              <div className="p-3 bg-indigo-50 rounded-lg text-center">
                <div className="text-xs text-gb-gray mb-1">Fondo Propuesto (1 año)</div>
                <div className="text-lg font-semibold text-indigo-700">
                  {historicalData.length > 0 && historicalData[historicalData.length - 1].proposed
                    ? `${((historicalData[historicalData.length - 1].proposed! - 100)).toFixed(2)}%`
                    : "N/A"}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Historical Error */}
        {historicalError && (
          <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-700">{historicalError}</p>
          </div>
        )}

        {/* Summary */}
        {totals.totalAllocatedCurrent > 0 && totals.totalAllocatedProposed > 0 && (
          <div className="mt-8 bg-white border border-gb-border rounded-lg p-8">
            <h2 className="text-lg font-semibold text-gb-black mb-6 text-center">
              Beneficio Total Anual
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="bg-gb-light rounded-lg p-5 text-center">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <DollarSign className="w-4 h-4 text-emerald-600" />
                  <span className="text-xs text-gb-gray">Ahorro en Costos</span>
                </div>
                <div className="text-2xl font-semibold text-emerald-700">${fmt(totals.costSavings)}</div>
                <div className="text-xs text-gb-gray mt-1">por año</div>
              </div>

              <div className="bg-gb-light rounded-lg p-5 text-center">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <TrendingUp className="w-4 h-4 text-emerald-600" />
                  <span className="text-xs text-gb-gray">Mejor Rentabilidad</span>
                </div>
                <div className="text-2xl font-semibold text-emerald-700">
                  {totals.returnImprovement > 0 ? "+" : ""}${fmt(totals.returnImprovement)}
                </div>
                <div className="text-xs text-gb-gray mt-1">por año</div>
              </div>

              <div className="bg-gb-light rounded-lg p-5 text-center border-2 border-gb-dark">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <Calculator className="w-4 h-4 text-gb-black" />
                  <span className="text-xs text-gb-gray">Beneficio Total</span>
                </div>
                <div className="text-2xl font-bold text-gb-black">${fmt(totals.totalBenefit)}</div>
                <div className="text-xs text-gb-gray mt-1">por año</div>
              </div>
            </div>

            <div className="bg-gb-light rounded-lg p-5 mb-6 text-center">
              <h3 className="text-sm font-medium text-gb-gray mb-2">Proyección a 10 años</h3>
              <div className="text-3xl font-bold text-gb-black">
                ${fmt(totals.totalBenefit * 10)}
              </div>
              <p className="text-xs text-gb-gray mt-1">Beneficio acumulado estimado</p>
            </div>

            <button
              onClick={handleExportPDF}
              disabled={exportingPDF}
              className="w-full px-6 py-3 bg-gb-black text-white font-medium rounded-lg hover:bg-gb-dark transition-colors flex items-center justify-center gap-2 disabled:bg-gb-border disabled:text-gb-gray disabled:cursor-not-allowed"
            >
              {exportingPDF ? (
                <><Loader className="w-5 h-5 animate-spin" /> Generando PDF...</>
              ) : (
                <><FileDown className="w-5 h-5" /> Exportar Comparación a PDF</>
              )}
            </button>
          </div>
        )}

      {/* Modal Cartera IA */}
      {showCarteraIA && carteraIA && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm overflow-y-auto">
          <div className="w-full max-w-4xl max-h-[90vh] overflow-y-auto my-8">
            <CarteraRecomendada
              cliente={carteraIA.cliente}
              recomendacion={carteraIA.recomendacion}
              generadoEn={carteraIA.generadoEn}
              onCerrar={() => setShowCarteraIA(false)}
              onAplicar={() => {
                // TODO: Aplicar los fondos de la cartera IA a las secciones
                setShowCarteraIA(false);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
