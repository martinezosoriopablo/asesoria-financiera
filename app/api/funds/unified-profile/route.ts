// app/api/funds/unified-profile/route.ts
// API unificada que intenta obtener datos de múltiples fuentes:
// 1. Alpha Vantage (principal)
// 2. Yahoo Finance (fallback)
// 3. Massive.com (fallback para acciones)

import { NextRequest, NextResponse } from "next/server";
import { findYahooSymbol } from "@/lib/yahoo-finance-mapping";

const ALPHA_VANTAGE_API_KEY = process.env.ALPHA_VANTAGE_API_KEY;
const ALPHA_VANTAGE_URL = "https://www.alphavantage.co/query";

interface FundProfile {
  symbol: string;
  name: string;
  currency: string;
  price?: {
    current: number | null;
    previousClose: number | null;
    changePercent: number | null;
  };
  returns?: {
    "1m"?: number | null;
    "3m"?: number | null;
    "6m"?: number | null;
    ytd?: number | null;
    "1y"?: number | null;
    "3y"?: number | null;
    "5y"?: number | null;
  };
  expenseRatio?: number | null;
  dividendYield?: number | null;
  beta?: number | null;
  assetType?: string;
  source: "alphavantage" | "yahoo" | "massive";
  historicalData?: { date: string; close: number }[];
}

// ============================================================
// ALPHA VANTAGE
// ============================================================
async function fetchFromAlphaVantage(symbol: string): Promise<FundProfile | null> {
  if (!ALPHA_VANTAGE_API_KEY) {
    console.log("Alpha Vantage API key not configured");
    return null;
  }

  try {
    const [quoteResponse, weeklyResponse, overviewResponse, etfResponse] = await Promise.all([
      fetch(`${ALPHA_VANTAGE_URL}?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${ALPHA_VANTAGE_API_KEY}`),
      fetch(`${ALPHA_VANTAGE_URL}?function=TIME_SERIES_WEEKLY&symbol=${symbol}&apikey=${ALPHA_VANTAGE_API_KEY}`),
      fetch(`${ALPHA_VANTAGE_URL}?function=OVERVIEW&symbol=${symbol}&apikey=${ALPHA_VANTAGE_API_KEY}`),
      fetch(`${ALPHA_VANTAGE_URL}?function=ETF_PROFILE&symbol=${symbol}&apikey=${ALPHA_VANTAGE_API_KEY}`),
    ]);

    const [quoteData, weeklyData, overviewData, etfData] = await Promise.all([
      quoteResponse.json(),
      weeklyResponse.json(),
      overviewResponse.json(),
      etfResponse.json(),
    ]);

    // Check for rate limit or errors
    const message = quoteData.Note || quoteData.Information || "";
    const isRateLimited = message.toLowerCase().includes("rate limit") ||
                          message.toLowerCase().includes("api call frequency") ||
                          message.toLowerCase().includes("premium");

    if (isRateLimited) {
      console.log(`Alpha Vantage rate limited for ${symbol}`);
      return null;
    }

    // Check if we got valid data
    const quote = quoteData["Global Quote"] || {};
    const currentPrice = parseFloat(quote["05. price"]);

    if (!currentPrice || isNaN(currentPrice)) {
      console.log(`No price data from Alpha Vantage for ${symbol}`);
      return null;
    }

    // Process historical data
    const weeklyTimeSeries = weeklyData["Weekly Time Series"] || {};
    const historicalData = Object.entries(weeklyTimeSeries)
      .map(([date, values]: [string, any]) => ({
        date,
        close: parseFloat(values["4. close"]),
      }))
      .filter((d) => !isNaN(d.close))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    // Calculate returns
    const returns = calculateReturns(historicalData, currentPrice);

    const isETF = etfData.net_assets || etfData.asset_class || overviewData.AssetType === "ETF";

    return {
      symbol,
      name: overviewData.Name || etfData.name || symbol,
      currency: overviewData.Currency || "USD",
      price: {
        current: currentPrice,
        previousClose: parseFloat(quote["08. previous close"]) || null,
        changePercent: quote["10. change percent"]
          ? parseFloat(quote["10. change percent"].replace("%", ""))
          : null,
      },
      returns,
      // Alpha Vantage returns expense ratio as decimal (0.0003 = 0.03%), convert to percentage
      expenseRatio: etfData.net_expense_ratio ? parseFloat(etfData.net_expense_ratio) * 100 : null,
      // Dividend yield: OVERVIEW returns as percentage, ETF_PROFILE returns as decimal
      dividendYield: overviewData.DividendYield
        ? parseFloat(overviewData.DividendYield) * 100  // OVERVIEW format needs conversion too
        : etfData.dividend_yield
          ? parseFloat(etfData.dividend_yield) * 100    // ETF_PROFILE returns decimal (0.011 = 1.1%)
          : null,
      beta: overviewData.Beta ? parseFloat(overviewData.Beta) : null,
      assetType: isETF ? "ETF" : (overviewData.AssetType || "Equity"),
      source: "alphavantage",
      historicalData,
    };
  } catch (error) {
    console.error("Alpha Vantage error:", error);
    return null;
  }
}

// ============================================================
// YAHOO FINANCE
// ============================================================
async function fetchFromYahooFinance(symbol: string, fundName?: string): Promise<FundProfile | null> {
  try {
    // Try to find Yahoo symbol if we have a fund name
    let yahooSymbol = symbol;
    if (fundName) {
      const mapping = findYahooSymbol(fundName);
      if (mapping) {
        yahooSymbol = mapping.yahooSymbol;
      }
    }

    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=1mo&range=1y`;

    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
      }
    });

    if (!response.ok) {
      console.log(`Yahoo Finance returned ${response.status} for ${yahooSymbol}`);
      return null;
    }

    const data = await response.json();

    if (data.chart?.error) {
      console.log(`Yahoo Finance error for ${yahooSymbol}:`, data.chart.error.description);
      return null;
    }

    const result = data.chart?.result?.[0];
    if (!result) {
      console.log(`No Yahoo Finance data for ${yahooSymbol}`);
      return null;
    }

    const meta = result.meta;
    const timestamps = result.timestamp || [];
    const quotes = result.indicators?.quote?.[0] || {};
    const adjClose = result.indicators?.adjclose?.[0]?.adjclose || quotes.close || [];

    // Build historical data
    const historicalData = timestamps.map((ts: number, index: number) => ({
      date: new Date(ts * 1000).toISOString().split("T")[0],
      close: adjClose[index] ?? quotes.close?.[index] ?? null,
    })).filter((d: any) => d.close !== null);

    if (historicalData.length === 0) {
      console.log(`No historical data from Yahoo for ${yahooSymbol}`);
      return null;
    }

    const currentPrice = meta?.regularMarketPrice || historicalData[historicalData.length - 1]?.close;
    const returns = calculateReturnsFromMonthly(historicalData);

    return {
      symbol: yahooSymbol,
      name: meta?.longName || meta?.shortName || fundName || symbol,
      currency: meta?.currency || "USD",
      price: {
        current: currentPrice,
        previousClose: null,
        changePercent: null,
      },
      returns,
      assetType: "Fund",
      source: "yahoo",
      historicalData,
    };
  } catch (error) {
    console.error("Yahoo Finance error:", error);
    return null;
  }
}

// ============================================================
// MASSIVE.COM (placeholder - requires MCP integration)
// ============================================================
async function fetchFromMassive(symbol: string): Promise<FundProfile | null> {
  // Massive.com is integrated via MCP, not direct API
  // This would need to be called differently in the frontend
  // For now, return null as it's not directly accessible from API routes
  console.log(`Massive.com fallback not available for ${symbol} in API route`);
  return null;
}

// ============================================================
// HELPERS
// ============================================================
function calculateReturns(historicalData: { date: string; close: number }[], currentPrice: number) {
  if (historicalData.length < 2) return {};

  const now = new Date();
  const returns: Record<string, number | null> = {};

  const findPriceAtDate = (targetDate: Date): number | null => {
    const found = historicalData.find((d) => new Date(d.date) <= targetDate);
    return found?.close || null;
  };

  // 1 month
  const oneMonthAgo = new Date(now);
  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
  const price1m = findPriceAtDate(oneMonthAgo);
  if (price1m) returns["1m"] = ((currentPrice - price1m) / price1m) * 100;

  // 3 months
  const threeMonthsAgo = new Date(now);
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
  const price3m = findPriceAtDate(threeMonthsAgo);
  if (price3m) returns["3m"] = ((currentPrice - price3m) / price3m) * 100;

  // 6 months
  const sixMonthsAgo = new Date(now);
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const price6m = findPriceAtDate(sixMonthsAgo);
  if (price6m) returns["6m"] = ((currentPrice - price6m) / price6m) * 100;

  // 1 year
  const oneYearAgo = new Date(now);
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  const price1y = findPriceAtDate(oneYearAgo);
  if (price1y) returns["1y"] = ((currentPrice - price1y) / price1y) * 100;

  // YTD
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const priceYtd = findPriceAtDate(startOfYear);
  if (priceYtd) returns.ytd = ((currentPrice - priceYtd) / priceYtd) * 100;

  // 3 years
  const threeYearsAgo = new Date(now);
  threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3);
  const price3y = findPriceAtDate(threeYearsAgo);
  if (price3y) returns["3y"] = ((currentPrice - price3y) / price3y) * 100;

  // 5 years
  const fiveYearsAgo = new Date(now);
  fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);
  const price5y = findPriceAtDate(fiveYearsAgo);
  if (price5y) returns["5y"] = ((currentPrice - price5y) / price5y) * 100;

  return returns;
}

function calculateReturnsFromMonthly(historicalData: { date: string; close: number }[]) {
  if (historicalData.length < 2) return {};

  const sorted = [...historicalData].sort((a, b) =>
    new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  const latestPrice = sorted[sorted.length - 1].close;
  const returns: Record<string, number | null> = {};

  // 1 month
  if (sorted.length >= 2) {
    const price = sorted[sorted.length - 2].close;
    returns["1m"] = ((latestPrice - price) / price) * 100;
  }

  // 3 months
  if (sorted.length >= 4) {
    const price = sorted[sorted.length - 4].close;
    returns["3m"] = ((latestPrice - price) / price) * 100;
  }

  // 6 months
  if (sorted.length >= 7) {
    const price = sorted[sorted.length - 7].close;
    returns["6m"] = ((latestPrice - price) / price) * 100;
  }

  // 1 year
  if (sorted.length >= 12) {
    const price = sorted[0].close;
    returns["1y"] = ((latestPrice - price) / price) * 100;
  }

  // YTD approximation
  const januaryData = sorted.find(d => d.date.includes("-01-"));
  if (januaryData) {
    returns.ytd = ((latestPrice - januaryData.close) / januaryData.close) * 100;
  }

  return returns;
}

// ============================================================
// MAIN API HANDLER
// ============================================================
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get("symbol");
  const name = searchParams.get("name");
  const skipAlphaVantage = searchParams.get("skipAV") === "true";

  if (!symbol) {
    return NextResponse.json(
      { success: false, error: "Symbol is required" },
      { status: 400 }
    );
  }

  console.log(`\n=== Unified Profile Request: ${symbol} ===`);

  let profile: FundProfile | null = null;
  const attempts: string[] = [];

  // 1. Try Alpha Vantage first (unless skipped)
  if (!skipAlphaVantage) {
    console.log(`1. Trying Alpha Vantage for ${symbol}...`);
    profile = await fetchFromAlphaVantage(symbol);
    if (profile) {
      attempts.push("alphavantage:success");
      console.log(`   ✓ Found in Alpha Vantage`);
    } else {
      attempts.push("alphavantage:failed");
      console.log(`   ✗ Not found in Alpha Vantage`);
    }
  }

  // 2. Try Yahoo Finance as fallback
  if (!profile) {
    console.log(`2. Trying Yahoo Finance for ${symbol}...`);
    profile = await fetchFromYahooFinance(symbol, name || undefined);
    if (profile) {
      attempts.push("yahoo:success");
      console.log(`   ✓ Found in Yahoo Finance`);
    } else {
      attempts.push("yahoo:failed");
      console.log(`   ✗ Not found in Yahoo Finance`);
    }
  }

  // 3. Try Massive.com as last resort (placeholder)
  if (!profile) {
    console.log(`3. Trying Massive.com for ${symbol}...`);
    profile = await fetchFromMassive(symbol);
    if (profile) {
      attempts.push("massive:success");
      console.log(`   ✓ Found in Massive.com`);
    } else {
      attempts.push("massive:failed");
      console.log(`   ✗ Not found in Massive.com`);
    }
  }

  if (!profile) {
    return NextResponse.json({
      success: false,
      error: `No data found for ${symbol}`,
      attempts,
    }, { status: 404 });
  }

  return NextResponse.json({
    success: true,
    profile,
    attempts,
  });
}
