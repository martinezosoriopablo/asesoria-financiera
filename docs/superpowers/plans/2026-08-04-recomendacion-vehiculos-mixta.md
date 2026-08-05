# Recomendación — vehículos por clase (carteras mixtas) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir armar la recomendación con acciones y bonos directos (no solo fondos/ETFs), eligiendo el vehículo por clase de activo una sola vez, sin ensuciar el flujo fila-por-fila.

**Architecture:** Un campo `clients.recomendacion_vehiculos` define el vehículo (fondos/etf/directo) por clase (rv/rf/alt). El resolver de la columna del medio (`resolveMisFondos`) se generaliza a `resolveMisInstrumentos`, que según el vehículo devuelve fondos preferidos, el ETF del comité, o —en modo directo— las posiciones directas que el cliente YA tiene en ese sleeve más las acciones/bonos preferidos del asesor, cada opción tageada con la vista sectorial/duración del comité. Todo es retrocompatible: sin config, todo es `fondos` = comportamiento actual.

**Tech Stack:** Next.js 16 (App Router) + React 19 + Supabase (Postgres) + TypeScript + Vitest.

## Global Constraints

- Retrocompatibilidad total: `recomendacion_vehiculos` ausente/nulo ⇒ todas las clases en `"fondos"` ⇒ salida idéntica a hoy. Ningún cliente existente cambia.
- El comité NO emite acciones/bonos individuales: solo se usan sus vistas por sector (`model_portfolios.sleeves`) y por sleeve (`posicion.vista`). No agregar generación de picks al pipeline del comité.
- Reusar el match `category → sleeve` ya existente (`PREFERRED_TO_COMITE` + `normCategoria` en `lib/recomendacion/resolve.ts`). No duplicar lógica de normalización.
- Reusar `classifyHolding` de `lib/comite-categories.ts` para clasificar holdings actuales. No reimplementar clasificación.
- La recomendación sigue siendo 100% editable en la UI (elegir opción, buscar, caja, ajustar peso).
- Tests con Vitest (`npx vitest run <archivo>`); `npx tsc --noEmit` debe quedar limpio.
- Codebase en español (columnas DB, mensajes, comentarios).

---

### Task 1: Tipos base + helper de config de vehículo

**Files:**
- Modify: `lib/recomendacion/types.ts`
- Create: `lib/recomendacion/vehiculos.ts`
- Test: `lib/recomendacion/vehiculos.test.ts`

**Interfaces:**
- Produces:
  - `type Vehiculo = "fondos" | "etf" | "directo"`
  - `interface VehiculosConfig { rv: Vehiculo; rf: Vehiculo; alt: Vehiculo }`
  - `type InstrumentoTipo = "fund" | "stock" | "bond" | "etf"`
  - `type InstrumentoOrigen = "preferido" | "actual" | "comite"`
  - `interface MiInstrumentoOption` (superset de `MiFondoOption`, campos nuevos opcionales)
  - `type MiFondoOption = MiInstrumentoOption` (alias retrocompat)
  - `DecisionFuente` incluye `"accion" | "bono"`; `Decision` incluye `sector?: string | null`
  - `resolveVehiculo(config: VehiculosConfig | null | undefined, role: ComiteRole): Vehiculo`
  - `parseVehiculos(raw: unknown): VehiculosConfig`

- [ ] **Step 1: Write the failing test**

Create `lib/recomendacion/vehiculos.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseVehiculos, resolveVehiculo } from "./vehiculos";

describe("parseVehiculos", () => {
  it("null/undefined → todo fondos (retrocompat)", () => {
    expect(parseVehiculos(null)).toEqual({ rv: "fondos", rf: "fondos", alt: "fondos" });
    expect(parseVehiculos(undefined)).toEqual({ rv: "fondos", rf: "fondos", alt: "fondos" });
  });
  it("respeta valores válidos y descarta basura", () => {
    expect(parseVehiculos({ rv: "directo", rf: "etf", alt: "zzz" }))
      .toEqual({ rv: "directo", rf: "etf", alt: "fondos" });
  });
});

describe("resolveVehiculo", () => {
  const cfg = { rv: "directo", rf: "etf", alt: "fondos" } as const;
  it("mapea role → vehículo de su clase; cash → fondos", () => {
    expect(resolveVehiculo(cfg, "rv")).toBe("directo");
    expect(resolveVehiculo(cfg, "rf")).toBe("etf");
    expect(resolveVehiculo(cfg, "alt")).toBe("fondos");
    expect(resolveVehiculo(cfg, "cash")).toBe("fondos");
  });
  it("config nula → fondos", () => {
    expect(resolveVehiculo(null, "rv")).toBe("fondos");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/recomendacion/vehiculos.test.ts`
Expected: FAIL con "Failed to resolve import ./vehiculos" o "parseVehiculos is not a function".

- [ ] **Step 3: Extend types**

En `lib/recomendacion/types.ts`, reemplazar `DecisionFuente`, `MiFondoOption` y `Decision` y agregar tipos nuevos:

```ts
import type { ComiteRole } from "@/lib/comite-categories";

export type CustodianType = "agf" | "corredora" | "internacional";
export type DecisionFuente = "mi_fondo" | "comite_etf" | "custom" | "caja" | "accion" | "bono";

export type Vehiculo = "fondos" | "etf" | "directo";
export interface VehiculosConfig { rv: Vehiculo; rf: Vehiculo; alt: Vehiculo }

export type InstrumentoTipo = "fund" | "stock" | "bond" | "etf";
export type InstrumentoOrigen = "preferido" | "actual" | "comite";

export interface MiInstrumentoOption {
  fund_id: string;
  fund_run: string | null;
  ticker: string | null;
  nombre: string;
  custodian_type: CustodianType;
  tac: number | null;
  rent_12m: number | null;
  isMapped: boolean;
  // nuevos (opcionales para retrocompat; el resolver los puebla siempre)
  tipo?: InstrumentoTipo;         // default "fund"
  origen?: InstrumentoOrigen;     // default "preferido"
  sector?: string | null;
  vista_comite?: string | null;   // "OW" | "UW" | "N" | null
  weight_pct?: number | null;     // solo origen "actual"
}
// Alias retrocompatible: código existente que usa MiFondoOption sigue compilando.
export type MiFondoOption = MiInstrumentoOption;
```

Mantener `ComiteColumn` como está. En `Decision`, agregar `sector`:

```ts
export interface Decision {
  fuente: DecisionFuente;
  ticker: string | null;
  nombre: string;
  clase: string;
  custodian_type: CustodianType | null;
  porcentaje: number;
  tac?: number | null;
  rent_12m?: number | null;
  sector?: string | null;
}
```

`RecomendacionRow.misFondos` queda tipado como `MiInstrumentoOption[]` (el alias lo hace transparente; no tocar la línea).

- [ ] **Step 4: Implement the helper**

Create `lib/recomendacion/vehiculos.ts`:

```ts
import type { ComiteRole } from "@/lib/comite-categories";
import type { Vehiculo, VehiculosConfig } from "./types";

const VALID: Vehiculo[] = ["fondos", "etf", "directo"];
const one = (v: unknown): Vehiculo => (VALID.includes(v as Vehiculo) ? (v as Vehiculo) : "fondos");

// Normaliza el JSONB clients.recomendacion_vehiculos a una config completa.
// Ausente/nulo/basura → todo "fondos" (retrocompatible).
export function parseVehiculos(raw: unknown): VehiculosConfig {
  const r = (raw ?? {}) as Record<string, unknown>;
  return { rv: one(r.rv), rf: one(r.rf), alt: one(r.alt) };
}

// Rol del comité → vehículo de su clase. "cash" usa "fondos".
export function resolveVehiculo(config: VehiculosConfig | null | undefined, role: ComiteRole): Vehiculo {
  const c = config ?? { rv: "fondos", rf: "fondos", alt: "fondos" };
  if (role === "rv") return c.rv;
  if (role === "rf") return c.rf;
  if (role === "alt") return c.alt;
  return "fondos"; // cash
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run lib/recomendacion/vehiculos.test.ts`
Expected: PASS (2 describe, 4 tests).

- [ ] **Step 6: Verify tsc**

Run: `npx tsc --noEmit`
Expected: sin errores (el alias `MiFondoOption` mantiene compatibilidad).

- [ ] **Step 7: Commit**

```bash
git add lib/recomendacion/types.ts lib/recomendacion/vehiculos.ts lib/recomendacion/vehiculos.test.ts
git commit -m "feat(recomendacion): tipos de vehículo por clase + parse/resolve config"
```

---

### Task 2: Helper de vista sectorial del comité

**Files:**
- Modify: `lib/recomendacion/resolve.ts`
- Test: `lib/recomendacion/resolve.test.ts` (agregar describe)

**Interfaces:**
- Consumes: `model_portfolios.sleeves` (array de `{ sector, region, vista, conviction, etf_us, etf_ucits, tesis, peso_pct }`).
- Produces: `buildSectorVistaLookup(sleeves): (sector: string | null) => string | null` — devuelve la `vista` del sector (match case-insensitive por `sector`), o null.

- [ ] **Step 1: Write the failing test**

Agregar a `lib/recomendacion/resolve.test.ts`:

```ts
import { buildSectorVistaLookup } from "./resolve";

describe("buildSectorVistaLookup", () => {
  const sleeves = [
    { sector: "technology", region: "us", vista: "OW", conviction: "MEDIA", etf_us: "XLK" },
    { sector: "energy", region: "us", vista: "UW", conviction: "ALTA", etf_us: "XLE" },
  ];
  it("devuelve la vista del sector (case-insensitive)", () => {
    const look = buildSectorVistaLookup(sleeves);
    expect(look("technology")).toBe("OW");
    expect(look("Technology")).toBe("OW");
    expect(look("energy")).toBe("UW");
  });
  it("sector desconocido o null → null", () => {
    const look = buildSectorVistaLookup(sleeves);
    expect(look("healthcare")).toBeNull();
    expect(look(null)).toBeNull();
  });
  it("sleeves vacío → siempre null", () => {
    const look = buildSectorVistaLookup([]);
    expect(look("technology")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/recomendacion/resolve.test.ts`
Expected: FAIL con "buildSectorVistaLookup is not exported".

- [ ] **Step 3: Implement**

Agregar a `lib/recomendacion/resolve.ts` (después de `normCategoria`):

```ts
interface SleeveSector { sector?: string | null; vista?: string | null }

// Construye un lookup sector → vista desde model_portfolios.sleeves.
export function buildSectorVistaLookup(sleeves: SleeveSector[] | null | undefined): (sector: string | null) => string | null {
  const map = new Map<string, string>();
  for (const s of sleeves || []) {
    if (s.sector && s.vista) map.set(s.sector.toLowerCase(), s.vista);
  }
  return (sector: string | null) => (sector ? map.get(sector.toLowerCase()) ?? null : null);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/recomendacion/resolve.test.ts`
Expected: PASS (incluye los describe previos + el nuevo).

- [ ] **Step 5: Commit**

```bash
git add lib/recomendacion/resolve.ts lib/recomendacion/resolve.test.ts
git commit -m "feat(recomendacion): lookup de vista sectorial del comité"
```

---

### Task 3: Clasificar holdings directos del cliente por sleeve

**Files:**
- Create: `lib/recomendacion/current-holdings.ts`
- Test: `lib/recomendacion/current-holdings.test.ts`

**Interfaces:**
- Consumes: `classifyHolding` de `@/lib/comite-categories` (retorna `{ categoryId, confidence, fundName, marketValue }`); `HoldingForClassification`.
- Produces:
  - `interface DirectHolding { ticker: string | null; nombre: string; tipo: "stock" | "bond"; sector: string | null; weight_pct: number; custodian_type: CustodianType }`
  - `detectDirectTipo(h): "stock" | "bond" | null` — bono si `couponRate!=null && maturityDate`, o CUSIP-bono; acción si `assetClass==="equity"` o ticker alfabético; si es fondo/ETF/caja → null.
  - `classifyDirectHoldingsBySleeve(holdings, totalValue): Map<string, DirectHolding[]>` — agrupa por `categoryId` solo los directos (stock/bond), con `weight_pct = marketValue/totalValue*100`.

- [ ] **Step 1: Write the failing test**

Create `lib/recomendacion/current-holdings.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { detectDirectTipo, classifyDirectHoldingsBySleeve } from "./current-holdings";

describe("detectDirectTipo", () => {
  it("bono por cupón+vencimiento", () => {
    expect(detectDirectTipo({ fundName: "US TREASURY 4% 2030", securityId: "912828XY9", marketValue: 100, couponRate: 4, maturityDate: "2030-01-01" })).toBe("bond");
  });
  it("acción por assetClass equity + ticker", () => {
    expect(detectDirectTipo({ fundName: "NVIDIA", securityId: "NVDA", marketValue: 100, assetClass: "equity" })).toBe("stock");
  });
  it("fondo (RUN numérico) → null", () => {
    expect(detectDirectTipo({ fundName: "FM BCI", securityId: "9226", marketValue: 100, assetClass: "fund" })).toBeNull();
  });
});

describe("classifyDirectHoldingsBySleeve", () => {
  it("agrupa directos por sleeve con weight_pct; ignora fondos", () => {
    const holdings = [
      { fundName: "NVIDIA", securityId: "NVDA", marketValue: 300, assetClass: "equity", currency: "USD", sector: "technology" },
      { fundName: "US TREASURY 4% 2030", securityId: "912828XY9", marketValue: 500, couponRate: 4, maturityDate: "2030-01-01", currency: "USD" },
      { fundName: "FM BCI", securityId: "9226", marketValue: 200, assetClass: "fund", currency: "CLP" },
    ];
    const map = classifyDirectHoldingsBySleeve(holdings, 1000);
    // NVDA → sleeve RV (equity US large), bono → sleeve RF
    const allTickers = [...map.values()].flat().map(d => d.ticker);
    expect(allTickers).toContain("NVDA");
    expect(allTickers).toContain("912828XY9");
    expect(allTickers).not.toContain("9226"); // el fondo se ignora
    const nvda = [...map.values()].flat().find(d => d.ticker === "NVDA")!;
    expect(nvda.tipo).toBe("stock");
    expect(nvda.weight_pct).toBeCloseTo(30, 4);
    expect(nvda.sector).toBe("technology");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/recomendacion/current-holdings.test.ts`
Expected: FAIL con "Failed to resolve import ./current-holdings".

- [ ] **Step 3: Implement**

Create `lib/recomendacion/current-holdings.ts`:

```ts
import { classifyHolding, type HoldingForClassification } from "@/lib/comite-categories";
import type { CustodianType } from "./types";

export interface DirectHolding {
  ticker: string | null;
  nombre: string;
  tipo: "stock" | "bond";
  sector: string | null;
  weight_pct: number;
  custodian_type: CustodianType;
}

type RawHolding = HoldingForClassification & {
  sector?: string | null;
  custodian_type?: CustodianType | null;
};

// Detecta si un holding es un instrumento DIRECTO (acción/bono) o no (fondo/ETF/caja → null).
export function detectDirectTipo(h: RawHolding): "stock" | "bond" | null {
  const sid = (h.securityId || "").trim().toUpperCase();
  const asset = (h.assetClass || "").toLowerCase();
  // Bono: cupón+vencimiento, o CUSIP alfanumérico de 9 con dígitos y letras.
  const cusipBond = /^[A-Z0-9]{9}$/.test(sid) && /\d/.test(sid) && /[A-Z]/.test(sid);
  if ((h.couponRate != null && h.maturityDate) || asset === "bond" || cusipBond) return "bond";
  // Fondo: RUN numérico, o assetClass fondo/etf.
  if (/^\d+$/.test(sid) || asset === "fund" || asset === "etf") return null;
  // Acción: assetClass equity, o ticker puramente alfabético (2-6 letras, con o sin sufijo .SN).
  if (asset === "equity" || /^[A-Z]{1,6}(\.[A-Z]{1,3})?$/.test(sid)) return "stock";
  return null;
}

// Agrupa los holdings directos por sleeve (categoryId de classifyHolding).
export function classifyDirectHoldingsBySleeve(
  holdings: RawHolding[],
  totalValue: number,
): Map<string, DirectHolding[]> {
  const out = new Map<string, DirectHolding[]>();
  const total = totalValue > 0 ? totalValue : 1;
  for (const h of holdings || []) {
    const tipo = detectDirectTipo(h);
    if (!tipo) continue;
    const { categoryId } = classifyHolding(h);
    const d: DirectHolding = {
      ticker: h.securityId ?? null,
      nombre: h.fundName,
      tipo,
      sector: h.sector ?? null,
      weight_pct: (h.marketValue / total) * 100,
      custodian_type: (h.custodian_type as CustodianType) || "corredora",
    };
    const arr = out.get(categoryId) || [];
    arr.push(d);
    out.set(categoryId, arr);
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/recomendacion/current-holdings.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/recomendacion/current-holdings.ts lib/recomendacion/current-holdings.test.ts
git commit -m "feat(recomendacion): clasificación de holdings directos por sleeve"
```

---

### Task 4: `resolveMisInstrumentos` (columna del medio vehículo-aware)

**Files:**
- Modify: `lib/recomendacion/resolve.ts`
- Test: `lib/recomendacion/resolve.test.ts`

**Interfaces:**
- Consumes: `PREFERRED_TO_COMITE`, `normCategoria` (ya en resolve.ts), `DirectHolding` (Task 3), `MiInstrumentoOption`, `Vehiculo`, `CustodianType`, `ComiteRole`.
- Produces:
  - `matchesSleeve(category: string, sleeveId: string): boolean` (extraído, reusado por `resolveMisFondos`)
  - `resolveMisInstrumentos(input): MiInstrumentoOption[]` con la firma del Step 3.
  - `resolveMisFondos` se ajusta para considerar solo `instrument_type` fund (default fund) y reusar `matchesSleeve`.

- [ ] **Step 1: Write the failing test**

Agregar a `lib/recomendacion/resolve.test.ts`:

```ts
import { resolveMisInstrumentos } from "./resolve";

describe("resolveMisInstrumentos", () => {
  const preferred = [
    { id: "f1", fund_run: "100", ticker: null, nombre: "AGF USA", custodian_type: "agf" as const, category: "RV USA", tac: 1.2, rent_12m: 7, instrument_type: "fund" as const, sector: null },
    { id: "s1", fund_run: null, ticker: "NVDA", nombre: "Nvidia", custodian_type: "internacional" as const, category: "RV USA", tac: null, rent_12m: null, instrument_type: "stock" as const, sector: "technology" },
    { id: "b1", fund_run: null, ticker: "912828XY9", nombre: "UST 2030", custodian_type: "internacional" as const, category: "UST belly", tac: null, rent_12m: null, instrument_type: "bond" as const, sector: null },
  ];
  const sectorVista = (s: string | null) => (s === "technology" ? "OW" : null);

  it("vehículo fondos → solo fondos preferidos (ignora acciones/bonos)", () => {
    const r = resolveMisInstrumentos({ sleeveId: "rv_usa_large_cap", role: "rv", vehiculo: "fondos", custodios: ["agf"], preferred, currentDirect: [], comiteEtfUs: "VOO", comiteEtfUcits: "CSPX", bondVista: null, sectorVista, mappings: [] });
    expect(r.map(o => o.fund_id)).toEqual(["f1"]);
    expect(r[0].tipo ?? "fund").toBe("fund");
  });

  it("vehículo etf → el ETF del comité", () => {
    const r = resolveMisInstrumentos({ sleeveId: "rv_usa_large_cap", role: "rv", vehiculo: "etf", custodios: ["internacional"], preferred, currentDirect: [], comiteEtfUs: "VOO", comiteEtfUcits: "CSPX", bondVista: null, sectorVista, mappings: [] });
    expect(r).toHaveLength(1);
    expect(r[0].ticker).toBe("VOO");
    expect(r[0].tipo).toBe("etf");
    expect(r[0].origen).toBe("comite");
  });

  it("vehículo directo RV → holdings actuales + acciones preferidas, tageadas con vista de sector", () => {
    const current = [{ ticker: "AAPL", nombre: "Apple", tipo: "stock" as const, sector: "technology", weight_pct: 12, custodian_type: "internacional" as const }];
    const r = resolveMisInstrumentos({ sleeveId: "rv_usa_large_cap", role: "rv", vehiculo: "directo", custodios: ["internacional"], preferred, currentDirect: current, comiteEtfUs: "VOO", comiteEtfUcits: "CSPX", bondVista: null, sectorVista, mappings: [] });
    // primero el actual (para "mantener"), luego la preferida
    expect(r.map(o => o.ticker)).toEqual(["AAPL", "NVDA"]);
    expect(r[0].origen).toBe("actual");
    expect(r[0].weight_pct).toBe(12);
    expect(r[0].vista_comite).toBe("OW");   // tech OW
    expect(r[1].origen).toBe("preferido");
    expect(r[1].vista_comite).toBe("OW");
  });

  it("vehículo directo RF → bonos, tageados con la vista de duración del sleeve", () => {
    const r = resolveMisInstrumentos({ sleeveId: "rf_ust_belly", role: "rf", vehiculo: "directo", custodios: ["internacional"], preferred, currentDirect: [], comiteEtfUs: "IEF", comiteEtfUcits: "IDTM", bondVista: "N", sectorVista, mappings: [] });
    expect(r.map(o => o.ticker)).toEqual(["912828XY9"]);
    expect(r[0].tipo).toBe("bond");
    expect(r[0].vista_comite).toBe("N");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/recomendacion/resolve.test.ts`
Expected: FAIL con "resolveMisInstrumentos is not exported".

- [ ] **Step 3: Implement**

En `lib/recomendacion/resolve.ts`:

3a. Extraer `matchesSleeve` y usarlo en `resolveMisFondos` (que además ahora ignora no-fondos). Reemplazar el cuerpo de `resolveMisFondos`:

```ts
// Match category (etiqueta del asesor) → sleeve del comité, con normalización.
export function matchesSleeve(category: string, sleeveId: string): boolean {
  const wanted = new Set((PREFERRED_TO_COMITE[sleeveId] || []).map(normCategoria));
  return wanted.has(normCategoria(category));
}

export function resolveMisFondos(input: {
  categoria: string;
  custodios: MiInstrumentoOption["custodian_type"][];
  preferredFunds: PreferredFundInput[];
  mappings: MappingInput[];
}): MiInstrumentoOption[] {
  const { categoria, custodios, preferredFunds, mappings } = input;
  const custodioSet = new Set(custodios);
  const mappedIds = new Set(
    mappings.filter(m => m.categoria === categoria && custodioSet.has(m.custodian_type)).map(m => m.preferred_fund_id)
  );
  const candidates = preferredFunds.filter(f =>
    (f.instrument_type ?? "fund") === "fund" &&
    custodioSet.has(f.custodian_type) &&
    (mappedIds.has(f.id) || matchesSleeve(f.category, categoria))
  );
  const toOption = (f: PreferredFundInput): MiInstrumentoOption => ({
    fund_id: f.id, fund_run: f.fund_run, ticker: f.ticker, nombre: f.nombre,
    custodian_type: f.custodian_type, tac: f.tac, rent_12m: f.rent_12m, isMapped: mappedIds.has(f.id),
    tipo: "fund", origen: "preferido", sector: null, vista_comite: null, weight_pct: null,
  });
  return candidates.map(toOption).sort((a, b) => {
    if (a.isMapped !== b.isMapped) return a.isMapped ? -1 : 1;
    return (a.tac ?? Infinity) - (b.tac ?? Infinity);
  });
}
```

Agregar `instrument_type` y `sector` a `PreferredFundInput`:

```ts
interface PreferredFundInput {
  id: string; fund_run: string | null; ticker: string | null; nombre: string;
  custodian_type: MiInstrumentoOption["custodian_type"]; category: string;
  tac: number | null; rent_12m: number | null;
  instrument_type?: "fund" | "stock" | "bond"; sector?: string | null;
}
```

3b. Agregar `resolveMisInstrumentos` (importar `DirectHolding` y `Vehiculo`):

```ts
import type { DirectHolding } from "./current-holdings";
import type { Vehiculo } from "./types";

function etfOption(etf: string, custodio: MiInstrumentoOption["custodian_type"]): MiInstrumentoOption {
  return { fund_id: `etf:${etf}`, fund_run: null, ticker: etf, nombre: etf, custodian_type: custodio,
    tac: null, rent_12m: null, isMapped: false, tipo: "etf", origen: "comite", sector: null, vista_comite: null, weight_pct: null };
}

export function resolveMisInstrumentos(input: {
  sleeveId: string;
  role: ComiteRole;
  vehiculo: Vehiculo;
  custodios: MiInstrumentoOption["custodian_type"][];
  preferred: PreferredFundInput[];
  currentDirect: DirectHolding[];
  comiteEtfUs: string | null;
  comiteEtfUcits: string | null;
  bondVista: string | null;
  sectorVista: (sector: string | null) => string | null;
  mappings: MappingInput[];
}): MiInstrumentoOption[] {
  const { sleeveId, role, vehiculo, custodios, preferred, currentDirect, comiteEtfUs, comiteEtfUcits, bondVista, sectorVista, mappings } = input;
  const custodioSet = new Set(custodios);

  if (vehiculo === "fondos") {
    return resolveMisFondos({ categoria: sleeveId, custodios, preferredFunds: preferred, mappings });
  }

  if (vehiculo === "etf") {
    const etf = comiteEtfUs || comiteEtfUcits;
    return etf ? [etfOption(etf, custodios[0] ?? "internacional")] : [];
  }

  // directo: RF → bonos, resto → acciones
  const wantType: "stock" | "bond" = role === "rf" ? "bond" : "stock";
  const vistaFor = (sector: string | null) => (wantType === "bond" ? bondVista : sectorVista(sector));

  const current: MiInstrumentoOption[] = currentDirect
    .filter(h => h.tipo === wantType)
    .map(h => ({
      fund_id: `hold:${h.ticker || h.nombre}`, fund_run: null, ticker: h.ticker, nombre: h.nombre,
      custodian_type: h.custodian_type, tac: null, rent_12m: null, isMapped: false,
      tipo: wantType, origen: "actual", sector: h.sector, vista_comite: vistaFor(h.sector), weight_pct: h.weight_pct,
    }));

  const pref: MiInstrumentoOption[] = preferred
    .filter(p => (p.instrument_type ?? "fund") === wantType && custodioSet.has(p.custodian_type) && matchesSleeve(p.category, sleeveId))
    .map(p => ({
      fund_id: p.id, fund_run: p.fund_run, ticker: p.ticker, nombre: p.nombre,
      custodian_type: p.custodian_type, tac: p.tac, rent_12m: p.rent_12m, isMapped: false,
      tipo: wantType, origen: "preferido", sector: p.sector ?? null, vista_comite: vistaFor(p.sector ?? null), weight_pct: null,
    }));

  return [...current, ...pref]; // actuales primero (default = mantener)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/recomendacion/resolve.test.ts`
Expected: PASS (todos los describe, incluidos los previos de `resolveMisFondos` que siguen verdes gracias al alias y a `matchesSleeve`).

- [ ] **Step 5: Commit**

```bash
git add lib/recomendacion/resolve.ts lib/recomendacion/resolve.test.ts
git commit -m "feat(recomendacion): resolveMisInstrumentos (fondos/etf/directo) + matchesSleeve"
```

---

### Task 5: `defaultDecision` por vehículo (incluye "mantener")

**Files:**
- Modify: `lib/recomendacion/resolve.ts`
- Test: `lib/recomendacion/resolve.test.ts`

**Interfaces:**
- Produces: `fuenteForOption(opt): DecisionFuente`; `defaultDecision` con nuevo parámetro `vehiculo` y `opciones: MiInstrumentoOption[]` (reemplaza el uso de `misFondos`).

- [ ] **Step 1: Write the failing test**

Reemplazar el `describe("defaultDecision", ...)` de `lib/recomendacion/resolve.test.ts` por:

```ts
describe("defaultDecision", () => {
  const comite: ComiteColumn = { etf_us: "VOO", etf_ucits: "CSPX", modelo_pct: 22, vista: "UW", conviction: "MEDIA" };
  const fondo: MiInstrumentoOption = { fund_id: "f1", fund_run: "9226", ticker: null, nombre: "FM BCI USA", custodian_type: "agf", tac: 1.2, rent_12m: 8, isMapped: true, tipo: "fund", origen: "preferido", sector: null, vista_comite: null, weight_pct: null };

  it("fondos: con fondo → mi_fondo", () => {
    const d = defaultDecision({ role: "rv", comite, opciones: [fondo], custodio: "agf", vehiculo: "fondos" });
    expect(d.fuente).toBe("mi_fondo");
    expect(d.nombre).toBe("FM BCI USA");
  });

  it("etf: opción etf → comite_etf", () => {
    const etf: MiInstrumentoOption = { fund_id: "etf:VOO", fund_run: null, ticker: "VOO", nombre: "VOO", custodian_type: "internacional", tac: null, rent_12m: null, isMapped: false, tipo: "etf", origen: "comite", sector: null, vista_comite: null, weight_pct: null };
    const d = defaultDecision({ role: "rv", comite, opciones: [etf], custodio: "internacional", vehiculo: "etf" });
    expect(d.fuente).toBe("comite_etf");
    expect(d.ticker).toBe("VOO");
  });

  it("directo: default = mantener lo actual (acción)", () => {
    const actual: MiInstrumentoOption = { fund_id: "hold:AAPL", fund_run: null, ticker: "AAPL", nombre: "Apple", custodian_type: "internacional", tac: null, rent_12m: null, isMapped: false, tipo: "stock", origen: "actual", sector: "technology", vista_comite: "OW", weight_pct: 12 };
    const d = defaultDecision({ role: "rv", comite, opciones: [actual], custodio: "internacional", vehiculo: "directo" });
    expect(d.fuente).toBe("accion");
    expect(d.nombre).toBe("Apple");
    expect(d.sector).toBe("technology");
  });

  it("directo sin opciones → caja (no cae a ETF)", () => {
    const d = defaultDecision({ role: "rv", comite, opciones: [], custodio: "internacional", vehiculo: "directo" });
    expect(d.fuente).toBe("caja");
  });

  it("fondos sin fondo + internacional → ETF del comité (fallback histórico)", () => {
    const d = defaultDecision({ role: "rv", comite, opciones: [], custodio: "internacional", vehiculo: "fondos" });
    expect(d.fuente).toBe("comite_etf");
    expect(d.ticker).toBe("VOO");
  });

  it("fondos sin fondo + AGF → caja", () => {
    const d = defaultDecision({ role: "rv", comite, opciones: [], custodio: "agf", vehiculo: "fondos" });
    expect(d.fuente).toBe("caja");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/recomendacion/resolve.test.ts`
Expected: FAIL (la firma vieja de `defaultDecision` usa `misFondos`, no `opciones`/`vehiculo`).

- [ ] **Step 3: Implement**

Reemplazar `defaultDecision` en `lib/recomendacion/resolve.ts`:

```ts
import type { DecisionFuente, MiInstrumentoOption, Vehiculo } from "./types";

function fuenteForOption(opt: MiInstrumentoOption): DecisionFuente {
  switch (opt.tipo) {
    case "etf": return "comite_etf";
    case "stock": return "accion";
    case "bond": return "bono";
    default: return "mi_fondo";
  }
}

export function defaultDecision(input: {
  role: ComiteRole;
  comite: ComiteColumn;
  opciones: MiInstrumentoOption[];
  custodio: CustodianType;
  vehiculo: Vehiculo;
}): Decision {
  const { role, comite, opciones, custodio, vehiculo } = input;
  const clase = roleToClase(role);
  const best = opciones[0]; // en directo, el actual viene primero (default = mantener)

  if (best) {
    return {
      fuente: fuenteForOption(best),
      ticker: best.ticker ?? (best.fund_run ? String(best.fund_run) : null),
      nombre: best.nombre, clase, custodian_type: best.custodian_type,
      porcentaje: comite.modelo_pct, tac: best.tac, rent_12m: best.rent_12m, sector: best.sector ?? null,
    };
  }

  // Sin opción: solo en modo no-directo, internacional/corredora pueden usar el ETF del comité.
  if (vehiculo !== "directo" && (custodio === "internacional" || custodio === "corredora")) {
    const etf = comite.etf_us || comite.etf_ucits;
    if (etf) return { fuente: "comite_etf", ticker: etf, nombre: etf, clase, custodian_type: custodio, porcentaje: comite.modelo_pct };
  }
  return { fuente: "caja", ticker: null, nombre: "Caja", clase, custodian_type: custodio, porcentaje: comite.modelo_pct };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/recomendacion/resolve.test.ts`
Expected: PASS.

- [ ] **Step 5: Verify tsc (romperá el route hasta Task 7 — esperado)**

Run: `npx tsc --noEmit`
Expected: el ÚNICO error esperado es en `app/api/comite/recomendacion/route.ts` (usa la firma vieja de `defaultDecision`). Se corrige en Task 7. No hay otros errores.

- [ ] **Step 6: Commit**

```bash
git add lib/recomendacion/resolve.ts lib/recomendacion/resolve.test.ts
git commit -m "feat(recomendacion): defaultDecision por vehículo (mantener directo / etf / caja)"
```

---

### Task 6: Migración DB (config de vehículo + tipos de instrumento)

**Files:**
- Create: `supabase/migrations/20260804_recomendacion_vehiculos.sql`

**Interfaces:**
- Produces: columnas `clients.recomendacion_vehiculos` (jsonb), `advisor_preferred_funds.instrument_type` (text, default 'fund'), `advisor_preferred_funds.sector` (text null).

- [ ] **Step 1: Escribir la migración**

Create `supabase/migrations/20260804_recomendacion_vehiculos.sql`:

```sql
-- Vehículo de inversión por clase de activo, por cliente (fondos/etf/directo).
-- Ausente/nulo = todo "fondos" (retrocompatible con la recomendación actual).
alter table public.clients
  add column if not exists recomendacion_vehiculos jsonb;

-- Instrumentos preferidos: además de fondos, acciones y bonos directos.
alter table public.advisor_preferred_funds
  add column if not exists instrument_type text not null default 'fund',
  add column if not exists sector text;

alter table public.advisor_preferred_funds
  drop constraint if exists advisor_preferred_funds_instrument_type_check;
alter table public.advisor_preferred_funds
  add constraint advisor_preferred_funds_instrument_type_check
  check (instrument_type in ('fund', 'stock', 'bond'));
```

- [ ] **Step 2: Aplicar en Supabase**

Aplicar la migración vía el SQL editor de Supabase (proyecto `zysotxkelepvotzujhxe`) o `supabase db push`. Ejecutar el contenido del archivo.

- [ ] **Step 3: Verificar columnas**

Ejecutar en el SQL editor:

```sql
select column_name, data_type, column_default
from information_schema.columns
where table_name in ('clients','advisor_preferred_funds')
  and column_name in ('recomendacion_vehiculos','instrument_type','sector');
```

Expected: 3 filas — `recomendacion_vehiculos jsonb`, `instrument_type text 'fund'::text`, `sector text`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260804_recomendacion_vehiculos.sql
git commit -m "feat(db): recomendacion_vehiculos + instrument_type/sector en preferred_funds"
```

---

### Task 7: Wiring del route `/api/comite/recomendacion`

**Files:**
- Modify: `app/api/comite/recomendacion/route.ts`

**Interfaces:**
- Consumes: `parseVehiculos`, `resolveVehiculo` (Task 1); `buildSectorVistaLookup` (Task 2); `classifyDirectHoldingsBySleeve` (Task 3); `resolveMisInstrumentos`, `defaultDecision` (Tasks 4-5).
- Produces: respuesta con `rows` cuya `misFondos` ya es vehículo-aware, más `vehiculos` (la config resuelta) en el payload.

- [ ] **Step 1: Reemplazar el cuerpo de composición del route**

En `app/api/comite/recomendacion/route.ts`:

1a. Imports (reemplazar los de recomendacion):

```ts
import { mapClientProfile, resolveCategoria } from "@/lib/comite-categories";
import { resolveMisInstrumentos, defaultDecision, buildUnresolvedRow, buildSectorVistaLookup } from "@/lib/recomendacion/resolve";
import { parseVehiculos, resolveVehiculo } from "@/lib/recomendacion/vehiculos";
import { classifyDirectHoldingsBySleeve, type DirectHolding } from "@/lib/recomendacion/current-holdings";
import { getFichaMetrics } from "@/lib/comite/ficha-metrics";
import type { CustodianType, RecomendacionRow } from "@/lib/recomendacion/types";
```

1b. Leer la config de vehículo (después de obtener `client`):

```ts
// Reemplazar el select del cliente para traer también los vehículos:
const { data: client } = await supabase
  .from("clients").select("perfil_riesgo, recomendacion_vehiculos").eq("id", clientId).single();
// ... (el fallback de perfil sigue igual) ...
const vehiculos = parseVehiculos(client?.recomendacion_vehiculos);
```

1c. Traer `sleeves` del modelo (agregar a la select existente):

```ts
const { data: modelo } = await supabase
  .from("model_portfolios").select("report_date, posiciones, sleeves")
  .eq("perfil", perfilModelo).order("report_date", { ascending: false }).limit(1).maybeSingle();
if (!modelo) return successResponse({ ok: false, reason: "sin_modelo", perfil_modelo: perfilModelo });
const sectorVista = buildSectorVistaLookup((modelo.sleeves as { sector?: string; vista?: string }[]) || []);
```

1d. Traer preferidos con tipo+sector y armar `preferred`:

```ts
const { data: preferred } = await supabase
  .from("advisor_preferred_funds")
  .select("id, fund_run, ticker, fund_name, custodian_type, category, instrument_type, sector")
  .eq("advisor_id", advisor!.id);
const fondoRuns = (preferred || []).filter(f => (f.instrument_type ?? "fund") === "fund").map(f => f.fund_run as string);
const fichaMetrics = await getFichaMetrics(supabase, fondoRuns);
const preferredFunds = (preferred || []).map(f => {
  const m = fichaMetrics.get(f.fund_run as string);
  return {
    id: f.id as string, fund_run: (f.fund_run as string) ?? null, ticker: (f.ticker as string) ?? null,
    nombre: (f.fund_name as string) || "", custodian_type: f.custodian_type as CustodianType,
    category: (f.category as string) || "", tac: m?.tac ?? null, rent_12m: m?.rent_12m ?? null,
    instrument_type: (f.instrument_type as "fund" | "stock" | "bond") ?? "fund", sector: (f.sector as string) ?? null,
  };
});
```

1e. Cargar holdings actuales SOLO si alguna clase es directo:

```ts
const algunDirecto = vehiculos.rv === "directo" || vehiculos.rf === "directo" || vehiculos.alt === "directo";
let directBySleeve = new Map<string, DirectHolding[]>();
if (algunDirecto) {
  const { data: snap } = await supabase
    .from("portfolio_snapshots").select("holdings, total_value, created_at")
    .eq("client_id", clientId).neq("source", "api-prices")
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (snap?.holdings) {
    directBySleeve = classifyDirectHoldingsBySleeve(
      snap.holdings as Parameters<typeof classifyDirectHoldingsBySleeve>[0],
      Number(snap.total_value) || 0,
    );
  }
}
```

1f. El loop de composición (reemplazar el `for` existente):

```ts
const rows: RecomendacionRow[] = [];
for (const p of posiciones) {
  const pct = Number(p.modelo_pct) || 0;
  if (pct <= 0) continue;
  const cat = resolveCategoria(p.categoria);
  if (!cat) { rows.push(buildUnresolvedRow(p.categoria, pct)); continue; }
  const comite = {
    etf_us: p.etf_us ?? cat.etfUS, etf_ucits: p.etf_ucits ?? cat.etfUCITS,
    modelo_pct: pct, vista: p.vista ?? null, conviction: p.conviction ?? null,
  };
  const vehiculo = resolveVehiculo(vehiculos, cat.role);
  const misFondos = resolveMisInstrumentos({
    sleeveId: cat.id, role: cat.role, vehiculo, custodios,
    preferred: preferredFunds, currentDirect: directBySleeve.get(cat.id) || [],
    comiteEtfUs: comite.etf_us, comiteEtfUcits: comite.etf_ucits,
    bondVista: p.vista ?? null, sectorVista, mappings: mappingRows,
  });
  const custodioDefault = misFondos[0]?.custodian_type || custodios[0];
  const decision = defaultDecision({ role: cat.role, comite, opciones: misFondos, custodio: custodioDefault, vehiculo });
  rows.push({ categoria: cat.id, label: cat.label, role: cat.role, comite, misFondos, decision });
}

return successResponse({
  ok: true, perfil_cliente: perfilCliente, perfil_modelo: perfilModelo,
  comite_report_date: modelo.report_date, custodios,
  custodios_detectados: detectados, custodio_asumido: custodioAsumido,
  vehiculos, rows,
});
```

(Nota: `p` ahora también puede leer `role` desde `cat.role`; usar `cat.role`, no `p.role`.)

- [ ] **Step 2: Verify tsc**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Verificación en vivo (script de diagnóstico)**

Con el server de prod corriendo, verificar que el route sigue devolviendo fondos para un cliente `fondos` (retrocompat) y directos para uno seteado en `directo`. Reusar el patrón de `scripts/` para pegarle a Supabase, o setear temporalmente `clients.recomendacion_vehiculos = '{"rv":"directo","rf":"fondos","alt":"fondos"}'` para el cliente de prueba B&B y confirmar en la UI (Task 9-10) que aparecen acciones. Con `recomendacion_vehiculos` nulo el resultado debe ser idéntico al actual (misma cantidad de `mi_fondo`).

- [ ] **Step 4: Commit**

```bash
git add app/api/comite/recomendacion/route.ts
git commit -m "feat(recomendacion): route vehículo-aware (fondos/etf/directo + holdings actuales)"
```

---

### Task 8: PATCH de `recomendacion_vehiculos` en `/api/clients/[id]`

**Files:**
- Modify: `app/api/clients/[id]/route.ts`

**Interfaces:**
- Produces: el PATCH acepta `recomendacion_vehiculos` (objeto `{rv,rf,alt}`) y lo persiste.

- [ ] **Step 1: Localizar el handler PATCH y su whitelist de campos**

Abrir `app/api/clients/[id]/route.ts` y localizar el `PATCH` (o `PUT`) que actualiza `clients`. Identificar cómo arma el objeto de update (probable whitelist de campos permitidos).

- [ ] **Step 2: Agregar el campo a la whitelist**

Incluir `recomendacion_vehiculos` entre los campos actualizables. Sanitizar con `parseVehiculos` para no guardar basura:

```ts
import { parseVehiculos } from "@/lib/recomendacion/vehiculos";
// dentro del handler, al armar el update:
if (body.recomendacion_vehiculos !== undefined) {
  update.recomendacion_vehiculos = parseVehiculos(body.recomendacion_vehiculos);
}
```

- [ ] **Step 3: Verify tsc + verificación manual**

Run: `npx tsc --noEmit` → sin errores.
Manual: `PATCH /api/clients/<id>` con body `{"recomendacion_vehiculos":{"rv":"directo","rf":"fondos","alt":"fondos"}}` y confirmar en DB que se guardó.

- [ ] **Step 4: Commit**

```bash
git add app/api/clients/[id]/route.ts
git commit -m "feat(clients): PATCH persiste recomendacion_vehiculos"
```

---

### Task 9: UI — toggles de vehículo en el header de "Construir recomendación"

**Files:**
- Modify: `components/recomendacion/hooks/useRecomendacion.ts`
- Modify: `components/recomendacion/RecomendacionConstruir.tsx`

**Interfaces:**
- Consumes: payload del route con `vehiculos` (Task 7); `PATCH /api/clients/[id]` (Task 8).
- Produces: en `useRecomendacion`, estado `vehiculos: VehiculosConfig` + `setVehiculo(clase, valor)` que persiste y refetchea.

- [ ] **Step 1: Extender el hook**

En `components/recomendacion/hooks/useRecomendacion.ts`:

```ts
import type { VehiculosConfig, Vehiculo } from "@/lib/recomendacion/types";
// nuevo estado:
const [vehiculos, setVehiculos] = useState<VehiculosConfig>({ rv: "fondos", rf: "fondos", alt: "fondos" });
// dentro del fetch (junto a setRows...):
setVehiculos(d.vehiculos || { rv: "fondos", rf: "fondos", alt: "fondos" });
// nueva acción: persiste y dispara refetch cambiando una dependencia
const setVehiculo = useCallback(async (clase: keyof VehiculosConfig, valor: Vehiculo) => {
  if (!clientId) return;
  const next = { ...vehiculos, [clase]: valor };
  setVehiculos(next);
  await fetch(`/api/clients/${clientId}`, {
    method: "PATCH", headers: { "content-type": "application/json" },
    body: JSON.stringify({ recomendacion_vehiculos: next }),
  });
  setRefetchKey(k => k + 1);
}, [clientId, vehiculos]);
```

Agregar `const [refetchKey, setRefetchKey] = useState(0);` y sumar `refetchKey` a las deps del `useEffect` de fetch. Exponer `vehiculos` y `setVehiculo` en el return.

- [ ] **Step 2: Toggles en el header**

En `components/recomendacion/RecomendacionConstruir.tsx`, dentro del bloque del header (junto a las casillas de Custodio), agregar:

```tsx
<span className="flex items-center gap-2 flex-wrap">
  Vehículo:
  {(["rv", "rf", "alt"] as const).map((clase) => (
    <span key={clase} className="flex items-center gap-1">
      <span className="uppercase text-[10px] text-gb-gray">{clase}</span>
      <select
        value={rec.vehiculos[clase]}
        onChange={(e) => rec.setVehiculo(clase, e.target.value as "fondos" | "etf" | "directo")}
        className="text-xs border border-gb-border rounded px-1 py-0.5"
      >
        <option value="fondos">Fondos</option>
        <option value="etf">ETF</option>
        <option value="directo">Directo</option>
      </select>
    </span>
  ))}
</span>
```

- [ ] **Step 3: Verify build + manual**

Run: `npx tsc --noEmit` → sin errores.
Manual: en el header aparecen 3 selects (RV/RF/Alt). Cambiar RV a "Directo" persiste (recarga y sigue en Directo) y re-arma la tabla.

- [ ] **Step 4: Commit**

```bash
git add components/recomendacion/hooks/useRecomendacion.ts components/recomendacion/RecomendacionConstruir.tsx
git commit -m "feat(recomendacion): toggles de vehículo por clase en el header"
```

---

### Task 10: UI — render de opciones directas + fuentes accion/bono en la tabla

**Files:**
- Modify: `components/recomendacion/RecomendacionTable.tsx`

**Interfaces:**
- Consumes: `MiInstrumentoOption` con `origen`/`tipo`/`vista_comite`/`weight_pct`; `Decision` con `sector`.
- Produces: la columna "Mis Fondos" muestra las opciones genéricas con badges; elegir setea la Decisión con el `fuente` correcto.

- [ ] **Step 1: Render genérico de la opción**

En `components/recomendacion/RecomendacionTable.tsx`, en el `map` de `row.misFondos.slice(0,3)`, reemplazar el badge y el `onClick` por lógica basada en `origen`/`tipo`:

```tsx
{row.misFondos.slice(0, 3).map((f) => {
  const fuente = f.tipo === "etf" ? "comite_etf" : f.tipo === "stock" ? "accion" : f.tipo === "bond" ? "bono" : "mi_fondo";
  const badge = f.origen === "actual" ? `YA LO TIENE${f.weight_pct != null ? ` ${f.weight_pct.toFixed(1)}%` : ""}`
    : f.tipo === "stock" ? "MI ACCIÓN" : f.tipo === "bond" ? "MI BONO" : f.isMapped ? "MI FONDO" : null;
  return (
    <button
      key={f.fund_id}
      onClick={() => setDecision(row.categoria, {
        fuente, ticker: f.ticker ?? (f.fund_run ? String(f.fund_run) : null),
        nombre: f.nombre, custodian_type: f.custodian_type, clase: roleToClase(row.role),
        tac: f.tac, rent_12m: f.rent_12m, sector: f.sector ?? null,
      })}
      className="block w-full text-left px-2 py-1 rounded border border-gb-border hover:bg-slate-50"
    >
      <span className="font-medium text-gb-black">
        {badge && <span className="text-[9px] px-1 py-0 rounded bg-amber-100 text-amber-700 font-semibold mr-1">{badge}</span>}
        {f.nombre}
      </span>
      <span className="text-[10px] text-gb-gray"> · {f.custodian_type}
        {f.vista_comite ? ` · comité ${f.vista_comite}` : ""}
        {f.tac != null ? ` · TAC ${f.tac}%` : ""}</span>
    </button>
  );
})}
```

- [ ] **Step 2: Verify tsc + manual**

Run: `npx tsc --noEmit` → sin errores.
Manual (con un cliente en RV=Directo y acciones preferidas/holdings): la columna del medio muestra las acciones con badge "YA LO TIENE x%" / "MI ACCIÓN" y el tag "comité OW". Elegir una setea la Decisión con fuente `accion` y el nombre correcto; el peso y "buscar/caja" siguen funcionando.

- [ ] **Step 3: Commit**

```bash
git add components/recomendacion/RecomendacionTable.tsx
git commit -m "feat(recomendacion): render de acciones/bonos directos con badges y vista del comité"
```

---

### Task 11: Gestión de acciones/bonos preferidos en `/advisor/fondos`

**Files:**
- Modify: `app/api/advisor/preferred-funds/route.ts`
- Modify: la página/form de `/advisor/fondos` (bajo `app/(advisor-shell)/advisor/fondos/`)

**Interfaces:**
- Produces: el CRUD de `advisor_preferred_funds` acepta y devuelve `instrument_type` y `sector`; la UI permite crear/editar acciones y bonos.

- [ ] **Step 1: Backend — incluir los campos nuevos**

En `app/api/advisor/preferred-funds/route.ts`, agregar `instrument_type` y `sector` a los `select` (GET) y a los campos aceptados en POST/PATCH. Default `instrument_type='fund'` si no viene. Validar `instrument_type in ('fund','stock','bond')`; `sector` solo se guarda para `stock` (si `instrument_type !== 'stock'`, forzar `sector = null`).

- [ ] **Step 2: UI — tipo y sector en el formulario**

En el form de `/advisor/fondos`:
- Agregar un selector "Tipo": Fondo / Acción / Bono (`instrument_type`).
- Mostrar el campo "Sector" (texto libre o dropdown) **solo** cuando Tipo = Acción.
- Para Acción/Bono, el campo de identificador es `ticker`/ISIN/CUSIP (no `fund_run`); `category` mapea al sleeve (ej. "RV USA", "UST belly").
- En la tabla/listado, agregar filtro por Tipo y mostrar la columna Tipo.

- [ ] **Step 3: Verify tsc + manual**

Run: `npx tsc --noEmit` → sin errores.
Manual: crear una acción preferida (NVDA, sector technology, category "RV USA", custodio internacional) y un bono; confirmar que aparecen en `/advisor/fondos` con su tipo y que llenan la columna del medio en modo directo del sleeve correspondiente.

- [ ] **Step 4: Commit**

```bash
git add app/api/advisor/preferred-funds/route.ts app/(advisor-shell)/advisor/fondos
git commit -m "feat(advisor): gestión de acciones/bonos preferidos (tipo + sector)"
```

---

## Notas de verificación final (post-implementación)

- `npx vitest run` completo verde (incluye los nuevos: vehiculos, resolve, current-holdings).
- `npx tsc --noEmit` limpio.
- Retrocompat: un cliente sin `recomendacion_vehiculos` produce EXACTAMENTE la misma recomendación que antes (mismo set de `mi_fondo`/`caja`). Verificar con el cliente B&B en modo por defecto.
- Caso mixto end-to-end: setear RV=Directo, RF=Directo; confirmar que la columna del medio muestra holdings actuales ("YA LO TIENE") + preferidos, con el tag de vista del comité, y que la Decisión guarda `accion`/`bono` y sigue editable.
