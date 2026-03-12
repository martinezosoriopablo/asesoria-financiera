// app/api/exchange-rates/route.ts
// Obtiene tasas de cambio desde mindicador.cl (API gratuita)

import { NextResponse } from "next/server";

const MINDICADOR_API = "https://mindicador.cl/api";

interface MindicadorResponse {
  version: string;
  autor: string;
  fecha: string;
  dolar?: { valor: number };
  euro?: { valor: number };
  uf?: { valor: number };
}

// Cache simple en memoria (10 minutos)
let cache: {
  data: { usd: number; eur: number; uf: number; timestamp: string } | null;
  expiry: number;
} = { data: null, expiry: 0 };

const CACHE_DURATION = 10 * 60 * 1000; // 10 minutos

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

    // Obtener datos de mindicador.cl
    const response = await fetch(MINDICADOR_API, {
      headers: {
        "Accept": "application/json",
      },
      next: { revalidate: 600 }, // Cache por 10 minutos
    });

    if (!response.ok) {
      console.error(`mindicador.cl API error: ${response.status}`);
      throw new Error("API error");
    }

    const data: MindicadorResponse = await response.json();

    const result = {
      usd: data.dolar?.valor || 950,
      eur: data.euro?.valor || 1020,
      uf: data.uf?.valor || 38000,
      timestamp: data.fecha || new Date().toISOString(),
      source: "mindicador.cl",
    };

    // Guardar en cache
    cache = {
      data: result,
      expiry: Date.now() + CACHE_DURATION,
    };

    console.log(`Exchange rates updated: USD=${result.usd}, EUR=${result.eur}, UF=${result.uf}`);

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error("Error fetching exchange rates:", error);

    // Si hay cache expirado, usarlo
    if (cache.data) {
      return NextResponse.json({
        success: true,
        ...cache.data,
        cached: true,
        stale: true,
      });
    }

    // Valores de fallback actualizados (marzo 2026)
    return NextResponse.json({
      success: true,
      usd: 950,
      eur: 1020,
      uf: 38000,
      timestamp: new Date().toISOString(),
      fallback: true,
      error: "Using fallback values",
    });
  }
}
