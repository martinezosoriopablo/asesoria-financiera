// app/api/market-stats/route.ts

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function GET(request: NextRequest) {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { searchParams } = new URL(request.url);
    const assetClass = searchParams.get("asset_class") || "equity";

    // Query para obtener estadísticas por proveedor
    const { data: funds, error } = await supabase
      .from("funds")
      .select("*")
      .eq("asset_class", assetClass)
      .eq("is_active", true);

    if (error) throw error;

    // Agrupar por proveedor
    const statsByProvider: {
      [key: string]: {
        provider: string;
        count: number;
        avgCost: number;
        minCost: number;
        maxCost: number;
        avgReturn1y: number;
        maxReturn1y: number;
        minReturn1y: number;
        avgReturn3y: number;
        funds: any[];
      };
    } = {};

    funds.forEach((fund) => {
      const provider = fund.provider || "Sin Proveedor";

      if (!statsByProvider[provider]) {
        statsByProvider[provider] = {
          provider,
          count: 0,
          avgCost: 0,
          minCost: Infinity,
          maxCost: 0,
          avgReturn1y: 0,
          maxReturn1y: -Infinity,
          minReturn1y: Infinity,
          avgReturn3y: 0,
          funds: [],
        };
      }

      const stats = statsByProvider[provider];
      stats.count++;
      stats.funds.push(fund);

      // Costos
      const cost = fund.total_expense_ratio || 0;
      stats.avgCost += cost;
      stats.minCost = Math.min(stats.minCost, cost);
      stats.maxCost = Math.max(stats.maxCost, cost);

      // Rentabilidades
      if (fund.return_1y !== null) {
        const ret1y = fund.return_1y || 0;
        stats.avgReturn1y += ret1y;
        stats.maxReturn1y = Math.max(stats.maxReturn1y, ret1y);
        stats.minReturn1y = Math.min(stats.minReturn1y, ret1y);
      }

      if (fund.return_3y !== null) {
        stats.avgReturn3y += fund.return_3y || 0;
      }
    });

    // Calcular promedios
    const providersArray = Object.values(statsByProvider).map((stats) => ({
      ...stats,
      avgCost: stats.avgCost / stats.count,
      avgReturn1y: stats.avgReturn1y / stats.count,
      avgReturn3y: stats.avgReturn3y / stats.count,
      minReturn1y: stats.minReturn1y === Infinity ? 0 : stats.minReturn1y,
      maxReturn1y: stats.maxReturn1y === -Infinity ? 0 : stats.maxReturn1y,
      minCost: stats.minCost === Infinity ? 0 : stats.minCost,
    }));

    // Calcular promedios del mercado
    const marketAverage = {
      avgCost:
        providersArray.reduce((sum, p) => sum + p.avgCost * p.count, 0) /
        funds.length,
      avgReturn1y:
        providersArray.reduce((sum, p) => sum + p.avgReturn1y * p.count, 0) /
        funds.length,
      avgReturn3y:
        providersArray.reduce((sum, p) => sum + p.avgReturn3y * p.count, 0) /
        funds.length,
      totalFunds: funds.length,
    };

    // Ordenar por cantidad de fondos (mayor a menor)
    providersArray.sort((a, b) => b.count - a.count);

    return NextResponse.json({
      success: true,
      assetClass,
      providers: providersArray,
      marketAverage,
    });
  } catch (error: any) {
    console.error("Error obteniendo estadísticas:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Error al obtener estadísticas",
      },
      { status: 500 }
    );
  }
}
