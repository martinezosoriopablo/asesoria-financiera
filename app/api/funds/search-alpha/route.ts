// app/api/funds/search-alpha/route.ts
// Busca ETFs y fondos mutuos internacionales usando Alpha Vantage

import { NextRequest, NextResponse } from "next/server";

const ALPHA_VANTAGE_API_KEY = process.env.ALPHA_VANTAGE_API_KEY;

interface AlphaVantageMatch {
  "1. symbol": string;
  "2. name": string;
  "3. type": string;
  "4. region": string;
  "5. marketOpen": string;
  "6. marketClose": string;
  "7. timezone": string;
  "8. currency": string;
  "9. matchScore": string;
}

interface AlphaVantageSearchResponse {
  bestMatches?: AlphaVantageMatch[];
  Note?: string;
  Information?: string;
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
    const query = searchParams.get("q") || "";
    const assetType = searchParams.get("type") || "all"; // etf, mutual_fund, all

    if (query.length < 2) {
      return NextResponse.json({ success: true, funds: [] });
    }

    // Llamar a Alpha Vantage SYMBOL_SEARCH
    const url = `https://www.alphavantage.co/query?function=SYMBOL_SEARCH&keywords=${encodeURIComponent(query)}&apikey=${ALPHA_VANTAGE_API_KEY}`;

    const response = await fetch(url);
    const data: AlphaVantageSearchResponse = await response.json();

    // Log para debug
    console.log("Alpha Vantage response for query:", query, JSON.stringify(data).substring(0, 500));

    // Verificar límite de API - solo si el mensaje contiene palabras clave de rate limit
    const message = data.Note || data.Information || "";
    const isRateLimited = message.toLowerCase().includes("rate limit") ||
                          message.toLowerCase().includes("api call frequency") ||
                          message.toLowerCase().includes("premium") ||
                          message.toLowerCase().includes("thank you for using");

    if (isRateLimited) {
      console.warn("Alpha Vantage rate limited:", message);
      return NextResponse.json({
        success: false,
        error: "Límite de API alcanzado. Intenta en unos segundos.",
        rateLimited: true,
      });
    }

    // Si hay un mensaje pero no es rate limit, loguear pero continuar
    if (message && !data.bestMatches) {
      console.log("Alpha Vantage message (not rate limit):", message);
    }

    if (!data.bestMatches) {
      return NextResponse.json({ success: true, funds: [] });
    }

    // Filtrar por tipo si se especifica
    let matches = data.bestMatches;
    const originalMatches = [...matches];

    if (assetType === "etf") {
      const filtered = matches.filter(m => m["3. type"] === "ETF");
      matches = filtered.length > 0 ? filtered : matches;
    } else if (assetType === "mutual_fund") {
      const filtered = matches.filter(m =>
        m["3. type"] === "Mutual Fund" ||
        m["3. type"].toLowerCase().includes("fund")
      );
      matches = filtered.length > 0 ? filtered : matches;
    } else {
      // "all" - mostrar todos los resultados (ETFs, fondos mutuos, y acciones)
      // No filtramos para no perder resultados útiles
    }

    console.log(`Found ${matches.length} matches for "${query}" (original: ${originalMatches.length})`);
    console.log("Types found:", [...new Set(matches.map(m => m["3. type"]))]);

    // Transformar a formato consistente
    const funds = matches.map((match) => ({
      id: match["1. symbol"],
      symbol: match["1. symbol"],
      name: match["2. name"],
      type: match["3. type"],
      region: match["4. region"],
      currency: match["8. currency"],
      matchScore: parseFloat(match["9. matchScore"]),
      source: "alphavantage",
    }));

    return NextResponse.json({
      success: true,
      funds,
      count: funds.length,
    });
  } catch (error: any) {
    console.error("Error buscando en Alpha Vantage:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Error al buscar fondos",
      },
      { status: 500 }
    );
  }
}
