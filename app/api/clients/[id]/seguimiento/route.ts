// app/api/clients/[id]/seguimiento/route.ts
// Endpoint consolidado para seguimiento de cartolas

import { NextRequest, NextResponse } from "next/server";
import { requireAdvisor, createAdminClient, getSubordinateAdvisorIds } from "@/lib/auth/api-auth";
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
  totalReturn: number;
  annualizedReturn: number;
  twr: number;
  twrAnnualized: number;
  volatility: number;
  maxDrawdown: number;
  sharpeRatio: number;
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
      if (advisor!.rol === "admin") {
        const allowedIds = await getSubordinateAdvisorIds(advisor!.id);
        if (!allowedIds.includes(client.asesor_id)) {
          return NextResponse.json({ success: false, error: "No autorizado" }, { status: 403 });
        }
      } else {
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

// Función para calcular métricas de rendimiento incluyendo TWR
function calculateMetrics(snapshots: SnapshotRecord[]): PortfolioMetrics {
  if (snapshots.length < 2) {
    const latestSnapshot = snapshots[snapshots.length - 1];
    return {
      totalReturn: 0,
      annualizedReturn: 0,
      twr: 0,
      twrAnnualized: 0,
      volatility: 0,
      maxDrawdown: 0,
      sharpeRatio: 0,
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
      twr: 0,
      twrAnnualized: 0,
      volatility: 0,
      maxDrawdown: 0,
      sharpeRatio: 0,
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

  // Retorno total simple
  const totalReturn = ((lastValue - firstValue) / firstValue) * 100;

  // TWR (Time-Weighted Return) - use stored value if available, otherwise calculate
  let twr = latestSnapshot.twr_cumulative || 0;

  // If no stored TWR, calculate it from scratch using cuota-based returns
  if (!twr && snapshots.length >= 2) {
    let twrFactor = 1;
    for (let i = 1; i < snapshots.length; i++) {
      const prevSnapshot = snapshots[i - 1];
      const currSnapshot = snapshots[i];
      const prevCuotas = prevSnapshot.total_cuotas || 0;
      const currCuotas = currSnapshot.total_cuotas || 0;

      let subPeriodReturn = 1;

      // Use cuota value (NAV) change for most accurate TWR
      if (prevCuotas > 0 && currCuotas > 0) {
        const prevUnitValue = prevSnapshot.total_value / prevCuotas;
        const currUnitValue = currSnapshot.total_value / currCuotas;
        subPeriodReturn = currUnitValue / prevUnitValue;
      } else if (prevSnapshot.total_value > 0) {
        // Fallback: use cash flow adjusted formula
        const netFlow = currSnapshot.net_cash_flow || 0;
        const adjustedEndValue = currSnapshot.total_value - netFlow;
        subPeriodReturn = adjustedEndValue / prevSnapshot.total_value;
      }

      twrFactor *= subPeriodReturn;
    }
    twr = (twrFactor - 1) * 100;
  }

  // Calculate TWR-based period returns for volatility
  const twrPeriodReturns: number[] = [];
  for (let i = 1; i < snapshots.length; i++) {
    const prevSnapshot = snapshots[i - 1];
    const currSnapshot = snapshots[i];
    const prevCuotas = prevSnapshot.total_cuotas || 0;
    const currCuotas = currSnapshot.total_cuotas || 0;

    // Use cuota value change for accurate return calculation
    if (prevCuotas > 0 && currCuotas > 0) {
      const prevUnitValue = prevSnapshot.total_value / prevCuotas;
      const currUnitValue = currSnapshot.total_value / currCuotas;
      twrPeriodReturns.push((currUnitValue / prevUnitValue) - 1);
    } else if (prevSnapshot.total_value > 0) {
      const netFlow = currSnapshot.net_cash_flow || 0;
      const adjustedEndValue = currSnapshot.total_value - netFlow;
      twrPeriodReturns.push((adjustedEndValue / prevSnapshot.total_value) - 1);
    }
  }

  // Period calculation
  const daysDiff =
    (new Date(snapshots[snapshots.length - 1].snapshot_date).getTime() -
      new Date(snapshots[0].snapshot_date).getTime()) /
    (1000 * 60 * 60 * 24);

  // Volatilidad (desviación estándar de retornos TWR anualizada)
  let annualizedVol = 0;
  if (twrPeriodReturns.length > 0) {
    const avgReturn = twrPeriodReturns.reduce((a, b) => a + b, 0) / twrPeriodReturns.length;
    const variance =
      twrPeriodReturns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) /
      twrPeriodReturns.length;
    const periodVol = Math.sqrt(variance);
    // Annualize based on number of periods per year
    // If we have daily data, use 252; otherwise estimate from data frequency
    const avgDaysBetweenSnapshots = daysDiff / (snapshots.length - 1);
    const periodsPerYear = avgDaysBetweenSnapshots > 0 ? 365 / avgDaysBetweenSnapshots : 12;
    annualizedVol = periodVol * Math.sqrt(Math.min(periodsPerYear, 252)) * 100;
  }
  const yearsElapsed = daysDiff / 365;

  // Retorno anualizado simple
  const annualizedReturn =
    yearsElapsed > 0
      ? (Math.pow(lastValue / firstValue, 1 / yearsElapsed) - 1) * 100
      : totalReturn;

  // TWR anualizado
  const twrAnnualized =
    yearsElapsed > 0
      ? (Math.pow(1 + twr / 100, 1 / yearsElapsed) - 1) * 100
      : twr;

  // Max Drawdown — adjusted for cash flows using cuota/unit value
  let maxDrawdown = 0;
  if (snapshots.length >= 2) {
    // Use unit value (total_value / total_cuotas) to isolate market returns from cash flows
    const useUnitValue = snapshots.every(s => s.total_cuotas && s.total_cuotas > 0);

    if (useUnitValue) {
      let peakUnitValue = snapshots[0].total_value / snapshots[0].total_cuotas!;
      for (const snapshot of snapshots) {
        const unitValue = snapshot.total_value / snapshot.total_cuotas!;
        if (unitValue > peakUnitValue) {
          peakUnitValue = unitValue;
        }
        const drawdown = ((peakUnitValue - unitValue) / peakUnitValue) * 100;
        if (drawdown > maxDrawdown) {
          maxDrawdown = drawdown;
        }
      }
    } else {
      // Fallback: adjust peak by cumulative net cash flows
      let peak = snapshots[0].total_value;
      let cumulativeFlow = 0;
      for (let i = 1; i < snapshots.length; i++) {
        const flow = snapshots[i].net_cash_flow || 0;
        cumulativeFlow += flow;
        const adjustedValue = snapshots[i].total_value - cumulativeFlow;
        const adjustedPeak = peak; // peak is already in "flow-free" terms
        if (adjustedValue > adjustedPeak) {
          peak = adjustedValue;
        }
        const drawdown = ((peak - adjustedValue) / peak) * 100;
        if (drawdown > maxDrawdown) {
          maxDrawdown = drawdown;
        }
      }
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
      equity: latestSnapshot.equity_percent || 0,
      fixedIncome: latestSnapshot.fixed_income_percent || 0,
      alternatives: latestSnapshot.alternatives_percent || 0,
      cash: latestSnapshot.cash_percent || 0,
    },
  };
}
