import { NextResponse } from "next/server";
import { findYahooSymbol } from "@/lib/yahoo-finance-mapping";

interface YahooChartResult {
  chart?: {
    result?: Array<{
      meta?: {
        symbol?: string;
        currency?: string;
        exchangeName?: string;
        shortName?: string;
        longName?: string;
        regularMarketPrice?: number;
      };
      timestamp?: number[];
      indicators?: {
        quote?: Array<{
          close?: (number | null)[];
          open?: (number | null)[];
          high?: (number | null)[];
          low?: (number | null)[];
          volume?: (number | null)[];
        }>;
        adjclose?: Array<{
          adjclose?: (number | null)[];
        }>;
      };
    }>;
    error?: {
      code?: string;
      description?: string;
    };
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  let symbol = searchParams.get("symbol");
  const fundName = searchParams.get("name");
  const range = searchParams.get("range") || "1y";
  const interval = searchParams.get("interval") || "1mo";

  // If no symbol provided, try to find it by fund name
  if (!symbol && fundName) {
    const mapping = findYahooSymbol(fundName);
    if (mapping) {
      symbol = mapping.yahooSymbol;
    }
  }

  if (!symbol) {
    return NextResponse.json(
      { success: false, error: "Symbol or fund name required" },
      { status: 400 }
    );
  }

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}`;

    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
      }
    });

    if (!response.ok) {
      return NextResponse.json(
        { success: false, error: `Yahoo Finance API error: ${response.status}` },
        { status: response.status }
      );
    }

    const data: YahooChartResult = await response.json();

    if (data.chart?.error) {
      return NextResponse.json(
        { success: false, error: data.chart.error.description },
        { status: 404 }
      );
    }

    const result = data.chart?.result?.[0];
    if (!result) {
      return NextResponse.json(
        { success: false, error: "No data found for symbol" },
        { status: 404 }
      );
    }

    const meta = result.meta;
    const timestamps = result.timestamp || [];
    const quotes = result.indicators?.quote?.[0] || {};
    const adjClose = result.indicators?.adjclose?.[0]?.adjclose || quotes.close || [];

    // Build historical data array
    const historicalData = timestamps.map((ts, index) => ({
      date: new Date(ts * 1000).toISOString().split("T")[0],
      timestamp: ts,
      close: adjClose[index] ?? quotes.close?.[index] ?? null,
      open: quotes.open?.[index] ?? null,
      high: quotes.high?.[index] ?? null,
      low: quotes.low?.[index] ?? null,
      volume: quotes.volume?.[index] ?? null
    })).filter(d => d.close !== null);

    // Calculate returns
    const returns: { period: string; value: number }[] = [];
    if (historicalData.length >= 2) {
      const latestPrice = historicalData[historicalData.length - 1].close!;

      // 1 month return
      if (historicalData.length >= 2) {
        const oneMonthAgo = historicalData[historicalData.length - 2].close!;
        returns.push({ period: "1M", value: ((latestPrice - oneMonthAgo) / oneMonthAgo) * 100 });
      }

      // 3 month return
      if (historicalData.length >= 4) {
        const threeMonthsAgo = historicalData[historicalData.length - 4].close!;
        returns.push({ period: "3M", value: ((latestPrice - threeMonthsAgo) / threeMonthsAgo) * 100 });
      }

      // 6 month return
      if (historicalData.length >= 7) {
        const sixMonthsAgo = historicalData[historicalData.length - 7].close!;
        returns.push({ period: "6M", value: ((latestPrice - sixMonthsAgo) / sixMonthsAgo) * 100 });
      }

      // 1 year return
      if (historicalData.length >= 12) {
        const oneYearAgo = historicalData[0].close!;
        returns.push({ period: "1Y", value: ((latestPrice - oneYearAgo) / oneYearAgo) * 100 });
      }

      // YTD return (approximation based on January data)
      const januaryData = historicalData.find(d => d.date.includes("-01-"));
      if (januaryData) {
        returns.push({ period: "YTD", value: ((latestPrice - januaryData.close!) / januaryData.close!) * 100 });
      }
    }

    return NextResponse.json({
      success: true,
      symbol: meta?.symbol || symbol,
      name: meta?.longName || meta?.shortName || fundName,
      currency: meta?.currency || "USD",
      exchange: meta?.exchangeName,
      currentPrice: meta?.regularMarketPrice,
      historicalData,
      returns,
      dataPoints: historicalData.length
    });
  } catch (error) {
    console.error("Yahoo Finance API error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch data from Yahoo Finance" },
      { status: 500 }
    );
  }
}
