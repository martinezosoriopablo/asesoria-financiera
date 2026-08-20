// app/portfolio-designer/components/ComparisonModeV2.tsx
// Modo Comparación V2: Layout rediseñado
// - Portafolio Recomendado (arriba, principal)
// - Portafolio Actual (medio, referencia)
// - Comparación Final (abajo, costos + gráfico)

"use client";

import React, { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Fund } from "@/components/portfolio/FundSelector";
import { supabaseBrowserClient } from "@/lib/supabase/supabaseClient";
import {
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
  CartesianGrid, Area, AreaChart,
} from "recharts";
import {
  ChevronDown,
  ChevronUp,
  TrendingUp,
  Search,
  User,
  Loader,
  AlertTriangle,
  CheckCircle,
  Sparkles,
  PieChart,
  Wallet,
  ArrowDownRight,
  ArrowUpRight,
  RefreshCw,
  Check,
  Save,
  Upload,
  FileSpreadsheet,
  HelpCircle,
  X,
  Download,
  Plus,
  Trash2,
} from "lucide-react";
import { GenerarCarteraButton } from "@/components/comite/CarteraRecomendada";
import { findYahooSymbol } from "@/lib/yahoo-finance-mapping";
import * as XLSX from "xlsx";
import ClientSelector, { type ClientOption } from "@/components/shared/ClientSelector";
import Card from "@/components/shared/Card";
import Button from "@/components/shared/Button";

// ============================================================
// INTERFACES
// ============================================================

interface PortfolioHolding {
  securityId?: string;
  ticker?: string;
  fundName?: string;
  name?: string;
  assetClass?: string;
  marketValue?: number;
  costBasis?: number;
  unrealizedGainLoss?: number;
  percentOfPortfolio?: number;
}

interface CarteraPosition {
  ticker: string;
  nombre: string;
  clase: string;
  porcentaje: number;
}

interface Client {
  id: string;
  nombre: string;
  apellido: string;
  email: string;
  rut?: string;
  portfolio_data?: {
    composition?: {
      holdings?: PortfolioHolding[];
      totalValue?: number;
      byAssetClass?: Record<string, { value: number; percent: number }>;
    };
    statement?: {
      holdings?: PortfolioHolding[];
    };
  };
  cartera_recomendada?: {
    cartera?: CarteraPosition[];
    generadoEn?: string;
    aplicadoEn?: string;
  };
}

interface RiskProfile {
  global_score: number;
  profile_label: string;
  capacity_score: number;
  tolerance_score: number;
}

interface ProposedPosition {
  ticker: string;
  nombre: string;
  clase: string;
  porcentaje: number;
  fundData?: Fund;
  loading?: boolean;
  // Manual overrides
  manualTER?: number;
  manualReturn1Y?: number;
  isAutoData?: boolean; // true = data from API, false = manual input needed
  benchmarkProxy?: string; // Symbol to use for historical data if no real data
  manualHistoricalData?: { date: string; close: number }[]; // Data loaded from Excel
  // Additional manual data
  manualISIN?: string;
  manualNombre?: string;
  manualMoneda?: string;
}

// Available benchmark proxies for funds without historical data
const BENCHMARK_PROXIES = [
  { symbol: "VOO", name: "S&P 500 (VOO)", clase: "Renta Variable" },
  { symbol: "VTI", name: "Total US Market (VTI)", clase: "Renta Variable" },
  { symbol: "VEA", name: "Developed Markets (VEA)", clase: "Renta Variable" },
  { symbol: "VWO", name: "Emerging Markets (VWO)", clase: "Renta Variable" },
  { symbol: "BND", name: "US Bonds (BND)", clase: "Renta Fija" },
  { symbol: "BNDX", name: "Intl Bonds (BNDX)", clase: "Renta Fija" },
  { symbol: "GLD", name: "Gold (GLD)", clase: "Commodities" },
  { symbol: "VNQ", name: "Real Estate (VNQ)", clase: "Alternativos" },
];

interface YahooData {
  ter?: number;
  return_1y?: number;
}

interface CurrentHolding {
  securityId: string;
  fundName: string;
  assetClass: string;
  marketValue: number;
  costBasis: number;
  unrealizedGainLoss: number;
  percentOfPortfolio: number;
  yahooData?: YahooData;
  // Manual overrides
  manualTER?: number;
  manualReturn1Y?: number;
  isAutoData?: boolean;
  benchmarkProxy?: string;
  manualHistoricalData?: { date: string; close: number }[];
  // Additional manual data
  manualISIN?: string;
  manualNombre?: string;
  manualMoneda?: string;
}

interface HistoricalPoint {
  date: string;
  actual?: number;
  propuesto?: number;
}

interface HistoricalDataPoint {
  date: string;
  close: number;
}

// ============================================================
// COMPONENT
// ============================================================

export default function ComparisonModeV2() {
  const searchParams = useSearchParams();

  // Client state
  const [clientEmail, setClientEmail] = useState(searchParams.get("client") || "");
  const [client, setClient] = useState<Client | null>(null);
  const [riskProfile, setRiskProfile] = useState<RiskProfile | null>(null);
  const [searchingClient, setSearchingClient] = useState(false);
  const [clientNotFound, setClientNotFound] = useState(false);

  // Portfolio state
  const [totalInvestment, setTotalInvestment] = useState(0);

  // Proposed portfolio (from AI)
  const [proposedPositions, setProposedPositions] = useState<ProposedPosition[]>([]);

  // Current holdings (from cartola)
  const [currentHoldings, setCurrentHoldings] = useState<CurrentHolding[]>([]);

  // Comparison data
  const [historicalData, setHistoricalData] = useState<HistoricalPoint[]>([]);
  const [loadingHistorical, setLoadingHistorical] = useState(false);

  // AI Cartera modal
  const [showCarteraIA, setShowCarteraIA] = useState(false);
  const [carteraLoadedFromDB, setCarteraLoadedFromDB] = useState(false);
  const [savingCartera, setSavingCartera] = useState(false);
  const [showRebalanceSummary, setShowRebalanceSummary] = useState(false);
  const [rebalanceSummary, setRebalanceSummary] = useState<Array<{
    ticker: string;
    nombre: string;
    clase: string;
    actualPct: number;
    recomendadoPct: number;
    action: "comprar" | "vender" | "mantener";
    diffPct: number;
  }>>([]);

  // Upload error (replaces alert() calls)
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Sections expanded state
  const [proposedExpanded, setProposedExpanded] = useState(true);
  const [currentExpanded, setCurrentExpanded] = useState(true);
  const [comparisonExpanded, setComparisonExpanded] = useState(true);

  // Excel upload state
  const [uploadingForIndex, setUploadingForIndex] = useState<number | null>(null);
  const [uploadingForPortfolio, setUploadingForPortfolio] = useState<"proposed" | "current" | null>(null);
  const [showExcelHelp, setShowExcelHelp] = useState(false);
  const [showExcelModal, setShowExcelModal] = useState(false);
  const [excelModalData, setExcelModalData] = useState<{
    file: File | null;
    ter: string;
    isin: string;
    nombre: string;
    moneda: string;
  }>({ file: null, ter: "", isin: "", nombre: "", moneda: "USD" });
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const modalFileInputRef = React.useRef<HTMLInputElement>(null);

  // Fund search modal state
  const [showFundSearch, setShowFundSearch] = useState(false);
  const [fundSearchQuery, setFundSearchQuery] = useState("");
  const [fundSearchResults, setFundSearchResults] = useState<Array<{
    id: string; symbol: string; name: string; type: string;
    asset_class?: string; source: string; return_1y?: number; ter?: number;
  }>>([]);
  const [fundSearchLoading, setFundSearchLoading] = useState(false);

  // Search funds across all sources (in parallel)
  const searchFundsForAdd = async (query: string) => {
    if (query.length < 2) { setFundSearchResults([]); return; }
    setFundSearchLoading(true);
    try {
      const q = encodeURIComponent(query);

      // Run all searches in parallel
      const [localRes, fintualRes, alphaRes] = await Promise.allSettled([
        fetch(`/api/funds/search?q=${q}`).then(r => r.json()),
        fetch(`/api/fintual/search?q=${q}&limit=20`).then(r => r.json()),
        fetch(`/api/funds/search-alpha?q=${q}&type=all`).then(r => r.json()),
      ]);

      const results: typeof fundSearchResults = [];
      const seenIds = new Set<string>();

      // 1. Local DB funds
      if (localRes.status === "fulfilled" && localRes.value.success && localRes.value.funds) {
        for (const f of localRes.value.funds) {
          const id = f.id || f.symbol;
          seenIds.add(id);
          results.push({
            id, symbol: f.symbol || f.name?.substring(0, 6).toUpperCase(),
            name: f.name, type: f.type === "external" ? "Internacional" : "Chile",
            asset_class: f.asset_class, source: "local", return_1y: f.return_1y, ter: f.total_expense_ratio,
          });
        }
      }

      // 2. Fintual/AAFM funds (Chilean mutual funds — searchable by RUN, name, provider)
      if (fintualRes.status === "fulfilled" && fintualRes.value.success && fintualRes.value.data) {
        for (const f of fintualRes.value.data) {
          const fundId = f.id || f.run || f.fund_name;
          if (!seenIds.has(fundId)) {
            seenIds.add(fundId);
            results.push({
              id: fundId,
              symbol: f.run || f.symbol || f.fund_name?.substring(0, 8),
              name: `${f.fund_name || ""}${f.serie_name ? ` — Serie ${f.serie_name}` : ""}${f.provider_name ? ` (${f.provider_name})` : ""}`,
              type: "Fondo Mutuo CL",
              asset_class: f.asset_class,
              source: "fintual",
              ter: f.total_expense_ratio,
            });
          }
        }
      }

      // 3. Alpha Vantage (international ETFs/funds)
      if (alphaRes.status === "fulfilled" && alphaRes.value.success && alphaRes.value.funds) {
        const existingSymbols = new Set(results.map(r => r.symbol?.toUpperCase()));
        for (const f of alphaRes.value.funds) {
          if (!existingSymbols.has((f.symbol as string)?.toUpperCase())) {
            results.push({
              id: f.symbol as string, symbol: f.symbol as string, name: f.name as string,
              type: (f.type as string) || "Internacional", source: "alphavantage",
            });
          }
        }
      }

      setFundSearchResults(results);
    } finally {
      setFundSearchLoading(false);
    }
  };

  // Add a fund from search to proposed positions
  const addFundToProposed = async (fund: { symbol: string; name: string; asset_class?: string }) => {
    const clase = fund.asset_class?.toLowerCase().includes("fixed") || fund.asset_class?.toLowerCase().includes("bond")
      ? "Renta Fija"
      : fund.asset_class?.toLowerCase().includes("alt") || fund.asset_class?.toLowerCase().includes("commodity")
      ? "Alternativos"
      : "Renta Variable";

    const newPos: ProposedPosition = {
      ticker: fund.symbol,
      nombre: fund.name,
      clase,
      porcentaje: 0,
      loading: true,
    };

    setProposedPositions(prev => [...prev, newPos]);
    setShowFundSearch(false);
    setFundSearchQuery("");
    setFundSearchResults([]);

    // Fetch fund data
    const idx = proposedPositions.length; // index of newly added
    try {
      const res = await fetch(`/api/funds/unified-profile?symbol=${encodeURIComponent(fund.symbol)}&name=${encodeURIComponent(fund.name)}`);
      const result = await res.json();
      if (result.success && result.profile) {
        const profile = result.profile;
        setProposedPositions(prev => prev.map((p, i) =>
          i === idx ? {
            ...p, loading: false,
            fundData: {
              id: `proposed-${fund.symbol}`, ticker: profile.symbol || fund.symbol,
              symbol: profile.symbol || fund.symbol, name: profile.name || fund.name,
              currency: profile.currency || "USD", type: "proposed" as const,
              asset_class: profile.assetType, total_expense_ratio: profile.expenseRatio,
              return_1m: profile.returns?.["1m"], return_3m: profile.returns?.["3m"],
              return_6m: profile.returns?.["6m"], return_ytd: profile.returns?.ytd,
              return_1y: profile.returns?.["1y"], price: profile.price,
              dataSource: profile.source, historicalData: profile.historicalData,
            },
          } : p
        ));
      } else {
        setProposedPositions(prev => prev.map((p, i) => i === idx ? { ...p, loading: false } : p));
      }
    } catch {
      setProposedPositions(prev => prev.map((p, i) => i === idx ? { ...p, loading: false } : p));
    }
  };

  // Remove a proposed position
  const removeProposedPosition = (idx: number) => {
    setProposedPositions(prev => prev.filter((_, i) => i !== idx));
  };

  // Download Excel template
  const downloadExcelTemplate = () => {
    const templateData = [
      ["Fecha", "Valor"],
      ["2024-01-15", 1000.00],
      ["2024-02-15", 1025.50],
      ["2024-03-15", 1015.30],
      ["2024-04-15", 1045.80],
      ["2024-05-15", 1067.20],
      ["2024-06-15", 1089.45],
      ["2024-07-15", 1102.30],
      ["2024-08-15", 1078.90],
      ["2024-09-15", 1095.60],
      ["2024-10-15", 1123.40],
      ["2024-11-15", 1145.80],
      ["2024-12-15", 1168.25],
    ];
    const ws = XLSX.utils.aoa_to_sheet(templateData);
    ws["!cols"] = [{ wch: 12 }, { wch: 12 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Datos");
    XLSX.writeFile(wb, "template_datos_historicos.xlsx");
  };

  // ============================================================
  // EFFECTS
  // ============================================================

  // Auto-search on load
  useEffect(() => {
    if (clientEmail.trim()) {
      searchClient();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ============================================================
  // CLIENT SEARCH
  // ============================================================

  const searchClient = async () => {
    if (!clientEmail.trim()) return;
    setSearchingClient(true);
    setClientNotFound(false);
    const supabase = supabaseBrowserClient();

    try {
      const { data: clientData, error } = await supabase
        .from("clients")
        .select("id, nombre, apellido, email, rut, portfolio_data, cartera_recomendada")
        .eq("email", clientEmail.toLowerCase().trim())
        .maybeSingle();

      if (error || !clientData) {
        setClientNotFound(true);
        setClient(null);
        return;
      }

      setClient(clientData);

      // Get risk profile
      const { data: profileData } = await supabase
        .from("risk_profiles")
        .select("global_score, profile_label, capacity_score, tolerance_score")
        .eq("client_id", clientData.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (profileData) {
        setRiskProfile(profileData);
      } else {
        setRiskProfile(null);
      }

      // Extract current holdings from portfolio_data
      const holdings = clientData.portfolio_data?.composition?.holdings ||
                       clientData.portfolio_data?.statement?.holdings || [];

      const totalValue = clientData.portfolio_data?.composition?.totalValue || 0;
      setTotalInvestment(totalValue);

      const mappedHoldings: CurrentHolding[] = holdings.map((h: PortfolioHolding) => ({
        securityId: h.securityId || h.ticker || "N/A",
        fundName: h.fundName || h.name || "Fondo",
        assetClass: h.assetClass || "Unknown",
        marketValue: h.marketValue ?? 0,
        costBasis: h.costBasis ?? 0,
        unrealizedGainLoss: h.unrealizedGainLoss ?? 0,
        percentOfPortfolio: h.percentOfPortfolio ?? (totalValue > 0 ? ((h.marketValue ?? 0) / totalValue) * 100 : 0),
      }));

      setCurrentHoldings(mappedHoldings);

      // Also try to load latest snapshot for more up-to-date holdings
      try {
        const snapRes = await fetch(`/api/clients/${clientData.id}/seguimiento?period=ALL`);
        const snapResult = await snapRes.json();
        if (snapResult.success && snapResult.data?.snapshots?.length > 0) {
          const latestSnap = snapResult.data.snapshots[snapResult.data.snapshots.length - 1];
          if (latestSnap.holdings && latestSnap.holdings.length > 0 && latestSnap.total_value > 0) {
            const snapHoldings: CurrentHolding[] = latestSnap.holdings.map((h: { securityId?: string; ticker?: string; fundName?: string; name?: string; nombre?: string; assetClass?: string; tipo?: string; marketValue?: number; marketValueCLP?: number; valor?: number; costBasis?: number; unrealizedGainLoss?: number; percentOfPortfolio?: number }) => ({
              securityId: h.securityId || h.ticker || "N/A",
              fundName: h.fundName || h.name || h.nombre || "Fondo",
              assetClass: h.assetClass || h.tipo || "Unknown",
              marketValue: h.marketValue ?? h.marketValueCLP ?? h.valor ?? 0,
              costBasis: h.costBasis ?? 0,
              unrealizedGainLoss: h.unrealizedGainLoss ?? 0,
              percentOfPortfolio: h.percentOfPortfolio ?? (latestSnap.total_value > 0 ? ((h.marketValue ?? h.marketValueCLP ?? h.valor ?? 0) / latestSnap.total_value * 100) : 0),
            }));
            setCurrentHoldings(snapHoldings);
            setTotalInvestment(latestSnap.total_value);
          }
        }
      } catch (e) {
        console.error("Error loading latest snapshot:", e);
        // Keep portfolio_data holdings as fallback
      }

      // Load saved recommended portfolio if exists
      if (clientData.cartera_recomendada?.cartera && clientData.cartera_recomendada.cartera.length > 0) {
        setCarteraLoadedFromDB(true);
        applyCartera(clientData.cartera_recomendada.cartera);
      } else {
        setCarteraLoadedFromDB(false);
        setProposedPositions([]);
      }
    } catch (error) {
      console.error("Error searching client:", error);
      setClientNotFound(true);
    } finally {
      setSearchingClient(false);
    }
  };

  // ============================================================
  // SAVE CARTERA TO DATABASE
  // ============================================================

  const saveCartera = async (cartera?: CarteraPosition[], fullData?: { generadoEn?: string }) => {
    if (!client) return;

    // If no cartera provided, use current proposedPositions
    const positionsToSave = cartera || proposedPositions.map(p => ({
      ticker: p.ticker,
      nombre: p.nombre,
      clase: p.clase,
      porcentaje: p.porcentaje,
    }));

    setSavingCartera(true);

    try {
      const supabase = supabaseBrowserClient();

      const carteraRecomendada = {
        ...(fullData || {}),
        cartera: positionsToSave,
        generadoEn: fullData?.generadoEn || new Date().toISOString(),
        guardadoEn: new Date().toISOString(),
      };

      const { error } = await supabase
        .from("clients")
        .update({
          cartera_recomendada: carteraRecomendada,
          updated_at: new Date().toISOString(),
        })
        .eq("id", client.id);

      if (error) {
        console.error("Error saving cartera:", error);
      } else {
        setCarteraLoadedFromDB(true);

        // Generate rebalancing summary
        const summary = positionsToSave.map(pos => {
          const currentMatch = currentHoldings.find(h =>
            h.securityId === pos.ticker ||
            h.fundName.toLowerCase().includes(pos.nombre.toLowerCase().substring(0, 10))
          );
          const actualPct = currentMatch?.percentOfPortfolio || 0;
          const diffPct = pos.porcentaje - actualPct;
          const action = Math.abs(diffPct) < 1 ? "mantener" as const : diffPct > 0 ? "comprar" as const : "vender" as const;
          return {
            ticker: pos.ticker,
            nombre: pos.nombre,
            clase: pos.clase,
            actualPct,
            recomendadoPct: pos.porcentaje,
            action,
            diffPct,
          };
        });
        // Add holdings in current but not in recommended (need to sell)
        currentHoldings.forEach(h => {
          const inRecommended = positionsToSave.some(pos =>
            pos.ticker === h.securityId ||
            h.fundName.toLowerCase().includes(pos.nombre.toLowerCase().substring(0, 10))
          );
          if (!inRecommended && h.percentOfPortfolio > 0.5) {
            summary.push({
              ticker: h.securityId,
              nombre: h.fundName,
              clase: h.assetClass === "Equity" ? "Renta Variable" : h.assetClass === "Fixed Income" ? "Renta Fija" : "Alternativos",
              actualPct: h.percentOfPortfolio,
              recomendadoPct: 0,
              action: "vender",
              diffPct: -h.percentOfPortfolio,
            });
          }
        });
        setRebalanceSummary(summary);
        setShowRebalanceSummary(true);
      }
    } catch (error) {
      console.error("Error saving cartera:", error);
    } finally {
      setSavingCartera(false);
    }
  };

  // ============================================================
  // EXCEL UPLOAD HANDLER
  // ============================================================

  // Open Excel modal instead of direct file picker
  const openExcelModal = (idx: number, portfolio: "proposed" | "current") => {
    setUploadingForIndex(idx);
    setUploadingForPortfolio(portfolio);
    setExcelModalData({ file: null, ter: "", isin: "", nombre: "", moneda: "USD" });
    setShowExcelModal(true);
  };

  // Handle file selection in modal
  const handleModalFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setExcelModalData(prev => ({ ...prev, file }));
    }
  };

  // Process Excel from modal
  const processExcelFromModal = () => {
    if (!excelModalData.file || uploadingForIndex === null || !uploadingForPortfolio) return;

    const file = excelModalData.file;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as (string | number | Date | undefined)[][];

        // Find date and value columns
        const headers = jsonData[0]?.map((h) => String(h).toLowerCase()) || [];
        let dateCol = headers.findIndex((h) =>
          h.includes("fecha") || h.includes("date") || h === "f" || h === "d"
        );
        let valueCol = headers.findIndex((h) =>
          h.includes("precio") || h.includes("price") || h.includes("close") ||
          h.includes("valor") || h.includes("value") || h.includes("nav") ||
          h.includes("cuota") || h === "p" || h === "v"
        );

        if (dateCol === -1) dateCol = 0;
        if (valueCol === -1) valueCol = 1;

        const historicalData: { date: string; close: number }[] = [];

        for (let i = 1; i < jsonData.length; i++) {
          const row = jsonData[i];
          if (!row || row.length < 2) continue;

          let dateVal = row[dateCol];
          let priceVal = row[valueCol];

          if (typeof dateVal === "number") {
            const excelDate = XLSX.SSF.parse_date_code(dateVal);
            dateVal = `${excelDate.y}-${String(excelDate.m).padStart(2, "0")}-${String(excelDate.d).padStart(2, "0")}`;
          } else if (dateVal instanceof Date) {
            dateVal = dateVal.toISOString().split("T")[0];
          } else if (typeof dateVal === "string") {
            const parsed = new Date(dateVal);
            if (!isNaN(parsed.getTime())) {
              dateVal = parsed.toISOString().split("T")[0];
            }
          }

          if (typeof priceVal === "string") {
            priceVal = parseFloat(priceVal.replace(/[,$]/g, ""));
          }

          if (dateVal && typeof priceVal === "number" && !isNaN(priceVal)) {
            historicalData.push({ date: dateVal, close: priceVal });
          }
        }

        historicalData.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        if (historicalData.length > 0) {
          const latestPrice = historicalData[historicalData.length - 1].close;
          const oldestPrice = historicalData[0].close;
          const return1Y = ((latestPrice - oldestPrice) / oldestPrice) * 100;

          // Parse TER from modal
          const terValue = excelModalData.ter ? parseFloat(excelModalData.ter) : undefined;

          if (uploadingForPortfolio === "proposed") {
            setProposedPositions(prev => prev.map((p, i) =>
              i === uploadingForIndex
                ? {
                    ...p,
                    manualHistoricalData: historicalData,
                    manualReturn1Y: return1Y,
                    manualTER: terValue ?? p.manualTER,
                    manualISIN: excelModalData.isin || p.manualISIN,
                    manualNombre: excelModalData.nombre || p.manualNombre,
                    manualMoneda: excelModalData.moneda || p.manualMoneda,
                    benchmarkProxy: undefined,
                  }
                : p
            ));
          } else {
            setCurrentHoldings(prev => prev.map((h, i) =>
              i === uploadingForIndex
                ? {
                    ...h,
                    manualHistoricalData: historicalData,
                    manualReturn1Y: return1Y,
                    manualTER: terValue ?? h.manualTER,
                    manualISIN: excelModalData.isin || h.manualISIN,
                    manualNombre: excelModalData.nombre || h.manualNombre,
                    manualMoneda: excelModalData.moneda || h.manualMoneda,
                    benchmarkProxy: undefined,
                  }
                : h
            ));
          }
          setShowExcelModal(false);
          setUploadError(null);
        } else {
          setUploadError("No se encontraron datos válidos en el archivo.");
        }
      } catch (error) {
        console.error("Error parsing Excel:", error);
        setUploadError("Error al leer el archivo Excel.");
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleExcelUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || uploadingForIndex === null || !uploadingForPortfolio) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as (string | number | Date | undefined)[][];

        // Find date and value columns
        const headers = jsonData[0]?.map((h) => String(h).toLowerCase()) || [];
        let dateCol = headers.findIndex((h) =>
          h.includes("fecha") || h.includes("date") || h === "f" || h === "d"
        );
        let valueCol = headers.findIndex((h) =>
          h.includes("precio") || h.includes("price") || h.includes("close") ||
          h.includes("valor") || h.includes("value") || h.includes("nav") || h === "p" || h === "v"
        );

        // Default to first two columns if not found
        if (dateCol === -1) dateCol = 0;
        if (valueCol === -1) valueCol = 1;

        // Parse data rows
        const historicalData: { date: string; close: number }[] = [];

        for (let i = 1; i < jsonData.length; i++) {
          const row = jsonData[i];
          if (!row || row.length < 2) continue;

          let dateVal = row[dateCol];
          let priceVal = row[valueCol];

          // Handle Excel date serial numbers
          if (typeof dateVal === "number") {
            const excelDate = XLSX.SSF.parse_date_code(dateVal);
            dateVal = `${excelDate.y}-${String(excelDate.m).padStart(2, "0")}-${String(excelDate.d).padStart(2, "0")}`;
          } else if (dateVal instanceof Date) {
            dateVal = dateVal.toISOString().split("T")[0];
          } else if (typeof dateVal === "string") {
            // Try to parse string date
            const parsed = new Date(dateVal);
            if (!isNaN(parsed.getTime())) {
              dateVal = parsed.toISOString().split("T")[0];
            }
          }

          // Parse price value
          if (typeof priceVal === "string") {
            priceVal = parseFloat(priceVal.replace(/[,$]/g, ""));
          }

          if (dateVal && typeof priceVal === "number" && !isNaN(priceVal)) {
            historicalData.push({ date: dateVal, close: priceVal });
          }
        }

        // Sort by date
        historicalData.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        if (historicalData.length > 0) {
          // Calculate 1Y return from the data
          const latestPrice = historicalData[historicalData.length - 1].close;
          const oldestPrice = historicalData[0].close;
          const return1Y = ((latestPrice - oldestPrice) / oldestPrice) * 100;

          if (uploadingForPortfolio === "proposed") {
            setProposedPositions(prev => prev.map((p, i) =>
              i === uploadingForIndex
                ? {
                    ...p,
                    manualHistoricalData: historicalData,
                    manualReturn1Y: return1Y,
                    benchmarkProxy: undefined,
                  }
                : p
            ));
          } else {
            setCurrentHoldings(prev => prev.map((h, i) =>
              i === uploadingForIndex
                ? {
                    ...h,
                    manualHistoricalData: historicalData,
                    manualReturn1Y: return1Y,
                    benchmarkProxy: undefined,
                  }
                : h
            ));
          }
        } else {
          setUploadError("No se encontraron datos válidos en el archivo. Asegúrese de tener columnas de fecha y precio.");
        }
      } catch (error) {
        console.error("Error parsing Excel:", error);
        setUploadError("Error al leer el archivo Excel.");
      } finally {
        setUploadingForIndex(null);
        setUploadingForPortfolio(null);
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // ============================================================
  // APPLY AI CARTERA
  // ============================================================

  const applyCartera = async (cartera: CarteraPosition[]) => {
    try {
      const positions: ProposedPosition[] = cartera.map((pos) => ({
        ticker: pos.ticker,
        nombre: pos.nombre,
        clase: pos.clase,
        porcentaje: pos.porcentaje,
        loading: true,
      }));

      setProposedPositions(positions);
      setShowCarteraIA(false);

      // Fetch data for each position using unified API
      for (let i = 0; i < positions.length; i++) {
        const pos = positions[i];
        try {
          const response = await fetch(
            `/api/funds/unified-profile?symbol=${encodeURIComponent(pos.ticker)}&name=${encodeURIComponent(pos.nombre)}`
          );
          const result = await response.json();

          if (result.success && result.profile) {
            const profile = result.profile;

            setProposedPositions((prev) =>
              prev.map((p, idx) =>
                idx === i
                  ? {
                      ...p,
                      loading: false,
                      fundData: {
                        id: `proposed-${pos.ticker}`,
                        ticker: profile.symbol || pos.ticker,
                        symbol: profile.symbol || pos.ticker,
                        name: profile.name || pos.nombre,
                        currency: profile.currency || "USD",
                        type: "proposed" as const,
                        asset_class: profile.assetType,
                        total_expense_ratio: profile.expenseRatio,
                        return_1m: profile.returns?.["1m"],
                        return_3m: profile.returns?.["3m"],
                        return_6m: profile.returns?.["6m"],
                        return_ytd: profile.returns?.ytd,
                        return_1y: profile.returns?.["1y"],
                        price: profile.price,
                        dataSource: profile.source,
                        historicalData: profile.historicalData,
                      },
                    }
                  : p
              )
            );
          } else {
            setProposedPositions((prev) =>
              prev.map((p, idx) => (idx === i ? { ...p, loading: false } : p))
            );
          }
        } catch (e) {
          console.error(`Error fetching ${pos.ticker}:`, e);
          setProposedPositions((prev) =>
            prev.map((p, idx) => (idx === i ? { ...p, loading: false } : p))
          );
        }
      }

      // Fetch historical data for comparison chart
      await fetchHistoricalComparison();
    } catch (error) {
      console.error("Error applying cartera:", error);
    }
  };

  // ============================================================
  // HISTORICAL COMPARISON
  // ============================================================

  const fetchHistoricalComparison = async () => {
    setLoadingHistorical(true);

    try {
      // Fetch benchmark proxy data for positions that need it
      const positionsWithProxyData: { pos: ProposedPosition; historicalData: HistoricalDataPoint[] }[] = [];

      for (const pos of proposedPositions) {
        // Priority: 1) Manual Excel data, 2) API data, 3) Benchmark proxy
        if (pos.manualHistoricalData && pos.manualHistoricalData.length > 0) {
          positionsWithProxyData.push({ pos, historicalData: pos.manualHistoricalData });
        } else if (pos.fundData?.historicalData && pos.fundData.historicalData.length > 0) {
          positionsWithProxyData.push({ pos, historicalData: pos.fundData.historicalData });
        } else if (pos.benchmarkProxy) {
          try {
            const res = await fetch(`/api/funds/yahoo-historical?symbol=${pos.benchmarkProxy}&range=5y`);
            const data = await res.json();
            if (data.historicalData && data.historicalData.length > 0) {
              positionsWithProxyData.push({ pos, historicalData: data.historicalData });
            }
          } catch (e) {
            console.error(`Error fetching proxy ${pos.benchmarkProxy}:`, e);
          }
        }
      }

      // Get all unique dates from all positions
      const allDates = new Set<string>();
      positionsWithProxyData.forEach(({ historicalData }) => {
        historicalData.forEach((d) => allDates.add(d.date));
      });

      // Sort dates
      const sortedDates = Array.from(allDates).sort(
        (a, b) => new Date(a).getTime() - new Date(b).getTime()
      );

      // Calculate weighted portfolio value for each date
      const proposedHistorical: { date: string; value: number }[] = [];

      if (positionsWithProxyData.length > 0 && sortedDates.length > 0) {
        // Normalize each position to base 100 first
        const normalizedPositions = positionsWithProxyData.map(({ pos, historicalData }) => {
          const sortedHistory = [...historicalData].sort(
            (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
          );
          const baseValue = sortedHistory[0]?.close || 1;
          const normalized = new Map<string, number>();
          sortedHistory.forEach((d) => {
            normalized.set(d.date, (d.close / baseValue) * 100);
          });
          return {
            weight: pos.porcentaje / 100,
            data: normalized,
          };
        });

        // Calculate total weight of positions with data
        const totalWeight = normalizedPositions.reduce((sum, p) => sum + p.weight, 0);

        // For each date, calculate weighted average
        sortedDates.forEach((date) => {
          let weightedSum = 0;
          let dateWeight = 0;

          normalizedPositions.forEach((pos) => {
            const value = pos.data.get(date);
            if (value != null) {
              weightedSum += value * pos.weight;
              dateWeight += pos.weight;
            }
          });

          if (dateWeight > 0) {
            // Normalize to the actual weight we have data for
            proposedHistorical.push({
              date,
              value: weightedSum / dateWeight * (dateWeight / totalWeight) + 100 * (1 - dateWeight / totalWeight),
            });
          }
        });
      }

      // If no historical data from positions, fall back to fetching VOO
      if (proposedHistorical.length === 0) {
        const proposedRes = await fetch("/api/funds/yahoo-historical?symbol=VOO&range=5y");
        const proposedData = await proposedRes.json();
        if (proposedData.historicalData) {
          const baseValue = proposedData.historicalData[0]?.close || 1;
          (proposedData.historicalData as HistoricalDataPoint[]).forEach((d) => {
            proposedHistorical.push({
              date: d.date,
              value: (d.close / baseValue) * 100,
            });
          });
        }
      }

      // Get historical data for current portfolio
      // Priority: 1) Manual Excel data, 2) Yahoo mapping, 3) Benchmark proxy
      const currentHistoricalMap = new Map<string, number[]>();
      let currentTotalWeight = 0;

      for (const holding of currentHoldings) {
        let historicalData: HistoricalDataPoint[] | null = null;

        // 1) Check for manual Excel data
        if (holding.manualHistoricalData && holding.manualHistoricalData.length > 0) {
          historicalData = holding.manualHistoricalData;
        }
        // 2) Try Yahoo mapping
        else {
          const yahooMapping = findYahooSymbol(holding.fundName);
          if (yahooMapping) {
            try {
              const res = await fetch(`/api/funds/yahoo-historical?symbol=${yahooMapping.yahooSymbol}&range=5y`);
              const data = await res.json();
              if (data.historicalData && data.historicalData.length > 0) {
                historicalData = data.historicalData;
              }
            } catch (e) {
              console.error(`Error fetching historical for ${holding.fundName}:`, e);
            }
          }
        }
        // 3) Try benchmark proxy
        if (!historicalData && holding.benchmarkProxy) {
          try {
            const res = await fetch(`/api/funds/yahoo-historical?symbol=${holding.benchmarkProxy}&range=5y`);
            const data = await res.json();
            if (data.historicalData && data.historicalData.length > 0) {
              historicalData = data.historicalData;
            }
          } catch (e) {
            console.error(`Error fetching proxy ${holding.benchmarkProxy}:`, e);
          }
        }

        // Process historical data if we got any
        if (historicalData && historicalData.length > 0) {
          const sorted = [...historicalData].sort(
            (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
          );
          const baseValue = sorted[0]?.close || 1;
          sorted.forEach((d) => {
            const normalizedValue = (d.close / baseValue) * 100;
            const existing = currentHistoricalMap.get(d.date) || [];
            existing.push(normalizedValue * (holding.percentOfPortfolio / 100));
            currentHistoricalMap.set(d.date, existing);
          });
          currentTotalWeight += holding.percentOfPortfolio;
        }
      }

      // Calculate weighted current portfolio
      const currentHistorical: { date: string; value: number }[] = [];
      if (currentTotalWeight > 0) {
        currentHistoricalMap.forEach((values, date) => {
          currentHistorical.push({
            date,
            value: values.reduce((sum, v) => sum + v, 0) * (100 / currentTotalWeight),
          });
        });
        currentHistorical.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      }

      // Merge into single dataset
      const dateMap = new Map<string, HistoricalPoint>();
      proposedHistorical.forEach((d) => {
        dateMap.set(d.date, { date: d.date, propuesto: d.value });
      });
      currentHistorical.forEach((d) => {
        const existing = dateMap.get(d.date);
        if (existing) {
          existing.actual = d.value;
        } else {
          dateMap.set(d.date, { date: d.date, actual: d.value });
        }
      });

      const merged = Array.from(dateMap.values()).sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
      );

      setHistoricalData(merged);
    } catch (error) {
      console.error("Error fetching historical:", error);
    } finally {
      setLoadingHistorical(false);
    }
  };

  // ============================================================
  // CALCULATIONS
  // ============================================================

  // Calculate proposed portfolio costs (using manual values if available)
  // Track positions with TER data vs without
  const proposedWithTER = proposedPositions.filter((p) => {
    const ter = p.manualTER ?? p.fundData?.total_expense_ratio;
    return ter != null && ter > 0;
  });
  const proposedWeightWithTER = proposedWithTER.reduce((sum, p) => sum + p.porcentaje, 0);

  // Calculate weighted TER only from positions with data
  const proposedTERRaw = proposedPositions.reduce((sum, p) => {
    const ter = p.manualTER ?? p.fundData?.total_expense_ratio ?? 0;
    return sum + (ter * p.porcentaje / 100);
  }, 0);

  // If we have TER data for some positions, extrapolate to full portfolio
  // Otherwise show the raw (likely incomplete) number
  const proposedTER = proposedWeightWithTER > 0
    ? (proposedTERRaw / proposedWeightWithTER) * 100
    : proposedTERRaw;

  // Calculate current portfolio TER (using manual values if available)
  const currentTER = currentHoldings.reduce((sum, h) => {
    const ter = h.manualTER ?? h.yahooData?.ter ?? 0;
    return sum + (ter * h.percentOfPortfolio / 100);
  }, 0);

  // Use calculated current TER, fallback to estimate if no data
  const effectiveCurrentTER = currentTER > 0 ? currentTER : 0.85; // 0.85% estimate for mutual funds

  const costSavings = effectiveCurrentTER - proposedTER;

  // Track TER data coverage for UI display
  const terDataCoverage = proposedPositions.length > 0
    ? proposedWeightWithTER / 100
    : 0;

  // Calculate 1Y returns (using manual values if available)
  const proposed1YReturn = proposedPositions.reduce((sum, p) => {
    const ret = p.manualReturn1Y ?? p.fundData?.return_1y ?? 0;
    return sum + (ret * p.porcentaje / 100);
  }, 0);

  // ============================================================
  // FORMATTERS
  // ============================================================

  const fmtPct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
  const fmtUSD = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <div className="space-y-6">
      {/* Hidden file input for Excel upload */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleExcelUpload}
        accept=".xlsx,.xls,.csv"
        className="hidden"
      />

      {/* Upload error banner */}
      {uploadError && (
        <div className="p-3 bg-gb-danger/10 border border-gb-danger/30 rounded-md flex items-center justify-between">
          <p className="text-sm text-gb-danger">{uploadError}</p>
          <button onClick={() => setUploadError(null)} className="text-gb-danger/70 hover:text-gb-danger ml-2">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ============================================================ */}
      {/* CLIENT SEARCH */}
      {/* ============================================================ */}
      <Card>
        <div className="flex gap-3 items-end">
          <ClientSelector
            value={client?.id || null}
            onChange={(selectedClient: ClientOption | null) => {
              if (selectedClient) {
                setClientEmail(selectedClient.email);
                setClientNotFound(false);
                // Trigger search after state update
                setTimeout(() => searchClient(), 100);
              } else {
                setClientEmail("");
                setClient(null);
                setRiskProfile(null);
                setCurrentHoldings([]);
                setProposedPositions([]);
                setTotalInvestment(0);
              }
            }}
            label="Cliente"
            placeholder="Seleccionar cliente..."
            className="flex-1"
            showRiskProfile={true}
          />
          {searchingClient && (
            <div className="pb-2.5">
              <Loader className="w-5 h-5 animate-spin text-gb-gray" />
            </div>
          )}
        </div>

        {clientNotFound && (
          <div className="mt-4 p-3 bg-gb-warning/10 border border-gb-warning/30 rounded-lg flex items-center gap-2 text-gb-warning text-sm">
            <AlertTriangle className="w-4 h-4" />
            Cliente no encontrado
          </div>
        )}

        {client && (
          <div className="mt-4 p-4 bg-gb-light border border-gb-border rounded-lg">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-white border border-gb-border rounded-full flex items-center justify-center">
                <User className="w-6 h-6 text-gb-gray" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-gb-black">
                  {client.nombre} {client.apellido}
                </h3>
                <p className="text-sm text-gb-gray">{client.email}</p>
              </div>
              {riskProfile && (
                <div className="text-right">
                  <div className="text-sm text-gb-gray">Perfil de Riesgo</div>
                  <div className="font-semibold text-gb-black">{riskProfile.profile_label}</div>
                  <div className="text-xs text-gb-gray">Score: {riskProfile.global_score}</div>
                </div>
              )}
              {totalInvestment > 0 && (
                <div className="text-right border-l border-gb-border pl-4">
                  <div className="text-sm text-gb-gray">Inversión Total</div>
                  <div className="font-semibold text-gb-black">{fmtUSD(totalInvestment)}</div>
                </div>
              )}
            </div>
          </div>
        )}
      </Card>

      {/* ============================================================ */}
      {/* GENERATE AI PORTFOLIO BUTTON */}
      {/* ============================================================ */}
      {client && (
        <div className="flex justify-center">
          <Button onClick={() => setShowCarteraIA(true)} className="px-6 py-3">
            <Sparkles className="w-5 h-5" />
            Generar Cartera con IA
          </Button>
        </div>
      )}

      {/* ============================================================ */}
      {/* PROPOSED PORTFOLIO (TOP - MAIN FOCUS) */}
      {/* ============================================================ */}
      {(proposedPositions.length > 0 || client) && (
        <div className="bg-white border border-gb-border rounded-xl shadow-sm overflow-hidden">
          <div
            className="w-full px-6 py-4 bg-gb-light flex items-center justify-between hover:bg-gb-border/40 transition-colors cursor-pointer"
          >
            <div
              className="flex items-center gap-3 flex-1"
              onClick={() => setProposedExpanded(!proposedExpanded)}
            >
              <div className="w-10 h-10 bg-gb-primary rounded-lg flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-white" />
              </div>
              <div className="text-left">
                <h2 className="text-lg font-bold text-gb-black">Portafolio Recomendado</h2>
                <p className="text-sm text-gb-gray">
                  {proposedPositions.length} posiciones
                  {carteraLoadedFromDB && <span className="ml-2 text-gb-success">(guardado)</span>}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => saveCartera()}
                disabled={savingCartera}
                className="px-3 py-1.5 text-sm font-medium text-gb-black bg-white border border-gb-border hover:bg-gb-light rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-50"
              >
                {savingCartera ? (
                  <Loader className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                Guardar
              </button>
              <button onClick={() => setProposedExpanded(!proposedExpanded)} className="p-1 hover:bg-gb-border/40 rounded">
                {proposedExpanded ? <ChevronUp className="w-5 h-5 text-gb-gray" /> : <ChevronDown className="w-5 h-5 text-gb-gray" />}
              </button>
            </div>
          </div>

          {proposedExpanded && (
            <div className="p-6">
              {proposedPositions.length === 0 ? (
                <div className="text-center py-8">
                  <PieChart className="w-10 h-10 text-gb-border mx-auto mb-3" />
                  <p className="text-sm text-gb-gray mb-4">Sin posiciones todavía. Genera con IA o agrega fondos manualmente.</p>
                  <button
                    onClick={() => setShowFundSearch(true)}
                    className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-gb-black bg-gb-light hover:bg-gb-border/40 border border-gb-border rounded-lg transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    Buscar y agregar fondos
                  </button>
                </div>
              ) : (<>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gb-border">
                      <th className="text-left py-3 px-2 text-gb-gray font-medium">Ticker</th>
                      <th className="text-left py-3 px-2 text-gb-gray font-medium">Nombre</th>
                      <th className="text-left py-3 px-2 text-gb-gray font-medium">Clase</th>
                      <th className="text-right py-3 px-2 text-gb-gray font-medium">%</th>
                      <th className="text-right py-3 px-2 text-gb-gray font-medium">TER</th>
                      <th className="text-right py-3 px-2 text-gb-gray font-medium">1Y</th>
                      <th className="text-center py-3 px-2 text-gb-gray font-medium min-w-[120px]">
                        <div className="flex items-center justify-center gap-1">
                          <span>Datos</span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowExcelHelp(true);
                            }}
                            className="p-0.5 hover:bg-gb-light rounded"
                            title="Ayuda formato Excel"
                          >
                            <HelpCircle className="w-3.5 h-3.5 text-gb-gray hover:text-gb-info" />
                          </button>
                        </div>
                      </th>
                      <th className="w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {proposedPositions.map((pos, idx) => {
                      const hasHistoricalData = pos.fundData?.historicalData && pos.fundData.historicalData.length > 0;
                      const ter = pos.manualTER ?? pos.fundData?.total_expense_ratio ?? null;
                      const ret1y = pos.manualReturn1Y ?? pos.fundData?.return_1y ?? null;

                      return (
                        <tr key={idx} className="border-b border-gb-border/60 hover:bg-gb-light">
                          <td className="py-3 px-2">
                            <span className="font-mono font-medium text-gb-black">{pos.ticker}</span>
                          </td>
                          <td className="py-3 px-2">
                            <div className="text-gb-black">{pos.nombre}</div>
                          </td>
                          <td className="py-3 px-2">
                            <span className="text-xs px-2 py-1 rounded-full bg-background text-gb-gray border border-gb-border">
                              {pos.clase === "Renta Variable" ? "RV" : pos.clase === "Renta Fija" ? "RF" : "ALT"}
                            </span>
                          </td>
                          <td className="py-3 px-2 text-right">
                            <input
                              type="number"
                              value={pos.porcentaje}
                              onChange={(e) => {
                                const newVal = parseFloat(e.target.value) || 0;
                                setProposedPositions(prev => prev.map((p, i) => i === idx ? { ...p, porcentaje: newVal } : p));
                              }}
                              className="w-16 text-right font-medium bg-transparent border-b border-transparent hover:border-gb-border focus:border-gb-info focus:outline-none py-1"
                            />
                            <span className="text-gb-gray">%</span>
                          </td>
                          <td className="py-3 px-2 text-right">
                            {pos.loading ? (
                              <Loader className="w-4 h-4 animate-spin text-gb-gray ml-auto" />
                            ) : (
                              <div className="flex items-center justify-end gap-1">
                                <input
                                  type="number"
                                  step="0.001"
                                  value={ter ?? ""}
                                  placeholder="—"
                                  onChange={(e) => {
                                    const newVal = parseFloat(e.target.value);
                                    setProposedPositions(prev => prev.map((p, i) => i === idx ? { ...p, manualTER: isNaN(newVal) ? undefined : newVal } : p));
                                  }}
                                  className="w-14 text-right bg-transparent border-b border-transparent hover:border-gb-border focus:border-gb-info focus:outline-none py-1"
                                />
                                <span className="text-gb-gray text-xs">%</span>
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-2 text-right">
                            {pos.loading ? (
                              <Loader className="w-4 h-4 animate-spin text-gb-gray ml-auto" />
                            ) : (
                              <div className="flex items-center justify-end gap-1">
                                <input
                                  type="number"
                                  step="0.1"
                                  value={ret1y ?? ""}
                                  placeholder="—"
                                  onChange={(e) => {
                                    const newVal = parseFloat(e.target.value);
                                    setProposedPositions(prev => prev.map((p, i) => i === idx ? { ...p, manualReturn1Y: isNaN(newVal) ? undefined : newVal } : p));
                                  }}
                                  className={`w-16 text-right bg-transparent border-b border-transparent hover:border-gb-border focus:border-gb-info focus:outline-none py-1 ${
                                    ret1y != null ? (ret1y >= 0 ? "text-gb-success" : "text-gb-danger") : ""
                                  }`}
                                />
                                <span className="text-gb-gray text-xs">%</span>
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-2 text-center">
                            {pos.loading ? (
                              <Loader className="w-4 h-4 animate-spin text-gb-border mx-auto" />
                            ) : hasHistoricalData || pos.manualHistoricalData ? (
                              <div className="flex items-center justify-center gap-1">
                                <Check className="w-4 h-4 text-gb-success" />
                                <span className="text-xs text-gb-success">
                                  {pos.manualHistoricalData ? "Excel" : "API"}
                                </span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1">
                                <input
                                  type="text"
                                  list={`proxy-list-proposed-${idx}`}
                                  value={pos.benchmarkProxy || ""}
                                  onChange={(e) => {
                                    const proxy = e.target.value.toUpperCase();
                                    setProposedPositions(prev => prev.map((p, i) =>
                                      i === idx ? { ...p, benchmarkProxy: proxy || undefined } : p
                                    ));
                                  }}
                                  placeholder="Proxy"
                                  className="text-xs border border-gb-border rounded px-1.5 py-0.5 bg-gb-warning/10 text-gb-warning focus:outline-none focus:border-gb-warning w-16 uppercase"
                                />
                                <datalist id={`proxy-list-proposed-${idx}`}>
                                  {BENCHMARK_PROXIES.filter(b => b.clase === pos.clase || pos.clase === "Commodities" || pos.clase === "Alternativos").map(b => (
                                    <option key={b.symbol} value={b.symbol}>{b.name}</option>
                                  ))}
                                </datalist>
                                <button
                                  onClick={() => openExcelModal(idx, "proposed")}
                                  className="p-1 hover:bg-gb-light rounded transition-colors"
                                  title="Cargar datos desde Excel"
                                >
                                  <FileSpreadsheet className="w-4 h-4 text-gb-info" />
                                </button>
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-1">
                            <button
                              onClick={() => removeProposedPosition(idx)}
                              className="p-1 text-gb-border hover:text-gb-danger rounded transition-colors"
                              title="Eliminar posición"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Add position button */}
              <button
                onClick={() => setShowFundSearch(true)}
                className="mt-3 flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-gb-black bg-gb-light hover:bg-gb-border/40 border border-gb-border border-dashed rounded-lg transition-colors w-full justify-center"
              >
                <Plus className="w-4 h-4" />
                Agregar posición
              </button>

              {/* Summary Stats */}
              <div className="mt-6 pt-6 border-t border-gb-border grid grid-cols-3 gap-4">
                <div className="text-center p-4 bg-gb-light rounded-lg">
                  <div className="text-sm text-gb-gray mb-1">TER Promedio Ponderado</div>
                  <div className="text-2xl font-bold text-gb-black">{proposedTER.toFixed(3)}%</div>
                  {terDataCoverage < 1 && terDataCoverage > 0 && (
                    <div className="text-xs text-gb-warning mt-1">
                      Basado en {Math.round(terDataCoverage * 100)}% del portafolio
                    </div>
                  )}
                  {terDataCoverage === 0 && proposedPositions.length > 0 && (
                    <div className="text-xs text-gb-warning mt-1">
                      Sin datos TER - ingrese valores manualmente
                    </div>
                  )}
                </div>
                <div className="text-center p-4 bg-gb-light rounded-lg">
                  <div className="text-sm text-gb-gray mb-1">Retorno 1Y Esperado</div>
                  <div className={`text-2xl font-bold ${proposed1YReturn >= 0 ? "text-gb-success" : "text-gb-danger"}`}>
                    {fmtPct(proposed1YReturn)}
                  </div>
                </div>
                <div className="text-center p-4 bg-gb-light rounded-lg">
                  <div className="text-sm text-gb-gray mb-1">Posiciones</div>
                  <div className="text-2xl font-bold text-gb-black">{proposedPositions.length}</div>
                </div>
              </div>
              </>)}
            </div>
          )}
        </div>
      )}

      {/* ============================================================ */}
      {/* CURRENT PORTFOLIO (MIDDLE - REFERENCE) */}
      {/* ============================================================ */}
      {currentHoldings.length > 0 && (
        <div className="bg-white border border-gb-border rounded-xl shadow-sm overflow-hidden">
          <button
            onClick={() => setCurrentExpanded(!currentExpanded)}
            className="w-full px-6 py-4 bg-gb-light flex items-center justify-between hover:bg-gb-border/40 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gb-black rounded-lg flex items-center justify-center">
                <Wallet className="w-5 h-5 text-white" />
              </div>
              <div className="text-left">
                <h2 className="text-lg font-bold text-gb-black">Portafolio Actual</h2>
                <p className="text-sm text-gb-gray">{currentHoldings.length} posiciones - Referencia</p>
              </div>
            </div>
            {currentExpanded ? <ChevronUp className="w-5 h-5 text-gb-gray" /> : <ChevronDown className="w-5 h-5 text-gb-gray" />}
          </button>

          {currentExpanded && (
            <div className="p-6">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gb-border">
                      <th className="text-left py-3 px-2 text-gb-gray font-medium">Fondo</th>
                      <th className="text-left py-3 px-2 text-gb-gray font-medium">Clase</th>
                      <th className="text-right py-3 px-2 text-gb-gray font-medium">%</th>
                      <th className="text-right py-3 px-2 text-gb-gray font-medium">TER</th>
                      <th className="text-right py-3 px-2 text-gb-gray font-medium">1Y</th>
                      <th className="text-center py-3 px-2 text-gb-gray font-medium min-w-[120px]">
                        <div className="flex items-center justify-center gap-1">
                          <span>Datos</span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowExcelHelp(true);
                            }}
                            className="p-0.5 hover:bg-gb-light rounded"
                            title="Ayuda formato Excel"
                          >
                            <HelpCircle className="w-3.5 h-3.5 text-gb-gray hover:text-gb-info" />
                          </button>
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentHoldings.map((holding, idx) => {
                      const hasYahooData = holding.yahooData != null;
                      const hasHistoricalData = holding.manualHistoricalData && holding.manualHistoricalData.length > 0;
                      const ter = holding.manualTER ?? holding.yahooData?.ter ?? null;
                      const ret1y = holding.manualReturn1Y ?? holding.yahooData?.return_1y ?? null;

                      return (
                        <tr key={idx} className="border-b border-gb-border/60 hover:bg-gb-light">
                          <td className="py-3 px-2">
                            <div className="font-medium text-gb-black text-xs leading-tight">{holding.fundName}</div>
                            <div className="text-xs text-gb-gray">{holding.securityId}</div>
                          </td>
                          <td className="py-3 px-2">
                            <span className="text-xs px-2 py-1 rounded-full bg-background text-gb-gray border border-gb-border">
                              {holding.assetClass === "Equity" ? "RV" : holding.assetClass === "Fixed Income" ? "RF" : "ALT"}
                            </span>
                          </td>
                          <td className="py-3 px-2 text-right">
                            <input
                              type="number"
                              value={holding.percentOfPortfolio.toFixed(1)}
                              onChange={(e) => {
                                const newVal = parseFloat(e.target.value) || 0;
                                setCurrentHoldings(prev => prev.map((h, i) => i === idx ? { ...h, percentOfPortfolio: newVal } : h));
                              }}
                              className="w-16 text-right font-medium bg-transparent border-b border-transparent hover:border-gb-border focus:border-gb-info focus:outline-none py-1"
                            />
                            <span className="text-gb-gray">%</span>
                          </td>
                          <td className="py-3 px-2 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <input
                                type="number"
                                step="0.001"
                                value={ter ?? ""}
                                placeholder="—"
                                onChange={(e) => {
                                  const newVal = parseFloat(e.target.value);
                                  setCurrentHoldings(prev => prev.map((h, i) => i === idx ? { ...h, manualTER: isNaN(newVal) ? undefined : newVal } : h));
                                }}
                                className="w-14 text-right bg-transparent border-b border-transparent hover:border-gb-border focus:border-gb-info focus:outline-none py-1"
                              />
                              <span className="text-gb-gray text-xs">%</span>
                            </div>
                          </td>
                          <td className="py-3 px-2 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <input
                                type="number"
                                step="0.1"
                                value={ret1y ?? ""}
                                placeholder="—"
                                onChange={(e) => {
                                  const newVal = parseFloat(e.target.value);
                                  setCurrentHoldings(prev => prev.map((h, i) => i === idx ? { ...h, manualReturn1Y: isNaN(newVal) ? undefined : newVal } : h));
                                }}
                                className={`w-16 text-right bg-transparent border-b border-transparent hover:border-gb-border focus:border-gb-info focus:outline-none py-1 ${
                                  ret1y != null ? (ret1y >= 0 ? "text-gb-success" : "text-gb-danger") : ""
                                }`}
                              />
                              <span className="text-gb-gray text-xs">%</span>
                            </div>
                          </td>
                          <td className="py-3 px-2 text-center">
                            {hasHistoricalData ? (
                              <div className="flex items-center justify-center gap-1">
                                <Check className="w-4 h-4 text-gb-success" />
                                <span className="text-xs text-gb-success">Excel</span>
                              </div>
                            ) : hasYahooData ? (
                              <div className="flex items-center justify-center gap-1">
                                <Check className="w-4 h-4 text-gb-success" />
                                <span className="text-xs text-gb-success">API</span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1">
                                <input
                                  type="text"
                                  list={`proxy-list-current-${idx}`}
                                  value={holding.benchmarkProxy || ""}
                                  onChange={(e) => {
                                    const proxy = e.target.value.toUpperCase();
                                    setCurrentHoldings(prev => prev.map((h, i) =>
                                      i === idx ? { ...h, benchmarkProxy: proxy || undefined } : h
                                    ));
                                  }}
                                  placeholder="Proxy"
                                  className="text-xs border border-gb-border rounded px-1.5 py-0.5 bg-gb-warning/10 text-gb-warning focus:outline-none focus:border-gb-warning w-16 uppercase"
                                />
                                <datalist id={`proxy-list-current-${idx}`}>
                                  {BENCHMARK_PROXIES.map(b => (
                                    <option key={b.symbol} value={b.symbol}>{b.name}</option>
                                  ))}
                                </datalist>
                                <button
                                  onClick={() => openExcelModal(idx, "current")}
                                  className="p-1 hover:bg-gb-light rounded transition-colors"
                                  title="Cargar datos desde Excel"
                                >
                                  <FileSpreadsheet className="w-4 h-4 text-gb-info" />
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Current Portfolio Summary */}
              <div className="mt-4 pt-4 border-t border-gb-border flex justify-between text-sm">
                <div>
                  <span className="text-gb-gray">TER Estimado (fondos mutuos): </span>
                  <span className="font-medium text-gb-danger">{effectiveCurrentTER.toFixed(3)}%</span>
                </div>
                <div>
                  <span className="text-gb-gray">Total: </span>
                  <span className="font-bold text-gb-black">{fmtUSD(totalInvestment)}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ============================================================ */}
      {/* COMPARISON SECTION (BOTTOM) */}
      {/* ============================================================ */}
      {proposedPositions.length > 0 && currentHoldings.length > 0 && (
        <div className="bg-white border border-gb-border rounded-xl shadow-sm overflow-hidden">
          <button
            onClick={() => setComparisonExpanded(!comparisonExpanded)}
            className="w-full px-6 py-4 bg-gb-light flex items-center justify-between hover:bg-gb-border/40 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gb-black rounded-lg flex items-center justify-center">
                <PieChart className="w-5 h-5 text-white" />
              </div>
              <div className="text-left">
                <h2 className="text-lg font-bold text-gb-black">Comparación Final</h2>
                <p className="text-sm text-gb-gray">Costos y Rentabilidad</p>
              </div>
            </div>
            {comparisonExpanded ? <ChevronUp className="w-5 h-5 text-gb-gray" /> : <ChevronDown className="w-5 h-5 text-gb-gray" />}
          </button>

          {comparisonExpanded && (
            <div className="p-6 space-y-6">
              {/* Cost Comparison */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-5 bg-gb-danger/10 rounded-xl border border-gb-danger/20">
                  <div className="flex items-center gap-2 mb-2">
                    <ArrowDownRight className="w-5 h-5 text-gb-danger" />
                    <span className="text-sm font-medium text-gb-danger">Costo Actual</span>
                  </div>
                  <div className="text-3xl font-bold text-gb-danger">{effectiveCurrentTER.toFixed(3)}%</div>
                  <div className="text-sm text-gb-danger/80 mt-1">
                    {fmtUSD(totalInvestment * effectiveCurrentTER / 100)} / año
                  </div>
                </div>

                <div className="p-5 bg-gb-success/10 rounded-xl border border-gb-success/20">
                  <div className="flex items-center gap-2 mb-2">
                    <ArrowUpRight className="w-5 h-5 text-gb-success" />
                    <span className="text-sm font-medium text-gb-success">Costo Propuesto</span>
                  </div>
                  <div className="text-3xl font-bold text-gb-success">{proposedTER.toFixed(3)}%</div>
                  <div className="text-sm text-gb-success/80 mt-1">
                    {fmtUSD(totalInvestment * proposedTER / 100)} / año
                  </div>
                </div>

                <div className="p-5 bg-gb-success/10 rounded-xl border border-gb-success/30">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle className="w-5 h-5 text-gb-success" />
                    <span className="text-sm font-medium text-gb-success">Ahorro Anual</span>
                  </div>
                  <div className="text-3xl font-bold text-gb-success">{costSavings.toFixed(3)}%</div>
                  <div className="text-sm text-gb-success/80 mt-1">
                    {fmtUSD(totalInvestment * costSavings / 100)} / año
                  </div>
                </div>
              </div>

              {/* Historical Chart */}
              <div className="mt-8">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-gb-black">Evolución Histórica (Base 100)</h3>
                  <button
                    onClick={fetchHistoricalComparison}
                    disabled={loadingHistorical}
                    className="text-sm text-gb-info hover:text-gb-primary flex items-center gap-1"
                  >
                    <RefreshCw className={`w-4 h-4 ${loadingHistorical ? "animate-spin" : ""}`} />
                    Actualizar
                  </button>
                </div>

                {loadingHistorical ? (
                  <div className="h-64 flex items-center justify-center">
                    <Loader className="w-8 h-8 animate-spin text-gb-gray" />
                  </div>
                ) : historicalData.length > 0 ? (
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={historicalData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id="colorPropuesto" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                          </linearGradient>
                          <linearGradient id="colorActual" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#6b7280" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#6b7280" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis
                          dataKey="date"
                          tickFormatter={(d) => new Date(d).toLocaleDateString("es-CL", { month: "short" })}
                          tick={{ fontSize: 11, fill: "#9ca3af" }}
                        />
                        <YAxis
                          domain={["dataMin - 5", "dataMax + 5"]}
                          tick={{ fontSize: 11, fill: "#9ca3af" }}
                        />
                        <Tooltip
                          contentStyle={{ borderRadius: "8px", border: "1px solid #e5e7eb" }}
                          formatter={(value) => value != null ? [`${Number(value).toFixed(1)}`, ""] : ["", ""]}
                          labelFormatter={(d) => new Date(d as string).toLocaleDateString("es-CL")}
                        />
                        <Legend />
                        <Area
                          type="monotone"
                          dataKey="propuesto"
                          name="Propuesto"
                          stroke="#10b981"
                          strokeWidth={2}
                          fill="url(#colorPropuesto)"
                        />
                        <Area
                          type="monotone"
                          dataKey="actual"
                          name="Actual"
                          stroke="#6b7280"
                          strokeWidth={2}
                          fill="url(#colorActual)"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="h-64 flex items-center justify-center text-gb-gray">
                    <div className="text-center">
                      <PieChart className="w-12 h-12 mx-auto mb-2 opacity-50" />
                      <p>No hay datos históricos disponibles</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ============================================================ */}
      {/* REBALANCING SUMMARY */}
      {/* ============================================================ */}
      {showRebalanceSummary && rebalanceSummary.length > 0 && (
        <div className="bg-white border border-gb-border rounded-xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 bg-gb-light flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gb-black rounded-lg flex items-center justify-center">
                <RefreshCw className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-gb-black">Resumen de Rebalanceo</h2>
                <p className="text-sm text-gb-gray">Acciones necesarias para alinear el portafolio</p>
              </div>
            </div>
            <button
              onClick={() => setShowRebalanceSummary(false)}
              className="text-gb-gray hover:text-gb-black"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="p-6">
            {/* Summary counts */}
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="text-center p-3 bg-gb-success/10 rounded-lg">
                <div className="text-2xl font-bold text-gb-success">{rebalanceSummary.filter(s => s.action === "comprar").length}</div>
                <div className="text-xs text-gb-success font-medium">Comprar / Aumentar</div>
              </div>
              <div className="text-center p-3 bg-gb-danger/10 rounded-lg">
                <div className="text-2xl font-bold text-gb-danger">{rebalanceSummary.filter(s => s.action === "vender").length}</div>
                <div className="text-xs text-gb-danger font-medium">Vender / Reducir</div>
              </div>
              <div className="text-center p-3 bg-gb-light rounded-lg">
                <div className="text-2xl font-bold text-gb-gray">{rebalanceSummary.filter(s => s.action === "mantener").length}</div>
                <div className="text-xs text-gb-gray font-medium">Mantener</div>
              </div>
            </div>

            {/* Detail table */}
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gb-border">
                  <th className="text-left py-2 px-2 text-gb-gray font-medium">Instrumento</th>
                  <th className="text-left py-2 px-2 text-gb-gray font-medium">Clase</th>
                  <th className="text-right py-2 px-2 text-gb-gray font-medium">Actual %</th>
                  <th className="text-right py-2 px-2 text-gb-gray font-medium">Recom. %</th>
                  <th className="text-right py-2 px-2 text-gb-gray font-medium">Diferencia</th>
                  <th className="text-center py-2 px-2 text-gb-gray font-medium">Accion</th>
                </tr>
              </thead>
              <tbody>
                {rebalanceSummary
                  .sort((a, b) => Math.abs(b.diffPct) - Math.abs(a.diffPct))
                  .map((item, idx) => (
                  <tr key={idx} className="border-b border-gb-border/60">
                    <td className="py-2.5 px-2">
                      <div className="font-medium text-gb-black">{item.nombre}</div>
                      <div className="text-xs text-gb-gray">{item.ticker}</div>
                    </td>
                    <td className="py-2.5 px-2">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-background text-gb-gray border border-gb-border">
                        {item.clase === "Renta Variable" ? "RV" : item.clase === "Renta Fija" ? "RF" : "ALT"}
                      </span>
                    </td>
                    <td className="py-2.5 px-2 text-right font-medium text-gb-black">{item.actualPct.toFixed(1)}%</td>
                    <td className="py-2.5 px-2 text-right font-medium text-gb-black">{item.recomendadoPct.toFixed(1)}%</td>
                    <td className={`py-2.5 px-2 text-right font-bold ${
                      item.diffPct > 0 ? "text-gb-success" : item.diffPct < 0 ? "text-gb-danger" : "text-gb-gray"
                    }`}>
                      {item.diffPct > 0 ? "+" : ""}{item.diffPct.toFixed(1)}%
                    </td>
                    <td className="py-2.5 px-2 text-center">
                      <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                        item.action === "comprar" ? "bg-gb-success/10 text-gb-success" :
                        item.action === "vender" ? "bg-gb-danger/10 text-gb-danger" :
                        "bg-gb-light text-gb-gray"
                      }`}>
                        {item.action === "comprar" ? "Comprar" : item.action === "vender" ? "Vender" : "Mantener"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {totalInvestment > 0 && (
              <div className="mt-4 pt-4 border-t border-gb-border">
                <h4 className="text-sm font-semibold text-gb-gray mb-2">Montos estimados</h4>
                <div className="space-y-1">
                  {rebalanceSummary
                    .filter(s => s.action !== "mantener")
                    .sort((a, b) => Math.abs(b.diffPct) - Math.abs(a.diffPct))
                    .map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between text-sm">
                      <span className="text-gb-gray">{item.nombre}</span>
                      <span className={`font-medium ${item.diffPct > 0 ? "text-gb-success" : "text-gb-danger"}`}>
                        {item.diffPct > 0 ? "+" : ""}{fmtUSD(totalInvestment * item.diffPct / 100)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* FUND SEARCH MODAL */}
      {/* ============================================================ */}
      {showFundSearch && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-xl w-full max-h-[80vh] flex flex-col">
            <div className="border-b border-gb-border px-6 py-4 flex items-center justify-between">
              <h2 className="text-lg font-bold flex items-center gap-2 text-gb-black">
                <Search className="w-5 h-5 text-gb-primary" />
                Buscar Fondo o ETF
              </h2>
              <button onClick={() => { setShowFundSearch(false); setFundSearchQuery(""); setFundSearchResults([]); }} className="text-gb-gray hover:text-gb-black">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-6 py-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gb-gray" />
                <input
                  type="text"
                  autoFocus
                  value={fundSearchQuery}
                  onChange={(e) => {
                    setFundSearchQuery(e.target.value);
                    searchFundsForAdd(e.target.value);
                  }}
                  placeholder="Buscar por nombre, ticker, RUN o ISIN..."
                  className="w-full pl-10 pr-4 py-3 border border-gb-border rounded-lg focus:border-gb-primary focus:outline-none text-sm"
                />
                {fundSearchLoading && <Loader className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gb-primary animate-spin" />}
              </div>
              <p className="text-xs text-gb-gray mt-2">Busca en fondos chilenos (AAFM/Fintual), ETFs internacionales y acciones</p>
            </div>
            <div className="flex-1 overflow-y-auto px-6 pb-4">
              {fundSearchResults.length > 0 ? (
                <div className="space-y-1">
                  {fundSearchResults.map((fund) => (
                    <button
                      key={fund.id}
                      onClick={() => addFundToProposed(fund)}
                      className="w-full p-3 hover:bg-gb-light rounded-lg transition-colors text-left flex items-center justify-between group"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm font-bold text-gb-black">{fund.symbol}</span>
                          <span className="text-xs px-1.5 py-0.5 bg-gb-light text-gb-gray rounded">{fund.type}</span>
                          {fund.source === "local" && (
                            <span className="text-xs px-1.5 py-0.5 bg-background text-gb-gray border border-gb-border rounded">BD</span>
                          )}
                        </div>
                        <p className="text-sm text-gb-black truncate mt-0.5">{fund.name}</p>
                        <div className="flex items-center gap-3 mt-0.5 text-xs text-gb-gray">
                          {fund.ter != null && <span>TER: {fund.ter}%</span>}
                          {fund.return_1y != null && (
                            <span className={fund.return_1y >= 0 ? "text-gb-success" : "text-gb-danger"}>
                              1Y: {fund.return_1y > 0 ? "+" : ""}{typeof fund.return_1y === "number" && Math.abs(fund.return_1y) > 1 ? fund.return_1y.toFixed(1) : ((fund.return_1y ?? 0) * 100).toFixed(1)}%
                            </span>
                          )}
                        </div>
                      </div>
                      <Plus className="w-5 h-5 text-gb-border group-hover:text-gb-primary transition-colors flex-shrink-0 ml-2" />
                    </button>
                  ))}
                </div>
              ) : fundSearchQuery.length >= 2 && !fundSearchLoading ? (
                <div className="text-center py-8 text-gb-gray">
                  <p className="text-sm">No se encontraron resultados para &ldquo;{fundSearchQuery}&rdquo;</p>
                  <p className="text-xs mt-1">Puedes escribir el ticker directamente en la tabla</p>
                </div>
              ) : (
                <div className="text-center py-8 text-gb-gray">
                  <Search className="w-8 h-8 mx-auto mb-2 text-gb-border" />
                  <p className="text-sm">Escribe al menos 2 caracteres para buscar</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* EXCEL HELP MODAL (z-[60] to appear above upload modal) */}
      {/* ============================================================ */}
      {showExcelHelp && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="border-b border-gb-border px-6 py-4 flex items-center justify-between sticky top-0 bg-white">
              <h2 className="text-lg font-bold flex items-center gap-2 text-gb-black">
                <FileSpreadsheet className="w-5 h-5 text-gb-info" />
                Formato de Excel para Datos Históricos
              </h2>
              <button
                onClick={() => setShowExcelHelp(false)}
                className="text-gb-gray hover:text-gb-black"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-6">
              {/* Download template button */}
              <div className="bg-gb-light border border-gb-border rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium text-gb-black">Descargar Template</h3>
                    <p className="text-sm text-gb-gray">Archivo Excel de ejemplo con el formato correcto</p>
                  </div>
                  <Button onClick={downloadExcelTemplate}>
                    <Download className="w-4 h-4" />
                    Descargar
                  </Button>
                </div>
              </div>

              {/* Format explanation */}
              <div>
                <h3 className="font-medium text-gb-black mb-3">Estructura del Archivo</h3>
                <div className="bg-gb-light rounded-lg p-4 font-mono text-sm">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gb-border">
                        <th className="text-left py-2 px-3 bg-gb-border/40">Fecha</th>
                        <th className="text-right py-2 px-3 bg-gb-border/40">Valor</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-gb-border">
                        <td className="py-2 px-3">2024-01-15</td>
                        <td className="text-right py-2 px-3">1000.00</td>
                      </tr>
                      <tr className="border-b border-gb-border">
                        <td className="py-2 px-3">2024-02-15</td>
                        <td className="text-right py-2 px-3">1025.50</td>
                      </tr>
                      <tr>
                        <td className="py-2 px-3">2024-03-15</td>
                        <td className="text-right py-2 px-3">1015.30</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Column names */}
              <div>
                <h3 className="font-medium text-gb-black mb-3">Nombres de Columnas Aceptados</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-gb-light rounded-lg p-3">
                    <h4 className="text-sm font-medium text-gb-gray mb-2">Columna de Fecha:</h4>
                    <div className="flex flex-wrap gap-1">
                      {["Fecha", "Date", "F", "D"].map(name => (
                        <span key={name} className="px-2 py-0.5 bg-gb-border/40 rounded text-xs">{name}</span>
                      ))}
                    </div>
                  </div>
                  <div className="bg-gb-light rounded-lg p-3">
                    <h4 className="text-sm font-medium text-gb-gray mb-2">Columna de Valor:</h4>
                    <div className="flex flex-wrap gap-1">
                      {["Valor", "Value", "Precio", "Price", "Close", "NAV", "P", "V"].map(name => (
                        <span key={name} className="px-2 py-0.5 bg-gb-border/40 rounded text-xs">{name}</span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Date formats */}
              <div>
                <h3 className="font-medium text-gb-black mb-3">Formatos de Fecha Aceptados</h3>
                <ul className="space-y-2 text-sm text-gb-gray">
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-gb-success" />
                    <span><code className="bg-gb-light px-1 rounded">2024-01-15</code> (ISO)</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-gb-success" />
                    <span><code className="bg-gb-light px-1 rounded">15/01/2024</code> (DD/MM/YYYY)</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-gb-success" />
                    <span><code className="bg-gb-light px-1 rounded">01/15/2024</code> (MM/DD/YYYY)</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-gb-success" />
                    <span>Formato de fecha nativo de Excel</span>
                  </li>
                </ul>
              </div>

              {/* Tips */}
              <div className="bg-gb-warning/10 border border-gb-warning/30 rounded-lg p-4">
                <h3 className="font-medium text-gb-black mb-2">Recomendaciones</h3>
                <ul className="space-y-1 text-sm text-gb-warning">
                  <li>• Usa datos mensuales o semanales (no diarios) para mejor rendimiento</li>
                  <li>• Incluye al menos 12 meses de datos para cálculos precisos</li>
                  <li>• Los valores deben ser el NAV o precio de cierre del fondo</li>
                  <li>• Ordena los datos del más antiguo al más reciente</li>
                </ul>
              </div>

              {/* File types */}
              <div className="text-sm text-gb-gray">
                <span className="font-medium">Formatos soportados:</span> .xlsx, .xls, .csv
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* EXCEL UPLOAD MODAL */}
      {/* ============================================================ */}
      {showExcelModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full">
            <div className="border-b border-gb-border px-6 py-4 flex items-center justify-between">
              <h2 className="text-lg font-bold flex items-center gap-2 text-gb-black">
                <FileSpreadsheet className="w-5 h-5 text-gb-info" />
                Cargar Datos del Fondo
              </h2>
              <button
                onClick={() => setShowExcelModal(false)}
                className="text-gb-gray hover:text-gb-black"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {/* File upload - Required */}
              <div>
                <label className="block text-sm font-medium text-gb-gray mb-2">
                  Archivo Excel con Valores Cuota <span className="text-gb-danger">*</span>
                </label>
                <div
                  onClick={() => modalFileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
                    excelModalData.file
                      ? "border-gb-success/40 bg-gb-success/10"
                      : "border-gb-border hover:border-gb-info hover:bg-gb-light"
                  }`}
                >
                  <input
                    type="file"
                    ref={modalFileInputRef}
                    onChange={handleModalFileSelect}
                    accept=".xlsx,.xls,.csv"
                    className="hidden"
                  />
                  {excelModalData.file ? (
                    <div className="flex items-center justify-center gap-2 text-gb-success">
                      <Check className="w-5 h-5" />
                      <span className="font-medium">{excelModalData.file.name}</span>
                    </div>
                  ) : (
                    <div className="text-gb-gray">
                      <Upload className="w-8 h-8 mx-auto mb-2 text-gb-gray" />
                      <p>Click para seleccionar archivo</p>
                      <p className="text-xs text-gb-gray mt-1">.xlsx, .xls, .csv</p>
                    </div>
                  )}
                </div>
                <button
                  onClick={() => setShowExcelHelp(true)}
                  className="text-xs text-gb-info hover:text-gb-primary mt-2 flex items-center gap-1"
                >
                  <HelpCircle className="w-3 h-3" />
                  Ver formato requerido
                </button>
              </div>

              {/* Divider */}
              <div className="border-t border-gb-border pt-4">
                <p className="text-sm text-gb-gray mb-3">Datos adicionales (opcional)</p>
              </div>

              {/* TER */}
              <div>
                <label className="block text-sm font-medium text-gb-gray mb-1">
                  TER (%)
                </label>
                <input
                  type="number"
                  step="0.001"
                  value={excelModalData.ter}
                  onChange={(e) => setExcelModalData(prev => ({ ...prev, ter: e.target.value }))}
                  placeholder="Ej: 0.85"
                  className="w-full border border-gb-border rounded-lg px-3 py-2 text-sm focus:border-gb-info focus:ring-1 focus:ring-gb-info outline-none"
                />
              </div>

              {/* ISIN */}
              <div>
                <label className="block text-sm font-medium text-gb-gray mb-1">
                  ISIN
                </label>
                <input
                  type="text"
                  value={excelModalData.isin}
                  onChange={(e) => setExcelModalData(prev => ({ ...prev, isin: e.target.value.toUpperCase() }))}
                  placeholder="Ej: LU0323578657"
                  className="w-full border border-gb-border rounded-lg px-3 py-2 text-sm focus:border-gb-info focus:ring-1 focus:ring-gb-info outline-none uppercase"
                />
              </div>

              {/* Nombre del fondo */}
              <div>
                <label className="block text-sm font-medium text-gb-gray mb-1">
                  Nombre del Fondo
                </label>
                <input
                  type="text"
                  value={excelModalData.nombre}
                  onChange={(e) => setExcelModalData(prev => ({ ...prev, nombre: e.target.value }))}
                  placeholder="Ej: Robeco Global Premium Equities"
                  className="w-full border border-gb-border rounded-lg px-3 py-2 text-sm focus:border-gb-info focus:ring-1 focus:ring-gb-info outline-none"
                />
              </div>

              {/* Moneda */}
              <div>
                <label className="block text-sm font-medium text-gb-gray mb-1">
                  Moneda
                </label>
                <select
                  value={excelModalData.moneda}
                  onChange={(e) => setExcelModalData(prev => ({ ...prev, moneda: e.target.value }))}
                  className="w-full border border-gb-border rounded-lg px-3 py-2 text-sm focus:border-gb-info focus:ring-1 focus:ring-gb-info outline-none"
                >
                  <option value="USD">USD - Dólar estadounidense</option>
                  <option value="EUR">EUR - Euro</option>
                  <option value="CLP">CLP - Peso chileno</option>
                  <option value="UF">UF - Unidad de Fomento</option>
                </select>
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-4 border-t border-gb-border">
                <button
                  onClick={() => setShowExcelModal(false)}
                  className="px-4 py-2 text-gb-gray hover:text-gb-black"
                >
                  Cancelar
                </button>
                <Button onClick={processExcelFromModal} disabled={!excelModalData.file}>
                  <Upload className="w-4 h-4" />
                  Cargar Datos
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* AI CARTERA MODAL */}
      {/* ============================================================ */}
      {showCarteraIA && client && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full">
            <div className="border-b border-gb-border px-6 py-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gb-black">Generar Cartera con IA</h2>
              <button
                onClick={() => setShowCarteraIA(false)}
                className="text-gb-gray hover:text-gb-black"
              >
                ✕
              </button>
            </div>
            <div className="p-6">
              <p className="text-sm text-gb-gray mb-4">
                La IA analizará el perfil de riesgo del cliente y generará una cartera de inversión optimizada.
              </p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowCarteraIA(false)}
                  className="px-4 py-2 text-gb-gray hover:text-gb-black"
                >
                  Cancelar
                </button>
                <GenerarCarteraButton
                  clientId={client.id}
                  montoInversion={totalInvestment}
                  onCarteraGenerada={(data: { recomendacion?: { cartera?: CarteraPosition[]; generadoEn?: string }; cartera?: CarteraPosition[]; generadoEn?: string }) => {
                    // La cartera viene en data.recomendacion.cartera
                    const posiciones = data.recomendacion?.cartera || data.cartera || [];
                    setCarteraLoadedFromDB(false); // New cartera, not saved yet
                    if (posiciones.length > 0) {
                      applyCartera(posiciones);
                      // Save cartera to database automatically
                      saveCartera(posiciones, data.recomendacion || data);
                    } else {
                      console.error("No se encontraron posiciones en la respuesta:", data);
                    }
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
