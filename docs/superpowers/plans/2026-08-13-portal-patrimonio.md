# Mi Patrimonio — espejo en el portal (Sub-proyecto B2) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) o superpowers:executing-plans. Los pasos usan checkboxes (`- [ ]`).

**Goal:** Mostrar al cliente, en el portal (read-only), su resumen de patrimonio (neto + flujo pasivo, con toggle de moneda) + el inventario de sus seguros/inmuebles/activos — reusando el cálculo de B y los schemas de A.

**Architecture:** Un endpoint de portal `GET /api/portal/patrimonio` (auth `requireClient`, sin id en la URL → cero IDOR) que devuelve inventario + resumen (reusa `computePatrimonioSummary`). Una página `/portal/patrimonio` que compone un resumen (neto total + flujo, toggle UF/CLP/USD) + tarjetas read-only por ítem, renderizadas por un formateador puro dirigido por los `FieldDef` de A. Oculta `notas`; montos del inventario en su moneda de origen.

**Tech Stack:** Next.js 16 App Router + React 19, Supabase, Tailwind v4, Vitest (jsdom).

## Global Constraints

- Rama `feat/portal-patrimonio` (worktree `.claude/worktrees/portal-patrimonio`), sobre `master` (tiene A y B).
- Auth de portal: `requireClient()` de `@/lib/auth/require-client` → `{ client, error }`; `if (error) return error`. Usar `client!.id` (el propio cliente; NUNCA un id de la URL). `createAdminClient()` de `@/lib/auth/api-auth` tras el auth. Respuestas `successResponse`/`errorResponse` + `handleApiError`. Rate-limit `applyRateLimit`.
- Reuso (NO reimplementar): `computePatrimonioSummary` + `PatrimonioSummary` (`@/lib/patrimonio/summary`, B); `fromCLP`/`ExchangeRates` (`@/lib/portfolio/currency`); `GRUPOS`/`FieldDef` (`@/components/clients/patrimonio/schemas`, A); tipos de A.
- Tipos de cambio: `getCurrentRates()` de `@/lib/bcch` (`{usd, uf, ...}` — NO trae `eur`; pasar `eur: 0`; monedas solo CLP/UF/USD).
- Valor de portafolio: último `portfolio_snapshots.total_value` del cliente, `.neq("source","api-prices")`, orden desc, `limit(1)`, null-safe.
- Curación cliente: ocultar el campo `notas`; montos del inventario en su moneda de origen; read-only (sin edición). Sin toggle "incluir casa" (se muestra patrimonio neto total).
- Tokens `--gb-*`, sin hardcodear hex. Español. Alias `@/`. Tests: `npx vitest run <archivo>`.

---

## File Structure

**Creados:**
- `app/api/portal/patrimonio/route.ts` — GET (inventario + resumen del propio cliente).
- `components/clients/patrimonio/itemDisplay.ts` — `formatFieldValue()` (puro, reusado por asesor y portal).
- `components/clients/patrimonio/itemDisplay.test.ts`.
- `components/portal/patrimonio/PatrimonioItemView.tsx` — tarjeta read-only de un ítem.
- `components/portal/patrimonio/PortalPatrimonioInventario.tsx` — 3 grupos read-only.
- `components/portal/patrimonio/PortalPatrimonioResumen.tsx` — franja de resumen (portal).
- `app/(portal)/portal/patrimonio/page.tsx` — página "Mi Patrimonio".

**Modificados:**
- `components/portal/PortalSidebar.tsx` — link "Mi Patrimonio".

---

## Task 1: Endpoint `GET /api/portal/patrimonio`

**Files:** Create `app/api/portal/patrimonio/route.ts`

**Interfaces:**
- Consume: `requireClient` (`@/lib/auth/require-client`), `createAdminClient` (`@/lib/auth/api-auth`), `successResponse`/`errorResponse`/`handleApiError`, `applyRateLimit`, `getCurrentRates` (`@/lib/bcch`), `computePatrimonioSummary` (`@/lib/patrimonio/summary`).
- Produce: `GET` → `{ success, seguros:[], inmuebles:[], activos:[], resumen: PatrimonioSummary, rates:{usd,eur,uf} }`.

- [ ] **Step 1: Escribir la ruta**

```ts
// app/api/portal/patrimonio/route.ts
import { NextRequest } from "next/server";
import { requireClient } from "@/lib/auth/require-client";
import { createAdminClient } from "@/lib/auth/api-auth";
import { successResponse, errorResponse, handleApiError } from "@/lib/api-response";
import { applyRateLimit } from "@/lib/rate-limit";
import { getCurrentRates } from "@/lib/bcch";
import { computePatrimonioSummary } from "@/lib/patrimonio/summary";

export async function GET(request: NextRequest) {
  const rl = await applyRateLimit(request, "portal-patrimonio", { limit: 60 });
  if (rl) return rl;

  const { client, error } = await requireClient();
  if (error) return error;

  return handleApiError("portal-patrimonio", async () => {
    const supabase = createAdminClient();
    const id = client!.id;
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

    const rates = await getCurrentRates(); // { usd, uf, ... } (sin eur)
    const portfolioCLP = (!snap.error && snap.data?.total_value != null) ? Number(snap.data.total_value) : null;

    const resumen = computePatrimonioSummary(
      { seguros: seg.data ?? [], inmuebles: inm.data ?? [], activos: act.data ?? [] },
      portfolioCLP,
      { usd: rates.usd, eur: 0, uf: rates.uf }
    );

    return successResponse({
      seguros: seg.data ?? [],
      inmuebles: inm.data ?? [],
      activos: act.data ?? [],
      resumen,
      rates: { usd: rates.usd, eur: 0, uf: rates.uf },
    });
  });
}
```

- [ ] **Step 2: Typecheck** — `npx tsc --noEmit` → 0 errores nuevos.
- [ ] **Step 3: Smoke manual** — con `npm run dev`, logueado como **cliente**, `GET /api/portal/patrimonio` → `{ success:true, seguros, inmuebles, activos, resumen, rates }`. Sin sesión de cliente → 401. (El endpoint no acepta id → no hay forma de pedir otro cliente.)
- [ ] **Step 4: Commit**

```bash
git add "app/api/portal/patrimonio/route.ts"
git commit -m "feat(patrimonio): endpoint de portal /api/portal/patrimonio (inventario + resumen del propio cliente)"
```

---

## Task 2: Formateador puro de campos (TDD)

**Files:** Create `components/clients/patrimonio/itemDisplay.ts`, Test `components/clients/patrimonio/itemDisplay.test.ts`

**Interfaces:**
- Consume: `FieldDef` de `./schemas`.
- Produce: `formatFieldValue(field: FieldDef, item: Record<string, unknown>): string | null` (null = sin valor / no mostrar).

- [ ] **Step 1: Escribir el test que falla `itemDisplay.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { formatFieldValue } from "./itemDisplay";
import type { FieldDef } from "./schemas";

const F = (partial: Partial<FieldDef>): FieldDef => ({ key: "x", label: "X", type: "text", ...partial } as FieldDef);

describe("formatFieldValue", () => {
  it("money: muestra 'monto moneda' desde key_monto/key_moneda", () => {
    const f = F({ key: "prima", type: "money" });
    expect(formatFieldValue(f, { prima_monto: 4.5, prima_moneda: "UF" })).toBe("4,5 UF");
  });
  it("money: null cuando no hay monto", () => {
    expect(formatFieldValue(F({ key: "prima", type: "money" }), { prima_monto: null })).toBeNull();
  });
  it("select: muestra el label de la opción", () => {
    const f = F({ key: "regimen", type: "select", options: [{ value: "A", label: "Régimen A" }] });
    expect(formatFieldValue(f, { regimen: "A" })).toBe("Régimen A");
  });
  it("switch: Sí/No", () => {
    expect(formatFieldValue(F({ key: "se_arrienda", type: "switch" }), { se_arrienda: true })).toBe("Sí");
    expect(formatFieldValue(F({ key: "se_arrienda", type: "switch" }), { se_arrienda: false })).toBe("No");
  });
  it("text/number vacío -> null", () => {
    expect(formatFieldValue(F({ key: "compania", type: "text" }), { compania: "" })).toBeNull();
    expect(formatFieldValue(F({ key: "compania", type: "text" }), {})).toBeNull();
    expect(formatFieldValue(F({ key: "compania", type: "text" }), { compania: "MetLife" })).toBe("MetLife");
  });
});
```

- [ ] **Step 2: Correr y verificar RED** — `npx vitest run components/clients/patrimonio/itemDisplay.test.ts` → FAIL (no resuelve `./itemDisplay`).

- [ ] **Step 3: Escribir `itemDisplay.ts`**

```ts
// components/clients/patrimonio/itemDisplay.ts
import type { FieldDef } from "./schemas";

/** Devuelve el valor de un campo listo para mostrar (read-only), o null si no hay valor. */
export function formatFieldValue(field: FieldDef, item: Record<string, unknown>): string | null {
  if (field.type === "money") {
    const monto = item[`${field.key}_monto`] as number | null | undefined;
    const moneda = (item[`${field.key}_moneda`] as string | null | undefined) ?? "";
    if (monto === null || monto === undefined) return null;
    const n = Number(monto).toLocaleString("es-CL", { maximumFractionDigits: 2 });
    return `${n} ${moneda}`.trim();
  }
  const raw = item[field.key];
  if (raw === null || raw === undefined || raw === "") return null;
  if (field.type === "switch") return raw ? "Sí" : "No";
  if (field.type === "select") {
    const opt = (field.options ?? []).find((o) => o.value === raw);
    return opt ? opt.label : String(raw);
  }
  if (field.type === "number") return Number(raw).toLocaleString("es-CL", { maximumFractionDigits: 2 });
  return String(raw);
}
```

- [ ] **Step 4: Correr y verificar GREEN** — mismo comando → PASS.
- [ ] **Step 5: Commit**

```bash
git add components/clients/patrimonio/itemDisplay.ts components/clients/patrimonio/itemDisplay.test.ts
git commit -m "feat(patrimonio): formateador puro de campos para vista read-only (money/select/switch/text)"
```

---

## Task 3: Inventario read-only (item view + inventario)

**Files:** Create `components/portal/patrimonio/PatrimonioItemView.tsx`, `components/portal/patrimonio/PortalPatrimonioInventario.tsx`

**Interfaces:**
- Consume: `GRUPOS` (`@/components/clients/patrimonio/schemas`), `formatFieldValue` (Task 2).
- Produce: `PortalPatrimonioInventario` con props `{ seguros:[], inmuebles:[], activos:[] }`.

- [ ] **Step 1: `PatrimonioItemView.tsx`**

```tsx
// components/portal/patrimonio/PatrimonioItemView.tsx
"use client";
import React from "react";
import { GRUPOS } from "@/components/clients/patrimonio/schemas";
import { formatFieldValue } from "@/components/clients/patrimonio/itemDisplay";

type Grupo = (typeof GRUPOS)[number];
type Item = Record<string, unknown> & { tipo: string };

export default function PatrimonioItemView({ grupo, item }: { grupo: Grupo; item: Item }) {
  const badge = grupo.tipos.find((t) => t.value === item.tipo)?.label ?? String(item.tipo);
  const rows = grupo.fields
    .filter((f) => f.key !== "notas")            // ocultar notas internas
    .filter((f) => !f.showIf || f.showIf(item))  // respetar condicionales
    .map((f) => ({ label: f.label, value: formatFieldValue(f, item) }))
    .filter((r) => r.value !== null);

  return (
    <div className="rounded-lg border border-gb-border bg-white p-4">
      <span className="inline-block rounded-full bg-gb-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-gb-primary">
        {badge}
      </span>
      <div className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2">
        {rows.map((r, i) => (
          <div key={i} className="flex justify-between gap-3 text-sm">
            <span className="text-gb-gray">{r.label}</span>
            <span className="text-right font-medium text-gb-black">{r.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: `PortalPatrimonioInventario.tsx`**

```tsx
// components/portal/patrimonio/PortalPatrimonioInventario.tsx
"use client";
import React from "react";
import { GRUPOS } from "@/components/clients/patrimonio/schemas";
import PatrimonioItemView from "./PatrimonioItemView";

type Items = { seguros: Record<string, unknown>[]; inmuebles: Record<string, unknown>[]; activos: Record<string, unknown>[] };

export default function PortalPatrimonioInventario({ seguros, inmuebles, activos }: Items) {
  const byKey: Record<string, Record<string, unknown>[]> = { seguros, inmuebles, activos };
  return (
    <div className="space-y-6">
      {GRUPOS.map((g) => {
        const items = byKey[g.key] ?? [];
        if (items.length === 0) return null;
        return (
          <section key={g.key}>
            <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-gb-black">
              <span>{g.icono}</span> {g.titulo} <span className="text-xs font-normal text-gb-gray">({items.length})</span>
            </h3>
            <div className="space-y-3">
              {items.map((it, i) => (
                <PatrimonioItemView key={i} grupo={g} item={it as Record<string, unknown> & { tipo: string }} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 3: Typecheck** — `npx tsc --noEmit` → 0 errores nuevos.
- [ ] **Step 4: Commit**

```bash
git add components/portal/patrimonio/PatrimonioItemView.tsx components/portal/patrimonio/PortalPatrimonioInventario.tsx
git commit -m "feat(patrimonio): inventario read-only del portal (tarjetas dirigidas por schema, oculta notas)"
```

---

## Task 4: Página + resumen + link en el sidebar

**Files:** Create `components/portal/patrimonio/PortalPatrimonioResumen.tsx`, `app/(portal)/portal/patrimonio/page.tsx`; Modify `components/portal/PortalSidebar.tsx`

**Interfaces:**
- Consume: `fromCLP`/`ExchangeRates` (`@/lib/portfolio/currency`); `PortalPatrimonioInventario` (Task 3); endpoint (Task 1).
- Produce: página `/portal/patrimonio`.

- [ ] **Step 1: `PortalPatrimonioResumen.tsx`** (recibe el resumen ya calculado; sin toggle casa)

```tsx
// components/portal/patrimonio/PortalPatrimonioResumen.tsx
"use client";
import React, { useState } from "react";
import { fromCLP, ExchangeRates } from "@/lib/portfolio/currency";

type Moneda = "UF" | "CLP" | "USD";
const MONEDAS: Moneda[] = ["UF", "CLP", "USD"];

interface Resumen {
  activos: { portafolio: number; inmuebles_inversion: number; casa_habitacion: number; apv: number; afp: number; cuenta_ahorro: number; otro_financiero: number; ahorro_seguros: number; total: number };
  pasivos: { credito_total: number; credito_casa_habitacion: number };
  patrimonioNeto: number;
  flujoPasivoMensual: number;
  portafolioDisponible: boolean;
}
const CAT_LABELS: Record<string, string> = {
  portafolio: "Portafolio", inmuebles_inversion: "Inmuebles de inversión", casa_habitacion: "Mi casa",
  apv: "APV", afp: "AFP", cuenta_ahorro: "Cuentas de ahorro", otro_financiero: "Otros", ahorro_seguros: "Ahorro en seguros",
};

function fmt(clp: number, m: Moneda, rates: ExchangeRates): string {
  const v = fromCLP(clp, m, rates);
  const dec = m === "CLP" ? 0 : m === "UF" ? 1 : 0;
  return `${v.toLocaleString("es-CL", { minimumFractionDigits: dec, maximumFractionDigits: dec })} ${m}`;
}

export default function PortalPatrimonioResumen({ resumen, rates }: { resumen: Resumen; rates: ExchangeRates }) {
  const [moneda, setMoneda] = useState<Moneda>("UF");
  const flujo = resumen.flujoPasivoMensual;
  const activos = Object.entries(resumen.activos).filter(([k, v]) => k !== "total" && v !== 0) as [string, number][];

  return (
    <div className="rounded-lg border border-gb-border bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center">
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
          <span className="text-[10px] font-semibold uppercase tracking-wide text-gb-gray">Patrimonio neto</span>
          <div className="font-mono text-2xl font-semibold text-gb-black">{fmt(resumen.patrimonioNeto, moneda, rates)}</div>
          <div className="mt-1 text-[11px] text-gb-gray">Activos {fmt(resumen.activos.total, moneda, rates)} · Deudas −{fmt(resumen.pasivos.credito_total, moneda, rates)}</div>
        </div>
        <div className="rounded-lg border border-gb-border p-4">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-gb-gray">Flujo mensual estimado</span>
          <div className={`font-mono text-2xl font-semibold ${flujo >= 0 ? "text-gb-success" : "text-gb-danger"}`}>{flujo >= 0 ? "+" : "−"}{fmt(Math.abs(flujo), moneda, rates)}</div>
          <div className="mt-1 text-[11px] text-gb-gray">Arriendos netos de dividendos</div>
        </div>
      </div>
      {!resumen.portafolioDisponible && (
        <p className="mt-3 text-[11px] text-gb-gray">Tu portafolio de inversiones aún no está incluido (sin cartola cargada).</p>
      )}
      <details className="mt-3">
        <summary className="cursor-pointer text-xs font-semibold text-gb-info">Ver desglose</summary>
        <div className="mt-2 space-y-1">
          {activos.map(([k, v]) => (
            <div key={k} className="flex justify-between text-xs">
              <span className="text-gb-gray">{CAT_LABELS[k] ?? k}</span>
              <span className="font-mono text-gb-black">{fmt(v, moneda, rates)}</span>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}
```

- [ ] **Step 2: Página `app/(portal)/portal/patrimonio/page.tsx`**

```tsx
// app/(portal)/portal/patrimonio/page.tsx
"use client";
import React, { useEffect, useState } from "react";
import { Loader } from "lucide-react";
import PortalPatrimonioResumen from "@/components/portal/patrimonio/PortalPatrimonioResumen";
import PortalPatrimonioInventario from "@/components/portal/patrimonio/PortalPatrimonioInventario";

export default function MiPatrimonioPage() {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch("/api/portal/patrimonio")
      .then((r) => r.json())
      .then((d) => { if (d.success) setData(d); else setError(true); })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex justify-center py-20"><Loader className="h-6 w-6 animate-spin text-gb-gray" /></div>;

  const seguros = (data?.seguros as Record<string, unknown>[]) ?? [];
  const inmuebles = (data?.inmuebles as Record<string, unknown>[]) ?? [];
  const activos = (data?.activos as Record<string, unknown>[]) ?? [];
  const vacio = !error && seguros.length === 0 && inmuebles.length === 0 && activos.length === 0;

  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gb-black">Mi Patrimonio</h1>
        <p className="mt-1 text-sm text-gb-gray">Resumen de tus seguros, inmuebles e inversiones</p>
      </div>
      {error && <div className="rounded-lg border border-gb-border p-6 text-sm text-gb-gray">No se pudo cargar tu patrimonio. Intenta más tarde.</div>}
      {vacio && <div className="rounded-lg border border-gb-border p-6 text-sm text-gb-gray">Aún no hay información de patrimonio cargada. Tu asesor la irá completando.</div>}
      {data && !vacio && (
        <div className="space-y-6">
          {(data.resumen as object) && <PortalPatrimonioResumen resumen={data.resumen as never} rates={data.rates as never} />}
          <PortalPatrimonioInventario seguros={seguros} inmuebles={inmuebles} activos={activos} />
        </div>
      )}
    </main>
  );
}
```

- [ ] **Step 3: Link en `PortalSidebar.tsx`**

Importar el ícono `Wallet` de `lucide-react` (junto a los otros imports de íconos). En el array de items de navegación (donde están `{ href: "/portal/mis-servicios", label: "Mis Servicios", icon: Briefcase }`, etc.), agregar:
```tsx
  { href: "/portal/patrimonio", label: "Mi Patrimonio", icon: Wallet },
```
(Ubicarlo después de "Mi Portafolio" o de "Mis Servicios".)

- [ ] **Step 4: Typecheck** — `npx tsc --noEmit` → 0 errores nuevos.

- [ ] **Step 5: Smoke E2E manual** — con `npm run dev`, loguearse como **cliente** con patrimonio → ir a "Mi Patrimonio" (`/portal/patrimonio`):
  1. Aparece el resumen (neto + flujo) con toggle **UF/CLP/USD**.
  2. Debajo, las tarjetas read-only de seguros/inmuebles/activos, **sin** el campo notas, montos en su moneda de origen, **sin** poder editar.
  3. Cliente sin datos → mensaje vacío suave. Cliente sin cartola → nota "portafolio no incluido".
  4. El link "Mi Patrimonio" aparece en el sidebar del portal.

- [ ] **Step 6: Suite + commit**

Run: `npm run test:run` → `lib/patrimonio/*` y `itemDisplay` verdes; sin regresiones.
```bash
git add components/portal/patrimonio/PortalPatrimonioResumen.tsx "app/(portal)/portal/patrimonio/page.tsx" components/portal/PortalSidebar.tsx
git commit -m "feat(patrimonio): página Mi Patrimonio en el portal (resumen + inventario read-only) + link en sidebar"
```

---

## Self-Review (cobertura del spec)

- Endpoint del propio cliente (sin id → sin IDOR) → Task 1. ✅
- Reuso de `computePatrimonioSummary` (sin lógica nueva de cálculo) → Task 1. ✅
- Formateador read-only puro (money/select/switch), testeado → Task 2 (TDD). ✅
- Inventario read-only dirigido por `schemas.ts`, oculta `notas`, respeta `showIf`, montos en moneda de origen → Task 3. ✅
- Resumen con toggle UF/CLP/USD, patrimonio neto total (sin toggle casa) → Task 4. ✅
- Página `/portal/patrimonio` + link en sidebar + estados vacío/error/sin-portafolio → Task 4. ✅
- Fuera de alcance: edición desde portal, simulador C → sin tareas. ✅
