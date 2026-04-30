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
  const blocked = await applyRateLimit(request, "portfolio-snapshots", { limit: 30, windowSeconds: 60 });
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
  const blocked = await applyRateLimit(request, "snapshots-post", { limit: 10, windowSeconds: 60 });
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

    // Ensure composition exists with safe defaults
    if (!composition) {
      return NextResponse.json({ success: false, error: "composition requerida" }, { status: 400 });
    }

    const date = snapshotDate || new Date().toISOString().split("T")[0];

    // Calculate total cuotas from holdings
    const totalCuotas = (holdings || []).reduce((sum, h) => sum + (h.quantity || 0), 0);

    // Obtener snapshot anterior para calcular retorno diario y cambio de cuotas
    const { data: prevSnapshot } = await supabase
      .from("portfolio_snapshots")
      .select("total_value, cumulative_return, total_cuotas")
      .eq("client_id", clientId)
      .lt("snapshot_date", date)
      .order("snapshot_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Calculate cuotas change from previous snapshot
    const prevCuotas = prevSnapshot?.total_cuotas || 0;
    const rawCuotasChange = totalCuotas - prevCuotas;
    // Apply tolerance: ignore tiny cuota differences (<0.1% of total) caused by
    // rounding in PDF parsing. Without this, sub-cent rounding differences generate
    // phantom cash flows that distort TWR calculations.
    const cuotasTolerance = prevCuotas > 0 ? prevCuotas * 0.001 : 0.01;
    const cuotasChange = Math.abs(rawCuotasChange) < cuotasTolerance ? 0 : rawCuotasChange;

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

    // Calcular retornos simples
    let dailyReturn = 0;
    let cumulativeReturn = 0;

    if (prevSnapshot && prevSnapshot.total_value > 0) {
      // Simple return vs previous snapshot (adjusted for cash flows)
      const adjustedEndValue = totalValue - estimatedNetFlow;
      dailyReturn = clampPercent(((adjustedEndValue - prevSnapshot.total_value) / prevSnapshot.total_value) * 100);

      // Cumulative return vs first snapshot
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
      // TWR columns deprecated — write 0 to avoid null issues in existing queries
      twr_period: 0,
      twr_cumulative: 0,
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

    // Auto-mark as baseline if this is the first snapshot for this client
    // Done AFTER insert to avoid race condition between count and insert
    const { count: existingCount } = await supabase
      .from("portfolio_snapshots")
      .select("id", { count: "exact", head: true })
      .eq("client_id", clientId);

    if (existingCount === 1 && snapshot) {
      // Exactly one snapshot exists (the one we just created) → mark as baseline
      await supabase
        .from("portfolio_snapshots")
        .update({ is_baseline: true })
        .eq("id", snapshot.id);
      snapshot.is_baseline = true;
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
  isAnnualized: boolean;
  volatility: number;
  maxDrawdown: number;
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
      isAnnualized: false,
      volatility: 0,
      maxDrawdown: 0,
      currentValue: snapshots[0]?.total_value || 0,
      initialValue: snapshots[0]?.total_value || 0,
      dataPoints: snapshots.length,
    };
  }

  const firstValue = snapshots[0].total_value || 0;
  const lastValue = snapshots[snapshots.length - 1].total_value || 0;
  const latestSnapshot = snapshots[snapshots.length - 1];

  // Guard: if first value is 0, we can't calculate returns
  if (firstValue <= 0) {
    return {
      totalReturn: 0, annualizedReturn: 0, isAnnualized: false,
      volatility: 0, maxDrawdown: 0,
      currentValue: lastValue, initialValue: firstValue,
      dataPoints: snapshots.length,
    };
  }

  // Period calculation
  const daysDiff = (new Date(snapshots[snapshots.length - 1].snapshot_date).getTime() -
                   new Date(snapshots[0].snapshot_date).getTime()) / (1000 * 60 * 60 * 24);

  // Retorno total simple
  const totalReturn = ((lastValue - firstValue) / firstValue) * 100;

  // Annualize only if >= 365 days
  const yearsElapsed = daysDiff / 365;
  const isAnnualized = daysDiff >= 365;
  const annualizedReturn = isAnnualized
    ? (Math.pow(lastValue / firstValue, 1 / yearsElapsed) - 1) * 100
    : totalReturn;

  // Simple period returns for volatility (cash-flow adjusted)
  const periodReturns: number[] = [];
  for (let i = 1; i < snapshots.length; i++) {
    const prev = snapshots[i - 1];
    const curr = snapshots[i];
    if (prev.total_value > 0) {
      const netFlow = curr.net_cash_flow || 0;
      const adjustedEndValue = curr.total_value - netFlow;
      periodReturns.push((adjustedEndValue / prev.total_value) - 1);
    }
  }

  // Volatilidad (desviación estándar anualizada)
  let annualizedVol = 0;
  if (periodReturns.length > 0) {
    const avgReturn = periodReturns.reduce((a, b) => a + b, 0) / periodReturns.length;
    const variance = periodReturns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / periodReturns.length;
    const periodVol = Math.sqrt(variance);
    const avgDaysBetweenSnapshots = daysDiff / (snapshots.length - 1);
    const periodsPerYear = avgDaysBetweenSnapshots > 0 ? 365 / avgDaysBetweenSnapshots : 12;
    annualizedVol = periodVol * Math.sqrt(Math.min(periodsPerYear, 252)) * 100;
  }

  // Max Drawdown — simple peak-to-trough, cash flow adjusted
  let maxDrawdown = 0;
  let peak = snapshots[0].total_value;
  let cumulativeFlow = 0;
  for (let i = 1; i < snapshots.length; i++) {
    const flow = snapshots[i].net_cash_flow || 0;
    cumulativeFlow += flow;
    const adjustedValue = snapshots[i].total_value - cumulativeFlow;
    if (adjustedValue > peak) {
      peak = adjustedValue;
    }
    const drawdown = ((peak - adjustedValue) / peak) * 100;
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
    }
  }

  // Total cash flows
  const totalDeposits = snapshots.reduce((sum, s) => sum + (s.deposits || 0), 0);
  const totalWithdrawals = snapshots.reduce((sum, s) => sum + (s.withdrawals || 0), 0);
  const netCashFlow = totalDeposits - totalWithdrawals;

  return {
    totalReturn: Math.round(totalReturn * 100) / 100,
    annualizedReturn: Math.round(annualizedReturn * 100) / 100,
    isAnnualized,
    volatility: Math.round(annualizedVol * 100) / 100,
    maxDrawdown: Math.round(maxDrawdown * 100) / 100,
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
