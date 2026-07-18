# Inferir Fecha de Compra Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Inferir y guardar la fecha de compra de cada fondo mutuo chileno matcheando su precio de compra (`unitCost`) contra el valor cuota histórico, para uso tributario.

**Architecture:** Función pura de match (`unitCost` ↔ valor cuota) + enriquecimiento en la ingesta de cartola + backfill de existentes. Solo match exacto; ambiguo → vacío. Sin UI nueva (rellena `holding.purchaseDate`).

**Tech Stack:** Next.js 16 API routes, Supabase (Postgres), Vitest, Node scripts (.mjs).

## Global Constraints

- Solo FM chilenos con `securityId` numérico (RUN) + `unitCost > 0`. No bonos ni internacionales.
- Nunca sobrescribir un `purchaseDate` existente.
- Fuente de valor cuota histórico: tabla `fund_cuota_history` (keyed by `fondo_id`, va desde 2014). NO `fondos_rentabilidades_diarias`.
- Resolución RUN → `fondo_id`: `fondos_mutuos` por `fo_run` (+ `fm_serie` cuando el holding trae serie).
- Umbral de exactitud: `EPS = max(0.01, unitCost * 0.00005)`.
- Ventana de contigüidad para plateau: 30 días.

---

### Task 1: Función pura `inferPurchaseDate`

**Files:**
- Create: `lib/tax/infer-purchase-date.ts`
- Test: `lib/tax/infer-purchase-date.test.ts`

**Interfaces:**
- Produces: `inferPurchaseDate(unitCost: number, serie: VCPoint[]): { date: string } | null` y `interface VCPoint { fecha: string; valorCuota: number }`.

- [ ] **Step 1: Write the failing test**

```ts
// lib/tax/infer-purchase-date.test.ts
import { describe, it, expect } from "vitest";
import { inferPurchaseDate } from "./infer-purchase-date";

describe("inferPurchaseDate", () => {
  it("match exacto único devuelve esa fecha", () => {
    const serie = [
      { fecha: "2024-06-27", valorCuota: 2284.3253 },
      { fecha: "2024-07-17", valorCuota: 2284.0084 },
      { fecha: "2024-08-01", valorCuota: 2283.2596 },
    ];
    expect(inferPurchaseDate(2284.0084, serie)).toEqual({ date: "2024-07-17" });
  });

  it("plateau contiguo devuelve la fecha más antigua", () => {
    const serie = [
      { fecha: "2024-07-15", valorCuota: 1000.0 },
      { fecha: "2024-07-16", valorCuota: 1000.0 },
      { fecha: "2024-07-17", valorCuota: 1000.0 },
    ];
    expect(inferPurchaseDate(1000.0, serie)).toEqual({ date: "2024-07-15" });
  });

  it("matches dispersos (dos épocas) devuelve null", () => {
    const serie = [
      { fecha: "2022-01-10", valorCuota: 1500.0 },
      { fecha: "2024-09-10", valorCuota: 1500.0 },
    ];
    expect(inferPurchaseDate(1500.0, serie)).toBeNull();
  });

  it("sin match (promedio ponderado) devuelve null", () => {
    const serie = [
      { fecha: "2024-01-10", valorCuota: 2200.0 },
      { fecha: "2024-06-10", valorCuota: 2300.0 },
    ];
    expect(inferPurchaseDate(2250.0, serie)).toBeNull();
  });

  it("unitCost <= 0 o serie vacía devuelve null", () => {
    expect(inferPurchaseDate(0, [{ fecha: "2024-01-01", valorCuota: 100 }])).toBeNull();
    expect(inferPurchaseDate(100, [])).toBeNull();
  });

  it("tolera redondeo dentro de EPS", () => {
    // unitCost 5000 -> EPS = max(0.01, 0.25) = 0.25; diff 0.1 matchea, diff 0.5 no
    const serie = [{ fecha: "2024-05-05", valorCuota: 5000.1 }];
    expect(inferPurchaseDate(5000.0, serie)).toEqual({ date: "2024-05-05" });
    const serie2 = [{ fecha: "2024-05-05", valorCuota: 5000.5 }];
    expect(inferPurchaseDate(5000.0, serie2)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/tax/infer-purchase-date.test.ts`
Expected: FAIL — "Failed to resolve import ./infer-purchase-date".

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/tax/infer-purchase-date.ts
// Infiere la fecha de compra de un FM chileno matcheando su unitCost (precio de
// compra por cuota) contra el valor cuota histórico. Solo match exacto (tolerante
// a redondeo). Ambigüedad (mismo vc en épocas distintas) o promedio ponderado
// sin match exacto -> null (mejor sin fecha que con una fecha incorrecta).

export interface VCPoint {
  fecha: string; // YYYY-MM-DD
  valorCuota: number;
}

const WINDOW_DAYS = 30;

export function inferPurchaseDate(unitCost: number, serie: VCPoint[]): { date: string } | null {
  if (!(unitCost > 0) || !serie || serie.length === 0) return null;

  const eps = Math.max(0.01, unitCost * 0.00005);
  const matchDates = serie
    .filter((p) => Math.abs(p.valorCuota - unitCost) <= eps)
    .map((p) => p.fecha)
    .sort();

  if (matchDates.length === 0) return null;

  const first = matchDates[0];
  const last = matchDates[matchDates.length - 1];
  const spanDays =
    (new Date(last + "T00:00:00").getTime() - new Date(first + "T00:00:00").getTime()) / 86400000;

  // Matches contiguos (plateau/misma compra) -> una fecha. Dispersos -> ambiguo.
  if (spanDays > WINDOW_DAYS) return null;
  return { date: first };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/tax/infer-purchase-date.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/tax/infer-purchase-date.ts lib/tax/infer-purchase-date.test.ts
git commit -m "feat(tributario): funcion pura inferPurchaseDate (match vc<->precio compra)"
```

---

### Task 2: Enriquecimiento `enrichPurchaseDates`

**Files:**
- Create: `lib/tax/enrich-purchase-dates.ts`

**Interfaces:**
- Consumes: `inferPurchaseDate`, `VCPoint` de Task 1.
- Produces: `enrichPurchaseDates(holdings, supabase): Promise<number>` — muta `holding.purchaseDate` in-place para los que resuelven, devuelve la cantidad rellenada.

- [ ] **Step 1: Write the implementation**

```ts
// lib/tax/enrich-purchase-dates.ts
// Rellena holding.purchaseDate infiriéndola del unitCost vs valor cuota historico.
// Resuelve el fondo por fo_run (+serie); si no hay serie explicita, prueba todas
// las series y solo acepta cuando EXACTAMENTE UNA produce una fecha (evita ambiguo).

import type { SupabaseClient } from "@supabase/supabase-js";
import { inferPurchaseDate, type VCPoint } from "./infer-purchase-date";

interface EnrichableHolding {
  securityId?: string | null;
  serie?: string | null;
  unitCost?: number | null;
  purchaseDate?: string | null;
  [key: string]: unknown;
}

async function seriesForFondo(supabase: SupabaseClient, fondoId: string): Promise<VCPoint[]> {
  const { data } = await supabase
    .from("fund_cuota_history")
    .select("fecha, valor_cuota")
    .eq("fondo_id", fondoId)
    .order("fecha", { ascending: true });
  return (data ?? [])
    .filter((r: { valor_cuota: number | null }) => r.valor_cuota != null && r.valor_cuota > 0)
    .map((r: { fecha: string; valor_cuota: number }) => ({ fecha: r.fecha, valorCuota: r.valor_cuota }));
}

export async function enrichPurchaseDates(
  holdings: EnrichableHolding[],
  supabase: SupabaseClient,
): Promise<number> {
  let filled = 0;
  for (const h of holdings) {
    if (h.purchaseDate) continue;
    const sid = (h.securityId ?? "").toString().trim();
    if (!/^\d{3,7}$/.test(sid)) continue;
    const unitCost = h.unitCost;
    if (!unitCost || unitCost <= 0) continue;

    let fondoQuery = supabase
      .from("fondos_mutuos")
      .select("id, fm_serie")
      .eq("fo_run", parseInt(sid, 10));
    const serie = (h.serie ?? "").toString().trim();
    if (serie) fondoQuery = fondoQuery.eq("fm_serie", serie);

    const { data: fondos } = await fondoQuery.limit(30);
    if (!fondos || fondos.length === 0) continue;

    // Probar cada candidato; aceptar solo si EXACTAMENTE UNO produce fecha.
    const hits: string[] = [];
    for (const f of fondos as Array<{ id: string }>) {
      const serieVC = await seriesForFondo(supabase, f.id);
      const inferred = inferPurchaseDate(unitCost, serieVC);
      if (inferred) hits.push(inferred.date);
    }
    const uniqueDates = Array.from(new Set(hits));
    if (uniqueDates.length === 1) {
      h.purchaseDate = uniqueDates[0];
      filled++;
    }
  }
  return filled;
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -v "^\.next/" | grep "error TS"`
Expected: sin output (limpio).

- [ ] **Step 3: Commit**

```bash
git add lib/tax/enrich-purchase-dates.ts
git commit -m "feat(tributario): enrichPurchaseDates (resuelve fondo_id + infiere fecha)"
```

---

### Task 3: Hook en el POST de snapshots

**Files:**
- Modify: `app/api/portfolio/snapshots/route.ts` (bloque de enriquecimiento de holdings, junto a `enrichHoldingsWithCostBasis`).

**Interfaces:**
- Consumes: `enrichPurchaseDates` de Task 2.

- [ ] **Step 1: Add import**

En los imports de `app/api/portfolio/snapshots/route.ts`, agregar:

```ts
import { enrichPurchaseDates } from "@/lib/returns/../tax/enrich-purchase-dates";
```

(Usar la ruta con alias correcta: `import { enrichPurchaseDates } from "@/lib/tax/enrich-purchase-dates";`)

- [ ] **Step 2: Llamar tras enriquecer cost basis**

Localizar el bloque donde se asigna `enrichedHoldings` (via `enrichHoldingsWithCostBasis`). Justo después, agregar:

```ts
    // Inferir fecha de compra (match unitCost <-> valor cuota) para uso tributario
    if (enrichedHoldings && enrichedHoldings.length > 0) {
      try {
        await enrichPurchaseDates(enrichedHoldings as unknown as Array<{ securityId?: string | null; serie?: string | null; unitCost?: number | null; purchaseDate?: string | null }>, supabase);
      } catch (e) {
        console.warn("enrichPurchaseDates fallo (no fatal):", e);
      }
    }
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -v "^\.next/" | grep "error TS"`
Expected: sin output.

- [ ] **Step 4: Commit**

```bash
git add "app/api/portfolio/snapshots/route.ts"
git commit -m "feat(tributario): infiere purchaseDate al guardar cartola"
```

---

### Task 4: Backfill de cartolas existentes

**Files:**
- Create: `scripts/backfill-purchase-dates.mjs`

- [ ] **Step 1: Write the script**

```js
// Usage: node --env-file=.env.local scripts/backfill-purchase-dates.mjs
// Rellena holding.purchaseDate en snapshots de cartola existentes (solo vacios,
// solo match exacto). Espeja lib/tax/infer-purchase-date.ts + enrich-purchase-dates.ts.
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error("Faltan env vars"); process.exit(1); }
const sb = createClient(url, key);

const WINDOW_DAYS = 30;
function inferPurchaseDate(unitCost, serie) {
  if (!(unitCost > 0) || !serie || serie.length === 0) return null;
  const eps = Math.max(0.01, unitCost * 0.00005);
  const dates = serie.filter((p) => Math.abs(p.valorCuota - unitCost) <= eps).map((p) => p.fecha).sort();
  if (dates.length === 0) return null;
  const span = (new Date(dates[dates.length - 1] + "T00:00:00") - new Date(dates[0] + "T00:00:00")) / 86400000;
  return span > WINDOW_DAYS ? null : dates[0];
}
async function seriesForFondo(id) {
  const { data } = await sb.from("fund_cuota_history").select("fecha, valor_cuota").eq("fondo_id", id).order("fecha", { ascending: true });
  return (data ?? []).filter((r) => r.valor_cuota > 0).map((r) => ({ fecha: r.fecha, valorCuota: r.valor_cuota }));
}

async function main() {
  const { data: snaps } = await sb
    .from("portfolio_snapshots")
    .select("id, holdings")
    .in("source", ["manual", "statement", "excel"]);
  let filledTotal = 0, snapsChanged = 0;
  for (const s of snaps ?? []) {
    const hs = Array.isArray(s.holdings) ? s.holdings : [];
    let changed = false;
    for (const h of hs) {
      if (h.purchaseDate) continue;
      const sid = (h.securityId ?? "").toString().trim();
      if (!/^\d{3,7}$/.test(sid) || !(h.unitCost > 0)) continue;
      let q = sb.from("fondos_mutuos").select("id, fm_serie").eq("fo_run", parseInt(sid, 10));
      const serie = (h.serie ?? "").toString().trim();
      if (serie) q = q.eq("fm_serie", serie);
      const { data: fondos } = await q.limit(30);
      if (!fondos || fondos.length === 0) continue;
      const hits = [];
      for (const f of fondos) { const d = inferPurchaseDate(h.unitCost, await seriesForFondo(f.id)); if (d) hits.push(d); }
      const uniq = [...new Set(hits)];
      if (uniq.length === 1) { h.purchaseDate = uniq[0]; changed = true; filledTotal++; }
    }
    if (changed) {
      const { error } = await sb.from("portfolio_snapshots").update({ holdings: hs }).eq("id", s.id);
      if (error) console.error(`  error snapshot ${s.id}: ${error.message}`); else snapsChanged++;
    }
  }
  console.log(`Listo. ${filledTotal} fechas inferidas en ${snapsChanged} snapshots.`);
}
main();
```

- [ ] **Step 2: Correr en la BD y verificar Heraldo**

Run: `node --env-file=.env.local scripts/backfill-purchase-dates.mjs`
Expected: imprime "X fechas inferidas". Verificar que el holding 8336 de Heraldo (client `e78758a9-604e-482b-94a9-faa382aa5e57`) quedó con `purchaseDate = 2024-07-17`:

```bash
node --env-file=.env.local -e 'import("@supabase/supabase-js").then(async ({createClient})=>{const sb=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);const {data}=await sb.from("portfolio_snapshots").select("holdings").eq("client_id","e78758a9-604e-482b-94a9-faa382aa5e57").eq("source","manual").limit(1);for(const h of data[0].holdings){console.log(h.securityId, h.purchaseDate||"(vacio)")}})'
```
Expected: `8336 2024-07-17` (y las demás con su fecha o "(vacio)" si ambiguo).

- [ ] **Step 3: Commit**

```bash
git add scripts/backfill-purchase-dates.mjs
git commit -m "feat(tributario): script backfill de purchaseDate + verificado en prod"
```

---

### Task 5: Uso tributario (bridge usa purchaseDate real)

**Files:**
- Modify: `lib/tax/bridge.ts` (`convertToTaxHoldings`, rama de cost basis con `purchaseUFs`).

**Interfaces:**
- Consumes: `holding.purchaseDate` (poblado por Tasks 3-4).

**Contexto:** `convertToTaxHoldings` ya recibe `purchaseUFs` (map `run-serie` → `{date, uf}`) y lo usa para `ufAtPurchase`/`acquisitionDate`. Hoy esa fecha viene de una estimación. Objetivo: cuando el holding trae `purchaseDate`, priorizarla como fecha de adquisición (y que el UF de esa fecha alimente la corrección monetaria).

- [ ] **Step 1: Leer la rama de cost basis en `lib/tax/bridge.ts`**

Localizar el bloque `if (raw.costBasis != null && raw.costBasis > 0) { ... }` que setea `acquisitionDate`/`ufAtPurchase` desde `purchaseUFs?.[quoteKey]`.

- [ ] **Step 2: Priorizar `raw.purchaseDate`**

Modificar para que, si `raw.purchaseDate` existe, se use como `acquisitionDate` y se busque el UF de esa fecha (vía `purchaseUFs` si el caller lo provee para esa fecha, o dejando `acquisitionDate` firme con `confianzaBaja = false`). Cambio mínimo:

```ts
      // Fecha de adquisición: preferir la inferida (purchaseDate) sobre la estimada
      const purchaseInfo = purchaseUFs?.[quoteKey];
      if ((raw as { purchaseDate?: string }).purchaseDate) {
        acquisitionDate = (raw as { purchaseDate?: string }).purchaseDate!;
        // Si el caller trae la UF de esa fecha, usarla; si no, corrección aproximada
        if (purchaseInfo && purchaseInfo.date === acquisitionDate && purchaseInfo.uf > 0) {
          ufAtPurchase = purchaseInfo.uf;
          acquisitionCostUF = costCLP / purchaseInfo.uf;
        } else {
          ufAtPurchase = ufValue; // aprox; el costo en CLP es firme
          acquisitionCostUF = costCLP / ufValue;
        }
        confianzaBaja = false;
      } else if (purchaseInfo && purchaseInfo.uf > 0) {
        // ... (rama existente sin cambios)
      }
```

(Integrar respetando la estructura existente de la función.)

- [ ] **Step 3: Typecheck + tests de tax**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -v "^\.next/" | grep "error TS"; npx vitest run lib/tax/`
Expected: tsc limpio, tests de tax pasan.

- [ ] **Step 4: Commit**

```bash
git add lib/tax/bridge.ts
git commit -m "feat(tributario): usa purchaseDate inferida como fecha de adquisicion"
```

---

## Self-Review

- **Spec coverage:** función pura (Task 1) ✓, enriquecimiento ingesta (Task 2+3) ✓, backfill (Task 4) ✓, uso tributario (Task 5) ✓, solo-exactas + ambiguo→null ✓, no sobrescribe ✓, fund_cuota_history ✓.
- **Placeholders:** ninguno; código completo en cada task.
- **Type consistency:** `inferPurchaseDate`/`VCPoint` usados igual en Tasks 1-4; `enrichPurchaseDates` firma consistente.
