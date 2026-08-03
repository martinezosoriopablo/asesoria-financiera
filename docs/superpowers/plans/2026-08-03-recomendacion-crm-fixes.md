# Recomendación / CRM — Fixes de pulido · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Arreglar 4 detalles del CRM/recomendación (feature `recomendacion`): la columna "Mis Fondos" que sale vacía, una categoría del comité que se pierde en silencio, TAC + rent 12M ausentes en el footer, y el naming "Radiografía"/"Recomendación".

**Architecture:** Cambios acotados sobre la feature existente. La normalización de categorías (hoy inline en el route) se extrae a `lib/comite-categories.ts` como función compartida `resolveCategoria`; el enriquecimiento TAC/rent se extrae a un helper `lib/comite/ficha-metrics.ts`. La UI (tabla) suma un aviso de "posiciones sin categoría" y métricas ponderadas en el footer. Sin cambios de esquema (columnas ya existen en los tipos).

**Tech Stack:** Next.js 16 (App Router) + Supabase (service-role via `createAdminClient`) + TypeScript. Tests: Vitest (`npx vitest run <file>`).

## Global Constraints

- Rama: `crm-recomendacion-fixes` (ya creada desde `master`).
- Forma canónica de categoría = **CON prefijo de rol** (`rv_usa_large_cap`, `rf_ust_belly`, `alt_gold`, `cash_tbills`). `model_portfolios.posiciones[].categoria` guarda la forma **SIN** prefijo (`usa_large_cap`) o pass-through (`rv_small_cap_us`); SIEMPRE normalizar con `resolveCategoria` antes de comparar/lookup.
- `npx tsc --noEmit` debe quedar en 0 al final de cada task.
- Comentarios y UI en español; clases Tailwind `gb-*` del proyecto; respuestas API vía `successResponse`/`errorResponse` (ya en uso).
- FUERA DE ALCANCE (no tocar): doble camino de escritura de `cartera_recomendada` (rama IA legacy `generar-cartera`/`ComparisonModeV2`), migración duplicada `20260523_model_portfolios.sql`, serie "Recomendado" honesta (`recommended-evolution`), `ticker` null de AGF en `defaultDecision`.
- No introducir dependencias nuevas.

## File Structure

- `lib/comite-categories.ts` (MODIFY) — agrega categoría `rv_usa_small_cap`; exporta `resolveCategoria` (movida desde el route) + alias de ids.
- `lib/comite-categories.test.ts` (CREATE) — tests de `resolveCategoria` (prefijo, sin prefijo, alias small-cap, desconocido).
- `lib/recomendacion/types.ts` (MODIFY) — agrega `sin_categoria?: boolean` a `RecomendacionRow`; agrega `tac?: number | null` y `rent_12m?: number | null` a `Decision`.
- `lib/recomendacion/resolve.ts` (MODIFY) — `buildUnresolvedRow(...)`; `defaultDecision` propaga `tac`/`rent_12m`; `weightedMetrics(rows)`.
- `lib/recomendacion/resolve.test.ts` (MODIFY) — tests de `buildUnresolvedRow` y `weightedMetrics`.
- `lib/comite/ficha-metrics.ts` (CREATE) — `getFichaMetrics(supabase, fundRuns)` → Map<fund_run, {tac, rent_12m}>.
- `app/api/comite/recomendacion/route.ts` (MODIFY) — usa `resolveCategoria` importada; pasa `cat.id` a `resolveMisFondos` (Fix 1); filas "sin categoría" (Fix 2); enriquece `tac`/`rent_12m` (Fix 3).
- `components/recomendacion/RecomendacionTable.tsx` (MODIFY) — aviso de filas sin categoría (Fix 2); footer con TAC y rent 12M ponderados (Fix 3); el click de "mi fondo" propaga `tac`/`rent_12m`.
- `components/shared/AdvisorSidebar.tsx` (MODIFY) — label "Radiografia" → "Recomendación" (Fix 4).
- `app/(advisor-shell)/recomendacion/page.tsx` (MODIFY) — `<h1>` "Radiografia" → "Recomendación" (Fix 4).

---

## Task 1: Normalización de categoría compartida + categoría RV USA Small Cap (Fix 1 + Fix 2a)

**Files:**
- Modify: `lib/comite-categories.ts`
- Create: `lib/comite-categories.test.ts`
- Modify: `app/api/comite/recomendacion/route.ts:9-25,114,120,123`

**Interfaces:**
- Produces: `resolveCategoria(rawId: string): ComiteCategory | undefined` exportada desde `@/lib/comite-categories` (mueve la lógica que hoy está inline en el route). Nueva categoría `{ id: "rv_usa_small_cap", label: "RV USA Small Cap", role: "rv", etfUS: "IJR", etfUCITS: null }`.

- [ ] **Step 1: Escribir el test que falla** (`lib/comite-categories.test.ts`)

```ts
import { describe, it, expect } from "vitest";
import { resolveCategoria, getCategoryById, PREFERRED_TO_COMITE } from "./comite-categories";

describe("resolveCategoria", () => {
  it("acepta el id canónico con prefijo", () => {
    expect(resolveCategoria("rv_usa_large_cap")?.id).toBe("rv_usa_large_cap");
    expect(resolveCategoria("cash_tbills")?.id).toBe("cash_tbills");
  });

  it("normaliza el id sin prefijo (como lo guarda model_portfolios)", () => {
    expect(resolveCategoria("usa_large_cap")?.id).toBe("rv_usa_large_cap");
    expect(resolveCategoria("ust_belly")?.id).toBe("rf_ust_belly");
    expect(resolveCategoria("gold")?.id).toBe("alt_gold");
    expect(resolveCategoria("tbills")?.id).toBe("cash_tbills");
  });

  it("resuelve small cap por alias (rv_small_cap_us / small_cap_us → rv_usa_small_cap)", () => {
    expect(resolveCategoria("rv_small_cap_us")?.id).toBe("rv_usa_small_cap");
    expect(resolveCategoria("small_cap_us")?.id).toBe("rv_usa_small_cap");
    expect(getCategoryById("rv_usa_small_cap")?.role).toBe("rv");
  });

  it("devuelve undefined para categoría desconocida", () => {
    expect(resolveCategoria("categoria_inexistente")).toBeUndefined();
  });

  it("small cap tiene entrada en PREFERRED_TO_COMITE", () => {
    expect(PREFERRED_TO_COMITE["rv_usa_small_cap"]).toContain("RV USA");
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npx vitest run lib/comite-categories.test.ts`
Expected: FAIL — `resolveCategoria is not a function` / `rv_usa_small_cap` no existe.

- [ ] **Step 3: Implementar en `lib/comite-categories.ts`**

(3a) Agregar la categoría small cap al array `COMITE_CATEGORIES` (después de `rv_chile`, dentro del bloque RV):

```ts
  { id: "rv_chile",               label: "RV Chile",                   role: "rv",   etfUS: "ECH",  etfUCITS: null },
  { id: "rv_usa_small_cap",       label: "RV USA Small Cap",           role: "rv",   etfUS: "IJR",  etfUCITS: null },
```

(3b) En el bloque `SECONDARY_ETFS` agregar los ETFs de small cap (para que la Radiografía también los clasifique):

```ts
  // rv_usa_small_cap
  IJR: "rv_usa_small_cap",
  VB: "rv_usa_small_cap",
  IJH: "rv_usa_small_cap",
```

(3c) En `PREFERRED_TO_COMITE` agregar la entrada (después de `rv_chile`):

```ts
  rv_chile:               ["RV Nacional"],
  rv_usa_small_cap:       ["RV USA", "RV Internacional"],
```

(3d) Al FINAL del archivo, agregar la normalización compartida (movida desde el route, más el alias de small cap):

```ts
// ── Normalización de id de categoría ─────────────────────────────────────
// model_portfolios guarda la categoría SIN prefijo de rol (ej. "usa_large_cap",
// "ust_belly", "gold", "tbills") o con ids pass-through (ej. "rv_small_cap_us").
// resolveCategoria() devuelve la ComiteCategory canónica desde cualquiera de esas formas.
const ROLE_PREFIX = /^(rv|rf|alt|cash)_/;

// Índice por id "pelado" (sin rv_/rf_/alt_/cash_). Primer match gana
// (RV antes que RF para "chile", por el orden de COMITE_CATEGORIES).
const strippedIndex = new Map<string, ComiteCategory>();
for (const c of COMITE_CATEGORIES) {
  const key = c.id.replace(ROLE_PREFIX, "");
  if (!strippedIndex.has(key)) strippedIndex.set(key, c);
}

// Alias para ids cuyo stem no coincide con el id canónico.
const CATEGORY_ALIASES: Record<string, string> = {
  rv_small_cap_us: "rv_usa_small_cap",
  small_cap_us: "rv_usa_small_cap",
};

export function resolveCategoria(rawId: string): ComiteCategory | undefined {
  const aliased = CATEGORY_ALIASES[rawId] ?? rawId;
  return getCategoryById(aliased) || strippedIndex.get(aliased.replace(ROLE_PREFIX, ""));
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `npx vitest run lib/comite-categories.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Actualizar el route para usar la función compartida y arreglar el Fix 1**

En `app/api/comite/recomendacion/route.ts`:

(5a) Cambiar el import (línea 9-10) para traer `resolveCategoria` y borrar el bloque inline (líneas 13-25 `ROLE_PREFIX`/`strippedIndex`/`resolveCategoria`):

```ts
import { mapClientProfile, resolveCategoria } from "@/lib/comite-categories";
import { resolveMisFondos, defaultDecision } from "@/lib/recomendacion/resolve";
import type { CustodianType, RecomendacionRow } from "@/lib/recomendacion/types";
```

(Nota: ya no se usan `COMITE_CATEGORIES`, `getCategoryById` ni el type `ComiteCategory` directamente; quitarlos del import. `resolveCategoria` ya existe importada.)

(5b) En el loop (líneas 114-124), **pasar `cat.id`** (canónico con prefijo) a `resolveMisFondos` y a `defaultDecision` en vez de `p.categoria` (crudo) — ESTE es el Fix 1:

```ts
      const cat = resolveCategoria(p.categoria);
      if (!cat) continue; // (Task 2 reemplaza este continue)
      const comite = {
        etf_us: p.etf_us ?? cat.etfUS, etf_ucits: p.etf_ucits ?? cat.etfUCITS,
        modelo_pct: pct, vista: p.vista ?? null, conviction: p.conviction ?? null,
      };
      const misFondos = resolveMisFondos({ categoria: cat.id, custodios, preferredFunds, mappings: mappingRows });
      const custodioDefault = misFondos[0]?.custodian_type || custodios[0];
      const decision = defaultDecision({ categoria: cat.id, role: cat.role, comite, misFondos, custodio: custodioDefault });
      rows.push({ categoria: cat.id, label: cat.label, role: cat.role, comite, misFondos, decision });
```

- [ ] **Step 6: Verificar tests existentes + tipos**

Run: `npx vitest run lib/recomendacion/resolve.test.ts lib/comite-categories.test.ts`
Expected: PASS (todos; los de `resolve.test.ts` ya usaban ids con prefijo, siguen verdes).
Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add lib/comite-categories.ts lib/comite-categories.test.ts app/api/comite/recomendacion/route.ts
git commit -m "fix(recomendacion): normaliza categoría con prefijo (Mis Fondos ya no sale vacío) + categoría RV USA Small Cap"
```

---

## Task 2: Red de seguridad para posiciones sin categoría (Fix 2b)

**Files:**
- Modify: `lib/recomendacion/types.ts`
- Modify: `lib/recomendacion/resolve.ts`
- Modify: `lib/recomendacion/resolve.test.ts`
- Modify: `app/api/comite/recomendacion/route.ts` (loop, donde estaba el `continue`)
- Modify: `components/recomendacion/RecomendacionTable.tsx`

**Interfaces:**
- Consumes: tipos `RecomendacionRow`, `Decision` de `./types`.
- Produces: `RecomendacionRow.sin_categoria?: boolean`; `buildUnresolvedRow(rawCategoria: string, pct: number): RecomendacionRow` en `resolve.ts`.

- [ ] **Step 1: Agregar el flag al tipo** (`lib/recomendacion/types.ts`)

En `RecomendacionRow` (después de `decision: Decision;`):

```ts
export interface RecomendacionRow {
  categoria: string; // id de COMITE_CATEGORIES
  label: string;
  role: ComiteRole;
  comite: ComiteColumn;
  misFondos: MiFondoOption[];
  decision: Decision;
  sin_categoria?: boolean; // true = el comité trajo una categoría que no resuelve; se conserva con aviso
}
```

- [ ] **Step 2: Escribir el test que falla** (agregar a `lib/recomendacion/resolve.test.ts`)

```ts
import { buildUnresolvedRow } from "./resolve";

describe("buildUnresolvedRow", () => {
  it("conserva una posición sin categoría con su peso y la marca sin_categoria", () => {
    const row = buildUnresolvedRow("categoria_rara", 7.5);
    expect(row.sin_categoria).toBe(true);
    expect(row.categoria).toBe("categoria_rara");
    expect(row.label).toBe("categoria_rara");
    expect(row.role).toBe("cash"); // sin rol conocido → cash (no infla RV/RF)
    expect(row.decision.fuente).toBe("caja");
    expect(row.decision.porcentaje).toBe(7.5);
    expect(row.comite.modelo_pct).toBe(7.5);
    expect(row.misFondos).toEqual([]);
  });
});
```

- [ ] **Step 3: Correr el test para verificar que falla**

Run: `npx vitest run lib/recomendacion/resolve.test.ts`
Expected: FAIL — `buildUnresolvedRow is not a function`.

- [ ] **Step 4: Implementar `buildUnresolvedRow` en `lib/recomendacion/resolve.ts`**

Agregar (después de `defaultDecision`):

```ts
// Fila para una posición del comité cuya categoría NO resuelve a COMITE_CATEGORIES.
// En vez de descartarla en silencio (dejando el total < 100%), se conserva con su
// peso, rol "cash" (para no inflar RV/RF), sin fondos, y marcada sin_categoria.
export function buildUnresolvedRow(rawCategoria: string, pct: number): RecomendacionRow {
  return {
    categoria: rawCategoria,
    label: rawCategoria,
    role: "cash",
    comite: { etf_us: null, etf_ucits: null, modelo_pct: pct, vista: null, conviction: null },
    misFondos: [],
    decision: { fuente: "caja", ticker: null, nombre: "Sin categoría", clase: "Cash", custodian_type: null, porcentaje: pct },
    sin_categoria: true,
  };
}
```

(Asegurar que `RecomendacionRow` esté importado en `resolve.ts` — ya lo está en el import de `./types`.)

- [ ] **Step 5: Correr el test para verificar que pasa**

Run: `npx vitest run lib/recomendacion/resolve.test.ts`
Expected: PASS.

- [ ] **Step 6: Usar `buildUnresolvedRow` en el route (reemplazar el `continue`)**

En `app/api/comite/recomendacion/route.ts`, importar la función:

```ts
import { resolveMisFondos, defaultDecision, buildUnresolvedRow } from "@/lib/recomendacion/resolve";
```

Y en el loop, reemplazar `if (!cat) continue;` por:

```ts
      const cat = resolveCategoria(p.categoria);
      if (!cat) { rows.push(buildUnresolvedRow(p.categoria, pct)); continue; }
```

- [ ] **Step 7: Aviso en la tabla** (`components/recomendacion/RecomendacionTable.tsx`)

(7a) En el `<tbody>`, la fila de datos usa `row.sin_categoria` para pintarse en ámbar y mostrar solo el aviso. Envolver el contenido de la celda "Comité" (líneas 89-97) para el caso sin categoría, y neutralizar Mis Fondos/Decisión. Reemplazar la fila `<tr>` (líneas 87-156) para que, si `row.sin_categoria`, muestre una fila compacta:

```tsx
                  {row.sin_categoria ? (
                    <tr className="bg-amber-50">
                      <td className="px-3 py-2 align-top" colSpan={3}>
                        <span className="text-amber-700 font-medium">⚠ Posición sin categoría: </span>
                        <span className="text-gb-black">{row.label}</span>
                        <span className="text-[10px] text-gb-gray"> — el comité trajo una categoría que no se reconoce; revisar el mapeo.</span>
                      </td>
                      <td className="px-3 py-2 text-right align-top">
                        <input
                          type="number" step="0.5" min="0" max="100"
                          value={row.decision.porcentaje}
                          onChange={(e) => setDecision(row.categoria, { porcentaje: Math.max(0, Math.min(100, parseFloat(e.target.value) || 0)) })}
                          className="w-16 px-1 py-0.5 text-xs text-right border border-gb-border rounded"
                        />
                      </td>
                    </tr>
                  ) : (
                    <tr>
                      {/* … el bloque actual de Comité | Mis Fondos | Decisión | Peso … */}
                    </tr>
                  )}
```

(Mover el `<tr>` existente completo — Comité/Mis Fondos/Decisión/Peso, líneas 87-156 — dentro de la rama `: (` sin cambios internos.)

(7b) Encima de la tabla (antes del `<div className="overflow-x-auto">`, línea 71), un banner si hay alguna fila sin categoría:

```tsx
      {rows.some(r => r.sin_categoria) && (
        <div className="px-4 py-2 bg-amber-50 border-b border-amber-200 text-xs text-amber-800">
          Hay posiciones del comité sin categoría reconocida. Se incluyen con su peso para que el total cuadre, pero revisá el mapeo antes de guardar.
        </div>
      )}
```

- [ ] **Step 8: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 9: Commit**

```bash
git add lib/recomendacion/types.ts lib/recomendacion/resolve.ts lib/recomendacion/resolve.test.ts app/api/comite/recomendacion/route.ts components/recomendacion/RecomendacionTable.tsx
git commit -m "fix(recomendacion): conserva posiciones sin categoría con aviso (el total ya no queda <100% en silencio)"
```

---

## Task 3: TAC + rentabilidad 12M ponderados (Fix 3)

**Files:**
- Create: `lib/comite/ficha-metrics.ts`
- Modify: `lib/recomendacion/types.ts` (`Decision.tac`, `Decision.rent_12m`)
- Modify: `lib/recomendacion/resolve.ts` (`defaultDecision` propaga; `weightedMetrics`)
- Modify: `lib/recomendacion/resolve.test.ts` (test de `weightedMetrics`)
- Modify: `app/api/comite/recomendacion/route.ts` (usar `getFichaMetrics`)
- Modify: `components/recomendacion/RecomendacionTable.tsx` (click propaga tac/rent; footer)

**Interfaces:**
- Produces: `getFichaMetrics(supabase, fundRuns: string[]): Promise<Map<string, { tac: number | null; rent_12m: number | null }>>` (key = `fund_run` tal cual está en `advisor_preferred_funds`). `weightedMetrics(rows: RecomendacionRow[]): { tac: number | null; rent12m: number | null; coverage: number }` en `resolve.ts`.

- [ ] **Step 1: Crear el helper de fichas** (`lib/comite/ficha-metrics.ts`)

```ts
import type { SupabaseClient } from "@supabase/supabase-js";

export interface FichaMetrics {
  tac: number | null;
  rent_12m: number | null;
}

/**
 * Devuelve TAC (%) y rentabilidad 12M nominal (%) por `fund_run` de advisor_preferred_funds.
 * FM (fund_run "foRun-serie"): desde vw_fondos_completo (tac_sintetica, rent_12m_nominal).
 * FI (fund_run "rut-FI"): TAC desde fi_fichas.tac_serie; rent 12M no disponible (null) en esta versión.
 * Mismo criterio de parseo que /api/advisor/preferred-funds.
 */
export async function getFichaMetrics(
  supabase: SupabaseClient,
  fundRuns: string[],
): Promise<Map<string, FichaMetrics>> {
  const out = new Map<string, FichaMetrics>();
  const runs = [...new Set(fundRuns.filter(Boolean))];
  if (runs.length === 0) return out;

  const fmRuns = runs.filter((r) => !r.endsWith("-FI"));
  const fiRuns = runs.filter((r) => r.endsWith("-FI"));

  // FM: vw_fondos_completo (fo_run + fm_serie)
  if (fmRuns.length > 0) {
    const foRuns = [...new Set(fmRuns.map((r) => parseInt(r.split("-")[0], 10)))].filter((n) => n > 0);
    if (foRuns.length > 0) {
      const { data } = await supabase
        .from("vw_fondos_completo")
        .select("fo_run, fm_serie, tac_sintetica, rent_12m_nominal")
        .in("fo_run", foRuns);
      const byKey = new Map<string, { tac: number | null; rent_12m: number | null }>();
      for (const row of data || []) {
        byKey.set(`${row.fo_run}-${row.fm_serie}`, {
          tac: row.tac_sintetica ?? null,
          rent_12m: row.rent_12m_nominal ?? null,
        });
      }
      for (const fr of fmRuns) {
        const m = byKey.get(fr);
        if (m) out.set(fr, m);
      }
    }
  }

  // FI: fi_fichas (fi_rut + fi_serie), TAC solamente
  if (fiRuns.length > 0) {
    const ruts = [...new Set(fiRuns.map((r) => r.replace(/-FI$/, "")))];
    const { data } = await supabase
      .from("fi_fichas")
      .select("fi_rut, fi_serie, tac_serie")
      .in("fi_rut", ruts);
    for (const fr of fiRuns) {
      const rut = fr.replace(/-FI$/, "");
      const ficha = (data || []).find((f) => String(f.fi_rut) === rut);
      if (ficha) out.set(fr, { tac: ficha.tac_serie ?? null, rent_12m: null });
    }
  }

  return out;
}
```

- [ ] **Step 2: Agregar `tac`/`rent_12m` al tipo `Decision`** (`lib/recomendacion/types.ts`)

```ts
export interface Decision {
  fuente: DecisionFuente;
  ticker: string | null;
  nombre: string;
  clase: string;
  custodian_type: CustodianType | null;
  porcentaje: number;
  tac?: number | null;       // solo cuando fuente = mi_fondo (para el ponderado del footer)
  rent_12m?: number | null;
}
```

- [ ] **Step 3: Escribir el test que falla** (agregar a `lib/recomendacion/resolve.test.ts`)

```ts
import { weightedMetrics } from "./resolve";

describe("weightedMetrics", () => {
  const mk = (fuente: "mi_fondo" | "caja", porcentaje: number, tac: number | null, rent: number | null): RecomendacionRow => ({
    categoria: "x", label: "x", role: "rv",
    comite: { etf_us: null, etf_ucits: null, modelo_pct: porcentaje, vista: null, conviction: null },
    misFondos: [],
    decision: { fuente, ticker: null, nombre: "n", clase: "Renta Variable", custodian_type: "agf", porcentaje, tac, rent_12m: rent },
  });

  it("pondera TAC/rent solo sobre las filas con dato y reporta cobertura", () => {
    const rows = [mk("mi_fondo", 60, 1.0, 8), mk("mi_fondo", 20, 2.0, 4), mk("caja", 20, null, null)];
    const r = weightedMetrics(rows);
    // TAC ponderado sobre 80%: (1.0*60 + 2.0*20)/80 = 1.25
    expect(r.tac).toBeCloseTo(1.25, 4);
    // rent ponderada sobre 80%: (8*60 + 4*20)/80 = 7
    expect(r.rent12m).toBeCloseTo(7, 4);
    expect(r.coverage).toBeCloseTo(0.8, 4); // 80 de 100
  });

  it("sin filas con dato → null y cobertura 0", () => {
    const r = weightedMetrics([mk("caja", 100, null, null)]);
    expect(r.tac).toBeNull();
    expect(r.rent12m).toBeNull();
    expect(r.coverage).toBe(0);
  });
});
```

- [ ] **Step 4: Correr el test para verificar que falla**

Run: `npx vitest run lib/recomendacion/resolve.test.ts`
Expected: FAIL — `weightedMetrics is not a function`.

- [ ] **Step 5: Implementar en `resolve.ts`**

(5a) En `defaultDecision`, en la rama `mi_fondo` (donde hoy retorna), propagar tac/rent del mejor fondo:

```ts
  if (best) {
    return { fuente: "mi_fondo", ticker: best.ticker, nombre: best.nombre,
      clase, custodian_type: best.custodian_type, porcentaje: comite.modelo_pct,
      tac: best.tac, rent_12m: best.rent_12m };
  }
```

(5b) Agregar `weightedMetrics` (al final del archivo):

```ts
// TAC y rent 12M ponderados por peso, SOLO sobre las decisiones que tienen el dato
// (típicamente "mi_fondo"). coverage = fracción de la cartera con dato (0..1).
export function weightedMetrics(rows: RecomendacionRow[]): { tac: number | null; rent12m: number | null; coverage: number } {
  let tacSum = 0, tacW = 0, rentSum = 0, rentW = 0, totalW = 0;
  for (const r of rows) {
    const w = r.decision.porcentaje || 0;
    totalW += w;
    if (r.decision.tac != null) { tacSum += r.decision.tac * w; tacW += w; }
    if (r.decision.rent_12m != null) { rentSum += r.decision.rent_12m * w; rentW += w; }
  }
  return {
    tac: tacW > 0 ? tacSum / tacW : null,
    rent12m: rentW > 0 ? rentSum / rentW : null,
    coverage: totalW > 0 ? tacW / totalW : 0,
  };
}
```

- [ ] **Step 6: Correr el test para verificar que pasa**

Run: `npx vitest run lib/recomendacion/resolve.test.ts`
Expected: PASS.

- [ ] **Step 7: Enriquecer los fondos preferidos en el route** (`app/api/comite/recomendacion/route.ts`)

Importar el helper:

```ts
import { getFichaMetrics } from "@/lib/comite/ficha-metrics";
```

Reemplazar el bloque de `preferredFunds` (líneas 94-98, que hoy fija `tac: null, rent_12m: null`) por la versión enriquecida (después de cargar `preferred` y ANTES de `mappingRows`):

```ts
    const fichaMetrics = await getFichaMetrics(supabase, (preferred || []).map(f => f.fund_run as string));
    const preferredFunds = (preferred || []).map(f => {
      const m = fichaMetrics.get(f.fund_run as string);
      return {
        id: f.id as string, fund_run: (f.fund_run as string) ?? null, ticker: (f.ticker as string) ?? null,
        nombre: (f.fund_name as string) || "", custodian_type: f.custodian_type as CustodianType,
        category: (f.category as string) || "", tac: m?.tac ?? null, rent_12m: m?.rent_12m ?? null,
      };
    });
```

(Actualizar el comentario de las líneas 83-84 que decía que TAC queda null — ya no aplica.)

- [ ] **Step 8: Footer con TAC/rent ponderados + click que propaga** (`components/recomendacion/RecomendacionTable.tsx`)

(8a) Importar `weightedMetrics`:

```ts
import { roleToClase, weightedMetrics } from "@/lib/recomendacion/resolve";
```

(8b) El botón de "mi fondo" (líneas 106-119) debe propagar tac/rent a la decisión:

```tsx
                              onClick={() => setDecision(row.categoria, {
                                fuente: "mi_fondo", ticker: f.ticker ?? (f.fund_run ? String(f.fund_run) : null),
                                nombre: f.nombre, custodian_type: f.custodian_type, clase: roleToClase(row.role),
                                tac: f.tac, rent_12m: f.rent_12m,
                              })}
```

(8c) En el footer (después del bloque de resumen por rol, dentro del `<div>` del footer, líneas 221-225) agregar TAC/rent ponderados:

```tsx
        {(() => {
          const wm = weightedMetrics(rows);
          return (
            <div className="flex items-center gap-3 text-xs text-gb-gray">
              <span>TAC: <span className="font-medium text-gb-black">{wm.tac != null ? `${wm.tac.toFixed(2)}%` : "—"}</span></span>
              <span>Rent 12M: <span className="font-medium text-gb-black">{wm.rent12m != null ? `${wm.rent12m.toFixed(1)}%` : "—"}</span></span>
              {wm.coverage < 0.999 && wm.tac != null && (
                <span className="text-[10px]">(sobre {(wm.coverage * 100).toFixed(0)}% de la cartera)</span>
              )}
            </div>
          );
        })()}
```

- [ ] **Step 9: Verificar tests + tipos**

Run: `npx vitest run lib/recomendacion/resolve.test.ts lib/comite-categories.test.ts`
Expected: PASS.
Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 10: Commit**

```bash
git add lib/comite/ficha-metrics.ts lib/recomendacion/types.ts lib/recomendacion/resolve.ts lib/recomendacion/resolve.test.ts app/api/comite/recomendacion/route.ts components/recomendacion/RecomendacionTable.tsx
git commit -m "feat(recomendacion): TAC + rent 12M ponderados en el footer (enriquecido desde fichas)"
```

---

## Task 4: Naming Radiografía → Recomendación (Fix 4)

**Files:**
- Modify: `components/shared/AdvisorSidebar.tsx:49`
- Modify: `app/(advisor-shell)/recomendacion/page.tsx:15-18`

- [ ] **Step 1: Sidebar** (`components/shared/AdvisorSidebar.tsx`)

Cambiar la línea 49:

```ts
  { href: "/recomendacion", label: "Recomendación", icon: Target },
```

- [ ] **Step 2: Página selectora** (`app/(advisor-shell)/recomendacion/page.tsx`)

Cambiar el `<h1>` y el subtítulo (líneas 15-18):

```tsx
        <h1 className="text-2xl font-semibold text-gb-black">Recomendación</h1>
        <p className="text-sm text-gb-gray mt-1">
          Radiografía del cliente y construcción de la recomendación desde el comité
        </p>
```

- [ ] **Step 3: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add components/shared/AdvisorSidebar.tsx "app/(advisor-shell)/recomendacion/page.tsx"
git commit -m "chore(recomendacion): renombra la sección a 'Recomendación' (sidebar + h1)"
```

---

## Verificación final (tras las 4 tasks)

- [ ] `npx vitest run lib/recomendacion/resolve.test.ts lib/comite-categories.test.ts` → todo verde.
- [ ] `npx tsc --noEmit` → exit 0.
- [ ] `npm run lint` → sin errores nuevos.
- [ ] Verificación manual en preview con un `model_portfolios` real cargado (perfil del cliente mapeado): abrir `/recomendacion/[clientId]` → pestaña "Construir recomendación" y confirmar:
  - "Mis Fondos" ya NO sale vacío cuando el asesor tiene fondos preferidos en la categoría.
  - Si el comité trae una categoría rara, aparece la fila/banner de aviso y el total suma 100%.
  - El footer muestra TAC y Rent 12M (con la nota de cobertura si aplica).
  - El sidebar y el título dicen "Recomendación".
