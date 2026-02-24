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
import { getBenchmarkFromScore, type AssetAllocation } from "@/lib/risk/benchmarks";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, Legend,
  LineChart, Line, CartesianGrid, Area, AreaChart,
} from "recharts";
import {
  ChevronDown,
  ChevronUp,
  DollarSign,
  TrendingUp,
  Search,
  FileDown,
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
  Pencil,
  Check,
  Save,
  Upload,
  FileSpreadsheet,
  HelpCircle,
  X,
  Download,
} from "lucide-react";
import { GenerarCarteraButton } from "@/components/comite/CarteraRecomendada";
import { findYahooSymbol } from "@/lib/yahoo-finance-mapping";
import * as XLSX from "xlsx";

// ============================================================
// INTERFACES
// ============================================================

interface Client {
  id: string;
  nombre: string;
  apellido: string;
  email: string;
  rut?: string;
  portfolio_data?: {
    composition?: {
      holdings?: any[];
      totalValue?: number;
      byAssetClass?: Record<string, { value: number; percent: number }>;
    };
    statement?: {
      holdings?: any[];
    };
  };
  cartera_recomendada?: {
    cartera?: Array<{
      ticker: string;
      nombre: string;
      clase: string;
      porcentaje: number;
    }>;
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

interface CurrentHolding {
  securityId: string;
  fundName: string;
  assetClass: string;
  marketValue: number;
  costBasis: number;
  unrealizedGainLoss: number;
  percentOfPortfolio: number;
  yahooData?: any;
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
  const [benchmark, setBenchmark] = useState<AssetAllocation | null>(null);

  // Proposed portfolio (from AI)
  const [proposedPositions, setProposedPositions] = useState<ProposedPosition[]>([]);
  const [loadingProposed, setLoadingProposed] = useState(false);

  // Current holdings (from cartola)
  const [currentHoldings, setCurrentHoldings] = useState<CurrentHolding[]>([]);

  // Comparison data
  const [historicalData, setHistoricalData] = useState<HistoricalPoint[]>([]);
  const [loadingHistorical, setLoadingHistorical] = useState(false);

  // AI Cartera modal
  const [showCarteraIA, setShowCarteraIA] = useState(false);
  const [carteraIA, setCarteraIA] = useState<any>(null);
  const [carteraLoadedFromDB, setCarteraLoadedFromDB] = useState(false);
  const [savingCartera, setSavingCartera] = useState(false);

  // Currency
  const [exchangeRates, setExchangeRates] = useState({ usd: 980, uf: 38500 });

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

  // Fetch exchange rates
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
      }
    };
    fetchRates();
  }, []);

  // Auto-search on load
  useEffect(() => {
    if (clientEmail.trim()) {
      searchClient();
    }
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
        setBenchmark(getBenchmarkFromScore(45, true, "global"));
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
        setBenchmark(getBenchmarkFromScore(profileData.global_score, true, "global"));
      } else {
        setRiskProfile(null);
        setBenchmark(getBenchmarkFromScore(45, true, "global"));
      }

      // Extract current holdings from portfolio_data
      const holdings = clientData.portfolio_data?.composition?.holdings ||
                       clientData.portfolio_data?.statement?.holdings || [];

      const totalValue = clientData.portfolio_data?.composition?.totalValue || 0;
      setTotalInvestment(totalValue);

      const mappedHoldings: CurrentHolding[] = holdings.map((h: any) => ({
        securityId: h.securityId || h.ticker || "N/A",
        fundName: h.fundName || h.name || "Fondo",
        assetClass: h.assetClass || "Unknown",
        marketValue: h.marketValue || 0,
        costBasis: h.costBasis || 0,
        unrealizedGainLoss: h.unrealizedGainLoss || 0,
        percentOfPortfolio: h.percentOfPortfolio || ((h.marketValue / totalValue) * 100) || 0,
      }));

      setCurrentHoldings(mappedHoldings);

      // Load saved recommended portfolio if exists
      if (clientData.cartera_recomendada?.cartera && clientData.cartera_recomendada.cartera.length > 0) {
        console.log("Loading saved cartera:", clientData.cartera_recomendada.cartera);
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

  const saveCartera = async (cartera?: any[], fullData?: any) => {
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
        console.log("Cartera saved successfully");
        setCarteraLoadedFromDB(true);
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
        const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];

        // Find date and value columns
        const headers = jsonData[0]?.map((h: any) => String(h).toLowerCase()) || [];
        let dateCol = headers.findIndex((h: string) =>
          h.includes("fecha") || h.includes("date") || h === "f" || h === "d"
        );
        let valueCol = headers.findIndex((h: string) =>
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
          console.log(`Loaded ${historicalData.length} data points with TER: ${terValue}, ISIN: ${excelModalData.isin}`);
          setShowExcelModal(false);
        } else {
          alert("No se encontraron datos válidos en el archivo.");
        }
      } catch (error) {
        console.error("Error parsing Excel:", error);
        alert("Error al leer el archivo Excel");
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
        const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];

        // Find date and value columns
        const headers = jsonData[0]?.map((h: any) => String(h).toLowerCase()) || [];
        let dateCol = headers.findIndex((h: string) =>
          h.includes("fecha") || h.includes("date") || h === "f" || h === "d"
        );
        let valueCol = headers.findIndex((h: string) =>
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
          console.log(`Loaded ${historicalData.length} data points for ${uploadingForPortfolio} position ${uploadingForIndex}`);
        } else {
          alert("No se encontraron datos válidos en el archivo. Asegúrese de tener columnas de fecha y precio.");
        }
      } catch (error) {
        console.error("Error parsing Excel:", error);
        alert("Error al leer el archivo Excel");
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

  const applyCartera = async (cartera: any[]) => {
    setLoadingProposed(true);

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
            console.log(`✓ ${pos.ticker} via ${profile.source}`);

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
    } finally {
      setLoadingProposed(false);
    }
  };

  // ============================================================
  // HISTORICAL COMPARISON
  // ============================================================

  const fetchHistoricalComparison = async () => {
    setLoadingHistorical(true);

    try {
      // Fetch benchmark proxy data for positions that need it
      const positionsWithProxyData: { pos: ProposedPosition; historicalData: any[] }[] = [];

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
        historicalData.forEach((d: any) => allDates.add(d.date));
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
            (a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime()
          );
          const baseValue = sortedHistory[0]?.close || 1;
          const normalized = new Map<string, number>();
          sortedHistory.forEach((d: any) => {
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
          proposedData.historicalData.forEach((d: any) => {
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
        let historicalData: any[] | null = null;

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
            (a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime()
          );
          const baseValue = sorted[0]?.close || 1;
          sorted.forEach((d: any) => {
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

  // Group proposed positions by asset class
  const proposedByClass = {
    rv: proposedPositions.filter((p) => p.clase === "Renta Variable"),
    rf: proposedPositions.filter((p) => p.clase === "Renta Fija"),
    alt: proposedPositions.filter((p) => p.clase === "Commodities" || p.clase === "Alternativos"),
  };

  // Group current holdings by asset class
  const currentByClass = {
    rv: currentHoldings.filter((h) => h.assetClass === "Equity"),
    rf: currentHoldings.filter((h) => h.assetClass === "Fixed Income"),
    alt: currentHoldings.filter((h) => h.assetClass !== "Equity" && h.assetClass !== "Fixed Income" && h.assetClass !== "Cash"),
    cash: currentHoldings.filter((h) => h.assetClass === "Cash"),
  };

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

  const current1YReturn = currentHoldings.reduce((sum, h) => {
    const ret = h.manualReturn1Y ?? h.yahooData?.return_1y ?? 0;
    return sum + (ret * h.percentOfPortfolio / 100);
  }, 0);

  // ============================================================
  // FORMATTERS
  // ============================================================

  const fmt = (n: number) => n.toLocaleString("es-CL", { maximumFractionDigits: 0 });
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

      {/* ============================================================ */}
      {/* CLIENT SEARCH */}
      {/* ============================================================ */}
      <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Email del Cliente
        </label>
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="email"
              value={clientEmail}
              onChange={(e) => { setClientEmail(e.target.value); setClientNotFound(false); }}
              onKeyDown={(e) => e.key === "Enter" && searchClient()}
              placeholder="cliente@email.com"
              className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
            />
          </div>
          <button
            onClick={searchClient}
            disabled={searchingClient || !clientEmail.trim()}
            className="px-5 py-2.5 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {searchingClient ? <Loader className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            {searchingClient ? "Buscando..." : "Buscar"}
          </button>
        </div>

        {clientNotFound && (
          <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-2 text-amber-800 text-sm">
            <AlertTriangle className="w-4 h-4" />
            Cliente no encontrado
          </div>
        )}

        {client && (
          <div className="mt-4 p-4 bg-gray-50 border border-gray-200 rounded-lg">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-white border border-gray-200 rounded-full flex items-center justify-center">
                <User className="w-6 h-6 text-gray-400" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900">
                  {client.nombre} {client.apellido}
                </h3>
                <p className="text-sm text-gray-500">{client.email}</p>
              </div>
              {riskProfile && (
                <div className="text-right">
                  <div className="text-sm text-gray-500">Perfil de Riesgo</div>
                  <div className="font-semibold text-gray-900">{riskProfile.profile_label}</div>
                  <div className="text-xs text-gray-400">Score: {riskProfile.global_score}</div>
                </div>
              )}
              {totalInvestment > 0 && (
                <div className="text-right border-l border-gray-200 pl-4">
                  <div className="text-sm text-gray-500">Inversión Total</div>
                  <div className="font-semibold text-gray-900">{fmtUSD(totalInvestment)}</div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ============================================================ */}
      {/* GENERATE AI PORTFOLIO BUTTON */}
      {/* ============================================================ */}
      {client && (
        <div className="flex justify-center">
          <button
            onClick={() => setShowCarteraIA(true)}
            className="px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white font-medium rounded-lg hover:from-purple-700 hover:to-blue-700 transition-all shadow-lg hover:shadow-xl flex items-center gap-2"
          >
            <Sparkles className="w-5 h-5" />
            Generar Cartera con IA
          </button>
        </div>
      )}

      {/* ============================================================ */}
      {/* PROPOSED PORTFOLIO (TOP - MAIN FOCUS) */}
      {/* ============================================================ */}
      {proposedPositions.length > 0 && (
        <div className="bg-white border-2 border-green-200 rounded-xl shadow-sm overflow-hidden">
          <div
            className="w-full px-6 py-4 bg-gradient-to-r from-green-50 to-emerald-50 flex items-center justify-between hover:from-green-100 hover:to-emerald-100 transition-colors cursor-pointer"
          >
            <div
              className="flex items-center gap-3 flex-1"
              onClick={() => setProposedExpanded(!proposedExpanded)}
            >
              <div className="w-10 h-10 bg-green-500 rounded-lg flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-white" />
              </div>
              <div className="text-left">
                <h2 className="text-lg font-bold text-gray-900">Portafolio Recomendado</h2>
                <p className="text-sm text-gray-500">
                  {proposedPositions.length} posiciones
                  {carteraLoadedFromDB && <span className="ml-2 text-green-600">(guardado)</span>}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => saveCartera()}
                disabled={savingCartera}
                className="px-3 py-1.5 text-sm font-medium text-green-700 bg-green-100 hover:bg-green-200 rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-50"
              >
                {savingCartera ? (
                  <Loader className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                Guardar
              </button>
              <button onClick={() => setProposedExpanded(!proposedExpanded)} className="p-1 hover:bg-green-100 rounded">
                {proposedExpanded ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
              </button>
            </div>
          </div>

          {proposedExpanded && (
            <div className="p-6">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-3 px-2 text-gray-500 font-medium">Ticker</th>
                      <th className="text-left py-3 px-2 text-gray-500 font-medium">Nombre</th>
                      <th className="text-left py-3 px-2 text-gray-500 font-medium">Clase</th>
                      <th className="text-right py-3 px-2 text-gray-500 font-medium">%</th>
                      <th className="text-right py-3 px-2 text-gray-500 font-medium">TER</th>
                      <th className="text-right py-3 px-2 text-gray-500 font-medium">1Y</th>
                      <th className="text-center py-3 px-2 text-gray-500 font-medium min-w-[120px]">
                        <div className="flex items-center justify-center gap-1">
                          <span>Datos</span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowExcelHelp(true);
                            }}
                            className="p-0.5 hover:bg-gray-100 rounded"
                            title="Ayuda formato Excel"
                          >
                            <HelpCircle className="w-3.5 h-3.5 text-gray-400 hover:text-blue-500" />
                          </button>
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {proposedPositions.map((pos, idx) => {
                      const hasHistoricalData = pos.fundData?.historicalData && pos.fundData.historicalData.length > 0;
                      const hasAutoData = pos.fundData && (pos.fundData.total_expense_ratio != null || pos.fundData.return_1y != null);
                      const ter = pos.manualTER ?? pos.fundData?.total_expense_ratio ?? null;
                      const ret1y = pos.manualReturn1Y ?? pos.fundData?.return_1y ?? null;

                      return (
                        <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="py-3 px-2">
                            <span className="font-mono font-medium text-gray-900">{pos.ticker}</span>
                          </td>
                          <td className="py-3 px-2">
                            <div className="text-gray-900">{pos.nombre}</div>
                          </td>
                          <td className="py-3 px-2">
                            <span className={`text-xs px-2 py-1 rounded-full ${
                              pos.clase === "Renta Variable" ? "bg-blue-100 text-blue-700" :
                              pos.clase === "Renta Fija" ? "bg-emerald-100 text-emerald-700" :
                              "bg-amber-100 text-amber-700"
                            }`}>
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
                              className="w-16 text-right font-medium bg-transparent border-b border-transparent hover:border-gray-300 focus:border-blue-500 focus:outline-none py-1"
                            />
                            <span className="text-gray-400">%</span>
                          </td>
                          <td className="py-3 px-2 text-right">
                            {pos.loading ? (
                              <Loader className="w-4 h-4 animate-spin text-gray-400 ml-auto" />
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
                                  className="w-14 text-right bg-transparent border-b border-transparent hover:border-gray-300 focus:border-blue-500 focus:outline-none py-1"
                                />
                                <span className="text-gray-400 text-xs">%</span>
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-2 text-right">
                            {pos.loading ? (
                              <Loader className="w-4 h-4 animate-spin text-gray-400 ml-auto" />
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
                                  className={`w-16 text-right bg-transparent border-b border-transparent hover:border-gray-300 focus:border-blue-500 focus:outline-none py-1 ${
                                    ret1y != null ? (ret1y >= 0 ? "text-green-600" : "text-red-600") : ""
                                  }`}
                                />
                                <span className="text-gray-400 text-xs">%</span>
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-2 text-center">
                            {pos.loading ? (
                              <Loader className="w-4 h-4 animate-spin text-gray-300 mx-auto" />
                            ) : hasHistoricalData || pos.manualHistoricalData ? (
                              <div className="flex items-center justify-center gap-1">
                                <Check className="w-4 h-4 text-green-500" />
                                <span className="text-xs text-green-600">
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
                                  className="text-xs border border-gray-200 rounded px-1.5 py-0.5 bg-amber-50 text-amber-700 focus:outline-none focus:border-amber-400 w-16 uppercase"
                                />
                                <datalist id={`proxy-list-proposed-${idx}`}>
                                  {BENCHMARK_PROXIES.filter(b => b.clase === pos.clase || pos.clase === "Commodities" || pos.clase === "Alternativos").map(b => (
                                    <option key={b.symbol} value={b.symbol}>{b.name}</option>
                                  ))}
                                </datalist>
                                <button
                                  onClick={() => openExcelModal(idx, "proposed")}
                                  className="p-1 hover:bg-blue-100 rounded transition-colors"
                                  title="Cargar datos desde Excel"
                                >
                                  <FileSpreadsheet className="w-4 h-4 text-blue-600" />
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

              {/* Summary Stats */}
              <div className="mt-6 pt-6 border-t border-gray-200 grid grid-cols-3 gap-4">
                <div className="text-center p-4 bg-green-50 rounded-lg">
                  <div className="text-sm text-gray-500 mb-1">TER Promedio Ponderado</div>
                  <div className="text-2xl font-bold text-green-600">{proposedTER.toFixed(3)}%</div>
                  {terDataCoverage < 1 && terDataCoverage > 0 && (
                    <div className="text-xs text-amber-600 mt-1">
                      Basado en {Math.round(terDataCoverage * 100)}% del portafolio
                    </div>
                  )}
                  {terDataCoverage === 0 && proposedPositions.length > 0 && (
                    <div className="text-xs text-amber-600 mt-1">
                      Sin datos TER - ingrese valores manualmente
                    </div>
                  )}
                </div>
                <div className="text-center p-4 bg-blue-50 rounded-lg">
                  <div className="text-sm text-gray-500 mb-1">Retorno 1Y Esperado</div>
                  <div className={`text-2xl font-bold ${proposed1YReturn >= 0 ? "text-blue-600" : "text-red-600"}`}>
                    {fmtPct(proposed1YReturn)}
                  </div>
                </div>
                <div className="text-center p-4 bg-purple-50 rounded-lg">
                  <div className="text-sm text-gray-500 mb-1">Posiciones</div>
                  <div className="text-2xl font-bold text-purple-600">{proposedPositions.length}</div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ============================================================ */}
      {/* CURRENT PORTFOLIO (MIDDLE - REFERENCE) */}
      {/* ============================================================ */}
      {currentHoldings.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <button
            onClick={() => setCurrentExpanded(!currentExpanded)}
            className="w-full px-6 py-4 bg-gray-50 flex items-center justify-between hover:bg-gray-100 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gray-400 rounded-lg flex items-center justify-center">
                <Wallet className="w-5 h-5 text-white" />
              </div>
              <div className="text-left">
                <h2 className="text-lg font-bold text-gray-900">Portafolio Actual</h2>
                <p className="text-sm text-gray-500">{currentHoldings.length} posiciones - Referencia</p>
              </div>
            </div>
            {currentExpanded ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
          </button>

          {currentExpanded && (
            <div className="p-6">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-3 px-2 text-gray-500 font-medium">Fondo</th>
                      <th className="text-left py-3 px-2 text-gray-500 font-medium">Clase</th>
                      <th className="text-right py-3 px-2 text-gray-500 font-medium">%</th>
                      <th className="text-right py-3 px-2 text-gray-500 font-medium">TER</th>
                      <th className="text-right py-3 px-2 text-gray-500 font-medium">1Y</th>
                      <th className="text-center py-3 px-2 text-gray-500 font-medium min-w-[120px]">
                        <div className="flex items-center justify-center gap-1">
                          <span>Datos</span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowExcelHelp(true);
                            }}
                            className="p-0.5 hover:bg-gray-100 rounded"
                            title="Ayuda formato Excel"
                          >
                            <HelpCircle className="w-3.5 h-3.5 text-gray-400 hover:text-blue-500" />
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
                        <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="py-3 px-2">
                            <div className="font-medium text-gray-900 text-xs leading-tight">{holding.fundName}</div>
                            <div className="text-xs text-gray-400">{holding.securityId}</div>
                          </td>
                          <td className="py-3 px-2">
                            <span className={`text-xs px-2 py-1 rounded-full ${
                              holding.assetClass === "Equity" ? "bg-blue-100 text-blue-700" :
                              holding.assetClass === "Fixed Income" ? "bg-emerald-100 text-emerald-700" :
                              "bg-gray-100 text-gray-700"
                            }`}>
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
                              className="w-16 text-right font-medium bg-transparent border-b border-transparent hover:border-gray-300 focus:border-blue-500 focus:outline-none py-1"
                            />
                            <span className="text-gray-400">%</span>
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
                                className="w-14 text-right bg-transparent border-b border-transparent hover:border-gray-300 focus:border-blue-500 focus:outline-none py-1"
                              />
                              <span className="text-gray-400 text-xs">%</span>
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
                                className={`w-16 text-right bg-transparent border-b border-transparent hover:border-gray-300 focus:border-blue-500 focus:outline-none py-1 ${
                                  ret1y != null ? (ret1y >= 0 ? "text-green-600" : "text-red-600") : ""
                                }`}
                              />
                              <span className="text-gray-400 text-xs">%</span>
                            </div>
                          </td>
                          <td className="py-3 px-2 text-center">
                            {hasHistoricalData ? (
                              <div className="flex items-center justify-center gap-1">
                                <Check className="w-4 h-4 text-green-500" />
                                <span className="text-xs text-green-600">Excel</span>
                              </div>
                            ) : hasYahooData ? (
                              <div className="flex items-center justify-center gap-1">
                                <Check className="w-4 h-4 text-green-500" />
                                <span className="text-xs text-green-600">API</span>
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
                                  className="text-xs border border-gray-200 rounded px-1.5 py-0.5 bg-amber-50 text-amber-700 focus:outline-none focus:border-amber-400 w-16 uppercase"
                                />
                                <datalist id={`proxy-list-current-${idx}`}>
                                  {BENCHMARK_PROXIES.map(b => (
                                    <option key={b.symbol} value={b.symbol}>{b.name}</option>
                                  ))}
                                </datalist>
                                <button
                                  onClick={() => openExcelModal(idx, "current")}
                                  className="p-1 hover:bg-blue-100 rounded transition-colors"
                                  title="Cargar datos desde Excel"
                                >
                                  <FileSpreadsheet className="w-4 h-4 text-blue-600" />
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
              <div className="mt-4 pt-4 border-t border-gray-200 flex justify-between text-sm">
                <div>
                  <span className="text-gray-500">TER Estimado (fondos mutuos): </span>
                  <span className="font-medium text-red-600">{effectiveCurrentTER.toFixed(3)}%</span>
                </div>
                <div>
                  <span className="text-gray-500">Total: </span>
                  <span className="font-bold">{fmtUSD(totalInvestment)}</span>
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
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <button
            onClick={() => setComparisonExpanded(!comparisonExpanded)}
            className="w-full px-6 py-4 bg-gradient-to-r from-blue-50 to-purple-50 flex items-center justify-between hover:from-blue-100 hover:to-purple-100 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-500 rounded-lg flex items-center justify-center">
                <PieChart className="w-5 h-5 text-white" />
              </div>
              <div className="text-left">
                <h2 className="text-lg font-bold text-gray-900">Comparación Final</h2>
                <p className="text-sm text-gray-500">Costos y Rentabilidad</p>
              </div>
            </div>
            {comparisonExpanded ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
          </button>

          {comparisonExpanded && (
            <div className="p-6 space-y-6">
              {/* Cost Comparison */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-5 bg-red-50 rounded-xl border border-red-100">
                  <div className="flex items-center gap-2 mb-2">
                    <ArrowDownRight className="w-5 h-5 text-red-500" />
                    <span className="text-sm font-medium text-red-700">Costo Actual</span>
                  </div>
                  <div className="text-3xl font-bold text-red-600">{effectiveCurrentTER.toFixed(3)}%</div>
                  <div className="text-sm text-red-500 mt-1">
                    {fmtUSD(totalInvestment * effectiveCurrentTER / 100)} / año
                  </div>
                </div>

                <div className="p-5 bg-green-50 rounded-xl border border-green-100">
                  <div className="flex items-center gap-2 mb-2">
                    <ArrowUpRight className="w-5 h-5 text-green-500" />
                    <span className="text-sm font-medium text-green-700">Costo Propuesto</span>
                  </div>
                  <div className="text-3xl font-bold text-green-600">{proposedTER.toFixed(3)}%</div>
                  <div className="text-sm text-green-500 mt-1">
                    {fmtUSD(totalInvestment * proposedTER / 100)} / año
                  </div>
                </div>

                <div className="p-5 bg-gradient-to-br from-emerald-50 to-green-50 rounded-xl border border-green-200">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle className="w-5 h-5 text-emerald-500" />
                    <span className="text-sm font-medium text-emerald-700">Ahorro Anual</span>
                  </div>
                  <div className="text-3xl font-bold text-emerald-600">{costSavings.toFixed(3)}%</div>
                  <div className="text-sm text-emerald-500 mt-1">
                    {fmtUSD(totalInvestment * costSavings / 100)} / año
                  </div>
                </div>
              </div>

              {/* Historical Chart */}
              <div className="mt-8">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-gray-900">Evolución Histórica (Base 100)</h3>
                  <button
                    onClick={fetchHistoricalComparison}
                    disabled={loadingHistorical}
                    className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
                  >
                    <RefreshCw className={`w-4 h-4 ${loadingHistorical ? "animate-spin" : ""}`} />
                    Actualizar
                  </button>
                </div>

                {loadingHistorical ? (
                  <div className="h-64 flex items-center justify-center">
                    <Loader className="w-8 h-8 animate-spin text-gray-400" />
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
                  <div className="h-64 flex items-center justify-center text-gray-400">
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
      {/* EXCEL HELP MODAL (z-[60] to appear above upload modal) */}
      {/* ============================================================ */}
      {showExcelHelp && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="border-b border-gray-200 px-6 py-4 flex items-center justify-between sticky top-0 bg-white">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-blue-600" />
                Formato de Excel para Datos Históricos
              </h2>
              <button
                onClick={() => setShowExcelHelp(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-6">
              {/* Download template button */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium text-blue-900">Descargar Template</h3>
                    <p className="text-sm text-blue-700">Archivo Excel de ejemplo con el formato correcto</p>
                  </div>
                  <button
                    onClick={downloadExcelTemplate}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
                  >
                    <Download className="w-4 h-4" />
                    Descargar
                  </button>
                </div>
              </div>

              {/* Format explanation */}
              <div>
                <h3 className="font-medium text-gray-900 mb-3">Estructura del Archivo</h3>
                <div className="bg-gray-50 rounded-lg p-4 font-mono text-sm">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-300">
                        <th className="text-left py-2 px-3 bg-gray-200">Fecha</th>
                        <th className="text-right py-2 px-3 bg-gray-200">Valor</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-gray-200">
                        <td className="py-2 px-3">2024-01-15</td>
                        <td className="text-right py-2 px-3">1000.00</td>
                      </tr>
                      <tr className="border-b border-gray-200">
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
                <h3 className="font-medium text-gray-900 mb-3">Nombres de Columnas Aceptados</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-gray-50 rounded-lg p-3">
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Columna de Fecha:</h4>
                    <div className="flex flex-wrap gap-1">
                      {["Fecha", "Date", "F", "D"].map(name => (
                        <span key={name} className="px-2 py-0.5 bg-gray-200 rounded text-xs">{name}</span>
                      ))}
                    </div>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Columna de Valor:</h4>
                    <div className="flex flex-wrap gap-1">
                      {["Valor", "Value", "Precio", "Price", "Close", "NAV", "P", "V"].map(name => (
                        <span key={name} className="px-2 py-0.5 bg-gray-200 rounded text-xs">{name}</span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Date formats */}
              <div>
                <h3 className="font-medium text-gray-900 mb-3">Formatos de Fecha Aceptados</h3>
                <ul className="space-y-2 text-sm text-gray-600">
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-green-500" />
                    <span><code className="bg-gray-100 px-1 rounded">2024-01-15</code> (ISO)</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-green-500" />
                    <span><code className="bg-gray-100 px-1 rounded">15/01/2024</code> (DD/MM/YYYY)</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-green-500" />
                    <span><code className="bg-gray-100 px-1 rounded">01/15/2024</code> (MM/DD/YYYY)</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-green-500" />
                    <span>Formato de fecha nativo de Excel</span>
                  </li>
                </ul>
              </div>

              {/* Tips */}
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <h3 className="font-medium text-amber-900 mb-2">Recomendaciones</h3>
                <ul className="space-y-1 text-sm text-amber-800">
                  <li>• Usa datos mensuales o semanales (no diarios) para mejor rendimiento</li>
                  <li>• Incluye al menos 12 meses de datos para cálculos precisos</li>
                  <li>• Los valores deben ser el NAV o precio de cierre del fondo</li>
                  <li>• Ordena los datos del más antiguo al más reciente</li>
                </ul>
              </div>

              {/* File types */}
              <div className="text-sm text-gray-500">
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
            <div className="border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-blue-600" />
                Cargar Datos del Fondo
              </h2>
              <button
                onClick={() => setShowExcelModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {/* File upload - Required */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Archivo Excel con Valores Cuota <span className="text-red-500">*</span>
                </label>
                <div
                  onClick={() => modalFileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
                    excelModalData.file
                      ? "border-green-300 bg-green-50"
                      : "border-gray-300 hover:border-blue-400 hover:bg-blue-50"
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
                    <div className="flex items-center justify-center gap-2 text-green-700">
                      <Check className="w-5 h-5" />
                      <span className="font-medium">{excelModalData.file.name}</span>
                    </div>
                  ) : (
                    <div className="text-gray-500">
                      <Upload className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                      <p>Click para seleccionar archivo</p>
                      <p className="text-xs text-gray-400 mt-1">.xlsx, .xls, .csv</p>
                    </div>
                  )}
                </div>
                <button
                  onClick={() => setShowExcelHelp(true)}
                  className="text-xs text-blue-600 hover:text-blue-700 mt-2 flex items-center gap-1"
                >
                  <HelpCircle className="w-3 h-3" />
                  Ver formato requerido
                </button>
              </div>

              {/* Divider */}
              <div className="border-t border-gray-200 pt-4">
                <p className="text-sm text-gray-500 mb-3">Datos adicionales (opcional)</p>
              </div>

              {/* TER */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  TER (%)
                </label>
                <input
                  type="number"
                  step="0.001"
                  value={excelModalData.ter}
                  onChange={(e) => setExcelModalData(prev => ({ ...prev, ter: e.target.value }))}
                  placeholder="Ej: 0.85"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                />
              </div>

              {/* ISIN */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  ISIN
                </label>
                <input
                  type="text"
                  value={excelModalData.isin}
                  onChange={(e) => setExcelModalData(prev => ({ ...prev, isin: e.target.value.toUpperCase() }))}
                  placeholder="Ej: LU0323578657"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none uppercase"
                />
              </div>

              {/* Nombre del fondo */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nombre del Fondo
                </label>
                <input
                  type="text"
                  value={excelModalData.nombre}
                  onChange={(e) => setExcelModalData(prev => ({ ...prev, nombre: e.target.value }))}
                  placeholder="Ej: Robeco Global Premium Equities"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                />
              </div>

              {/* Moneda */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Moneda
                </label>
                <select
                  value={excelModalData.moneda}
                  onChange={(e) => setExcelModalData(prev => ({ ...prev, moneda: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                >
                  <option value="USD">USD - Dólar estadounidense</option>
                  <option value="EUR">EUR - Euro</option>
                  <option value="CLP">CLP - Peso chileno</option>
                  <option value="UF">UF - Unidad de Fomento</option>
                </select>
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                <button
                  onClick={() => setShowExcelModal(false)}
                  className="px-4 py-2 text-gray-600 hover:text-gray-800"
                >
                  Cancelar
                </button>
                <button
                  onClick={processExcelFromModal}
                  disabled={!excelModalData.file}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  <Upload className="w-4 h-4" />
                  Cargar Datos
                </button>
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
            <div className="border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <h2 className="text-lg font-bold">Generar Cartera con IA</h2>
              <button
                onClick={() => setShowCarteraIA(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>
            <div className="p-6">
              <p className="text-sm text-gray-600 mb-4">
                La IA analizará el perfil de riesgo del cliente y generará una cartera de inversión optimizada.
              </p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowCarteraIA(false)}
                  className="px-4 py-2 text-gray-600 hover:text-gray-800"
                >
                  Cancelar
                </button>
                <GenerarCarteraButton
                  clientId={client.id}
                  montoInversion={totalInvestment}
                  onCarteraGenerada={(data: { recomendacion?: { cartera?: any[] }; cartera?: any[] }) => {
                    // La cartera viene en data.recomendacion.cartera
                    const posiciones = data.recomendacion?.cartera || data.cartera || [];
                    console.log("Cartera generada:", posiciones);
                    setCarteraIA(data);
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
