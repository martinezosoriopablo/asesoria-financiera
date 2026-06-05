// lib/uf.ts — Fetch current UF value
// Primary: Banco Central de Chile (BCCH). Fallback: mindicador.cl

import { getUF as getBcchUF } from "@/lib/bcch";

let cachedUF: { value: number; timestamp: number } | null = null;
const CACHE_TTL = 1000 * 60 * 60; // 1 hour

export async function getUFValue(): Promise<number> {
  if (cachedUF && Date.now() - cachedUF.timestamp < CACHE_TTL) {
    return cachedUF.value;
  }

  // Primary: Banco Central de Chile
  try {
    const today = new Date().toISOString().split("T")[0];
    const valor = await getBcchUF(today);
    cachedUF = { value: Math.round(valor * 100) / 100, timestamp: Date.now() };
    return cachedUF.value;
  } catch {
    // BCCH failed, try mindicador.cl
  }

  // Fallback: mindicador.cl
  try {
    const res = await fetch("https://mindicador.cl/api/uf", { next: { revalidate: 3600 }, signal: AbortSignal.timeout(15000) });
    const data = await res.json();
    const valor = data?.serie?.[0]?.valor;
    if (typeof valor === "number" && valor > 0) {
      cachedUF = { value: Math.round(valor * 100) / 100, timestamp: Date.now() };
      return cachedUF.value;
    }
  } catch {
    // both failed
  }

  return 38000; // static fallback — last resort
}

export function clpToUF(clp: number, ufValue: number): number {
  if (ufValue <= 0) return 0;
  return clp / ufValue;
}

export function ufToCLP(uf: number, ufValue: number): number {
  return uf * ufValue;
}

export function formatUF(uf: number): string {
  return `UF ${uf.toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatCLP(clp: number): string {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(clp);
}
