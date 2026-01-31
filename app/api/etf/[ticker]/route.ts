import { NextRequest, NextResponse } from "next/server";
import { ETF_DATABASE } from "@/lib/ETF_DATABASE";

const ALPHA_VANTAGE_API_KEY = process.env.ALPHA_VANTAGE_API_KEY ?? "";

interface RouteParams {
  params: Promise<{
    ticker: string;
  }>;
}

export async function GET(request: NextRequest, context: RouteParams) {
  try {
    const resolvedParams = await context.params;
    const ticker = resolvedParams.ticker.toUpperCase();
    const period = request.nextUrl.searchParams.get("period") || "5y";

    console.log(`Fetching ${ticker} - Period: ${period}`);

    // 1. Precio actual
    const quoteUrl = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${ticker}&apikey=${ALPHA_VANTAGE_API_KEY}`;
    const quoteResponse = await fetch(quoteUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    const quoteData = await quoteResponse.json();
    console.log("Quote data:", JSON.stringify(quoteData).substring(0, 200));
    
    if (!quoteData["Global Quote"] || Object.keys(quoteData["Global Quote"]).length === 0) {
      throw new Error("No se pudo obtener precio actual del ETF");
    }

    const currentPrice = parseFloat(quoteData["Global Quote"]["05. price"]);
    console.log(`Precio: $${currentPrice}`);

    // Esperar 12 segundos para evitar rate limit (5 requests/minuto = 1 cada 12 seg)
    console.log("Esperando 12s para evitar rate limit...");
    await new Promise(resolve => setTimeout(resolve, 12000));

    // 2. Datos históricos
    const outputSize = period === "1y" ? "compact" : "full";
    const timeFunction = period === "1y" ? "TIME_SERIES_DAILY" : "TIME_SERIES_WEEKLY";
    
    const historicalUrl = `https://www.alphavantage.co/query?function=${timeFunction}&symbol=${ticker}&outputsize=${outputSize}&apikey=${ALPHA_VANTAGE_API_KEY}`;
    const historicalResponse = await fetch(historicalUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    const historicalData = await historicalResponse.json();
    console.log("Historical data keys:", Object.keys(historicalData));
    
    const timeSeriesKey = period === "1y" ? "Time Series (Daily)" : "Weekly Time Series";
    
    // Verificar si hay un mensaje de error o rate limit
    if (historicalData.Information) {
      console.error("⚠️ Alpha Vantage dice:", historicalData.Information);
      throw new Error(`Alpha Vantage: ${historicalData.Information}`);
    }
    
    if (historicalData.Note) {
      console.error("⚠️ Rate limit:", historicalData.Note);
      throw new Error("Rate limit excedido. Espera 1 minuto.");
    }
    
    if (!historicalData[timeSeriesKey]) {
      console.error("❌ No time series data. Response:", historicalData);
      throw new Error("No se pudieron obtener datos históricos");
    }

    const timeSeries = historicalData[timeSeriesKey];
    const historicalPoints = Object.entries(timeSeries)
      .map(([date, values]: [string, any]) => ({
        date,
        value: parseFloat(values["4. close"]),
      }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    console.log(`Puntos históricos: ${historicalPoints.length}`);

    // Filtrar según período
    const now = new Date();
    let filteredHistorical = historicalPoints;
    
    if (period === "1y") {
      const oneYearAgo = new Date(now);
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
      filteredHistorical = historicalPoints.filter(
        (p) => new Date(p.date) >= oneYearAgo
      );
    } else if (period === "5y") {
      const fiveYearsAgo = new Date(now);
      fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);
      filteredHistorical = historicalPoints.filter(
        (p) => new Date(p.date) >= fiveYearsAgo
      );
    } else if (period === "10y") {
      const tenYearsAgo = new Date(now);
      tenYearsAgo.setFullYear(tenYearsAgo.getFullYear() - 10);
      filteredHistorical = historicalPoints.filter(
        (p) => new Date(p.date) >= tenYearsAgo
      );
    } else if (period === "max") {
      filteredHistorical = historicalPoints;
    }

    console.log(`Puntos filtrados: ${filteredHistorical.length}`);

    // Calcular retornos
    const calculate1YReturn = () => {
      if (filteredHistorical.length < 2) return 0;
      
      const oneYearAgo = new Date(now);
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
      
      const recentData = filteredHistorical.filter(
        (p) => new Date(p.date) >= oneYearAgo
      );
      
      if (recentData.length < 2) return 0;
      
      const oldest = recentData[0].value;
      const newest = recentData[recentData.length - 1].value;
      
      return ((newest - oldest) / oldest) * 100;
    };

    const calculate5YReturn = () => {
      if (filteredHistorical.length < 2) return 0;
      
      const oldest = filteredHistorical[0].value;
      const newest = filteredHistorical[filteredHistorical.length - 1].value;
      
      return ((newest - oldest) / oldest) * 100;
    };

    const return1Y = calculate1YReturn();
    const return5Y = calculate5YReturn();

    console.log(`Retorno 1Y: ${return1Y.toFixed(2)}%`);
    console.log(`Retorno 5Y: ${return5Y.toFixed(2)}%`);

    // 3. Datos del ETF desde la base de datos central (70 ETFs)
    const etfEntry = ETF_DATABASE[ticker];
    const etfInfo = etfEntry
      ? { name: etfEntry.name, expenseRatio: etfEntry.expenseRatio, dividendYield: etfEntry.dividendYield }
      : { name: ticker, expenseRatio: 0, dividendYield: 0 };

    // Respuesta
    const response = {
      ticker: ticker,
      name: etfInfo.name,
      price: currentPrice,
      change1Y: return1Y,
      change5Y: return5Y,
      expenseRatio: etfInfo.expenseRatio,
      dividendYield: etfInfo.dividendYield,
      historical: filteredHistorical,
      dataPoints: filteredHistorical.length,
    };

    console.log(`✅ Success! Sending ${response.dataPoints} data points`);

    return NextResponse.json(response);

  } catch (error: any) {
    console.error("❌ ERROR:", error.message);
    return NextResponse.json(
      { 
        error: error.message || "Error al obtener datos",
        ticker: (await context.params).ticker,
      },
      { status: 500 }
    );
  }
}
