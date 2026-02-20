// app/api/funds/full-profile/route.ts
// Obtiene perfil completo de un fondo: precio actual, datos históricos y perfil ETF
// Optimizado para API pagada de Alpha Vantage (75 req/min)

import { NextRequest, NextResponse } from "next/server";

const ALPHA_VANTAGE_API_KEY = process.env.ALPHA_VANTAGE_API_KEY;
const BASE_URL = "https://www.alphavantage.co/query";

interface HistoricalData {
  date: string;
  close: number;
}

function calculateReturns(historicalData: HistoricalData[]) {
  if (historicalData.length < 2) return {};

  const sortedData = [...historicalData].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  const currentPrice = sortedData[0]?.close;
  if (!currentPrice) return {};

  const now = new Date();
  const returns: Record<string, number | null> = {};

  // YTD - desde el inicio del año
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const ytdData = sortedData.find(
    (d) => new Date(d.date) <= startOfYear
  );
  if (ytdData) {
    returns.ytd = ((currentPrice - ytdData.close) / ytdData.close) * 100;
  }

  // 1 mes
  const oneMonthAgo = new Date(now);
  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
  const oneMonthData = sortedData.find(
    (d) => new Date(d.date) <= oneMonthAgo
  );
  if (oneMonthData) {
    returns["1m"] = ((currentPrice - oneMonthData.close) / oneMonthData.close) * 100;
  }

  // 3 meses
  const threeMonthsAgo = new Date(now);
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
  const threeMonthData = sortedData.find(
    (d) => new Date(d.date) <= threeMonthsAgo
  );
  if (threeMonthData) {
    returns["3m"] = ((currentPrice - threeMonthData.close) / threeMonthData.close) * 100;
  }

  // 6 meses
  const sixMonthsAgo = new Date(now);
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const sixMonthData = sortedData.find(
    (d) => new Date(d.date) <= sixMonthsAgo
  );
  if (sixMonthData) {
    returns["6m"] = ((currentPrice - sixMonthData.close) / sixMonthData.close) * 100;
  }

  // 1 año
  const oneYearAgo = new Date(now);
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  const oneYearData = sortedData.find(
    (d) => new Date(d.date) <= oneYearAgo
  );
  if (oneYearData) {
    returns["1y"] = ((currentPrice - oneYearData.close) / oneYearData.close) * 100;
  }

  // 3 años
  const threeYearsAgo = new Date(now);
  threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3);
  const threeYearData = sortedData.find(
    (d) => new Date(d.date) <= threeYearsAgo
  );
  if (threeYearData) {
    returns["3y"] = ((currentPrice - threeYearData.close) / threeYearData.close) * 100;
  }

  // 5 años
  const fiveYearsAgo = new Date(now);
  fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);
  const fiveYearData = sortedData.find(
    (d) => new Date(d.date) <= fiveYearsAgo
  );
  if (fiveYearData) {
    returns["5y"] = ((currentPrice - fiveYearData.close) / fiveYearData.close) * 100;
  }

  // 10 años
  const tenYearsAgo = new Date(now);
  tenYearsAgo.setFullYear(tenYearsAgo.getFullYear() - 10);
  const tenYearData = sortedData.find(
    (d) => new Date(d.date) <= tenYearsAgo
  );
  if (tenYearData) {
    returns["10y"] = ((currentPrice - tenYearData.close) / tenYearData.close) * 100;
  }

  return returns;
}

export async function GET(request: NextRequest) {
  if (!ALPHA_VANTAGE_API_KEY) {
    return NextResponse.json(
      { success: false, error: "Alpha Vantage API key not configured" },
      { status: 500 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get("symbol");

    if (!symbol) {
      return NextResponse.json(
        { success: false, error: "Symbol is required" },
        { status: 400 }
      );
    }

    // Hacer todas las llamadas en paralelo para aprovechar la API pagada
    const [quoteResponse, weeklyResponse, overviewResponse, etfResponse] = await Promise.all([
      // 1. Precio actual
      fetch(`${BASE_URL}?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${ALPHA_VANTAGE_API_KEY}`),
      // 2. Datos semanales (para calcular retornos históricos)
      fetch(`${BASE_URL}?function=TIME_SERIES_WEEKLY&symbol=${symbol}&apikey=${ALPHA_VANTAGE_API_KEY}`),
      // 3. Overview (para acciones/ETFs)
      fetch(`${BASE_URL}?function=OVERVIEW&symbol=${symbol}&apikey=${ALPHA_VANTAGE_API_KEY}`),
      // 4. ETF Profile (si es un ETF)
      fetch(`${BASE_URL}?function=ETF_PROFILE&symbol=${symbol}&apikey=${ALPHA_VANTAGE_API_KEY}`),
    ]);

    const [quoteData, weeklyData, overviewData, etfData] = await Promise.all([
      quoteResponse.json(),
      weeklyResponse.json(),
      overviewResponse.json(),
      etfResponse.json(),
    ]);

    // Log para debug
    console.log("Full profile for:", symbol);

    // Verificar rate limit - solo si contiene palabras clave específicas
    const message = quoteData.Note || quoteData.Information || "";
    const isRateLimited = message.toLowerCase().includes("rate limit") ||
                          message.toLowerCase().includes("api call frequency") ||
                          message.toLowerCase().includes("premium") ||
                          message.toLowerCase().includes("thank you for using");

    if (isRateLimited) {
      console.warn("Alpha Vantage rate limited:", message);
      return NextResponse.json({
        success: false,
        error: "API rate limit",
        rateLimited: true,
      });
    }

    // Extraer precio actual
    const quote = quoteData["Global Quote"] || {};
    const currentPrice = parseFloat(quote["05. price"]) || null;
    const previousClose = parseFloat(quote["08. previous close"]) || null;
    const changePercent = quote["10. change percent"]
      ? parseFloat(quote["10. change percent"].replace("%", ""))
      : null;

    // Procesar datos históricos para calcular retornos
    const weeklyTimeSeries = weeklyData["Weekly Time Series"] || {};
    const historicalData: HistoricalData[] = Object.entries(weeklyTimeSeries)
      .map(([date, values]: [string, any]) => ({
        date,
        close: parseFloat(values["4. close"]),
      }))
      .filter((d) => !isNaN(d.close));

    const calculatedReturns = calculateReturns(historicalData);

    // Determinar si es ETF o acción
    const isETF = etfData.net_assets || etfData.asset_class || overviewData.AssetType === "ETF";

    // Expense ratio (solo para ETFs)
    let expenseRatio = null;
    if (etfData.net_expense_ratio) {
      expenseRatio = parseFloat(etfData.net_expense_ratio);
    }

    // Construir respuesta
    const profile = {
      symbol,
      name: overviewData.Name || etfData.name || symbol,
      description: overviewData.Description || "",
      assetType: isETF ? "ETF" : (overviewData.AssetType || "Equity"),
      sector: overviewData.Sector || etfData.sector || "",
      industry: overviewData.Industry || "",

      // Precio actual
      price: {
        current: currentPrice,
        previousClose,
        changePercent,
        currency: overviewData.Currency || "USD",
      },

      // Costos
      expenseRatio,

      // Retornos calculados desde datos históricos
      returns: {
        "1m": calculatedReturns["1m"] || null,
        "3m": calculatedReturns["3m"] || null,
        "6m": calculatedReturns["6m"] || null,
        ytd: calculatedReturns.ytd || null,
        "1y": calculatedReturns["1y"] || null,
        "3y": calculatedReturns["3y"] || null,
        "5y": calculatedReturns["5y"] || null,
        "10y": calculatedReturns["10y"] || null,
      },

      // Datos adicionales
      marketCap: overviewData.MarketCapitalization
        ? parseInt(overviewData.MarketCapitalization)
        : null,
      peRatio: overviewData.PERatio ? parseFloat(overviewData.PERatio) : null,
      dividendYield: overviewData.DividendYield
        ? parseFloat(overviewData.DividendYield)
        : etfData.dividend_yield
          ? parseFloat(etfData.dividend_yield)
          : null,
      beta: overviewData.Beta ? parseFloat(overviewData.Beta) : null,
      "52WeekHigh": overviewData["52WeekHigh"]
        ? parseFloat(overviewData["52WeekHigh"])
        : null,
      "52WeekLow": overviewData["52WeekLow"]
        ? parseFloat(overviewData["52WeekLow"])
        : null,

      // Holdings (solo ETFs)
      holdings: etfData.holdings || [],
      netAssets: etfData.net_assets || null,

      source: "alphavantage",
      isETF,
    };

    return NextResponse.json({
      success: true,
      profile,
    });
  } catch (error: any) {
    console.error("Error obteniendo perfil completo:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Error al obtener perfil",
      },
      { status: 500 }
    );
  }
}
