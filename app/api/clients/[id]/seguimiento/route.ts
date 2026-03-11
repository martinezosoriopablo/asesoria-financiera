// app/api/clients/[id]/seguimiento/route.ts
// Endpoint consolidado para seguimiento de cartolas

import { NextRequest, NextResponse } from "next/server";
import { requireAdvisor, createAdminClient } from "@/lib/auth/api-auth";

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
  source: string;
  created_at: string;
}

interface PortfolioMetrics {
  totalReturn: number;
  annualizedReturn: number;
  volatility: number;
  maxDrawdown: number;
  sharpeRatio: number;
  currentValue: number;
  initialValue: number;
  dataPoints: number;
  unrealizedGainLoss?: number | null;
  periodDays?: number;
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
  const { advisor, error: authError } = await requireAdvisor();
  if (authError) return authError;

  const supabase = createAdminClient();

  try {
    const { id: clientId } = await context.params;
    const { searchParams } = new URL(request.url);
    const period = searchParams.get("period") || "ALL";

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
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 403 }
      );
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

    // Obtener snapshots
    const { data: snapshots, error: snapshotsError } = await supabase
      .from("portfolio_snapshots")
      .select("*")
      .eq("client_id", clientId)
      .gte("snapshot_date", startDate.toISOString().split("T")[0])
      .lte("snapshot_date", endDate.toISOString().split("T")[0])
      .order("snapshot_date", { ascending: true });

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

  const firstValue = snapshots[0].total_value;
  const lastValue = snapshots[snapshots.length - 1].total_value;

  // Retorno total
  const totalReturn = ((lastValue - firstValue) / firstValue) * 100;

  // Calcular retornos diarios para volatilidad
  const dailyReturns: number[] = [];
  for (let i = 1; i < snapshots.length; i++) {
    const prevValue = snapshots[i - 1].total_value;
    const currValue = snapshots[i].total_value;
    if (prevValue > 0) {
      dailyReturns.push((currValue - prevValue) / prevValue);
    }
  }

  // Volatilidad (desviación estándar de retornos diarios anualizada)
  let annualizedVol = 0;
  if (dailyReturns.length > 0) {
    const avgReturn = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
    const variance =
      dailyReturns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) /
      dailyReturns.length;
    const dailyVol = Math.sqrt(variance);
    annualizedVol = dailyVol * Math.sqrt(252) * 100; // 252 trading days
  }

  // Retorno anualizado
  const daysDiff =
    (new Date(snapshots[snapshots.length - 1].snapshot_date).getTime() -
      new Date(snapshots[0].snapshot_date).getTime()) /
    (1000 * 60 * 60 * 24);
  const yearsElapsed = daysDiff / 365;
  const annualizedReturn =
    yearsElapsed > 0
      ? (Math.pow(lastValue / firstValue, 1 / yearsElapsed) - 1) * 100
      : totalReturn;

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

  // Sharpe Ratio (asumiendo tasa libre de riesgo de 4%)
  const riskFreeRate = 4;
  const excessReturn = annualizedReturn - riskFreeRate;
  const sharpeRatio = annualizedVol > 0 ? excessReturn / annualizedVol : 0;

  // Composición actual
  const latestSnapshot = snapshots[snapshots.length - 1];

  return {
    totalReturn: Math.round(totalReturn * 100) / 100,
    annualizedReturn: Math.round(annualizedReturn * 100) / 100,
    volatility: Math.round(annualizedVol * 100) / 100,
    maxDrawdown: Math.round(maxDrawdown * 100) / 100,
    sharpeRatio: Math.round(sharpeRatio * 100) / 100,
    currentValue: lastValue,
    initialValue: firstValue,
    unrealizedGainLoss: latestSnapshot.unrealized_gain_loss,
    dataPoints: snapshots.length,
    periodDays: Math.round(daysDiff),
    composition: {
      equity: latestSnapshot.equity_percent || 0,
      fixedIncome: latestSnapshot.fixed_income_percent || 0,
      alternatives: latestSnapshot.alternatives_percent || 0,
      cash: latestSnapshot.cash_percent || 0,
    },
  };
}
