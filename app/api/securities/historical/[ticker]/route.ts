// app/api/securities/historical/[ticker]/route.ts
// API para obtener datos históricos de una acción

import { NextRequest, NextResponse } from "next/server";
import { requireAdvisor } from "@/lib/auth/api-auth";

interface YahooChartResult {
  chart: {
    result: Array<{
      meta: {
        currency: string;
        symbol: string;
        regularMarketPrice: number;
      };
      timestamp: number[];
      indicators: {
        quote: Array<{
          open: number[];
          high: number[];
          low: number[];
          close: number[];
          volume: number[];
        }>;
        adjclose?: Array<{
          adjclose: number[];
        }>;
      };
    }>;
    error?: {
      code: string;
      description: string;
    };
  };
}

interface HistoricalDataPoint {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  adjClose?: number;
}

type RangeType = "1mo" | "3mo" | "6mo" | "1y" | "2y" | "5y" | "max";
type IntervalType = "1d" | "1wk" | "1mo";

const RANGE_INTERVALS: Record<RangeType, IntervalType> = {
  "1mo": "1d",
  "3mo": "1d",
  "6mo": "1d",
  "1y": "1wk",
  "2y": "1wk",
  "5y": "1mo",
  "max": "1mo",
};

async function fetchYahooHistorical(
  ticker: string,
  range: RangeType = "1y"
): Promise<HistoricalDataPoint[]> {
  try {
    const interval = RANGE_INTERVALS[range] || "1d";
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=${interval}&range=${range}`;

    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      next: { revalidate: 3600 }, // Cache por 1 hora
    });

    if (!response.ok) {
      console.error(`Yahoo Finance historical error for ${ticker}:`, response.status);
      return [];
    }

    const data: YahooChartResult = await response.json();

    if (data.chart.error || !data.chart.result || data.chart.result.length === 0) {
      console.error(`No historical data for ${ticker}`);
      return [];
    }

    const result = data.chart.result[0];
    const timestamps = result.timestamp || [];
    const quote = result.indicators.quote[0];
    const adjclose = result.indicators.adjclose?.[0]?.adjclose;

    const historicalData: HistoricalDataPoint[] = [];

    for (let i = 0; i < timestamps.length; i++) {
      // Saltar días con datos nulos
      if (quote.close[i] == null) continue;

      historicalData.push({
        date: new Date(timestamps[i] * 1000).toISOString().split("T")[0],
        open: quote.open[i] || quote.close[i],
        high: quote.high[i] || quote.close[i],
        low: quote.low[i] || quote.close[i],
        close: quote.close[i],
        volume: quote.volume[i] || 0,
        adjClose: adjclose ? adjclose[i] : quote.close[i],
      });
    }

    return historicalData;
  } catch (error) {
    console.error(`Error fetching Yahoo historical for ${ticker}:`, error);
    return [];
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  // Verificar autenticación
  const { error: authError } = await requireAdvisor();
  if (authError) return authError;

  const { ticker } = await params;

  if (!ticker) {
    return NextResponse.json(
      { success: false, error: "Ticker es requerido" },
      { status: 400 }
    );
  }

  const { searchParams } = new URL(request.url);
  const range = (searchParams.get("range") || "1y") as RangeType;

  // Validar range
  const validRanges: RangeType[] = ["1mo", "3mo", "6mo", "1y", "2y", "5y", "max"];
  if (!validRanges.includes(range)) {
    return NextResponse.json(
      { success: false, error: `Range inválido. Use: ${validRanges.join(", ")}` },
      { status: 400 }
    );
  }

  try {
    const historical = await fetchYahooHistorical(ticker, range);

    if (historical.length === 0) {
      return NextResponse.json(
        { success: false, error: `No se encontraron datos históricos para ${ticker}` },
        { status: 404 }
      );
    }

    // Calcular algunas métricas
    const firstPrice = historical[0].close;
    const lastPrice = historical[historical.length - 1].close;
    const totalReturn = ((lastPrice - firstPrice) / firstPrice) * 100;

    // Calcular volatilidad (desviación estándar de retornos)
    const returns: number[] = [];
    for (let i = 1; i < historical.length; i++) {
      const dailyReturn = (historical[i].close - historical[i - 1].close) / historical[i - 1].close;
      returns.push(dailyReturn);
    }

    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
    const volatility = Math.sqrt(variance) * Math.sqrt(252) * 100; // Anualizado

    return NextResponse.json({
      success: true,
      ticker: ticker.toUpperCase(),
      range,
      data: historical,
      metrics: {
        totalReturn: totalReturn.toFixed(2),
        volatility: volatility.toFixed(2),
        dataPoints: historical.length,
        startDate: historical[0].date,
        endDate: historical[historical.length - 1].date,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error obteniendo datos históricos";
    console.error("Historical error:", error);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
