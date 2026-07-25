# Vista Recomendación por Comité (3 columnas) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir una vista `/recomendacion` que arma la recomendación de un cliente desde la cartera-modelo del comité (`model_portfolios`) en 3 columnas (Comité · Mis Fondos filtrado por custodio · Decisión editable) y la guarda enriquecida en `clients.cartera_recomendada`.

**Architecture:** Lógica pura y testeable en `lib/recomendacion/` (mapeo de columnas, reglas de default, derivación de `cartera[]`). Un endpoint `GET /api/comite/recomendacion` compone los datos server-side (model_portfolios + preferred funds + custodios del cliente). El guardado extiende `POST /api/comite/aplicar-cartera`. La UI es una página en el route-group advisor-shell con un componente de tabla, reusando `ClientSelector`, el buscador de fondos y el patrón de `XrayProposalTable`.

**Tech Stack:** Next.js 16 (App Router) + React 19 + Supabase (admin client) + TypeScript + Vitest. Sin librerías nuevas.

## Global Constraints

- Path alias `@/` → raíz del repo. Usar `@/lib/...`, `@/components/...`.
- Auth de rutas API: `requireAdvisor()` de `@/lib/auth/api-auth`; tras el check usar `createAdminClient()`. Verificar acceso al cliente con `requireClientAccess(clientId)` de `@/lib/auth/api-auth`.
- Respuestas API: `successResponse()` / `errorResponse()` de `@/lib/api-response`, dentro de `handleApiError("route-name", async () => {...})`.
- Rate limit: `applyRateLimit(request, "route-name", { limit: N })`.
- Reusar SIEMPRE `@/lib/comite-categories` (`COMITE_CATEGORIES`, `mapClientProfile`, `PREFERRED_TO_COMITE`, `ComiteRole`). No redefinir categorías ni mapeos.
- Tests: Vitest. Correr uno con `npx vitest run <archivo>`.
- Commits frecuentes, mensajes en español, terminar con `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- Rama de trabajo: `feat/recomendacion-comite-3col` (ya creada).

---

## File Structure

- Create `lib/recomendacion/types.ts` — tipos compartidos (columnas, decisión, fila).
- Create `lib/recomendacion/resolve.ts` — funciones puras: `roleToClase`, `defaultDecision`, `resolveMisFondos`, `deriveCartera`, `sumaPesos`.
- Create `lib/recomendacion/resolve.test.ts` — tests unitarios de `resolve.ts`.
- Create `app/api/comite/recomendacion/route.ts` — `GET`: compone las filas de 3 columnas para un cliente.
- Modify `app/api/comite/aplicar-cartera/route.ts` — aceptar payload enriquecido (`source: "comite_3col"`, `posiciones[]`, `comite_report_date`, `custodios`) y derivar `cartera[]`.
- Create `components/recomendacion/hooks/useRecomendacion.ts` — fetch + estado editable de las filas.
- Create `components/recomendacion/RecomendacionTable.tsx` — la tabla de 3 columnas + footer de totales.
- Create `app/(advisor-shell)/recomendacion/page.tsx` — página con `ClientSelector` + tabla + guardar.
- Modify el sidebar (`components/**/AdvisorSidebar*.tsx`) — ítem "Recomendación".

---

## Contratos compartidos (definidos en Task 1, usados por todas)

```ts
// lib/recomendacion/types.ts
import type { ComiteRole } from "@/lib/comite-categories";

export type CustodianType = "agf" | "corredora" | "internacional";
export type DecisionFuente = "mi_fondo" | "comite_etf" | "custom" | "caja";

export interface ComiteColumn {
  etf_us: string | null;
  etf_ucits: string | null;
  modelo_pct: number;
  vista: string | null;       // "OW" | "UW" | "N" | null
  conviction: string | null;  // "ALTA" | "MEDIA" | "BAJA" | null
}

export interface MiFondoOption {
  fund_id: string;
  fund_run: number | null;
  ticker: string | null;
  nombre: string;
  custodian_type: CustodianType;
  tac: number | null;
  rent_12m: number | null;
  isMapped: boolean; // true = de model_fund_mapping (confirmado); false = sugerido
}

export interface Decision {
  fuente: DecisionFuente;
  ticker: string | null;
  nombre: string;
  clase: string; // "Renta Variable" | "Renta Fija" | "Alternativos" | "Cash"
  custodian_type: CustodianType | null;
  porcentaje: number;
}

export interface RecomendacionRow {
  categoria: string; // id de COMITE_CATEGORIES
  label: string;
  role: ComiteRole;
  comite: ComiteColumn;
  misFondos: MiFondoOption[];
  decision: Decision;
}

// Fila de cartera_recomendada.cartera[] (compat con consumidores actuales)
export interface CarteraPosition {
  clase: string;
  ticker: string | null;
  nombre: string;
  porcentaje: number;
}
```

---

### Task 1: Tipos + reglas puras (`roleToClase`, `defaultDecision`)

**Files:**
- Create: `lib/recomendacion/types.ts` (contenido en el bloque "Contratos compartidos" de arriba)
- Create: `lib/recomendacion/resolve.ts`
- Test: `lib/recomendacion/resolve.test.ts`

**Interfaces:**
- Consumes: `ComiteRole` de `@/lib/comite-categories`; tipos de `./types`.
- Produces: `roleToClase(role: ComiteRole): string`; `defaultDecision(input): Decision`.

- [ ] **Step 1: Escribir `types.ts`** con exactamente el bloque "Contratos compartidos".

- [ ] **Step 2: Escribir el test que falla** en `lib/recomendacion/resolve.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { roleToClase, defaultDecision } from "./resolve";
import type { ComiteColumn, MiFondoOption } from "./types";

describe("roleToClase", () => {
  it("mapea roles del comité a la clase de cartera_recomendada", () => {
    expect(roleToClase("rv")).toBe("Renta Variable");
    expect(roleToClase("rf")).toBe("Renta Fija");
    expect(roleToClase("alt")).toBe("Alternativos");
    expect(roleToClase("cash")).toBe("Cash");
  });
});

describe("defaultDecision", () => {
  const comite: ComiteColumn = { etf_us: "VOO", etf_ucits: "CSPX", modelo_pct: 22, vista: "UW", conviction: "MEDIA" };
  const miFondo: MiFondoOption = { fund_id: "f1", fund_run: 9226, ticker: null, nombre: "FM BCI USA", custodian_type: "agf", tac: 1.2, rent_12m: 8, isMapped: true };

  it("AGF con mi fondo → usa el fondo", () => {
    const d = defaultDecision({ categoria: "rv_usa_large_cap", role: "rv", comite, misFondos: [miFondo], custodio: "agf" });
    expect(d.fuente).toBe("mi_fondo");
    expect(d.nombre).toBe("FM BCI USA");
    expect(d.custodian_type).toBe("agf");
    expect(d.porcentaje).toBe(22);
    expect(d.clase).toBe("Renta Variable");
  });

  it("AGF sin mi fondo → sin equivalente = caja (peso a decidir por el asesor)", () => {
    const d = defaultDecision({ categoria: "rv_usa_large_cap", role: "rv", comite, misFondos: [], custodio: "agf" });
    expect(d.fuente).toBe("caja");
    expect(d.ticker).toBeNull();
    expect(d.porcentaje).toBe(22);
  });

  it("internacional sin mi fondo → ETF del comité (US preferido)", () => {
    const d = defaultDecision({ categoria: "rv_usa_large_cap", role: "rv", comite, misFondos: [], custodio: "internacional" });
    expect(d.fuente).toBe("comite_etf");
    expect(d.ticker).toBe("VOO");
  });

  it("internacional con mi fondo → prioriza mi fondo", () => {
    const d = defaultDecision({ categoria: "rv_usa_large_cap", role: "rv", comite, misFondos: [miFondo], custodio: "internacional" });
    expect(d.fuente).toBe("mi_fondo");
  });
});
```

- [ ] **Step 3: Correr y ver que falla**

Run: `npx vitest run lib/recomendacion/resolve.test.ts`
Expected: FAIL (no existe `./resolve`).

- [ ] **Step 4: Implementar `lib/recomendacion/resolve.ts` (parte 1)**

```ts
import type { ComiteRole } from "@/lib/comite-categories";
import type { ComiteColumn, CustodianType, Decision, MiFondoOption } from "./types";

const ROLE_TO_CLASE: Record<ComiteRole, string> = {
  rv: "Renta Variable",
  rf: "Renta Fija",
  alt: "Alternativos",
  cash: "Cash",
};

export function roleToClase(role: ComiteRole): string {
  return ROLE_TO_CLASE[role];
}

export function defaultDecision(input: {
  categoria: string;
  role: ComiteRole;
  comite: ComiteColumn;
  misFondos: MiFondoOption[];
  custodio: CustodianType;
}): Decision {
  const { role, comite, misFondos, custodio } = input;
  const clase = roleToClase(role);
  const best = misFondos[0]; // ya viene ordenado (mapped primero, luego mejor TAC)

  // Prioridad 1: si hay un fondo del asesor disponible, usarlo (aplica a todos los custodios)
  if (best) {
    return { fuente: "mi_fondo", ticker: best.ticker, nombre: best.nombre,
      clase, custodian_type: best.custodian_type, porcentaje: comite.modelo_pct };
  }

  // Prioridad 2: sin fondo del asesor.
  // internacional/corredora pueden comprar el ETF del comité en bolsa.
  if (custodio === "internacional" || custodio === "corredora") {
    const etf = comite.etf_us || comite.etf_ucits;
    if (etf) {
      return { fuente: "comite_etf", ticker: etf, nombre: etf,
        clase, custodian_type: custodio, porcentaje: comite.modelo_pct };
    }
  }

  // AGF sin equivalente (o categoría sin ETF): default a caja, el asesor decide.
  return { fuente: "caja", ticker: null, nombre: "Caja",
    clase, custodian_type: custodio, porcentaje: comite.modelo_pct };
}
```

- [ ] **Step 5: Correr y ver que pasa**

Run: `npx vitest run lib/recomendacion/resolve.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/recomendacion/types.ts lib/recomendacion/resolve.ts lib/recomendacion/resolve.test.ts
git commit -m "feat(recomendacion): tipos + reglas puras roleToClase/defaultDecision"
```

---

### Task 2: `resolveMisFondos` (Col 2) + `deriveCartera` + `sumaPesos`

**Files:**
- Modify: `lib/recomendacion/resolve.ts`
- Test: `lib/recomendacion/resolve.test.ts`

**Interfaces:**
- Consumes: `PREFERRED_TO_COMITE` de `@/lib/comite-categories`; tipos de `./types`.
- Produces:
  - `resolveMisFondos(input): MiFondoOption[]`
  - `deriveCartera(rows: RecomendacionRow[]): CarteraPosition[]`
  - `sumaPesos(rows: RecomendacionRow[]): number`

- [ ] **Step 1: Escribir tests que fallan** (añadir a `resolve.test.ts`):

```ts
import { resolveMisFondos, deriveCartera, sumaPesos } from "./resolve";
import type { RecomendacionRow } from "./types";

describe("resolveMisFondos", () => {
  const funds = [
    { id: "f1", fund_run: 100, ticker: null, nombre: "AGF USA A", custodian_type: "agf" as const, category: "RV USA", tac: 1.5, rent_12m: 7 },
    { id: "f2", fund_run: 200, ticker: null, nombre: "AGF USA B", custodian_type: "agf" as const, category: "RV Internacional", tac: 0.9, rent_12m: 9 },
    { id: "f3", fund_run: 300, ticker: null, nombre: "Corredora Global", custodian_type: "corredora" as const, category: "RV Global", tac: 0.5, rent_12m: 10 },
  ];

  it("filtra por categoría del comité (PREFERRED_TO_COMITE) y por custodio, ordena mapped primero luego menor TAC", () => {
    const res = resolveMisFondos({
      categoria: "rv_usa_large_cap",
      custodios: ["agf"],
      preferredFunds: funds,
      mappings: [{ categoria: "rv_usa_large_cap", custodian_type: "agf", preferred_fund_id: "f1" }],
    });
    expect(res.map(f => f.fund_id)).toEqual(["f1", "f2"]); // f1 mapped primero; f3 excluido (corredora)
    expect(res[0].isMapped).toBe(true);
    expect(res[1].isMapped).toBe(false);
  });

  it("sin mapeo: solo sugeridos por categoría+custodio, ordenados por TAC", () => {
    const res = resolveMisFondos({ categoria: "rv_usa_large_cap", custodios: ["agf"], preferredFunds: funds, mappings: [] });
    expect(res.map(f => f.fund_id)).toEqual(["f2", "f1"]); // f2 menor TAC
  });

  it("custodio sin fondos → vacío", () => {
    const res = resolveMisFondos({ categoria: "rv_usa_large_cap", custodios: ["internacional"], preferredFunds: funds, mappings: [] });
    expect(res).toEqual([]);
  });
});

describe("deriveCartera + sumaPesos", () => {
  const rows: RecomendacionRow[] = [
    { categoria: "rv_usa_large_cap", label: "RV USA Large Cap", role: "rv",
      comite: { etf_us: "VOO", etf_ucits: "CSPX", modelo_pct: 60, vista: null, conviction: null },
      misFondos: [], decision: { fuente: "comite_etf", ticker: "VOO", nombre: "VOO", clase: "Renta Variable", custodian_type: "internacional", porcentaje: 60 } },
    { categoria: "cash_tbills", label: "US T-Bills", role: "cash",
      comite: { etf_us: "SGOV", etf_ucits: "ERNS", modelo_pct: 40, vista: null, conviction: null },
      misFondos: [], decision: { fuente: "caja", ticker: null, nombre: "Caja", clase: "Cash", custodian_type: "agf", porcentaje: 40 } },
  ];

  it("deriveCartera produce una fila por decisión con instrumento real", () => {
    const cartera = deriveCartera(rows);
    expect(cartera).toEqual([
      { clase: "Renta Variable", ticker: "VOO", nombre: "VOO", porcentaje: 60 },
      { clase: "Cash", ticker: null, nombre: "Caja", porcentaje: 40 },
    ]);
  });

  it("sumaPesos suma los pesos de las decisiones", () => {
    expect(sumaPesos(rows)).toBe(100);
  });
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx vitest run lib/recomendacion/resolve.test.ts`
Expected: FAIL (funciones no definidas).

- [ ] **Step 3: Implementar** (añadir a `lib/recomendacion/resolve.ts`):

```ts
import { PREFERRED_TO_COMITE } from "@/lib/comite-categories";
import type { CarteraPosition, MiFondoOption, RecomendacionRow } from "./types";

interface PreferredFundInput {
  id: string;
  fund_run: number | null;
  ticker: string | null;
  nombre: string;
  custodian_type: MiFondoOption["custodian_type"];
  category: string;       // categoría del asesor (ej. "RV Internacional")
  tac: number | null;
  rent_12m: number | null;
}
interface MappingInput {
  categoria: string;      // id de COMITE_CATEGORIES
  custodian_type: MiFondoOption["custodian_type"];
  preferred_fund_id: string;
}

export function resolveMisFondos(input: {
  categoria: string;
  custodios: MiFondoOption["custodian_type"][];
  preferredFunds: PreferredFundInput[];
  mappings: MappingInput[];
}): MiFondoOption[] {
  const { categoria, custodios, preferredFunds, mappings } = input;
  const wantedCategories = PREFERRED_TO_COMITE[categoria] || [];
  const custodioSet = new Set(custodios);

  // IDs mapeados explícitamente para esta categoría y algún custodio del cliente
  const mappedIds = new Set(
    mappings.filter(m => m.categoria === categoria && custodioSet.has(m.custodian_type)).map(m => m.preferred_fund_id)
  );

  const candidates = preferredFunds.filter(f =>
    custodioSet.has(f.custodian_type) &&
    (mappedIds.has(f.id) || wantedCategories.includes(f.category))
  );

  const toOption = (f: PreferredFundInput): MiFondoOption => ({
    fund_id: f.id, fund_run: f.fund_run, ticker: f.ticker, nombre: f.nombre,
    custodian_type: f.custodian_type, tac: f.tac, rent_12m: f.rent_12m, isMapped: mappedIds.has(f.id),
  });

  return candidates
    .map(toOption)
    .sort((a, b) => {
      if (a.isMapped !== b.isMapped) return a.isMapped ? -1 : 1;  // mapped primero
      return (a.tac ?? Infinity) - (b.tac ?? Infinity);           // luego menor TAC
    });
}

export function deriveCartera(rows: RecomendacionRow[]): CarteraPosition[] {
  return rows.map(r => ({
    clase: r.decision.clase, ticker: r.decision.ticker,
    nombre: r.decision.nombre, porcentaje: r.decision.porcentaje,
  }));
}

export function sumaPesos(rows: RecomendacionRow[]): number {
  return rows.reduce((acc, r) => acc + (r.decision.porcentaje || 0), 0);
}
```

- [ ] **Step 4: Correr y ver que pasa**

Run: `npx vitest run lib/recomendacion/resolve.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/recomendacion/resolve.ts lib/recomendacion/resolve.test.ts
git commit -m "feat(recomendacion): resolveMisFondos + deriveCartera + sumaPesos"
```

---

### Task 3: `GET /api/comite/recomendacion` — compone las 3 columnas

**Files:**
- Create: `app/api/comite/recomendacion/route.ts`

**Interfaces:**
- Consumes: `resolveMisFondos`, `defaultDecision` de `@/lib/recomendacion/resolve`; `COMITE_CATEGORIES`, `mapClientProfile`, `getCategoryById` de `@/lib/comite-categories`.
- Produces: respuesta JSON `{ ok, perfil_cliente, perfil_modelo, comite_report_date, custodios, rows: RecomendacionRow[], reason? }`.

**Contrato de la respuesta:**
- `reason` (string) presente cuando no se puede armar: `"sin_perfil"` (cliente sin perfil), `"sin_modelo"` (no hay model_portfolios para el perfil), `"sin_custodio"` (no se detecta custodio en snapshots).
- Cada `row` = `RecomendacionRow` (ver contratos). Solo categorías con `modelo_pct > 0`.

- [ ] **Step 1: Implementar la ruta**

```ts
import { NextRequest } from "next/server";
import { requireClientAccess, createAdminClient } from "@/lib/auth/api-auth";
import { successResponse, errorResponse, handleApiError } from "@/lib/api-response";
import { applyRateLimit } from "@/lib/rate-limit";
import { mapClientProfile, getCategoryById } from "@/lib/comite-categories";
import { resolveMisFondos, defaultDecision } from "@/lib/recomendacion/resolve";
import type { CustodianType, RecomendacionRow } from "@/lib/recomendacion/types";

export async function GET(request: NextRequest) {
  const rl = await applyRateLimit(request, "comite-recomendacion", { limit: 30 });
  if (rl) return rl;

  return handleApiError("comite-recomendacion-get", async () => {
    const clientId = request.nextUrl.searchParams.get("clientId");
    if (!clientId) return errorResponse("clientId es requerido", 400);

    const { advisor, error: accessError } = await requireClientAccess(clientId);
    if (accessError) return accessError;

    const supabase = createAdminClient();

    // 1. Perfil del cliente → perfil del modelo
    const { data: client } = await supabase
      .from("clients").select("perfil_riesgo").eq("id", clientId).single();
    const perfilCliente = (client?.perfil_riesgo as string) || "";
    if (!perfilCliente) return successResponse({ ok: false, reason: "sin_perfil" });
    const perfilModelo = mapClientProfile(perfilCliente);

    // 2. Custodios del cliente (distinct custodian_type de sus snapshots)
    const { data: snaps } = await supabase
      .from("portfolio_snapshots").select("custodian_type").eq("client_id", clientId);
    const custodios = [...new Set((snaps || [])
      .map(s => s.custodian_type as CustodianType | null).filter(Boolean))] as CustodianType[];
    if (custodios.length === 0) return successResponse({ ok: false, reason: "sin_custodio", perfil_modelo: perfilModelo });

    // 3. Cartera-modelo del comité (report_date más reciente)
    const { data: modelo } = await supabase
      .from("model_portfolios").select("report_date, posiciones")
      .eq("perfil", perfilModelo).order("report_date", { ascending: false }).limit(1).maybeSingle();
    if (!modelo) return successResponse({ ok: false, reason: "sin_modelo", perfil_modelo: perfilModelo });

    // 4. Fondos preferidos del asesor + mapeos
    const { data: preferred } = await supabase
      .from("advisor_preferred_funds")
      .select("id, fund_run, ticker, fund_name, custodian_type, category, tac")
      .eq("advisor_id", advisor!.id);
    const { data: mappings } = await supabase
      .from("model_fund_mapping")
      .select("categoria, custodian_type, preferred_fund_id")
      .eq("advisor_id", advisor!.id);

    const preferredFunds = (preferred || []).map(f => ({
      id: f.id, fund_run: f.fund_run ?? null, ticker: f.ticker ?? null, nombre: f.fund_name,
      custodian_type: f.custodian_type as CustodianType, category: f.category || "",
      tac: f.tac ?? null, rent_12m: null as number | null,
    }));

    // 5. Componer filas por posición del comité con modelo_pct > 0
    const posiciones = (modelo.posiciones || []) as Array<{
      categoria: string; modelo_pct?: number; etf_us?: string | null; etf_ucits?: string | null;
      vista?: string | null; conviction?: string | null;
    }>;

    const rows: RecomendacionRow[] = [];
    for (const p of posiciones) {
      const pct = Number(p.modelo_pct) || 0;
      if (pct <= 0) continue;
      const cat = getCategoryById(p.categoria);
      if (!cat) continue;
      const comite = {
        etf_us: p.etf_us ?? cat.etfUS, etf_ucits: p.etf_ucits ?? cat.etfUCITS,
        modelo_pct: pct, vista: p.vista ?? null, conviction: p.conviction ?? null,
      };
      const misFondos = resolveMisFondos({ categoria: p.categoria, custodios, preferredFunds, mappings: mappings || [] });
      // default de custodio: si un fondo mapeado existe usa el suyo, si no el primero del cliente
      const custodioDefault = misFondos[0]?.custodian_type || custodios[0];
      const decision = defaultDecision({ categoria: p.categoria, role: cat.role, comite, misFondos, custodio: custodioDefault });
      rows.push({ categoria: p.categoria, label: cat.label, role: cat.role, comite, misFondos, decision });
    }

    return successResponse({
      ok: true, perfil_cliente: perfilCliente, perfil_modelo: perfilModelo,
      comite_report_date: modelo.report_date, custodios, rows,
    });
  });
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0. (Si `advisor_preferred_funds` no tiene columna `tac`, ajustar el `select`; verificar el schema con `supabase/migrations/20260523_custodian_and_mapping.sql`.)

- [ ] **Step 3: Commit**

```bash
git add app/api/comite/recomendacion/route.ts
git commit -m "feat(recomendacion): GET /api/comite/recomendacion compone las 3 columnas"
```

- [ ] **Step 4: Verificación E2E (preview)** — se hace al final (Task 8), no bloquea.

---

### Task 4: Extender `aplicar-cartera` para el payload enriquecido

**Files:**
- Modify: `app/api/comite/aplicar-cartera/route.ts`

**Interfaces:**
- Consumes: `deriveCartera`, tipos de `@/lib/recomendacion`.
- Produces: guarda `clients.cartera_recomendada` con `{ source:"comite_3col", posiciones, comite_report_date, custodios, cartera:[...] }` + versión.

- [ ] **Step 1: Añadir rama enriquecida al handler.** En `app/api/comite/aplicar-cartera/route.ts`, tras parsear el body, detectar el nuevo formato y construir el objeto a guardar. Añadir al inicio del handler (después de `const body = await request.json()`):

```ts
// Nuevo formato desde la vista Recomendación (3 columnas)
if (body.source === "comite_3col") {
  const { clientId, cliente, posiciones, comite_report_date, custodios, resumenEjecutivo } = body as {
    clientId: string; cliente: { nombre: string; perfil: string; puntaje?: number };
    posiciones: import("@/lib/recomendacion/types").RecomendacionRow[];
    comite_report_date: string; custodios: string[]; resumenEjecutivo?: string;
  };
  if (!clientId || !posiciones?.length) {
    return NextResponse.json({ success: false, error: "Faltan datos requeridos" }, { status: 400 });
  }
  const { user, error: accessError } = await requireClientAccess(clientId);
  if (accessError) return accessError;
  const supabase = createAdminClient();

  const { deriveCartera } = await import("@/lib/recomendacion/resolve");
  const cartera = deriveCartera(posiciones);

  const carteraRecomendada = {
    source: "comite_3col",
    comite_report_date, custodios,
    perfil_modelo: cliente?.perfil,
    posiciones,
    cartera,
    resumenEjecutivo: resumenEjecutivo || "Recomendación construida desde el comité.",
    cliente, generadoEn: comite_report_date,
    aplicadoEn: new Date().toISOString(), aplicadoPor: user!.email,
  };

  const { data: lastVersion } = await supabase
    .from("recommendation_versions").select("version_number")
    .eq("client_id", clientId).order("version_number", { ascending: false }).limit(1).maybeSingle();
  const nextVersion = (lastVersion?.version_number || 0) + 1;

  await supabase.from("recommendation_versions").insert({
    client_id: clientId, version_number: nextVersion,
    cartera_recomendada: carteraRecomendada, applied_by: user!.email, applied_at: new Date().toISOString(),
  });

  const { error: updErr } = await supabase.from("clients")
    .update({ cartera_recomendada: carteraRecomendada, updated_at: new Date().toISOString() })
    .eq("id", clientId);
  if (updErr) return NextResponse.json({ success: false, error: updErr.message }, { status: 500 });

  return NextResponse.json({ success: true, message: "Recomendación guardada", data: { versionNumber: nextVersion, cartera } });
}
```

(El código existente para el formato antiguo `recomendacion.cartera` queda intacto debajo.)

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add app/api/comite/aplicar-cartera/route.ts
git commit -m "feat(recomendacion): aplicar-cartera acepta payload enriquecido comite_3col"
```

---

### Task 5: Hook `useRecomendacion`

**Files:**
- Create: `components/recomendacion/hooks/useRecomendacion.ts`

**Interfaces:**
- Consumes: `GET /api/comite/recomendacion`; tipos de `@/lib/recomendacion/types`; `sumaPesos`, `roleToClase` de `@/lib/recomendacion/resolve`.
- Produces: hook `useRecomendacion(clientId)` → `{ loading, ok, reason, rows, custodios, comiteReportDate, perfilModelo, setDecision, totalPeso, save, saving }`.

- [ ] **Step 1: Implementar el hook**

```ts
"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import type { RecomendacionRow, Decision } from "@/lib/recomendacion/types";
import { sumaPesos } from "@/lib/recomendacion/resolve";

export function useRecomendacion(clientId: string | null) {
  const [loading, setLoading] = useState(false);
  const [ok, setOk] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  const [rows, setRows] = useState<RecomendacionRow[]>([]);
  const [custodios, setCustodios] = useState<string[]>([]);
  const [comiteReportDate, setComiteReportDate] = useState<string | null>(null);
  const [perfilModelo, setPerfilModelo] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!clientId) { setRows([]); setOk(false); setReason(null); return; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/comite/recomendacion?clientId=${clientId}`);
        const j = await res.json();
        const d = j.data || j;
        if (cancelled) return;
        setOk(!!d.ok); setReason(d.reason ?? null);
        setRows(d.rows || []); setCustodios(d.custodios || []);
        setComiteReportDate(d.comite_report_date ?? null); setPerfilModelo(d.perfil_modelo ?? null);
      } finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [clientId]);

  const setDecision = useCallback((categoria: string, patch: Partial<Decision>) => {
    setRows(prev => prev.map(r => r.categoria === categoria ? { ...r, decision: { ...r.decision, ...patch } } : r));
  }, []);

  const totalPeso = useMemo(() => sumaPesos(rows), [rows]);

  const save = useCallback(async (cliente: { nombre: string; perfil: string; puntaje?: number }) => {
    if (!clientId) return { ok: false, error: "sin cliente" };
    setSaving(true);
    try {
      const res = await fetch("/api/comite/aplicar-cartera", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ source: "comite_3col", clientId, cliente, posiciones: rows, comite_report_date: comiteReportDate, custodios }),
      });
      const j = await res.json();
      return { ok: !!j.success, error: j.error, version: j.data?.versionNumber };
    } finally { setSaving(false); }
  }, [clientId, rows, comiteReportDate, custodios]);

  return { loading, ok, reason, rows, custodios, comiteReportDate, perfilModelo, setDecision, totalPeso, save, saving };
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add components/recomendacion/hooks/useRecomendacion.ts
git commit -m "feat(recomendacion): hook useRecomendacion (fetch + edición + guardar)"
```

---

### Task 6: `RecomendacionTable` (tabla de 3 columnas + footer)

**Files:**
- Create: `components/recomendacion/RecomendacionTable.tsx`

**Interfaces:**
- Consumes: `RecomendacionRow`, `Decision`, `DecisionFuente` de `@/lib/recomendacion/types`; el retorno de `useRecomendacion` (props `rows`, `setDecision`, `totalPeso`, `custodios`).
- Produces: componente `<RecomendacionTable rows setDecision totalPeso custodios />`.

**Guía de implementación (seguir el patrón visual de `components/seguimiento/XrayProposalTable.tsx`, clases `text-xs`, `text-gb-*`, `border-gb-border`):**
- Tabla con columnas: **Comité** (label + `modelo_pct%` + badge vista OW/UW + convicción + ETF), **Mis Fondos** (lista de `misFondos` con badge "MI FONDO"; botón "usar" por fondo → `setDecision(cat, { fuente:"mi_fondo", ticker, nombre, custodian_type, clase })`; si vacío: "sin equivalente"), **Decisión** (muestra `decision.nombre` + input numérico de `porcentaje` que llama `setDecision(cat, { porcentaje })`; menú para cambiar fuente: usar ETF comité / caja / buscar). El buscador reusa el patrón inline de `XrayProposalTable` (`/api/fondos/search-price`) y al elegir llama `setDecision(cat, { fuente:"custom", ticker, nombre, ... })`.
- Footer: **Total peso** (`totalPeso%`, rojo si ≠ 100 ±0.5, botón "normalizar" que reparte proporcional), resumen por rol (RV/RF/Alt/Caja sumando `porcentaje` por `roleToClase`/`role`).

- [ ] **Step 1: Implementar el componente** siguiendo la guía y el patrón de `XrayProposalTable` (columnas, badges, buscador inline). Cada control muta vía `setDecision`.
- [ ] **Step 2: Typecheck** — Run: `npx tsc --noEmit` → exit 0.
- [ ] **Step 3: Commit**

```bash
git add components/recomendacion/RecomendacionTable.tsx
git commit -m "feat(recomendacion): tabla de 3 columnas Comité/Mis Fondos/Decisión"
```

---

### Task 7: Página `/recomendacion` + guardado

**Files:**
- Create: `app/(advisor-shell)/recomendacion/page.tsx`

**Interfaces:**
- Consumes: `useRecomendacion`, `RecomendacionTable`, `ClientSelector` (`@/components/shared/ClientSelector`).
- Produces: la ruta `/recomendacion`.

**Guía (seguir el patrón de `app/(advisor-shell)/seguimiento/page.tsx`: header estándar `text-2xl font-semibold text-gb-black`, `ClientSelector` arriba a la derecha):**
- Estado `clientId`. `ClientSelector` lo setea. `const rec = useRecomendacion(clientId)`.
- Si `rec.loading` → spinner. Si `!rec.ok` → mensaje según `rec.reason`:
  - `sin_perfil`: "Completa el perfil de riesgo del cliente" + link a `/clients/[id]`.
  - `sin_modelo`: "No hay cartera del comité para el perfil <perfilModelo>" + link a subir (ComiteReportsPanel / `/advisor`).
  - `sin_custodio`: "No se detecta custodio en las cartolas del cliente."
- Si `rec.ok` → `<RecomendacionTable rows={rec.rows} setDecision={rec.setDecision} totalPeso={rec.totalPeso} custodios={rec.custodios} />` + botón **Guardar** (deshabilitado si `totalPeso` fuera de 100±0.5) que llama `rec.save({ nombre, perfil })` y muestra toast de éxito/versión.
- Enlace "Ver Radiografía" al `/clients/[id]/seguimiento` (no duplicar holdings).

- [ ] **Step 1: Implementar la página** según la guía.
- [ ] **Step 2: Typecheck** — Run: `npx tsc --noEmit` → exit 0.
- [ ] **Step 3: Commit**

```bash
git add "app/(advisor-shell)/recomendacion/page.tsx"
git commit -m "feat(recomendacion): página /recomendacion con selector, tabla y guardar"
```

---

### Task 8: Ítem de sidebar + verificación E2E en preview

**Files:**
- Modify: el sidebar del advisor (buscar con `grep -rl "Seguimiento" components app --include=*.tsx | xargs grep -l "AdvisorSidebar\|href=\"/seguimiento\""`).

**Interfaces:**
- Produces: link "Recomendación" (`/recomendacion`) en la sección Principal del sidebar, junto a "Seguimiento".

- [ ] **Step 1: Añadir el ítem** al array de navegación del sidebar (mismo formato que "Seguimiento", icono de lucide p. ej. `Target` o `ClipboardList`, href `/recomendacion`).
- [ ] **Step 2: Typecheck** — Run: `npx tsc --noEmit` → exit 0.
- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(recomendacion): ítem de sidebar Recomendación"
```

- [ ] **Step 4: Push + verificación E2E en preview de Vercel**

```bash
git push -u origin feat/recomendacion-comite-3col
```

Esperar el preview (Vercel), iniciar sesión, y verificar con un cliente que tenga **perfil de riesgo** y **`model_portfolios`** para su perfil:
- La tabla muestra 3 columnas correctas (Comité con `modelo_pct` + vista; Mis Fondos filtrado por el custodio del cliente con badge "MI FONDO"; Decisión con default correcto).
- Cambiar una decisión + peso, cuadrar a 100%, **Guardar** → confirmar respuesta `success:true, versionNumber`.
- Verificar por API que `clients.cartera_recomendada` quedó con `source:"comite_3col"`, `posiciones[]` y `cartera[]` coherentes (fetch a `/api/clients/[id]/seguimiento` o consulta directa).
- Casos borde: cliente sin perfil → mensaje `sin_perfil`; perfil sin modelo → `sin_modelo`.

---

## Self-Review (cobertura del spec)

- §3 modelo enriquecido → Task 4 (guardado) + Task 1/2 (tipos/deriveCartera). ✓
- §4 flujo → Task 3 (GET compone) + Task 7 (página). ✓
- §5 resolución 3 columnas → Task 1 (default) + Task 2 (Col2) + Task 6 (UI). ✓
- §6 custodio del cliente (de snapshots, multi) → Task 3 (detecta custodios) + Task 2 (filtro multi). ✓
- §7 guardado/versionado → Task 4. ✓
- §8 reuso (comite-categories, model_fund_mapping, preferred_funds, ClientSelector, patrón XrayProposalTable) → Tasks 2, 3, 6, 7. ✓
- §9 casos borde (sin perfil / sin modelo / suma ≠ 100 / caja) → Task 3 (reasons) + Task 1 (caja) + Task 6/7 (validación 100%). ✓
- §12 decisiones (no duplicar holdings → link; custodio multi; caja) → Tasks 3, 7, 1. ✓

Fuera de alcance (specs B y C): serie honesta + toggle benchmark, y Portfolio Designer → Mi Benchmark.
