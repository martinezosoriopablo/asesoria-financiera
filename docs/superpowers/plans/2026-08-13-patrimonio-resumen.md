# Resumen de patrimonio y flujos (Sub-proyecto B) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) o superpowers:executing-plans para implementar tarea por tarea. Los pasos usan checkboxes (`- [ ]`).

**Goal:** Calcular y mostrar (lado asesor) el patrimonio neto y el flujo pasivo mensual del cliente, a partir del modelo de A + el valor del portafolio del Seguimiento, con toggle de moneda UF/CLP/USD y toggle "incluir casa habitación".

**Architecture:** Lógica pura de agregación en `lib/patrimonio/summary.ts` (Vitest, TDD). Un endpoint `GET /api/clients/[id]/patrimonio/resumen` junta patrimonio + valor de portafolio (último snapshot) + tipos de cambio y devuelve los totales en CLP + los rates. La UI (`PatrimonioResumen`) se monta arriba de la sección Patrimonio, convierte a la moneda elegida con `fromCLP`, y se refresca cuando la sección guarda cambios.

**Tech Stack:** Next.js 16 App Router + React 19, Supabase, Tailwind v4, Vitest (jsdom).

## Global Constraints

- Rama `feat/patrimonio-resumen` (worktree `.claude/worktrees/patrimonio-resumen`), sobre `master` (que ya tiene A).
- Auth de ruta: `requireClientAccess(id)` de `@/lib/auth/api-auth` → `{ user, advisor, error }`; `if (error) return error` ANTES de `createAdminClient()`. Respuestas `successResponse`/`errorResponse` + `handleApiError`. Rate-limit `applyRateLimit`.
- Reusar `toCLP`/`fromCLP` + `ExchangeRates` (`{ usd, eur, uf }`) de `@/lib/portfolio/currency` — NO reimplementar. Tipos de A (`Seguro`/`Inmueble`/`ActivoFinanciero`/`PatrimonioData`, `Moneda`) de `@/lib/patrimonio/types`.
- Tipos de cambio: `getCurrentRates()` de `@/lib/bcch` (server-side; devuelve `{ usd, eur, uf, timestamp, source }`).
- Valor del portafolio: último `portfolio_snapshots.total_value` del cliente, `.neq("source","api-prices")`, `.order("snapshot_date",{ascending:false}).limit(1)`.
- Moneda por campo: cada monto se convierte desde su moneda de origen; montos `null` cuentan como 0. Alias `@/`. Paleta tokens `--gb-*`, sin hardcodear hex. Español.
- Tests: `npx vitest run <archivo>`. Gotcha OneDrive: reiniciar `npm run dev` si un cambio no se refleja.

---

## File Structure

**Creados:**
- `lib/patrimonio/summary.ts` — `PatrimonioSummary` + `computePatrimonioSummary()`.
- `lib/patrimonio/summary.test.ts`.
- `app/api/clients/[id]/patrimonio/resumen/route.ts` — GET.
- `components/clients/patrimonio/PatrimonioResumen.tsx` — franja de resumen (asesor).

**Modificados:**
- `components/clients/patrimonio/PatrimonioSection.tsx` — monta `<PatrimonioResumen>` arriba + `refreshKey` que se incrementa al guardar/borrar.

---

## Task 1: Lógica pura del resumen (TDD)

**Files:**
- Create: `lib/patrimonio/summary.ts`
- Test: `lib/patrimonio/summary.test.ts`

**Interfaces:**
- Consume: `toCLP`, `ExchangeRates` de `@/lib/portfolio/currency`; `PatrimonioData` de `@/lib/patrimonio/types`.
- Produce: `PatrimonioSummary`, `computePatrimonioSummary(items: PatrimonioData, portfolioCLP: number | null, rates: ExchangeRates): PatrimonioSummary`.

- [ ] **Step 1: Escribir el test que falla `lib/patrimonio/summary.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { computePatrimonioSummary } from "./summary";
import type { PatrimonioData } from "./types";

const rates = { usd: 950, eur: 1000, uf: 38000 }; // CLP por unidad

// Helper para construir items mínimos (el resto de campos no afecta el cálculo).
function data(partial: Partial<PatrimonioData>): PatrimonioData {
  return { seguros: [], inmuebles: [], activos: [], ...partial } as PatrimonioData;
}

describe("computePatrimonioSummary", () => {
  it("suma activos por categoría y convierte a CLP", () => {
    const s = computePatrimonioSummary(
      data({
        inmuebles: [
          { tipo: "inversion", valor_estimado_venta_monto: 5000, valor_estimado_venta_moneda: "UF" } as never, // 190.000.000
        ],
        activos: [
          { tipo: "apv", saldo_monto: 1000, saldo_moneda: "UF" } as never,   // 38.000.000
          { tipo: "afp", saldo_monto: 4900, saldo_moneda: "UF" } as never,   // 186.200.000
        ],
      }),
      6_000_000_000, // portafolio CLP (6 mil millones para el ejemplo)
      rates
    );
    expect(s.activos.inmuebles_inversion).toBe(190_000_000);
    expect(s.activos.apv).toBe(38_000_000);
    expect(s.activos.afp).toBe(186_200_000);
    expect(s.activos.portafolio).toBe(6_000_000_000);
    expect(s.portafolioDisponible).toBe(true);
  });

  it("patrimonio neto = activos − pasivos; invertible excluye casa y su hipoteca", () => {
    const s = computePatrimonioSummary(
      data({
        inmuebles: [
          { tipo: "habitacion", valor_estimado_venta_monto: 300_000_000, valor_estimado_venta_moneda: "CLP",
            tiene_credito: true, credito_saldo_monto: 100_000_000, credito_saldo_moneda: "CLP" } as never,
          { tipo: "inversion", valor_estimado_venta_monto: 200_000_000, valor_estimado_venta_moneda: "CLP" } as never,
        ],
      }),
      null, // sin portafolio
      rates
    );
    // activos.total = 300M (casa) + 200M (inversion) = 500M ; pasivos = 100M
    expect(s.patrimonioNeto).toBe(400_000_000);              // 500M − 100M
    // invertible = 400M − (300M casa − 100M hipoteca casa) = 400M − 200M = 200M
    expect(s.patrimonioInvertible).toBe(200_000_000);
    expect(s.portafolioDisponible).toBe(false);
    expect(s.activos.portafolio).toBe(0);
  });

  it("flujo pasivo = Σ (arriendo − dividendo) de los que se arriendan; puede ser negativo", () => {
    const s = computePatrimonioSummary(
      data({
        inmuebles: [
          { tipo: "inversion", se_arrienda: true, arriendo_monto: 18, arriendo_moneda: "UF",
            tiene_credito: true, credito_cuota_monto: 15, credito_cuota_moneda: "UF" } as never, // (18−15)*38000 = 114.000
          { tipo: "inversion", se_arrienda: true, arriendo_monto: 10, arriendo_moneda: "UF",
            tiene_credito: true, credito_cuota_monto: 14, credito_cuota_moneda: "UF" } as never, // (10−14)*38000 = −152.000
          { tipo: "inversion", se_arrienda: false, arriendo_monto: 99, arriendo_moneda: "UF" } as never, // no cuenta
        ],
      }),
      null, rates
    );
    expect(s.flujoPasivoMensual).toBe((3 - 4) * 38000); // 114000 − 152000 = −38000
  });

  it("suma el componente de ahorro de los seguros", () => {
    const s = computePatrimonioSummary(
      data({ seguros: [{ tipo: "vida_con_ahorro", componente_ahorro_monto: 500, componente_ahorro_moneda: "UF" } as never] }),
      0, rates
    );
    expect(s.activos.ahorro_seguros).toBe(19_000_000);
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run lib/patrimonio/summary.test.ts`
Expected: FAIL — `Failed to resolve import "./summary"`.

- [ ] **Step 3: Escribir `lib/patrimonio/summary.ts`**

```ts
// lib/patrimonio/summary.ts
import { toCLP, ExchangeRates } from "@/lib/portfolio/currency";
import type { PatrimonioData, Inmueble, ActivoFinanciero, Seguro } from "./types";

export interface PatrimonioSummary {
  activos: {
    portafolio: number;
    inmuebles_inversion: number;
    casa_habitacion: number;
    apv: number;
    afp: number;
    cuenta_ahorro: number;
    otro_financiero: number;
    ahorro_seguros: number;
    total: number;
  };
  pasivos: { credito_total: number; credito_casa_habitacion: number };
  patrimonioNeto: number;        // incluye casa habitación
  patrimonioInvertible: number;  // sin casa ni su hipoteca
  flujoPasivoMensual: number;
  portafolioDisponible: boolean;
}

/** Convierte un par (monto, moneda) a CLP; null/undefined → 0. */
function clp(monto: number | null | undefined, moneda: string | null | undefined, rates: ExchangeRates): number {
  if (monto === null || monto === undefined) return 0;
  return toCLP(monto, moneda ?? "CLP", rates);
}

function sum<T>(arr: T[], fn: (x: T) => number): number {
  return arr.reduce((acc, x) => acc + fn(x), 0);
}

export function computePatrimonioSummary(
  items: PatrimonioData,
  portfolioCLP: number | null,
  rates: ExchangeRates
): PatrimonioSummary {
  const seguros: Seguro[] = items.seguros ?? [];
  const inmuebles: Inmueble[] = items.inmuebles ?? [];
  const activos: ActivoFinanciero[] = items.activos ?? [];

  const inmuebles_inversion = sum(
    inmuebles.filter((i) => i.tipo === "inversion"),
    (i) => clp(i.valor_estimado_venta_monto, i.valor_estimado_venta_moneda, rates)
  );
  const casa_habitacion = sum(
    inmuebles.filter((i) => i.tipo === "habitacion"),
    (i) => clp(i.valor_estimado_venta_monto, i.valor_estimado_venta_moneda, rates)
  );
  const bySaldo = (tipos: string[]) =>
    sum(activos.filter((a) => tipos.includes(a.tipo)), (a) => clp(a.saldo_monto, a.saldo_moneda, rates));
  const apv = bySaldo(["apv"]);
  const afp = bySaldo(["afp"]);
  const cuenta_ahorro = bySaldo(["cuenta_ahorro"]);
  const otro_financiero = bySaldo(["ahorro_periodico", "otro"]);
  const ahorro_seguros = sum(seguros, (s) => clp(s.componente_ahorro_monto, s.componente_ahorro_moneda, rates));
  const portafolio = portfolioCLP ?? 0;

  const total =
    portafolio + inmuebles_inversion + casa_habitacion + apv + afp + cuenta_ahorro + otro_financiero + ahorro_seguros;

  const credito_total = sum(
    inmuebles.filter((i) => i.tiene_credito),
    (i) => clp(i.credito_saldo_monto, i.credito_saldo_moneda, rates)
  );
  const credito_casa_habitacion = sum(
    inmuebles.filter((i) => i.tipo === "habitacion" && i.tiene_credito),
    (i) => clp(i.credito_saldo_monto, i.credito_saldo_moneda, rates)
  );

  const patrimonioNeto = total - credito_total;
  const patrimonioInvertible = patrimonioNeto - (casa_habitacion - credito_casa_habitacion);

  const flujoPasivoMensual = sum(
    inmuebles.filter((i) => i.se_arrienda),
    (i) => clp(i.arriendo_monto, i.arriendo_moneda, rates) - (i.tiene_credito ? clp(i.credito_cuota_monto, i.credito_cuota_moneda, rates) : 0)
  );

  return {
    activos: { portafolio, inmuebles_inversion, casa_habitacion, apv, afp, cuenta_ahorro, otro_financiero, ahorro_seguros, total },
    pasivos: { credito_total, credito_casa_habitacion },
    patrimonioNeto,
    patrimonioInvertible,
    flujoPasivoMensual,
    portafolioDisponible: portfolioCLP !== null && portfolioCLP !== undefined,
  };
}
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `npx vitest run lib/patrimonio/summary.test.ts`
Expected: PASS (4 verdes).

- [ ] **Step 5: Commit**

```bash
git add lib/patrimonio/summary.ts lib/patrimonio/summary.test.ts
git commit -m "feat(patrimonio): lógica pura del resumen (patrimonio neto/invertible + flujo pasivo)"
```

---

## Task 2: Endpoint `GET /api/clients/[id]/patrimonio/resumen`

**Files:**
- Create: `app/api/clients/[id]/patrimonio/resumen/route.ts`

**Interfaces:**
- Consume: `requireClientAccess`, `createAdminClient` (`@/lib/auth/api-auth`); `successResponse`/`errorResponse`/`handleApiError`; `applyRateLimit`; `getCurrentRates` (`@/lib/bcch`); `computePatrimonioSummary` (Task 1).
- Produce: `GET` → `{ success, ...PatrimonioSummary, rates: { usd, eur, uf } }`.

- [ ] **Step 1: Escribir la ruta**

```ts
// app/api/clients/[id]/patrimonio/resumen/route.ts
import { NextRequest } from "next/server";
import { requireClientAccess, createAdminClient } from "@/lib/auth/api-auth";
import { successResponse, errorResponse, handleApiError } from "@/lib/api-response";
import { applyRateLimit } from "@/lib/rate-limit";
import { getCurrentRates } from "@/lib/bcch";
import { computePatrimonioSummary } from "@/lib/patrimonio/summary";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rl = await applyRateLimit(request, "patrimonio-resumen", { limit: 60 });
  if (rl) return rl;

  const { error } = await requireClientAccess(id);
  if (error) return error;

  return handleApiError("patrimonio-resumen", async () => {
    const supabase = createAdminClient();
    const [seg, inm, act, snap] = await Promise.all([
      supabase.from("client_seguros").select("*").eq("client_id", id),
      supabase.from("client_inmuebles").select("*").eq("client_id", id),
      supabase.from("client_activos_financieros").select("*").eq("client_id", id),
      supabase
        .from("portfolio_snapshots")
        .select("total_value")
        .eq("client_id", id)
        .neq("source", "api-prices")
        .order("snapshot_date", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    if (seg.error || inm.error || act.error) return errorResponse("Error al cargar el patrimonio", 500);

    const rates = await getCurrentRates(); // { usd, eur, uf, ... }
    const portfolioCLP = snap.data ? Number(snap.data.total_value) : null;

    const summary = computePatrimonioSummary(
      { seguros: seg.data ?? [], inmuebles: inm.data ?? [], activos: act.data ?? [] } as never,
      portfolioCLP,
      { usd: rates.usd, eur: rates.eur, uf: rates.uf }
    );

    return successResponse({ ...summary, rates: { usd: rates.usd, eur: rates.eur, uf: rates.uf } });
  });
}
```

- [ ] **Step 2: Verificar typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errores nuevos.

- [ ] **Step 3: Smoke test manual**

Con `npm run dev`, autenticado, `GET http://localhost:3000/api/clients/<id-propio>/patrimonio/resumen` → `{ success:true, activos:{...}, pasivos:{...}, patrimonioNeto, patrimonioInvertible, flujoPasivoMensual, portafolioDisponible, rates }`. Un `<id>` no accesible → 403/404.

- [ ] **Step 4: Commit**

```bash
git add "app/api/clients/[id]/patrimonio/resumen/route.ts"
git commit -m "feat(patrimonio): endpoint /resumen (patrimonio + valor de portafolio + rates)"
```

---

## Task 3: UI `PatrimonioResumen` + montaje + refresh

**Files:**
- Create: `components/clients/patrimonio/PatrimonioResumen.tsx`
- Modify: `components/clients/patrimonio/PatrimonioSection.tsx`

**Interfaces:**
- Consume: `fromCLP`, `ExchangeRates` de `@/lib/portfolio/currency`; endpoint de Task 2.
- Produce: `PatrimonioResumen` con props `{ clientId: string; refreshKey?: number }`.

- [ ] **Step 1: Escribir `components/clients/patrimonio/PatrimonioResumen.tsx`**

```tsx
// components/clients/patrimonio/PatrimonioResumen.tsx
"use client";
import React, { useEffect, useState } from "react";
import { Loader, Wallet } from "lucide-react";
import { fromCLP, ExchangeRates } from "@/lib/portfolio/currency";

type Moneda = "UF" | "CLP" | "USD";
const MONEDAS: Moneda[] = ["UF", "CLP", "USD"];

interface Resumen {
  activos: { portafolio: number; inmuebles_inversion: number; casa_habitacion: number; apv: number; afp: number; cuenta_ahorro: number; otro_financiero: number; ahorro_seguros: number; total: number };
  pasivos: { credito_total: number; credito_casa_habitacion: number };
  patrimonioNeto: number;
  patrimonioInvertible: number;
  flujoPasivoMensual: number;
  portafolioDisponible: boolean;
  rates: ExchangeRates;
}

const CAT_LABELS: Record<string, string> = {
  portafolio: "Portafolio (Seguimiento)", inmuebles_inversion: "Inmuebles de inversión",
  casa_habitacion: "Casa habitación", apv: "APV", afp: "AFP",
  cuenta_ahorro: "Cuentas de ahorro", otro_financiero: "Otros financieros", ahorro_seguros: "Ahorro en seguros",
};

function fmt(clpValue: number, moneda: Moneda, rates: ExchangeRates): string {
  const v = fromCLP(clpValue, moneda, rates);
  const decimals = moneda === "CLP" ? 0 : moneda === "UF" ? 1 : 0;
  const n = v.toLocaleString("es-CL", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return `${n} ${moneda}`;
}

export default function PatrimonioResumen({ clientId, refreshKey = 0 }: { clientId: string; refreshKey?: number }) {
  const [data, setData] = useState<Resumen | null>(null);
  const [loading, setLoading] = useState(true);
  const [moneda, setMoneda] = useState<Moneda>("UF");
  const [incluirCasa, setIncluirCasa] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/clients/${clientId}/patrimonio/resumen`)
      .then((r) => r.json())
      .then((d) => { if (d.success) setData(d as Resumen); })
      .finally(() => setLoading(false));
  }, [clientId, refreshKey]);

  if (loading) {
    return <div className="mb-4 flex justify-center rounded-lg border border-gb-border bg-white py-6"><Loader className="h-5 w-5 animate-spin text-gb-gray" /></div>;
  }
  if (!data) return null;

  const rates = data.rates;
  const neto = incluirCasa ? data.patrimonioNeto : data.patrimonioInvertible;
  const flujo = data.flujoPasivoMensual;
  const activosVisibles = Object.entries(data.activos).filter(([k]) => k !== "total") as [string, number][];

  return (
    <div className="mb-5 rounded-lg border border-gb-border border-l-4 border-l-gb-primary bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <Wallet className="h-4 w-4 text-gb-primary" />
        <h2 className="text-sm font-semibold text-gb-black">Resumen de patrimonio</h2>
        <div className="ml-auto flex gap-1">
          {MONEDAS.map((m) => (
            <button key={m} onClick={() => setMoneda(m)}
              className={`rounded-md border px-2.5 py-1 text-xs font-semibold ${moneda === m ? "border-gb-black bg-gb-black text-white" : "border-gb-border bg-white text-gb-gray"}`}>{m}</button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-gb-border p-4">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-gb-gray">Patrimonio neto</span>
            <button onClick={() => setIncluirCasa((v) => !v)}
              className={`text-[10px] font-semibold ${incluirCasa ? "text-gb-primary" : "text-gb-gray"}`}>
              {incluirCasa ? "incluye casa ✓" : "sin casa"}
            </button>
          </div>
          <div className="font-mono text-2xl font-semibold text-gb-black">{fmt(neto, moneda, rates)}</div>
          <div className="mt-1 text-[11px] text-gb-gray">Activos {fmt(data.activos.total, moneda, rates)} · Pasivos −{fmt(data.pasivos.credito_total, moneda, rates)}</div>
        </div>
        <div className="rounded-lg border border-gb-border p-4">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-gb-gray">Flujo pasivo mensual</span>
          <div className={`font-mono text-2xl font-semibold ${flujo >= 0 ? "text-gb-success" : "text-gb-danger"}`}>{flujo >= 0 ? "+" : "−"}{fmt(Math.abs(flujo), moneda, rates)}</div>
          <div className="mt-1 text-[11px] text-gb-gray">Arriendos − dividendos (foto de hoy)</div>
        </div>
      </div>

      {!data.portafolioDisponible && (
        <p className="mt-3 text-[11px] text-gb-gray">Nota: el portafolio de inversiones no está incluido (aún sin cartola cargada en Seguimiento).</p>
      )}

      <details className="mt-3">
        <summary className="cursor-pointer text-xs font-semibold text-gb-info">Ver desglose</summary>
        <div className="mt-2 space-y-1">
          {activosVisibles.filter(([, v]) => v !== 0).map(([k, v]) => (
            <div key={k} className="flex justify-between text-xs">
              <span className="text-gb-gray">{CAT_LABELS[k] ?? k}</span>
              <span className="font-mono text-gb-black">{fmt(v, moneda, rates)}</span>
            </div>
          ))}
          {data.pasivos.credito_total !== 0 && (
            <div className="flex justify-between border-t border-gb-border pt-1 text-xs">
              <span className="text-gb-gray">Créditos hipotecarios</span>
              <span className="font-mono text-gb-danger">−{fmt(data.pasivos.credito_total, moneda, rates)}</span>
            </div>
          )}
        </div>
      </details>
    </div>
  );
}
```

- [ ] **Step 2: Montar en `PatrimonioSection.tsx` con `refreshKey`**

Importar el componente cerca de los otros imports:
```tsx
import PatrimonioResumen from "@/components/clients/patrimonio/PatrimonioResumen";
```
Agregar un contador de refresco en el estado del componente `PatrimonioSection` (junto a los otros `useState`):
```tsx
const [refreshKey, setRefreshKey] = useState(0);
```
Dentro de `load()` (que ya se llama en el mount y tras guardar/borrar), incrementar el contador al final para que el resumen se recalcule:
```tsx
    setRefreshKey((k) => k + 1);
```
(Ponerlo dentro del `.then(...)` de `load`, después de `setData(...)`, o al final de `load`.)

Renderizar el resumen **arriba** del `<h2>Patrimonio</h2>` dentro del return de `PatrimonioSection`, justo después de abrir el contenedor principal:
```tsx
      <PatrimonioResumen clientId={clientId} refreshKey={refreshKey} />
```

- [ ] **Step 3: Verificar typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errores nuevos.

- [ ] **Step 4: Smoke test end-to-end manual**

Con `npm run dev`, abrir `/clients/<id>` de un cliente con datos de patrimonio (o crearlos):
1. Aparece la franja **Resumen de patrimonio** arriba de la sección, con Patrimonio neto y Flujo pasivo.
2. El toggle **UF/CLP/USD** cambia todos los números.
3. El toggle **incluye casa ✓ / sin casa** alterna el patrimonio neto entre total e invertible.
4. **Ver desglose** lista los activos por categoría y los créditos.
5. Agregar/editar un inmueble en la sección → el resumen se **actualiza** (por el `refreshKey`).
6. Si el cliente no tiene cartola en Seguimiento → aparece la nota "portafolio no incluido".
(Si un cambio no se refleja, reiniciar `npm run dev` — gotcha OneDrive.)

- [ ] **Step 5: Correr la suite + commit**

Run: `npm run test:run`
Expected: `lib/patrimonio/*` verdes; sin regresiones.
```bash
git add components/clients/patrimonio/PatrimonioResumen.tsx components/clients/patrimonio/PatrimonioSection.tsx
git commit -m "feat(patrimonio): franja Resumen (neto/flujo, toggles moneda y casa) montada en la ficha"
```

---

## Self-Review (cobertura del spec)

- Cálculo puro (neto/invertible/flujo, multi-moneda) → Task 1 (TDD). ✅
- Fuente del portafolio (último snapshot, sin api-prices) → Task 2. ✅
- Endpoint con IDOR cerrado (`requireClientAccess`) → Task 2. ✅
- Toggle UF/CLP/USD gobierna todo (via `fromCLP`) + toggle incluir casa → Task 3. ✅
- Franja arriba de la sección + refresh al guardar → Task 3 (`refreshKey`). ✅
- Estado sin portafolio / sin datos comunicado → Task 3 (nota + `portafolioDisponible`). ✅
- Fuera de alcance B2/C → sin tareas de portal ni proyección. ✅
- Testing: pure logic Vitest (Task 1), ruta+UI manual (Tasks 2-3). ✅
