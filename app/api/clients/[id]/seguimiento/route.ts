// app/api/clients/[id]/seguimiento/route.ts
// Endpoint consolidado para seguimiento de cartolas

import { NextRequest, NextResponse } from "next/server";
import { requireAdvisor, createAdminClient, getSubordinateAdvisorIds, getSharedClientIds } from "@/lib/auth/api-auth";
import { applyRateLimit } from "@/lib/rate-limit";

interface RouteContext {
  params: Promise<{ id: string }>;
}

interface SnapshotRecord {
  id: string;
  client_id: string;
  snapshot_date: string;
  total_value: number;
  total_cost_basis: number | null;
  unrealized_gain_loss: number | null;
  equity_percent: number;
  fixed_income_percent: number;
  alternatives_percent: number;
  cash_percent: number;
  equity_value: number;
  fixed_income_value: number;
  alternatives_value: number;
  cash_value: number;
  holdings: unknown[] | null;
  daily_return: number;
  cumulative_return: number;
  deposits?: number;
  withdrawals?: number;
  net_cash_flow?: number;
  twr_period?: number;
  twr_cumulative?: number;
  total_cuotas?: number;
  cuotas_change?: number;
  source: string;
  created_at: string;
}

interface PortfolioMetrics {
  totalReturn: number;        // simple return % from first to last snapshot
  annualizedReturn: number;   // annualized if >= 365 days, else same as totalReturn
  isAnnualized: boolean;      // whether annualizedReturn is actually annualized
  volatility: number;
  maxDrawdown: number;
  currentValue: number;
  initialValue: number;
  dataPoints: number;
  unrealizedGainLoss?: number | null;
  periodDays?: number;
  totalDeposits?: number;
  totalWithdrawals?: number;
  netCashFlow?: number;
  composition?: {
    equity: number;
    fixedIncome: number;
    alternatives: number;
    cash: number;
  };
}

// GET - Obtener datos consolidados de seguimiento
export async function GET(
  request: NextRequest,
  context: RouteContext
) {
  const blocked = await applyRateLimit(request, "client-seguimiento", { limit: 30, windowSeconds: 60 });
  if (blocked) return blocked;

  const { advisor, error: authError } = await requireAdvisor();
  if (authError) return authError;

  const supabase = createAdminClient();

  try {
    const { id: clientId } = await context.params;
    const { searchParams } = new URL(request.url);
    const period = searchParams.get("period") || "ALL";

    // Pagination params
    const rawLimit = parseInt(searchParams.get("limit") || "500", 10);
    const rawOffset = parseInt(searchParams.get("offset") || "0", 10);
    const limit = Math.max(1, Math.min(isNaN(rawLimit) ? 500 : rawLimit, 1000));
    const offset = Math.max(0, isNaN(rawOffset) ? 0 : rawOffset);

    // Verificar que el cliente pertenece al advisor
    const { data: client, error: clientError } = await supabase
      .from("clients")
      .select("id, nombre, apellido, email, cartera_recomendada, asesor_id")
      .eq("id", clientId)
      .single();

    if (clientError || !client) {
      return NextResponse.json(
        { success: false, error: "Cliente no encontrado" },
        { status: 404 }
      );
    }

    if (client.asesor_id && client.asesor_id !== advisor!.id) {
      let authorized = false;
      if (advisor!.rol === "admin") {
        const allowedIds = await getSubordinateAdvisorIds(advisor!.id);
        authorized = allowedIds.includes(client.asesor_id);
      }
      if (!authorized) {
        // Check shared access
        const sharedIds = await getSharedClientIds(advisor!.id);
        authorized = sharedIds.includes(clientId);
      }
      if (!authorized) {
        return NextResponse.json({ success: false, error: "No autorizado" }, { status: 403 });
      }
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
      default:
        startDate = new Date(2000, 0, 1);
        break;
    }

    // Obtener snapshots with pagination
    const { data: snapshots, error: snapshotsError, count: totalCount } = await supabase
      .from("portfolio_snapshots")
      .select("*", { count: "exact" })
      .eq("client_id", clientId)
      .gte("snapshot_date", startDate.toISOString().split("T")[0])
      .lte("snapshot_date", endDate.toISOString().split("T")[0])
      .order("snapshot_date", { ascending: true })
      .range(offset, offset + limit - 1);

    if (snapshotsError) {
      console.error("Error fetching snapshots:", snapshotsError);
      return NextResponse.json(
        { success: false, error: snapshotsError.message },
        { status: 500 }
      );
    }

    // Calcular métricas
    const metrics = calculateMetrics(snapshots || []);

    // Preparar recomendación
    const recommendation = client.cartera_recomendada || null;

    return NextResponse.json({
      success: true,
      data: {
        client: {
          id: client.id,
          nombre: client.nombre,
          apellido: client.apellido,
          email: client.email,
          cartera_recomendada: client.cartera_recomendada,
        },
        snapshots: snapshots || [],
        metrics,
        recommendation,
        period,
        startDate: startDate.toISOString().split("T")[0],
        endDate: endDate.toISOString().split("T")[0],
        pagination: {
          limit,
          offset,
          total: totalCount ?? (snapshots?.length || 0),
        },
      },
    });
  } catch (error) {
    console.error("Error in seguimiento GET:", error);
    return NextResponse.json(
      { success: false, error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}

// Función para calcular métricas de rendimiento
function calculateMetrics(snapshots: SnapshotRecord[]): PortfolioMetrics {
  if (snapshots.length < 2) {
    const latestSnapshot = snapshots[snapshots.length - 1];
    return {
      totalReturn: 0,
      annualizedReturn: 0,
      isAnnualized: false,
      volatility: 0,
      maxDrawdown: 0,
      currentValue: latestSnapshot?.total_value || 0,
      initialValue: snapshots[0]?.total_value || 0,
      dataPoints: snapshots.length,
      periodDays: 0,
      composition: latestSnapshot
        ? {
            equity: latestSnapshot.equity_percent || 0,
            fixedIncome: latestSnapshot.fixed_income_percent || 0,
            alternatives: latestSnapshot.alternatives_percent || 0,
            cash: latestSnapshot.cash_percent || 0,
          }
        : undefined,
    };
  }

  const firstValue = snapshots[0].total_value || 0;
  const lastValue = snapshots[snapshots.length - 1].total_value || 0;
  const latestSnapshot = snapshots[snapshots.length - 1];

  // Guard: if first value is 0, we can't calculate returns
  if (firstValue <= 0) {
    return {
      totalReturn: 0,
      annualizedReturn: 0,
      isAnnualized: false,
      volatility: 0,
      maxDrawdown: 0,
      currentValue: lastValue,
      initialValue: firstValue,
      dataPoints: snapshots.length,
      periodDays: 0,
      composition: latestSnapshot
        ? {
            equity: latestSnapshot.equity_percent || 0,
            fixedIncome: latestSnapshot.fixed_income_percent || 0,
            alternatives: latestSnapshot.alternatives_percent || 0,
            cash: latestSnapshot.cash_percent || 0,
          }
        : undefined,
    };
  }

  // Simple return
  const totalReturn = ((lastValue - firstValue) / firstValue) * 100;

  // Period calculation
  const daysDiff =
    (new Date(snapshots[snapshots.length - 1].snapshot_date).getTime() -
      new Date(snapshots[0].snapshot_date).getTime()) /
    (1000 * 60 * 60 * 24);
  const yearsElapsed = daysDiff / 365;

  // Annualize ONLY if >= 365 days
  const isAnnualized = daysDiff >= 365;
  const annualizedReturn = isAnnualized
    ? (Math.pow(lastValue / firstValue, 1 / yearsElapsed) - 1) * 100
    : totalReturn;

  // Period returns for volatility (simple cash-flow adjusted)
  const periodReturns: number[] = [];
  for (let i = 1; i < snapshots.length; i++) {
    if (snapshots[i - 1].total_value > 0) {
      const netFlow = snapshots[i].net_cash_flow || 0;
      const adjustedEndValue = snapshots[i].total_value - netFlow;
      periodReturns.push((adjustedEndValue / snapshots[i - 1].total_value) - 1);
    }
  }

  // Volatility (annualized standard deviation of period returns)
  let annualizedVol = 0;
  if (periodReturns.length > 0) {
    const avgReturn = periodReturns.reduce((a, b) => a + b, 0) / periodReturns.length;
    const variance =
      periodReturns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) /
      periodReturns.length;
    const periodVol = Math.sqrt(variance);
    const avgDaysBetweenSnapshots = daysDiff / (snapshots.length - 1);
    const periodsPerYear = avgDaysBetweenSnapshots > 0 ? 365 / avgDaysBetweenSnapshots : 12;
    annualizedVol = periodVol * Math.sqrt(Math.min(periodsPerYear, 252)) * 100;
  }

  // Max Drawdown — simple peak-to-trough adjusted for cumulative cash flows
  let maxDrawdown = 0;
  if (snapshots.length >= 2) {
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
      equity: latestSnapshot.equity_percent || 0,
      fixedIncome: latestSnapshot.fixed_income_percent || 0,
      alternatives: latestSnapshot.alternatives_percent || 0,
      cash: latestSnapshot.cash_percent || 0,
    },
  };
}
