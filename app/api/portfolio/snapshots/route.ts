// app/api/portfolio/snapshots/route.ts
// API para gestionar snapshots de portfolio y calcular métricas

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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
  holdings?: any[];
  source?: string;
}

// GET: Obtener snapshots históricos de un cliente
export async function GET(request: NextRequest) {
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
  } catch (error: any) {
    console.error("Error in GET snapshots:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// POST: Crear un nuevo snapshot
export async function POST(request: NextRequest) {
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
    } = body;

    if (!clientId || !totalValue) {
      return NextResponse.json({ success: false, error: "clientId y totalValue requeridos" }, { status: 400 });
    }

    const date = snapshotDate || new Date().toISOString().split("T")[0];

    // Obtener snapshot anterior para calcular retorno diario
    const { data: prevSnapshot } = await supabase
      .from("portfolio_snapshots")
      .select("total_value, cumulative_return")
      .eq("client_id", clientId)
      .lt("snapshot_date", date)
      .order("snapshot_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Calcular retornos
    let dailyReturn = 0;
    let cumulativeReturn = 0;

    if (prevSnapshot) {
      dailyReturn = ((totalValue - prevSnapshot.total_value) / prevSnapshot.total_value) * 100;

      // Obtener primer snapshot para calcular retorno acumulado
      const { data: firstSnapshot } = await supabase
        .from("portfolio_snapshots")
        .select("total_value")
        .eq("client_id", clientId)
        .order("snapshot_date", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (firstSnapshot) {
        cumulativeReturn = ((totalValue - firstSnapshot.total_value) / firstSnapshot.total_value) * 100;
      }
    }

    // Calcular ganancia/pérdida no realizada
    const unrealizedGainLoss = totalCostBasis ? totalValue - totalCostBasis : null;

    // Insertar o actualizar snapshot
    const { data: snapshot, error } = await supabase
      .from("portfolio_snapshots")
      .upsert({
        client_id: clientId,
        snapshot_date: date,
        total_value: totalValue,
        total_cost_basis: totalCostBasis,
        unrealized_gain_loss: unrealizedGainLoss,
        equity_percent: composition.equity?.percent || 0,
        fixed_income_percent: composition.fixedIncome?.percent || 0,
        alternatives_percent: composition.alternatives?.percent || 0,
        cash_percent: composition.cash?.percent || 0,
        equity_value: composition.equity?.value || 0,
        fixed_income_value: composition.fixedIncome?.value || 0,
        alternatives_value: composition.alternatives?.value || 0,
        cash_value: composition.cash?.value || 0,
        holdings: holdings || null,
        daily_return: dailyReturn,
        cumulative_return: cumulativeReturn,
        source,
      }, {
        onConflict: "client_id,snapshot_date",
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating snapshot:", error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: snapshot,
    });
  } catch (error: any) {
    console.error("Error in POST snapshot:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// Función para calcular métricas de rendimiento
function calculateMetrics(snapshots: any[]): any {
  if (snapshots.length < 2) {
    return {
      totalReturn: 0,
      annualizedReturn: 0,
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
  const avgReturn = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
  const variance = dailyReturns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / dailyReturns.length;
  const dailyVol = Math.sqrt(variance);
  const annualizedVol = dailyVol * Math.sqrt(252) * 100; // 252 trading days

  // Retorno anualizado
  const daysDiff = (new Date(snapshots[snapshots.length - 1].snapshot_date).getTime() -
                   new Date(snapshots[0].snapshot_date).getTime()) / (1000 * 60 * 60 * 24);
  const yearsElapsed = daysDiff / 365;
  const annualizedReturn = yearsElapsed > 0
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
      equity: latestSnapshot.equity_percent,
      fixedIncome: latestSnapshot.fixed_income_percent,
      alternatives: latestSnapshot.alternatives_percent,
      cash: latestSnapshot.cash_percent,
    },
  };
}
