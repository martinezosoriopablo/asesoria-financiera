# Portal Cliente v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Seguimiento (full read-only portfolio tracking) and Mis Servicios pages to the client portal, reusing existing advisor components.

**Architecture:** New portal pages import existing seguimiento components (EvolucionChart, HoldingReturnsPanel, etc.) without modification. New API routes authenticate via `requireClient()` and proxy the same DB queries the advisor uses. RadiografiaCartola gets a `readOnly` prop to hide action buttons.

**Tech Stack:** Next.js 16 App Router, React 19, Supabase, Tailwind v4, lucide-react icons

**Spec:** `docs/superpowers/specs/2026-06-05-portal-cliente-v2-design.md`

---

## File Structure

### New files

| File | Responsibility |
|------|---------------|
| `app/api/portal/seguimiento/route.ts` | GET: snapshots + metrics for authenticated client |
| `app/api/portal/radiografia/route.ts` | POST: radiografía analysis for authenticated client |
| `app/api/portal/historical-prices/route.ts` | POST: proxy historical-prices for authenticated client |
| `app/api/portal/prices-at-date/route.ts` | POST: proxy prices-at-date for authenticated client |
| `app/api/portal/benchmark-config/route.ts` | GET: read-only benchmark config for authenticated client |
| `app/api/portal/servicios/route.ts` | GET: servicios_adicionales + advisor info |
| `app/(portal)/portal/seguimiento/page.tsx` | Seguimiento page — imports SeguimientoPage-like layout with existing components |
| `app/(portal)/portal/mis-servicios/page.tsx` | Mis Servicios page — cards for contracted services |

### Modified files

| File | Change |
|------|--------|
| `components/portal/PortalTopbar.tsx` | Add "Seguimiento" and "Mis Servicios" tabs |
| `components/seguimiento/RadiografiaCartola.tsx` | Accept optional `readOnly` prop, hide action buttons when true |

---

## Task 1: Portal Seguimiento API

**Files:**
- Create: `app/api/portal/seguimiento/route.ts`

- [ ] **Step 1: Create the seguimiento API route**

This route reuses the same `calculateMetrics` logic from the advisor's seguimiento route but authenticates via `requireClient()` instead of `requireAdvisor()`, and gets `clientId` from user metadata instead of URL params.

```typescript
// app/api/portal/seguimiento/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireClient } from "@/lib/auth/require-client";
import { createAdminClient } from "@/lib/auth/api-auth";
import { applyRateLimit } from "@/lib/rate-limit";
import { handleApiError } from "@/lib/api-response";

interface SnapshotRecord {
  id: string;
  client_id: string;
  snapshot_date: string;
  total_value: number;
  total_cost_basis: number | null;
  unrealized_gain_loss: number | null;
  equity_percent: number;
  fixed_income_percent: number;
  alternatives_percent: number;
  cash_percent: number;
  equity_value: number;
  fixed_income_value: number;
  alternatives_value: number;
  cash_value: number;
  holdings: unknown[] | null;
  daily_return: number;
  cumulative_return: number;
  deposits?: number;
  withdrawals?: number;
  net_cash_flow?: number;
  source: string;
  created_at: string;
}

interface PortfolioMetrics {
  totalReturn: number;
  annualizedReturn: number;
  isAnnualized: boolean;
  volatility: number;
  maxDrawdown: number;
  currentValue: number;
  initialValue: number;
  dataPoints: number;
  unrealizedGainLoss?: number | null;
  periodDays?: number;
  totalDeposits?: number;
  totalWithdrawals?: number;
  netCashFlow?: number;
  composition?: {
    equity: number;
    fixedIncome: number;
    alternatives: number;
    cash: number;
  };
}

export async function GET(request: NextRequest) {
  const blocked = await applyRateLimit(request, "portal-seguimiento", { limit: 20, windowSeconds: 60 });
  if (blocked) return blocked;

  const { client, error: authError } = await requireClient();
  if (authError) return authError;

  const supabase = createAdminClient();

  return handleApiError("portal-seguimiento-get", async () => {
    const clientId = client!.id;
    const { searchParams } = new URL(request.url);
    const period = searchParams.get("period") || "ALL";

    // Load client info
    const { data: clientData } = await supabase
      .from("clients")
      .select("id, nombre, apellido, email, cartera_recomendada, puntaje_riesgo, perfil_riesgo, display_currency, benchmark_config")
      .eq("id", clientId)
      .single();

    // Calculate period start date
    const endDate = new Date();
    let startDate = new Date();
    switch (period) {
      case "1M": startDate.setMonth(startDate.getMonth() - 1); break;
      case "3M": startDate.setMonth(startDate.getMonth() - 3); break;
      case "6M": startDate.setMonth(startDate.getMonth() - 6); break;
      case "1Y": startDate.setFullYear(startDate.getFullYear() - 1); break;
      case "YTD": startDate = new Date(startDate.getFullYear(), 0, 1); break;
      case "ALL": default: startDate = new Date(2000, 0, 1); break;
    }

    // Fetch snapshots (exclude api-prices)
    const { data: snapshots } = await supabase
      .from("portfolio_snapshots")
      .select("*")
      .eq("client_id", clientId)
      .neq("source", "api-prices")
      .gte("snapshot_date", startDate.toISOString().split("T")[0])
      .lte("snapshot_date", endDate.toISOString().split("T")[0])
      .order("snapshot_date", { ascending: true })
      .range(0, 499);

    const metrics = calculateMetrics(snapshots || []);

    return NextResponse.json({
      success: true,
      data: {
        client: clientData ? {
          id: clientData.id,
          nombre: clientData.nombre,
          apellido: clientData.apellido,
          email: clientData.email,
          cartera_recomendada: clientData.cartera_recomendada,
          display_currency: clientData.display_currency || "CLP",
          puntaje_riesgo: clientData.puntaje_riesgo,
          perfil_riesgo: clientData.perfil_riesgo,
        } : null,
        snapshots: snapshots || [],
        metrics,
        recommendation: clientData?.cartera_recomendada || null,
        benchmarkConfig: clientData?.benchmark_config || null,
        period,
      },
    });
  });
}

// Same calculateMetrics from app/api/clients/[id]/seguimiento/route.ts
function calculateMetrics(snapshots: SnapshotRecord[]): PortfolioMetrics {
  if (snapshots.length < 2) {
    const latest = snapshots[snapshots.length - 1];
    return {
      totalReturn: 0, annualizedReturn: 0, isAnnualized: false,
      volatility: 0, maxDrawdown: 0,
      currentValue: latest?.total_value || 0,
      initialValue: snapshots[0]?.total_value || 0,
      dataPoints: snapshots.length, periodDays: 0,
      composition: latest ? {
        equity: latest.equity_percent || 0,
        fixedIncome: latest.fixed_income_percent || 0,
        alternatives: latest.alternatives_percent || 0,
        cash: latest.cash_percent || 0,
      } : undefined,
    };
  }

  const firstValue = snapshots[0].total_value || 0;
  const lastValue = snapshots[snapshots.length - 1].total_value || 0;
  const latest = snapshots[snapshots.length - 1];

  if (firstValue <= 0) {
    return {
      totalReturn: 0, annualizedReturn: 0, isAnnualized: false,
      volatility: 0, maxDrawdown: 0,
      currentValue: lastValue, initialValue: firstValue,
      dataPoints: snapshots.length, periodDays: 0,
      composition: latest ? {
        equity: latest.equity_percent || 0,
        fixedIncome: latest.fixed_income_percent || 0,
        alternatives: latest.alternatives_percent || 0,
        cash: latest.cash_percent || 0,
      } : undefined,
    };
  }

  const totalReturn = ((lastValue - firstValue) / firstValue) * 100;
  const daysDiff = (new Date(snapshots[snapshots.length - 1].snapshot_date).getTime() -
    new Date(snapshots[0].snapshot_date).getTime()) / (1000 * 60 * 60 * 24);
  const yearsElapsed = daysDiff / 365;
  const isAnnualized = daysDiff >= 365;
  const annualizedReturn = isAnnualized
    ? (Math.pow(lastValue / firstValue, 1 / yearsElapsed) - 1) * 100
    : totalReturn;

  const periodReturns: number[] = [];
  for (let i = 1; i < snapshots.length; i++) {
    if (snapshots[i - 1].total_value > 0) {
      const netFlow = snapshots[i].net_cash_flow || 0;
      const adjustedEndValue = snapshots[i].total_value - netFlow;
      periodReturns.push((adjustedEndValue / snapshots[i - 1].total_value) - 1);
    }
  }

  let annualizedVol = 0;
  if (periodReturns.length > 0) {
    const avgReturn = periodReturns.reduce((a, b) => a + b, 0) / periodReturns.length;
    const variance = periodReturns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / periodReturns.length;
    const periodVol = Math.sqrt(variance);
    const avgDaysBetween = daysDiff / (snapshots.length - 1);
    const periodsPerYear = avgDaysBetween > 0 ? 365 / avgDaysBetween : 12;
    annualizedVol = periodVol * Math.sqrt(Math.min(periodsPerYear, 252)) * 100;
  }

  let maxDrawdown = 0;
  let peak = snapshots[0].total_value;
  let cumulativeFlow = 0;
  for (let i = 1; i < snapshots.length; i++) {
    const flow = snapshots[i].net_cash_flow || 0;
    cumulativeFlow += flow;
    const adjustedValue = snapshots[i].total_value - cumulativeFlow;
    if (adjustedValue > peak) peak = adjustedValue;
    const drawdown = ((peak - adjustedValue) / peak) * 100;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
  }

  const totalDeposits = snapshots.reduce((sum, s) => sum + (s.deposits || 0), 0);
  const totalWithdrawals = snapshots.reduce((sum, s) => sum + (s.withdrawals || 0), 0);

  return {
    totalReturn: Math.round(totalReturn * 100) / 100,
    annualizedReturn: Math.round(annualizedReturn * 100) / 100,
    isAnnualized,
    volatility: Math.round(annualizedVol * 100) / 100,
    maxDrawdown: Math.round(maxDrawdown * 100) / 100,
    currentValue: lastValue,
    initialValue: firstValue,
    unrealizedGainLoss: latest.unrealized_gain_loss,
    dataPoints: snapshots.length,
    periodDays: Math.round(daysDiff),
    totalDeposits: Math.round(totalDeposits),
    totalWithdrawals: Math.round(totalWithdrawals),
    netCashFlow: Math.round(totalDeposits - totalWithdrawals),
    composition: {
      equity: latest.equity_percent || 0,
      fixedIncome: latest.fixed_income_percent || 0,
      alternatives: latest.alternatives_percent || 0,
      cash: latest.cash_percent || 0,
    },
  };
}
```

- [ ] **Step 2: Verify route compiles**

Run: `npx tsc --noEmit app/api/portal/seguimiento/route.ts` (or wait for build verification in final task)

- [ ] **Step 3: Commit**

```bash
git add app/api/portal/seguimiento/route.ts
git commit -m "feat(portal): add seguimiento API route for client auth"
```

---

## Task 2: Portal Proxy API Routes

**Files:**
- Create: `app/api/portal/historical-prices/route.ts`
- Create: `app/api/portal/prices-at-date/route.ts`
- Create: `app/api/portal/benchmark-config/route.ts`
- Create: `app/api/portal/radiografia/route.ts`

These routes authenticate via `requireClient()`, inject the client's ID, and delegate to the existing service logic. They prevent a client from querying another client's data.

- [ ] **Step 1: Create historical-prices proxy**

```typescript
// app/api/portal/historical-prices/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireClient } from "@/lib/auth/require-client";
import { applyRateLimit } from "@/lib/rate-limit";
import { handleApiError } from "@/lib/api-response";

export async function POST(request: NextRequest) {
  const blocked = await applyRateLimit(request, "portal-historical-prices", { limit: 10, windowSeconds: 60 });
  if (blocked) return blocked;

  const { client, error: authError } = await requireClient();
  if (authError) return authError;

  return handleApiError("portal-historical-prices-post", async () => {
    const body = await request.json();

    // Forward to internal API with client's auth context
    const internalUrl = new URL("/api/portfolio/historical-prices", request.url);
    const res = await fetch(internalUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: request.headers.get("cookie") || "",
      },
      body: JSON.stringify({ ...body, clientId: client!.id }),
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  });
}
```

- [ ] **Step 2: Create prices-at-date proxy**

```typescript
// app/api/portal/prices-at-date/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireClient } from "@/lib/auth/require-client";
import { applyRateLimit } from "@/lib/rate-limit";
import { handleApiError } from "@/lib/api-response";

export async function POST(request: NextRequest) {
  const blocked = await applyRateLimit(request, "portal-prices-at-date", { limit: 10, windowSeconds: 60 });
  if (blocked) return blocked;

  const { client, error: authError } = await requireClient();
  if (authError) return authError;

  return handleApiError("portal-prices-at-date-post", async () => {
    const body = await request.json();

    const internalUrl = new URL("/api/portfolio/prices-at-date", request.url);
    const res = await fetch(internalUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: request.headers.get("cookie") || "",
      },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  });
}
```

- [ ] **Step 3: Create benchmark-config read-only route**

```typescript
// app/api/portal/benchmark-config/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireClient } from "@/lib/auth/require-client";
import { createAdminClient } from "@/lib/auth/api-auth";
import { applyRateLimit } from "@/lib/rate-limit";
import { handleApiError } from "@/lib/api-response";

const DEFAULT_BENCHMARK = [{ ticker: "UF", weight: 1.0, spread: 2.0 }];

export async function GET(request: NextRequest) {
  const blocked = await applyRateLimit(request, "portal-benchmark-config", { limit: 10, windowSeconds: 60 });
  if (blocked) return blocked;

  const { client, error: authError } = await requireClient();
  if (authError) return authError;

  return handleApiError("portal-benchmark-config-get", async () => {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from("clients")
      .select("benchmark_config")
      .eq("id", client!.id)
      .single();

    return NextResponse.json({
      success: true,
      benchmark: data?.benchmark_config || DEFAULT_BENCHMARK,
    });
  });
}
```

- [ ] **Step 4: Create radiografia proxy**

```typescript
// app/api/portal/radiografia/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireClient } from "@/lib/auth/require-client";
import { applyRateLimit } from "@/lib/rate-limit";
import { handleApiError } from "@/lib/api-response";

export async function POST(request: NextRequest) {
  const blocked = await applyRateLimit(request, "portal-radiografia", { limit: 5, windowSeconds: 60 });
  if (blocked) return blocked;

  const { client, error: authError } = await requireClient();
  if (authError) return authError;

  return handleApiError("portal-radiografia-post", async () => {
    const body = await request.json();

    // Force clientId to the authenticated client (prevent querying other clients)
    const internalUrl = new URL("/api/portfolio/radiografia", request.url);
    const res = await fetch(internalUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: request.headers.get("cookie") || "",
      },
      body: JSON.stringify({ ...body, clientId: client!.id }),
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  });
}
```

- [ ] **Step 5: Commit**

```bash
git add app/api/portal/historical-prices/route.ts app/api/portal/prices-at-date/route.ts app/api/portal/benchmark-config/route.ts app/api/portal/radiografia/route.ts
git commit -m "feat(portal): add proxy API routes for seguimiento data"
```

---

## Task 3: Portal Servicios API

**Files:**
- Create: `app/api/portal/servicios/route.ts`

- [ ] **Step 1: Create servicios API route**

```typescript
// app/api/portal/servicios/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireClient } from "@/lib/auth/require-client";
import { createAdminClient } from "@/lib/auth/api-auth";
import { applyRateLimit } from "@/lib/rate-limit";
import { handleApiError } from "@/lib/api-response";

export async function GET(request: NextRequest) {
  const blocked = await applyRateLimit(request, "portal-servicios", { limit: 10, windowSeconds: 60 });
  if (blocked) return blocked;

  const { client, error: authError } = await requireClient();
  if (authError) return authError;

  return handleApiError("portal-servicios-get", async () => {
    const supabase = createAdminClient();

    // Get client's servicios_adicionales
    const { data: clientData } = await supabase
      .from("clients")
      .select("servicios_adicionales, asesor_id")
      .eq("id", client!.id)
      .single();

    // Get advisor info for the base "Asesoría de Inversiones" service
    let advisor = null;
    if (clientData?.asesor_id) {
      const { data: advisorData } = await supabase
        .from("advisors")
        .select("id, nombre, apellido, empresa")
        .eq("id", clientData.asesor_id)
        .single();
      advisor = advisorData;
    }

    return NextResponse.json({
      success: true,
      servicios: clientData?.servicios_adicionales || null,
      advisor,
    });
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/portal/servicios/route.ts
git commit -m "feat(portal): add servicios API route"
```

---

## Task 4: Update PortalTopbar Navigation

**Files:**
- Modify: `components/portal/PortalTopbar.tsx`

- [ ] **Step 1: Add Seguimiento and Mis Servicios tabs**

In the `tabs` array, add two new entries after "Mi Portafolio":

```typescript
// Add these imports at the top (alongside existing lucide imports)
import { LineChart, Briefcase } from "lucide-react";
```

Then in the tabs array, insert after the `Mi Portafolio` entry:

```typescript
const tabs = [
  { label: "Inicio", href: "/portal/bienvenida", icon: Home },
  { label: "Mi Portafolio", href: "/portal/dashboard", icon: LayoutDashboard },
  { label: "Seguimiento", href: "/portal/seguimiento", icon: LineChart },
  { label: "Mis Servicios", href: "/portal/mis-servicios", icon: Briefcase },
  { label: "Reportes", href: "/portal/reportes", icon: FileText, badgeKey: "reports" as const },
  { label: "Mis Cartolas", href: "/portal/mis-cartolas", icon: FileUp },
  { label: "Mensajes", href: "/portal/mensajes", icon: MessageSquare, badgeKey: "messages" as const },
];
```

- [ ] **Step 2: Commit**

```bash
git add components/portal/PortalTopbar.tsx
git commit -m "feat(portal): add Seguimiento and Mis Servicios to topbar nav"
```

---

## Task 5: Add readOnly Prop to RadiografiaCartola

**Files:**
- Modify: `components/seguimiento/RadiografiaCartola.tsx`

- [ ] **Step 1: Add readOnly to props interface**

Find the component's Props interface (near the top of the file) and add `readOnly?: boolean`. Then find any action buttons (buttons that trigger trades, apply changes, send emails, etc.) and wrap them with `{!readOnly && (...)}`.

The key areas to hide are:
- Any "Aplicar" / "Ejecutar" / "Generar" buttons
- Any "Enviar por email" buttons
- Any edit/delete controls

Search for `<button` elements and wrap advisor-only actions:

```typescript
// In the Props interface, add:
readOnly?: boolean;

// Then in JSX, wrap action buttons like:
{!readOnly && (
  <button onClick={handleAction} className="...">
    Action text
  </button>
)}
```

The exact buttons depend on the current RadiografiaCartola code. Read the component, find all interactive controls (buttons, inputs that trigger mutations), and conditionally hide them when `readOnly` is true. Display-only elements (tables, charts, badges, TAC info) remain visible.

- [ ] **Step 2: Commit**

```bash
git add components/seguimiento/RadiografiaCartola.tsx
git commit -m "feat(portal): add readOnly prop to RadiografiaCartola"
```

---

## Task 6: Portal Seguimiento Page

**Files:**
- Create: `app/(portal)/portal/seguimiento/page.tsx`

This is the largest task. The page reuses the same components as `SeguimientoPage.tsx` but:
- Fetches from `/api/portal/seguimiento` instead of `/api/clients/[id]/seguimiento`
- Fetches from `/api/portal/*` proxy routes for prices, benchmark, radiografia
- No advisor-only modals (AddSnapshot, ReviewSnapshot, SendSeguimiento)
- No edit controls, no "Fill Prices" button, no executions panel
- No `useAdvisor()` hook (client context)

- [ ] **Step 1: Create the portal seguimiento page**

```typescript
// app/(portal)/portal/seguimiento/page.tsx
"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { formatNumber, formatCurrency, formatDate } from "@/lib/format";
import EvolucionChart from "@/components/seguimiento/EvolucionChart";
import PerformanceAttribution from "@/components/seguimiento/PerformanceAttribution";
import RentabilidadPorActivo from "@/components/seguimiento/RentabilidadPorActivo";
import RetornosComparados from "@/components/seguimiento/RetornosComparados";
import HoldingReturnsPanel, { type HoldingReturnsData } from "@/components/seguimiento/HoldingReturnsPanel";
import PortfolioBreakdownPies from "@/components/seguimiento/PortfolioBreakdownPies";
import RadiografiaCartola from "@/components/seguimiento/RadiografiaCartola";
import PortalTopbar from "@/components/portal/PortalTopbar";
import type { BenchmarkComponent } from "@/lib/prices/types";
import { getBenchmarkFromScore } from "@/lib/risk/benchmarks";
import { detectSerieCode } from "@/lib/fund-utils";
import {
  Loader,
  TrendingUp,
  Calendar,
  AlertTriangle,
} from "lucide-react";

// Reuse the same interfaces from SeguimientoPage
interface Client {
  id: string;
  nombre: string;
  apellido: string;
  email: string;
  puntaje_riesgo?: number;
  perfil_riesgo?: string;
  display_currency?: string;
  cartera_recomendada?: {
    equity_percent?: number;
    fixed_income_percent?: number;
    alternatives_percent?: number;
    cash_percent?: number;
  };
}

interface Snapshot {
  id: string;
  client_id: string;
  snapshot_date: string;
  total_value: number;
  total_cost_basis: number | null;
  unrealized_gain_loss: number | null;
  equity_percent: number;
  fixed_income_percent: number;
  alternatives_percent: number;
  cash_percent: number;
  equity_value: number;
  fixed_income_value: number;
  alternatives_value: number;
  cash_value: number;
  holdings: unknown[] | null;
  daily_return: number;
  cumulative_return: number;
  deposits?: number;
  withdrawals?: number;
  net_cash_flow?: number;
  source: string;
  is_baseline?: boolean;
  created_at: string;
}

interface Metrics {
  totalReturn: number;
  annualizedReturn: number;
  isAnnualized: boolean;
  volatility: number;
  maxDrawdown: number;
  currentValue: number;
  initialValue: number;
  unrealizedGainLoss: number | null;
  dataPoints: number;
  periodDays: number;
  totalDeposits?: number;
  totalWithdrawals?: number;
  netCashFlow?: number;
  composition: {
    equity: number;
    fixedIncome: number;
    alternatives: number;
    cash: number;
  };
}

interface SeguimientoData {
  snapshots: Snapshot[];
  metrics: Metrics | null;
  recommendation: Client["cartera_recomendada"] | null;
  client: Client;
  benchmarkConfig?: BenchmarkComponent[] | null;
}

export default function PortalSeguimientoPage() {
  const [data, setData] = useState<SeguimientoData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState("ALL");
  const [clientInfo, setClientInfo] = useState<{ nombre: string; email: string } | null>(null);

  // Historical price series (for EvolucionChart with daily data)
  const [historicalSeries, setHistoricalSeries] = useState<Array<{ fecha: string; total: number; [key: string]: string | number }>>([]);
  const [fundsMeta, setFundsMeta] = useState<Array<{ fundName: string; run: string; serie: string; tac: number | null; moneda: string; quantity: number }>>([]);
  const [loadingHistorical, setLoadingHistorical] = useState(false);
  const [holdingReturnsData, setHoldingReturnsData] = useState<HoldingReturnsData | null>(null);
  const [deflatorData, setDeflatorData] = useState<{ uf: Map<string, number>; usd: Map<string, number> } | null>(null);
  const [exchangeRates, setExchangeRates] = useState<{ uf: number; usd: number } | null>(null);
  const [benchmarkConfig, setBenchmarkConfig] = useState<BenchmarkComponent[] | null>(null);
  const [benchmarkReturns, setBenchmarkReturns] = useState<Record<string, number> | null>(null);
  const [benchmarkLabel, setBenchmarkLabel] = useState("UF +2%");

  // Fetch portal /me for topbar
  useEffect(() => {
    fetch("/api/portal/me")
      .then(res => res.json())
      .then(d => {
        if (d.client) setClientInfo({ nombre: `${d.client.nombre} ${d.client.apellido}`, email: d.client.email });
      })
      .catch(() => {});
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/portal/seguimiento?period=ALL`);
      const result = await res.json();
      if (result.success) {
        setData(result.data);
        if (result.data?.benchmarkConfig) {
          setBenchmarkConfig(result.data.benchmarkConfig);
        }
      } else {
        setError(result.error || "Error al cargar datos");
      }
    } catch {
      setError("Error de conexión");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // --- Historical prices fetch (same logic as SeguimientoPage) ---
  // This section fetches daily price series for the evolution chart.
  // It calls /api/portal/historical-prices with holdings from the latest snapshot.
  // The implementation mirrors SeguimientoPage.fetchHistoricalPrices().

  const latestSnapshot = useMemo(() => {
    if (!data?.snapshots?.length) return null;
    return data.snapshots[data.snapshots.length - 1];
  }, [data]);

  const filteredSnapshots = useMemo(() => {
    if (!data?.snapshots) return [];
    if (period === "ALL") return data.snapshots;
    const now = new Date();
    let start = new Date();
    switch (period) {
      case "1M": start.setMonth(now.getMonth() - 1); break;
      case "3M": start.setMonth(now.getMonth() - 3); break;
      case "6M": start.setMonth(now.getMonth() - 6); break;
      case "1Y": start.setFullYear(now.getFullYear() - 1); break;
    }
    const startStr = start.toISOString().split("T")[0];
    return data.snapshots.filter(s => s.snapshot_date >= startStr);
  }, [data, period]);

  // Fetch historical prices when we have snapshot data
  useEffect(() => {
    if (!latestSnapshot?.holdings || (latestSnapshot.holdings as unknown[]).length === 0) return;
    setLoadingHistorical(true);

    const holdings = latestSnapshot.holdings as Array<Record<string, unknown>>;

    // Build request bodies (same logic as SeguimientoPage)
    const chileanHoldings: Array<{ fundName: string; run: number; serie: string; quantity: number; currency?: string; cartolaPrice?: number }> = [];
    const byNameHoldings: Array<{ fundName: string; serie?: string; quantity: number; currency?: string; cartolaPrice?: number }> = [];
    const intlHoldings: Array<{ fundName: string; securityId: string; quantity: number; marketValue?: number; currency?: string }> = [];

    for (const h of holdings) {
      const name = (h.fundName || h.nombre || h.name || "") as string;
      const secId = (h.securityId || h.security_id || "") as string;
      const qty = Number(h.quantity || h.cantidad || 0);
      const mv = Number(h.marketValue || h.valor || 0);
      const curr = (h.currency || h.moneda || "CLP") as string;
      const run = Number(h.run || 0);
      const serie = (h.serie || detectSerieCode(name) || "") as string;
      const cartolaPrice = mv && qty ? mv / qty : undefined;

      if (run > 0 && serie) {
        chileanHoldings.push({ fundName: name, run, serie, quantity: qty, currency: curr, cartolaPrice });
      } else if (secId && (secId.startsWith("CFI") || secId.endsWith("CL") || secId.includes(".") || /^[A-Z]{1,5}$/.test(secId))) {
        intlHoldings.push({ fundName: name, securityId: secId, quantity: qty, marketValue: mv, currency: curr });
      } else {
        byNameHoldings.push({ fundName: name, serie, quantity: qty, currency: curr, cartolaPrice });
      }
    }

    const fromDate = data!.snapshots[0]?.snapshot_date;

    fetch("/api/portal/historical-prices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        holdings: chileanHoldings,
        holdingsByName: byNameHoldings,
        internationalHoldings: intlHoldings,
        fromDate,
      }),
    })
      .then(res => res.json())
      .then(result => {
        if (result.success && result.data) {
          setHistoricalSeries(result.data.series || []);
          setFundsMeta(result.data.fundsMeta || []);
          if (result.data.deflators) {
            const ufMap = new Map(Object.entries(result.data.deflators.uf || {}));
            const usdMap = new Map(Object.entries(result.data.deflators.usd || {}));
            setDeflatorData({ uf: ufMap as Map<string, number>, usd: usdMap as Map<string, number> });
          }
        }
      })
      .catch(err => console.error("Error fetching historical prices:", err))
      .finally(() => setLoadingHistorical(false));
  }, [latestSnapshot, data]);

  // Fetch exchange rates
  useEffect(() => {
    fetch("/api/exchange-rates")
      .then(res => res.json())
      .then(d => {
        if (d.usd && d.uf) setExchangeRates({ usd: d.usd, uf: d.uf });
      })
      .catch(() => {});
  }, []);

  const periods = ["1M", "3M", "6M", "1Y", "ALL"];

  if (loading) {
    return (
      <div className="min-h-screen bg-gb-light">
        {clientInfo && <PortalTopbar clientName={clientInfo.nombre} clientEmail={clientInfo.email} />}
        <div className="flex items-center justify-center py-20">
          <Loader className="w-6 h-6 text-gb-gray animate-spin" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gb-light">
        {clientInfo && <PortalTopbar clientName={clientInfo.nombre} clientEmail={clientInfo.email} />}
        <div className="max-w-5xl mx-auto px-6 py-8">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-500" />
            <p className="text-sm text-red-700">{error || "Error al cargar datos"}</p>
          </div>
        </div>
      </div>
    );
  }

  const { metrics, client } = data;
  const clientName = `${client.nombre} ${client.apellido}`.trim();

  return (
    <div className="min-h-screen bg-gb-light">
      <PortalTopbar
        clientName={clientInfo?.nombre || clientName}
        clientEmail={clientInfo?.email || client.email}
      />

      <main className="max-w-5xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-gb-black">Seguimiento</h1>
          <p className="text-sm text-gb-gray mt-1">Análisis detallado de tu portafolio</p>
        </div>

        {/* Period selector */}
        <div className="flex gap-1 mb-6">
          {periods.map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                period === p
                  ? "bg-gb-primary text-white"
                  : "bg-white text-gb-gray border border-gb-border hover:bg-gray-50"
              }`}
            >
              {p}
            </button>
          ))}
        </div>

        {/* Metrics cards */}
        {metrics && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <div className="bg-white rounded-lg border border-gb-border p-4">
              <p className="text-xs text-gb-gray mb-1">Retorno Total</p>
              <p className={`text-xl font-bold ${metrics.totalReturn >= 0 ? "text-gb-success" : "text-gb-danger"}`}>
                {metrics.totalReturn >= 0 ? "+" : ""}{metrics.totalReturn.toFixed(2)}%
              </p>
              {metrics.isAnnualized && (
                <p className="text-[10px] text-gb-gray mt-1">
                  Anualizado: {metrics.annualizedReturn >= 0 ? "+" : ""}{metrics.annualizedReturn.toFixed(2)}%
                </p>
              )}
            </div>
            <div className="bg-white rounded-lg border border-gb-border p-4">
              <p className="text-xs text-gb-gray mb-1">Valor Actual</p>
              <p className="text-xl font-bold text-gb-black">{formatCurrency(metrics.currentValue)}</p>
            </div>
            <div className="bg-white rounded-lg border border-gb-border p-4">
              <p className="text-xs text-gb-gray mb-1">Valor Inicial</p>
              <p className="text-xl font-bold text-gb-black">{formatCurrency(metrics.initialValue)}</p>
            </div>
            <div className="bg-white rounded-lg border border-gb-border p-4">
              <p className="text-xs text-gb-gray mb-1">Ganancia/Pérdida</p>
              <p className={`text-xl font-bold ${(metrics.unrealizedGainLoss ?? 0) >= 0 ? "text-gb-success" : "text-gb-danger"}`}>
                {formatCurrency(metrics.unrealizedGainLoss ?? (metrics.currentValue - metrics.initialValue))}
              </p>
            </div>
          </div>
        )}

        {/* Evolution chart */}
        {filteredSnapshots.length >= 2 && (
          <div className="bg-white rounded-lg border border-gb-border p-6 mb-6">
            <h2 className="text-sm font-semibold text-gb-black mb-4">Evolución del Portafolio</h2>
            <EvolucionChart
              snapshots={filteredSnapshots}
              historicalSeries={historicalSeries}
              period={period}
            />
          </div>
        )}

        {/* Portfolio breakdown pies */}
        {latestSnapshot?.holdings && (latestSnapshot.holdings as unknown[]).length > 0 && (
          <PortfolioBreakdownPies
            holdings={(latestSnapshot.holdings as Array<{ fundName?: string; nombre?: string; marketValue?: number; valor?: number; assetClass?: string; asset_class?: string; currency?: string; moneda?: string }>).map(h => ({
              fundName: (h.fundName || h.nombre || "") as string,
              marketValue: Number(h.marketValue || h.valor || 0),
              assetClass: (h.assetClass || h.asset_class || "other") as string,
              currency: (h.currency || h.moneda || "CLP") as string,
            }))}
          />
        )}

        {/* Holding Returns Panel */}
        {latestSnapshot && (
          <HoldingReturnsPanel
            snapshot={latestSnapshot}
            snapshots={data.snapshots}
            exchangeRates={exchangeRates}
            deflatorData={deflatorData}
            onReturnsData={setHoldingReturnsData}
            clientId={client.id}
            pricesAtDateEndpoint="/api/portal/prices-at-date"
          />
        )}

        {/* Performance Attribution */}
        {holdingReturnsData && (
          <PerformanceAttribution
            holdingReturnsData={holdingReturnsData}
            snapshots={data.snapshots}
          />
        )}

        {/* Rentabilidad por activo */}
        {latestSnapshot && data.snapshots.length >= 1 && (
          <RentabilidadPorActivo
            snapshots={data.snapshots}
            clientId={client.id}
            pricesAtDateEndpoint="/api/portal/prices-at-date"
          />
        )}

        {/* Retornos Comparados */}
        {data.snapshots.length >= 2 && (
          <RetornosComparados
            snapshots={data.snapshots}
            historicalSeries={historicalSeries}
            benchmarkConfig={benchmarkConfig}
            benchmarkReturns={benchmarkReturns}
            benchmarkLabel={benchmarkLabel}
          />
        )}

        {/* Radiografía */}
        {latestSnapshot && (
          <RadiografiaCartola
            clientId={client.id}
            readOnly
            radiografiaEndpoint="/api/portal/radiografia"
          />
        )}
      </main>
    </div>
  );
}
```

**Important notes for the implementer:**
- Several components (`HoldingReturnsPanel`, `RentabilidadPorActivo`, `RadiografiaCartola`) may need a new optional prop for the API endpoint path (e.g., `pricesAtDateEndpoint`, `radiografiaEndpoint`). If these components currently hardcode `/api/portfolio/...` paths, add an optional prop that defaults to the existing path, so the portal can pass the portal proxy path instead.
- If a component uses `useAdvisor()` internally, it will fail in the portal context. Check each imported component — if it calls `useAdvisor()`, either make it optional or skip that component and render a simpler version.
- The exact props for `EvolucionChart`, `PerformanceAttribution`, `RetornosComparados` may need adjustment based on what they actually accept. Read each component's Props interface before wiring up.
- This is the initial skeleton. After the build verification (Task 8), fix any type mismatches or missing props iteratively.

- [ ] **Step 2: Commit**

```bash
git add app/(portal)/portal/seguimiento/page.tsx
git commit -m "feat(portal): add seguimiento page with full read-only view"
```

---

## Task 7: Mis Servicios Page

**Files:**
- Create: `app/(portal)/portal/mis-servicios/page.tsx`

- [ ] **Step 1: Create the Mis Servicios page**

```typescript
// app/(portal)/portal/mis-servicios/page.tsx
"use client";

import { useEffect, useState } from "react";
import PortalTopbar from "@/components/portal/PortalTopbar";
import {
  Loader,
  TrendingUp,
  Shield,
  Calculator,
  Building2,
  AlertTriangle,
} from "lucide-react";

interface Servicios {
  seguros?: {
    activo: boolean;
    poliza?: string;
    cobertura?: string;
    beneficiarios?: string;
    notas?: string;
  };
  asesoria_tributaria?: {
    activo: boolean;
    descripcion?: string;
  };
  asesoria_inmobiliaria?: {
    activo: boolean;
    descripcion?: string;
  };
}

interface Advisor {
  id: string;
  nombre: string;
  apellido: string;
  empresa: string;
}

export default function MisServiciosPage() {
  const [loading, setLoading] = useState(true);
  const [servicios, setServicios] = useState<Servicios | null>(null);
  const [advisor, setAdvisor] = useState<Advisor | null>(null);
  const [clientInfo, setClientInfo] = useState<{ nombre: string; email: string } | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/portal/servicios").then(r => r.json()),
      fetch("/api/portal/me").then(r => r.json()),
    ])
      .then(([servData, meData]) => {
        if (servData.success) {
          setServicios(servData.servicios);
          setAdvisor(servData.advisor);
        }
        if (meData.client) {
          setClientInfo({
            nombre: `${meData.client.nombre} ${meData.client.apellido}`,
            email: meData.client.email,
          });
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gb-light">
        {clientInfo && <PortalTopbar clientName={clientInfo.nombre} clientEmail={clientInfo.email} />}
        <div className="flex items-center justify-center py-20">
          <Loader className="w-6 h-6 text-gb-gray animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gb-light">
      {clientInfo && <PortalTopbar clientName={clientInfo.nombre} clientEmail={clientInfo.email} />}

      <main className="max-w-3xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-gb-black">Mis Servicios</h1>
          <p className="text-sm text-gb-gray mt-1">Productos y servicios contratados</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Asesoría de Inversiones — always active */}
          <ServiceCard
            icon={TrendingUp}
            title="Asesoría de Inversiones"
            active
            details={advisor ? [
              { label: "Asesor", value: `${advisor.nombre} ${advisor.apellido}` },
              { label: "Empresa", value: advisor.empresa },
            ] : []}
            description="Gestión y seguimiento de tu portafolio de inversiones"
          />

          {/* Seguros */}
          <ServiceCard
            icon={Shield}
            title="Seguros"
            active={servicios?.seguros?.activo ?? false}
            details={servicios?.seguros?.activo ? [
              ...(servicios.seguros.poliza ? [{ label: "Póliza", value: servicios.seguros.poliza }] : []),
              ...(servicios.seguros.cobertura ? [{ label: "Cobertura", value: servicios.seguros.cobertura }] : []),
              ...(servicios.seguros.beneficiarios ? [{ label: "Beneficiarios", value: servicios.seguros.beneficiarios }] : []),
            ] : []}
            description={servicios?.seguros?.activo ? servicios.seguros.notas : "Consulta con tu asesor para más información"}
          />

          {/* Asesoría Tributaria */}
          <ServiceCard
            icon={Calculator}
            title="Asesoría Tributaria"
            active={servicios?.asesoria_tributaria?.activo ?? false}
            description={servicios?.asesoria_tributaria?.activo
              ? servicios.asesoria_tributaria.descripcion
              : "Consulta con tu asesor para más información"}
          />

          {/* Asesoría Inmobiliaria */}
          <ServiceCard
            icon={Building2}
            title="Asesoría Inmobiliaria"
            active={servicios?.asesoria_inmobiliaria?.activo ?? false}
            description={servicios?.asesoria_inmobiliaria?.activo
              ? servicios.asesoria_inmobiliaria.descripcion
              : "Consulta con tu asesor para más información"}
          />
        </div>
      </main>
    </div>
  );
}

function ServiceCard({
  icon: Icon,
  title,
  active,
  details = [],
  description,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  active: boolean;
  details?: Array<{ label: string; value: string }>;
  description?: string;
}) {
  return (
    <div className={`bg-white rounded-lg border border-gb-border p-6 ${!active ? "opacity-60" : ""}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Icon className={`w-5 h-5 ${active ? "text-gb-primary" : "text-gb-gray"}`} />
          <h3 className="text-sm font-semibold text-gb-black">{title}</h3>
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
          active ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"
        }`}>
          {active ? "Activo" : "No contratado"}
        </span>
      </div>

      {details.length > 0 && (
        <div className="space-y-1 mb-3">
          {details.map((d, i) => (
            <div key={i} className="flex items-center gap-2 text-sm">
              <span className="text-gb-gray">{d.label}:</span>
              <span className="text-gb-black font-medium">{d.value}</span>
            </div>
          ))}
        </div>
      )}

      {description && (
        <p className="text-xs text-gb-gray">{description}</p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add "app/(portal)/portal/mis-servicios/page.tsx"
git commit -m "feat(portal): add Mis Servicios page with service cards"
```

---

## Task 8: Build Verification & Component Prop Fixes

**Files:** Various (fixes discovered during build)

This task handles the integration — making sure all imported components accept the props we're passing, and that no component requires advisor-only context.

- [ ] **Step 1: Run build**

```bash
npm run build
```

Review errors. Common issues to fix:

1. **Components that hardcode API paths:** If `RentabilidadPorActivo` hardcodes `/api/portfolio/prices-at-date`, add an optional `pricesAtDateEndpoint` prop with default value.

2. **Components that call `useAdvisor()`:** If a component like `RadiografiaCartola` uses `useAdvisor()`, make the hook call conditional or provide a fallback when `advisor` is null.

3. **Missing prop types on existing components:** The portal page passes props like `historicalSeries` to `EvolucionChart` — verify the component accepts them with the correct shape.

4. **`readOnly` prop on `RadiografiaCartola`:** Also add `radiografiaEndpoint?: string` prop if the component hardcodes the API path.

- [ ] **Step 2: Fix each error iteratively**

For each build error:
1. Read the affected component to understand what it expects
2. Add optional props with defaults where needed
3. Adjust the portal page to match

- [ ] **Step 3: Run build again to confirm 0 errors**

```bash
npm run build
```

Expected: Build succeeds with 0 errors.

- [ ] **Step 4: Run tests**

```bash
npm run test:run
```

Expected: All existing tests pass (no regression).

- [ ] **Step 5: Run lint**

```bash
npm run lint
```

Expected: No new lint errors.

- [ ] **Step 6: Commit all fixes**

```bash
git add -A
git commit -m "fix(portal): resolve build errors for seguimiento component integration"
```

---

## Task 9: Manual Testing

- [ ] **Step 1: Start dev server**

```bash
npm run dev
```

- [ ] **Step 2: Log in as client**

Navigate to `http://localhost:3000/portal/login` and log in with a client account (e.g., halvarez@colbun.cl / Portal2026!).

- [ ] **Step 3: Verify navigation**

Check PortalTopbar shows all 7 tabs: Inicio, Mi Portafolio, Seguimiento, Mis Servicios, Reportes, Mis Cartolas, Mensajes.

- [ ] **Step 4: Test Seguimiento page**

Navigate to `/portal/seguimiento`. Verify:
- Period selector works (1M, 3M, 6M, 1Y, ALL)
- Metric cards show values
- Evolution chart renders
- Breakdown pies render
- Holdings panel shows
- No edit/add/delete buttons visible
- No advisor-only modals accessible

- [ ] **Step 5: Test Mis Servicios page**

Navigate to `/portal/mis-servicios`. Verify:
- "Asesoría de Inversiones" card shows as active with advisor name
- Other cards show based on `servicios_adicionales` data
- Inactive cards show "No contratado" in gray

- [ ] **Step 6: Commit any final fixes and tag completion**

```bash
git add -A
git commit -m "feat(portal): portal cliente v2 complete — seguimiento + servicios"
```
