// app/api/funds/etf-profile/route.ts
// Obtiene perfil detallado de un ETF usando Alpha Vantage

import { NextRequest, NextResponse } from "next/server";

const ALPHA_VANTAGE_API_KEY = process.env.ALPHA_VANTAGE_API_KEY;

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

    // Obtener perfil del ETF
    const profileUrl = `https://www.alphavantage.co/query?function=ETF_PROFILE&symbol=${encodeURIComponent(symbol)}&apikey=${ALPHA_VANTAGE_API_KEY}`;
    const profileResponse = await fetch(profileUrl);
    const profileData = await profileResponse.json();

    // Verificar límite de API
    if (profileData.Note || profileData.Information) {
      console.warn("Alpha Vantage API limit:", profileData.Note || profileData.Information);
      return NextResponse.json({
        success: false,
        error: "Límite de API alcanzado. Intenta en unos segundos.",
        rateLimited: true,
      });
    }

    // También obtener overview para datos adicionales como expense ratio
    const overviewUrl = `https://www.alphavantage.co/query?function=OVERVIEW&symbol=${encodeURIComponent(symbol)}&apikey=${ALPHA_VANTAGE_API_KEY}`;
    const overviewResponse = await fetch(overviewUrl);
    const overviewData = await overviewResponse.json();

    // Combinar datos
    const profile = {
      symbol,
      name: profileData.net_assets ? `${symbol} ETF` : overviewData.Name || symbol,
      description: overviewData.Description || profileData.description || "",
      assetType: profileData.asset_class || overviewData.AssetType || "ETF",
      sector: overviewData.Sector || profileData.sector || "",
      netAssets: profileData.net_assets || overviewData.MarketCapitalization || null,
      netExpenseRatio: profileData.net_expense_ratio
        ? parseFloat(profileData.net_expense_ratio)
        : null,
      expenseRatio: overviewData.ExpenseRatio
        ? parseFloat(overviewData.ExpenseRatio)
        : null,
      dividendYield: overviewData.DividendYield
        ? parseFloat(overviewData.DividendYield)
        : profileData.dividend_yield
          ? parseFloat(profileData.dividend_yield)
          : null,
      // Holdings principales si están disponibles
      holdings: profileData.holdings || [],
      // Performance
      "52WeekHigh": overviewData["52WeekHigh"]
        ? parseFloat(overviewData["52WeekHigh"])
        : null,
      "52WeekLow": overviewData["52WeekLow"]
        ? parseFloat(overviewData["52WeekLow"])
        : null,
      // Retornos (si disponibles)
      returns: {
        ytd: profileData.returns_ytd ? parseFloat(profileData.returns_ytd) : null,
        "1y": profileData.returns_1y ? parseFloat(profileData.returns_1y) : null,
        "3y": profileData.returns_3y ? parseFloat(profileData.returns_3y) : null,
        "5y": profileData.returns_5y ? parseFloat(profileData.returns_5y) : null,
      },
      source: "alphavantage",
    };

    return NextResponse.json({
      success: true,
      profile,
      rawProfile: profileData,
      rawOverview: overviewData,
    });
  } catch (error: any) {
    console.error("Error obteniendo perfil de ETF:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Error al obtener perfil",
      },
      { status: 500 }
    );
  }
}
