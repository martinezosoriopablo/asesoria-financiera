// app/api/exchange-rates/historical/route.ts
// Proxy for mindicador.cl historical UF/USD data
// Avoids CORS issues from client-side direct calls

import { NextRequest, NextResponse } from "next/server";
import { applyRateLimit } from "@/lib/rate-limit";

// Cache per indicator+year (1 hour)
const cache: Record<string, { data: Array<{ fecha: string; valor: number }>; expiry: number }> = {};
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour

export async function GET(request: NextRequest) {
  const blocked = await applyRateLimit(request, "exchange-rates-historical", { limit: 10, windowSeconds: 60 });
  if (blocked) return blocked;

  const indicator = request.nextUrl.searchParams.get("indicator"); // "uf" or "dolar"
  const year = request.nextUrl.searchParams.get("year");

  if (!indicator || !year || !["uf", "dolar"].includes(indicator)) {
    return NextResponse.json({ success: false, error: "indicator (uf|dolar) and year required" }, { status: 400 });
  }

  const cacheKey = `${indicator}-${year}`;
  if (cache[cacheKey] && Date.now() < cache[cacheKey].expiry) {
    return NextResponse.json({ success: true, serie: cache[cacheKey].data, cached: true });
  }

  try {
    const res = await fetch(`https://mindicador.cl/api/${indicator}/${year}`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) throw new Error(`mindicador ${res.status}`);
    const data = await res.json();
    const serie = (data.serie || []).map((e: { fecha: string; valor: number }) => ({
      fecha: e.fecha.split("T")[0],
      valor: e.valor,
    }));

    cache[cacheKey] = { data: serie, expiry: Date.now() + CACHE_DURATION };
    return NextResponse.json({ success: true, serie });
  } catch {
    return NextResponse.json({ success: true, serie: [] });
  }
}
