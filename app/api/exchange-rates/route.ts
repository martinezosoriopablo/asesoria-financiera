// app/api/exchange-rates/route.ts
// Obtiene tasas de cambio desde el Banco Central de Chile

import { NextResponse } from "next/server";

const BCCH_API_URL = "https://si3.bcentral.cl/SieteRestWS/SieteRestWS.ashx";
const BCCH_USER = process.env.BCCH_API_USER || "";
const BCCH_PASSWORD = process.env.BCCH_API_PASSWORD || "";

// Series del Banco Central
const SERIES = {
  dolar_obs: "F073.TCO.PRE.Z.D", // Dólar observado (pesos por dólar)
  uf: "F073.UFF.PRE.Z.D",        // UF diaria (pesos por UF)
};

interface BCCHResponse {
  Series?: {
    Obs?: Array<{
      value: string;
      statusCode: string;
    }>;
  };
  Codigo?: number;
  Descripcion?: string;
}

// Cache simple en memoria (5 minutos)
let cache: {
  data: { usd: number; uf: number; timestamp: string } | null;
  expiry: number;
} = { data: null, expiry: 0 };

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutos

async function fetchSeriesValue(seriesId: string): Promise<number | null> {
  try {
    // Usar fecha de hoy y ayer para asegurar obtener el último valor
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 5); // 5 días atrás por si hay feriados

    const formatDate = (d: Date) => d.toISOString().split("T")[0];

    const params = new URLSearchParams({
      user: BCCH_USER,
      pass: BCCH_PASSWORD,
      function: "GetSeries",
      timeseries: seriesId,
      firstdate: formatDate(yesterday),
      lastdate: formatDate(today),
    });

    const response = await fetch(`${BCCH_API_URL}?${params.toString()}`, {
      headers: {
        "Accept": "application/json",
      },
      next: { revalidate: 300 }, // Cache por 5 minutos
    });

    if (!response.ok) {
      console.error(`BCCH API error: ${response.status}`);
      return null;
    }

    const data: BCCHResponse = await response.json();

    if (data.Codigo && data.Codigo !== 0) {
      console.error(`BCCH API error: ${data.Descripcion}`);
      return null;
    }

    // Obtener el último valor disponible
    const observations = data.Series?.Obs;
    if (!observations || observations.length === 0) {
      console.error(`No observations for series ${seriesId}`);
      return null;
    }

    // Buscar el último valor válido (statusCode OK)
    for (let i = observations.length - 1; i >= 0; i--) {
      if (observations[i].statusCode === "OK" && observations[i].value) {
        return parseFloat(observations[i].value);
      }
    }

    return null;
  } catch (error) {
    console.error(`Error fetching series ${seriesId}:`, error);
    return null;
  }
}

export async function GET() {
  try {
    // Verificar cache
    if (cache.data && Date.now() < cache.expiry) {
      return NextResponse.json({
        success: true,
        ...cache.data,
        cached: true,
      });
    }

    // Verificar credenciales
    if (!BCCH_USER || !BCCH_PASSWORD) {
      console.error("BCCH credentials not configured");
      // Retornar valores por defecto si no hay credenciales
      return NextResponse.json({
        success: true,
        usd: 980,
        uf: 38500,
        timestamp: new Date().toISOString(),
        fallback: true,
      });
    }

    // Obtener ambas series en paralelo
    const [usdValue, ufValue] = await Promise.all([
      fetchSeriesValue(SERIES.dolar_obs),
      fetchSeriesValue(SERIES.uf),
    ]);

    const result = {
      usd: usdValue || 980,    // Fallback si falla
      uf: ufValue || 38500,    // Fallback si falla
      timestamp: new Date().toISOString(),
      fallback: !usdValue || !ufValue,
    };

    // Guardar en cache
    cache = {
      data: result,
      expiry: Date.now() + CACHE_DURATION,
    };

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error("Error fetching exchange rates:", error);

    // Retornar valores por defecto en caso de error
    return NextResponse.json({
      success: true,
      usd: 980,
      uf: 38500,
      timestamp: new Date().toISOString(),
      fallback: true,
      error: "Using fallback values",
    });
  }
}
