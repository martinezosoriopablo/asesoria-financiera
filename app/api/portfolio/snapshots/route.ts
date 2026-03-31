// app/api/portfolio/snapshots/route.ts
// API para gestionar snapshots de portfolio y calcular métricas

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { applyRateLimit } from "@/lib/rate-limit";

interface HoldingData {
  fundName: string;
  quantity?: number;
  marketPrice?: number;
  marketValue: number;
  [key: string]: unknown;
}

interface SnapshotData {
  clientId: string;
  snapshotDate?: string;
  totalValue: number;
  totalCostBasis?: number;
  composition: {
    equity: { value: number; percent: number };
    fixedIncome: { value: number; percent: number };
    alternatives?: { value: number; percent: number };
    cash?: { value: number; percent: number };
  };
  holdings?: HoldingData[];
  source?: string;
  cashFlows?: {
    deposits: number;
    withdrawals: number;
    netFlow: number;
  };
}

// GET: Obtener snapshots históricos de un cliente
export async function GET(request: NextRequest) {
  const blocked = applyRateLimit(request, "portfolio-snapshots", { limit: 30, windowSeconds: 60 });
  if (blocked) return blocked;

  try {
    const supabase = await createSupabaseServerClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get("clientId");
    const period = searchParams.get("period") || "1Y"; // 1M, 3M, 6M, 1Y, ALL

    if (!clientId) {
      return NextResponse.json({ success: false, error: "clientId requerido" }, { status: 400 });
    }

    // Calcular fecha de inicio según periodo
    const endDate = new Date();
    let startDate = new Date();

    switch (period) {
      case "1M":
        startDate.setMonth(startDate.getMonth() - 1);
        break;
      case "3M":
        startDate.setMonth(startDate.getMonth() - 3);
        break;
      case "6M":
        startDate.setMonth(startDate.getMonth() - 6);
        break;
      case "1Y":
        startDate.setFullYear(startDate.getFullYear() - 1);
        break;
      case "YTD":
        startDate = new Date(startDate.getFullYear(), 0, 1);
        break;
      case "ALL":
        startDate = new Date(2000, 0, 1);
        break;
    }

    // Obtener snapshots
    const { data: snapshots, error } = await supabase
      .from("portfolio_snapshots")
      .select("*")
      .eq("client_id", clientId)
      .gte("snapshot_date", startDate.toISOString().split("T")[0])
      .lte("snapshot_date", endDate.toISOString().split("T")[0])
      .order("snapshot_date", { ascending: true });

    if (error) {
      console.error("Error fetching snapshots:", error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    // Calcular métricas si hay suficientes datos
    const metrics = calculateMetrics(snapshots || []);

    return NextResponse.json({
      success: true,
      data: {
        snapshots: snapshots || [],
        metrics,
        period,
        startDate: startDate.toISOString().split("T")[0],
        endDate: endDate.toISOString().split("T")[0],
      },
    });
  } catch (error: unknown) {
    console.error("Error in GET snapshots:", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Error in GET snapshots" }, { status: 500 });
  }
}

// POST: Crear un nuevo snapshot
export async function POST(request: NextRequest) {
  const blocked = applyRateLimit(request, "snapshots-post", { limit: 10, windowSeconds: 60 });
  if (blocked) return blocked;

  try {
    const supabase = await createSupabaseServerClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    const body: SnapshotData = await request.json();
    const {
      clientId,
      snapshotDate,
      totalValue,
      totalCostBasis,
      composition,
      holdings,
      source = "manual",
      cashFlows,
    } = body;

    if (!clientId || !totalValue) {
      return NextResponse.json({ success: false, error: "clientId y totalValue requeridos" }, { status: 400 });
    }

    const date = snapshotDate || new Date().toISOString().split("T")[0];

    // Calculate total cuotas from holdings
    const totalCuotas = (holdings || []).reduce((sum, h) => sum + (h.quantity || 0), 0);

    // Obtener snapshot anterior para calcular retorno diario y cambio de cuotas
    const { data: prevSnapshot } = await supabase
      .from("portfolio_snapshots")
      .select("total_value, cumulative_return, twr_cumulative, total_cuotas")
      .eq("client_id", clientId)
      .lt("snapshot_date", date)
      .order("snapshot_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Calculate cuotas change from previous snapshot
    const prevCuotas = prevSnapshot?.total_cuotas || 0;
    const cuotasChange = totalCuotas - prevCuotas;

    // Estimate cash flows from cuota changes if not provided
    // If cuotas increased, the value of new cuotas is a deposit
    // If cuotas decreased, the value of sold cuotas is a withdrawal
    let estimatedNetFlow = cashFlows?.netFlow || 0;
    let estimatedDeposits = cashFlows?.deposits || 0;
    let estimatedWithdrawals = cashFlows?.withdrawals || 0;

    if (!cashFlows && prevSnapshot && prevCuotas > 0 && cuotasChange !== 0) {
      // Use the previous unit value to estimate cash flows
      const prevUnitValue = prevSnapshot.total_value / prevCuotas;
      if (cuotasChange > 0) {
        // Bought more cuotas = deposit
        estimatedDeposits = cuotasChange * prevUnitValue;
        estimatedNetFlow = estimatedDeposits;
      } else {
        // Sold cuotas = withdrawal
        estimatedWithdrawals = Math.abs(cuotasChange) * prevUnitValue;
        estimatedNetFlow = -estimatedWithdrawals;
      }
    }

    // Helper to clamp values to prevent database overflow
    // DECIMAL(10,4) can hold max 999999.9999, we use ±9999.99 as reasonable bounds for percentages
    const clampPercent = (value: number): number => {
      if (!Number.isFinite(value)) return 0;
      return Math.max(-9999.99, Math.min(9999.99, value));
    };

    // Calcular retornos
    let dailyReturn = 0;
    let cumulativeReturn = 0;
    let twrPeriod = 0;
    let twrCumulative = 0;

    if (prevSnapshot && prevSnapshot.total_value > 0) {
      // Simple return (for backwards compatibility)
      dailyReturn = clampPercent(((totalValue - prevSnapshot.total_value) / prevSnapshot.total_value) * 100);

      // TWR (Time-Weighted Return) calculation
      // For mutual funds: use cuota value change (most accurate)
      // Formula: (Current Unit Value / Previous Unit Value) - 1
      // Only use cuota-based calc if we have meaningful cuota values (> 0.001)
      if (totalCuotas > 0.001 && prevCuotas > 0.001) {
        const currentUnitValue = totalValue / totalCuotas;
        const prevUnitValue = prevSnapshot.total_value / prevCuotas;
        // Sanity check: unit values should be positive and finite
        if (Number.isFinite(currentUnitValue) && Number.isFinite(prevUnitValue) && prevUnitValue > 0) {
          twrPeriod = clampPercent(((currentUnitValue / prevUnitValue) - 1) * 100);
        }
      } else if (prevSnapshot.total_value > 0) {
        // Fallback: use cash flow adjusted formula
        // (End Value - Net Flow) / Beginning Value - 1
        const adjustedEndValue = totalValue - estimatedNetFlow;
        twrPeriod = clampPercent(((adjustedEndValue / prevSnapshot.total_value) - 1) * 100);
      }

      // Cumulative TWR using geometric linking
      // (1 + TWR_cumulative_new) = (1 + TWR_cumulative_prev) * (1 + TWR_period)
      const prevTwrFactor = 1 + ((prevSnapshot.twr_cumulative || 0) / 100);
      const periodTwrFactor = 1 + (twrPeriod / 100);
      twrCumulative = clampPercent((prevTwrFactor * periodTwrFactor - 1) * 100);

      // Obtener primer snapshot para calcular retorno acumulado simple
      const { data: firstSnapshot } = await supabase
        .from("portfolio_snapshots")
        .select("total_value")
        .eq("client_id", clientId)
        .order("snapshot_date", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (firstSnapshot && firstSnapshot.total_value > 0) {
        cumulativeReturn = clampPercent(((totalValue - firstSnapshot.total_value) / firstSnapshot.total_value) * 100);
      }
    }

    // Calcular ganancia/pérdida no realizada
    const unrealizedGainLoss = totalCostBasis ? totalValue - totalCostBasis : null;

    // Helper to clamp monetary values (DECIMAL(18,2) max ~10^16)
    const clampMoney = (value: number): number => {
      if (!Number.isFinite(value)) return 0;
      return Math.max(-9999999999999999, Math.min(9999999999999999, Math.round(value * 100) / 100));
    };

    // Helper to clamp cuotas (DECIMAL(18,6) max ~10^12 integer part)
    const clampCuotas = (value: number): number => {
      if (!Number.isFinite(value)) return 0;
      return Math.max(-999999999999, Math.min(999999999999, Math.round(value * 1000000) / 1000000));
    };

    // Prepare data with clamped values
    const snapshotData = {
      client_id: clientId,
      snapshot_date: date,
      total_value: clampMoney(totalValue),
      total_cost_basis: totalCostBasis ? clampMoney(totalCostBasis) : null,
      unrealized_gain_loss: unrealizedGainLoss ? clampMoney(unrealizedGainLoss) : null,
      equity_percent: clampPercent(composition.equity?.percent || 0),
      fixed_income_percent: clampPercent(composition.fixedIncome?.percent || 0),
      alternatives_percent: clampPercent(composition.alternatives?.percent || 0),
      cash_percent: clampPercent(composition.cash?.percent || 0),
      equity_value: clampMoney(composition.equity?.value || 0),
      fixed_income_value: clampMoney(composition.fixedIncome?.value || 0),
      alternatives_value: clampMoney(composition.alternatives?.value || 0),
      cash_value: clampMoney(composition.cash?.value || 0),
      holdings: holdings || null,
      daily_return: clampPercent(dailyReturn),
      cumulative_return: clampPercent(cumulativeReturn),
      // Cash flows for TWR calculation
      deposits: clampMoney(estimatedDeposits),
      withdrawals: clampMoney(estimatedWithdrawals),
      net_cash_flow: clampMoney(estimatedNetFlow),
      // TWR metrics
      twr_period: clampPercent(twrPeriod),
      twr_cumulative: clampPercent(twrCumulative),
      // Cuotas tracking
      total_cuotas: clampCuotas(totalCuotas),
      cuotas_change: clampCuotas(cuotasChange),
      source,
    };

    // Insertar o actualizar snapshot
    const { data: snapshot, error } = await supabase
      .from("portfolio_snapshots")
      .upsert(snapshotData, {
        onConflict: "client_id,snapshot_date",
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating snapshot:", error);
      console.error("Snapshot data that failed:", JSON.stringify(snapshotData, null, 2));
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: snapshot,
      // Signal to frontend that fill-prices should be triggered
      shouldFillPrices: !!(holdings && holdings.length > 0 && (source === "statement" || source === "manual" || source === "excel")),
    });
  } catch (error: unknown) {
    console.error("Error in POST snapshot:", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Error in POST snapshot" }, { status: 500 });
  }
}

// Función para calcular métricas de rendimiento
interface SnapshotRecord {
  total_value: number;
  snapshot_date: string;
  unrealized_gain_loss?: number;
  equity_percent?: number;
  fixed_income_percent?: number;
  alternatives_percent?: number;
  cash_percent?: number;
  deposits?: number;
  withdrawals?: number;
  net_cash_flow?: number;
  twr_period?: number;
  twr_cumulative?: number;
  total_cuotas?: number;
  cuotas_change?: number;
}

interface PortfolioMetrics {
  totalReturn: number;
  annualizedReturn: number;
  twr: number; // Time-Weighted Return
  twrAnnualized: number;
  volatility: number;
  maxDrawdown: number;
  sharpeRatio: number;
  currentValue: number;
  initialValue: number;
  dataPoints: number;
  unrealizedGainLoss?: number;
  periodDays?: number;
  totalDeposits?: number;
  totalWithdrawals?: number;
  netCashFlow?: number;
  composition?: {
    equity: number | undefined;
    fixedIncome: number | undefined;
    alternatives: number | undefined;
    cash: number | undefined;
  };
}

function calculateMetrics(snapshots: SnapshotRecord[]): PortfolioMetrics {
  if (snapshots.length < 2) {
    return {
      totalReturn: 0,
      annualizedReturn: 0,
      twr: 0,
      twrAnnualized: 0,
      volatility: 0,
      maxDrawdown: 0,
      sharpeRatio: 0,
      currentValue: snapshots[0]?.total_value || 0,
      initialValue: snapshots[0]?.total_value || 0,
      dataPoints: snapshots.length,
    };
  }

  const firstValue = snapshots[0].total_value;
  const lastValue = snapshots[snapshots.length - 1].total_value;
  const latestSnapshot = snapshots[snapshots.length - 1];

  // Retorno total simple
  const totalReturn = ((lastValue - firstValue) / firstValue) * 100;

  // TWR (Time-Weighted Return) - use stored value if available, otherwise calculate
  let twr = latestSnapshot.twr_cumulative || 0;

  // If no stored TWR, calculate it from scratch using sub-period returns
  if (!twr && snapshots.length >= 2) {
    let twrFactor = 1;
    for (let i = 1; i < snapshots.length; i++) {
      const prevValue = snapshots[i - 1].total_value;
      const currValue = snapshots[i].total_value;
      const netFlow = snapshots[i].net_cash_flow || 0;

      if (prevValue > 0) {
        // Sub-period return adjusted for cash flows
        // (End Value - Net Flow) / Beginning Value
        const adjustedEndValue = currValue - netFlow;
        const subPeriodReturn = adjustedEndValue / prevValue;
        twrFactor *= subPeriodReturn;
      }
    }
    twr = (twrFactor - 1) * 100;
  }

  // Calculate TWR-based daily returns for volatility
  const twrDailyReturns: number[] = [];
  for (let i = 1; i < snapshots.length; i++) {
    const prevValue = snapshots[i - 1].total_value;
    const currValue = snapshots[i].total_value;
    const netFlow = snapshots[i].net_cash_flow || 0;

    if (prevValue > 0) {
      const adjustedEndValue = currValue - netFlow;
      twrDailyReturns.push((adjustedEndValue / prevValue) - 1);
    }
  }

  // Volatilidad (desviación estándar de retornos TWR anualizada)
  let annualizedVol = 0;
  if (twrDailyReturns.length > 0) {
    const avgReturn = twrDailyReturns.reduce((a, b) => a + b, 0) / twrDailyReturns.length;
    const variance = twrDailyReturns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / twrDailyReturns.length;
    const dailyVol = Math.sqrt(variance);
    annualizedVol = dailyVol * Math.sqrt(252) * 100; // 252 trading days
  }

  // Period calculation
  const daysDiff = (new Date(snapshots[snapshots.length - 1].snapshot_date).getTime() -
                   new Date(snapshots[0].snapshot_date).getTime()) / (1000 * 60 * 60 * 24);
  const yearsElapsed = daysDiff / 365;

  // Retorno anualizado simple
  const annualizedReturn = yearsElapsed > 0
    ? (Math.pow(lastValue / firstValue, 1 / yearsElapsed) - 1) * 100
    : totalReturn;

  // TWR anualizado
  const twrAnnualized = yearsElapsed > 0
    ? (Math.pow(1 + twr / 100, 1 / yearsElapsed) - 1) * 100
    : twr;

  // Max Drawdown
  let maxDrawdown = 0;
  let peak = snapshots[0].total_value;

  for (const snapshot of snapshots) {
    if (snapshot.total_value > peak) {
      peak = snapshot.total_value;
    }
    const drawdown = ((peak - snapshot.total_value) / peak) * 100;
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
    }
  }

  // Sharpe Ratio usando TWR (asumiendo tasa libre de riesgo de 4%)
  const riskFreeRate = 4;
  const excessReturn = twrAnnualized - riskFreeRate;
  const sharpeRatio = annualizedVol > 0 ? excessReturn / annualizedVol : 0;

  // Total cash flows
  const totalDeposits = snapshots.reduce((sum, s) => sum + (s.deposits || 0), 0);
  const totalWithdrawals = snapshots.reduce((sum, s) => sum + (s.withdrawals || 0), 0);
  const netCashFlow = totalDeposits - totalWithdrawals;

  return {
    totalReturn: Math.round(totalReturn * 100) / 100,
    annualizedReturn: Math.round(annualizedReturn * 100) / 100,
    twr: Math.round(twr * 100) / 100,
    twrAnnualized: Math.round(twrAnnualized * 100) / 100,
    volatility: Math.round(annualizedVol * 100) / 100,
    maxDrawdown: Math.round(maxDrawdown * 100) / 100,
    sharpeRatio: Math.round(sharpeRatio * 100) / 100,
    currentValue: lastValue,
    initialValue: firstValue,
    unrealizedGainLoss: latestSnapshot.unrealized_gain_loss,
    dataPoints: snapshots.length,
    periodDays: Math.round(daysDiff),
    totalDeposits: Math.round(totalDeposits),
    totalWithdrawals: Math.round(totalWithdrawals),
    netCashFlow: Math.round(netCashFlow),
    composition: {
      equity: latestSnapshot.equity_percent,
      fixedIncome: latestSnapshot.fixed_income_percent,
      alternatives: latestSnapshot.alternatives_percent,
      cash: latestSnapshot.cash_percent,
    },
  };
}
