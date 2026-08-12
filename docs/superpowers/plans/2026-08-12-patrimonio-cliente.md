# Patrimonio del cliente (Sub-proyecto A) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capturar el patrimonio completo del cliente (seguros, inmuebles, activos financieros manuales) en el lado asesor, con moneda por campo, como fundación del panel espejo (B) y el simulador de jubilación (C).

**Architecture:** 3 tablas dedicadas en Postgres con RLS por `get_accessible_client_ids()`. Lógica pura de validación en `lib/patrimonio/` (Vitest, TDD). API REST bajo `/api/clients/[id]/patrimonio` con un segmento dinámico `[entidad]` que DRYea el CRUD de las tres entidades. UI: una tarjeta full-width "Patrimonio" (acordeón de 3 grupos) dentro de `ClientDetail`, con formularios dirigidos por schema y un `MoneyInput` reutilizable.

**Tech Stack:** Next.js 16 (App Router) + React 19, Supabase Postgres (RLS), Tailwind v4, Vitest (jsdom).

## Global Constraints

- Migraciones en `supabase/migrations/`, nombre `YYYYMMDD_description.sql`, prefijo de hoy `20260812`. Se aplican **a mano** en el dashboard de Supabase (convención del repo).
- Auth de rutas: `requireClientAccess(clientId)` de `@/lib/auth/api-auth` → devuelve `{ user, advisor, error }`; chequear `if (error) return error` ANTES de seguir (cierra IDOR: verifica que el cliente sea accesible por el asesor). Cliente admin vía `createAdminClient()` DESPUÉS del auth. Respuestas vía `successResponse(obj, status?)` / `errorResponse(msg, status)`; envolver en `handleApiError("route-name", async () => {...})`. Rate-limit: `applyRateLimit(request, "route-name", { limit: N })` de `@/lib/rate-limit`.
- Alias `@/` = raíz del proyecto.
- Moneda: valores permitidos exactos `'CLP' | 'UF' | 'USD'`. Cada monto = par `*_monto numeric` + `*_moneda text`.
- Idioma: español para UI, comentarios de DB y mensajes de error de API.
- Paleta app: tokens `--gb-*` / clases Tailwind (`gb-primary`=copper, `gb-black`=navy, `gb-border`, `gb-gray`, `gb-success`, `gb-danger`). NO hardcodear hex. NO reintroducir Fraunces/Hanken/IBM Plex (las fuentes se heredan del layout).
- Reusar `toCLP`/`fromCLP`/`isCurrencyCode` de `@/lib/portfolio/currency` — NO reimplementar conversión.
- Tests: `npm run test:run` (todo), `npx vitest run <archivo>` (uno).
- Gotcha OneDrive: tras editar, `next dev` puede no recargar — reiniciar `npm run dev` si un cambio no se refleja en localhost.

---

## File Structure

**Creados:**
- `supabase/migrations/20260812_patrimonio_cliente.sql` — 3 tablas + índices + RLS.
- `lib/patrimonio/types.ts` — interfaces TS (`Moneda`, `Seguro`, `Inmueble`, `ActivoFinanciero`, `PatrimonioData`) + constantes.
- `lib/patrimonio/validate.ts` — `validateSeguro`, `validateInmueble`, `validateActivo`, helpers `isMoneda`/`validateMoney`.
- `lib/patrimonio/validate.test.ts` — tests de validación.
- `lib/patrimonio/entidades.ts` — mapa `entidad → tabla`, whitelist de columnas, `resolveTabla`, `pickAllowed`, `validateFor`.
- `lib/patrimonio/entidades.test.ts` — tests de mapeo/whitelist.
- `app/api/clients/[id]/patrimonio/route.ts` — `GET` agregado.
- `app/api/clients/[id]/patrimonio/[entidad]/route.ts` — `POST` (crear ítem).
- `app/api/clients/[id]/patrimonio/[entidad]/[itemId]/route.ts` — `PATCH` + `DELETE`.
- `components/shared/MoneyInput.tsx` — input monto + selector de moneda.
- `components/clients/patrimonio/schemas.ts` — `FieldDef` + `SEGURO_FIELDS`, `INMUEBLE_FIELDS`, `ACTIVO_FIELDS`, `GRUPOS`.
- `components/clients/patrimonio/PatrimonioForm.tsx` — formulario genérico dirigido por schema.
- `components/clients/patrimonio/PatrimonioSection.tsx` — acordeón de 3 grupos + CRUD.

**Modificados:**
- `components/clients/ClientDetail.tsx` — montar `<PatrimonioSection clientId={client.id} />` full-width bajo la grilla existente.
- `CLAUDE.md` — documentar el modelo (fold en la última task).

---

## PHASE 0 — Schema

### Task 1: Migración de las 3 tablas + RLS

**Files:**
- Create: `supabase/migrations/20260812_patrimonio_cliente.sql`

**Interfaces:**
- Produce: tablas `client_seguros`, `client_inmuebles`, `client_activos_financieros`.

- [ ] **Step 1: Escribir la migración**

```sql
-- Patrimonio del cliente (sub-proyecto A): seguros, inmuebles y activos financieros
-- manuales. Moneda por campo (par *_monto + *_moneda). RLS por get_accessible_client_ids().

-- 1. Seguros: una fila por póliza.
CREATE TABLE IF NOT EXISTS client_seguros (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id                 uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  tipo                      text NOT NULL CHECK (tipo IN ('vida','salud','vida_con_ahorro','otros')),
  compania                  text,
  numero_poliza             text,
  prima_monto               numeric,
  prima_moneda              text CHECK (prima_moneda IN ('CLP','UF','USD')),
  prima_periodicidad        text NOT NULL DEFAULT 'mensual' CHECK (prima_periodicidad IN ('mensual','anual')),
  cobertura_monto           numeric,
  cobertura_moneda          text CHECK (cobertura_moneda IN ('CLP','UF','USD')),
  cobertura_desc            text,
  beneficiarios             text,
  devuelve_prima            boolean NOT NULL DEFAULT false,
  devolucion_pct            numeric DEFAULT 100,
  fecha_inicio              date,
  fecha_termino             date,
  componente_ahorro_monto   numeric,
  componente_ahorro_moneda  text CHECK (componente_ahorro_moneda IN ('CLP','UF','USD')),
  notas                     text,
  created_by                uuid REFERENCES advisors(id),
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_client_seguros_client ON client_seguros(client_id);

-- 2. Inmuebles: una fila por propiedad. Crédito hipotecario embebido (1:1).
CREATE TABLE IF NOT EXISTS client_inmuebles (
  id                             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id                      uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  tipo                           text NOT NULL CHECK (tipo IN ('inversion','habitacion')),
  etiqueta                       text,
  ubicacion                      text,
  valor_compra_monto             numeric,
  valor_compra_moneda            text CHECK (valor_compra_moneda IN ('CLP','UF','USD')),
  fecha_compra                   date,
  valor_estimado_venta_monto     numeric,
  valor_estimado_venta_moneda    text CHECK (valor_estimado_venta_moneda IN ('CLP','UF','USD')),
  tiene_credito                  boolean NOT NULL DEFAULT false,
  credito_saldo_monto            numeric,
  credito_saldo_moneda           text CHECK (credito_saldo_moneda IN ('CLP','UF','USD')),
  credito_tasa_anual             numeric,
  credito_plazo_meses_restantes  integer,
  credito_cuota_monto            numeric,
  credito_cuota_moneda           text CHECK (credito_cuota_moneda IN ('CLP','UF','USD')),
  se_arrienda                    boolean NOT NULL DEFAULT false,
  arriendo_monto                 numeric,
  arriendo_moneda                text CHECK (arriendo_moneda IN ('CLP','UF','USD')),
  notas                          text,
  created_by                     uuid REFERENCES advisors(id),
  created_at                     timestamptz NOT NULL DEFAULT now(),
  updated_at                     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_client_inmuebles_client ON client_inmuebles(client_id);

-- 3. Activos financieros manuales (el portafolio trackeado NO va aquí).
CREATE TABLE IF NOT EXISTS client_activos_financieros (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id            uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  tipo                 text NOT NULL CHECK (tipo IN ('apv','afp','ahorro_periodico','cuenta_ahorro','otro')),
  institucion          text,
  saldo_monto          numeric,
  saldo_moneda         text CHECK (saldo_moneda IN ('CLP','UF','USD')),
  aporte_monto         numeric,
  aporte_moneda        text CHECK (aporte_moneda IN ('CLP','UF','USD')),
  aporte_periodicidad  text CHECK (aporte_periodicidad IN ('mensual','anual')),
  aporte_es_variable   boolean NOT NULL DEFAULT false,
  regimen              text CHECK (regimen IN ('A','B')),
  notas                text,
  created_by           uuid REFERENCES advisors(id),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_client_activos_client ON client_activos_financieros(client_id);

-- RLS: asesores leen lo accesible; el service role (rutas API) gestiona todo.
ALTER TABLE client_seguros ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_inmuebles ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_activos_financieros ENABLE ROW LEVEL SECURITY;

CREATE POLICY "adv_read_seguros" ON client_seguros FOR SELECT TO authenticated
  USING (client_id IN (SELECT get_accessible_client_ids()));
CREATE POLICY "svc_manage_seguros" ON client_seguros FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "adv_read_inmuebles" ON client_inmuebles FOR SELECT TO authenticated
  USING (client_id IN (SELECT get_accessible_client_ids()));
CREATE POLICY "svc_manage_inmuebles" ON client_inmuebles FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "adv_read_activos" ON client_activos_financieros FOR SELECT TO authenticated
  USING (client_id IN (SELECT get_accessible_client_ids()));
CREATE POLICY "svc_manage_activos" ON client_activos_financieros FOR ALL TO service_role
  USING (true) WITH CHECK (true);
```

- [ ] **Step 2: Aplicar la migración a mano en Supabase**

Pegar el SQL en el SQL Editor del dashboard de Supabase y ejecutarlo.
Expected: `Success. No rows returned`.

- [ ] **Step 3: Verificar en el dashboard**

Run (SQL Editor):
```sql
SELECT table_name FROM information_schema.tables
WHERE table_name IN ('client_seguros','client_inmuebles','client_activos_financieros');
```
Expected: 3 filas.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260812_patrimonio_cliente.sql
git commit -m "feat(patrimonio): schema client_seguros/inmuebles/activos_financieros + RLS"
```

---

## PHASE 1 — Lógica pura (TDD)

### Task 2: Tipos + validación

**Files:**
- Create: `lib/patrimonio/types.ts`
- Create: `lib/patrimonio/validate.ts`
- Test: `lib/patrimonio/validate.test.ts`

**Interfaces:**
- Produce: `Moneda`, `MONEDAS`, `Seguro`, `Inmueble`, `ActivoFinanciero`, `PatrimonioData` (types.ts).
- Produce: `isMoneda(v): boolean`, `validateMoney(monto, moneda, label): string[]`, `validateSeguro(input): ValidationResult`, `validateInmueble(input): ValidationResult`, `validateActivo(input): ValidationResult`, `ValidationResult = { ok: boolean; errors: string[] }` (validate.ts).

- [ ] **Step 1: Escribir `lib/patrimonio/types.ts`**

```ts
// lib/patrimonio/types.ts
export type Moneda = "CLP" | "UF" | "USD";
export const MONEDAS: Moneda[] = ["CLP", "UF", "USD"];
export type Periodicidad = "mensual" | "anual";

export type SeguroTipo = "vida" | "salud" | "vida_con_ahorro" | "otros";
export interface Seguro {
  id: string;
  client_id: string;
  tipo: SeguroTipo;
  compania: string | null;
  numero_poliza: string | null;
  prima_monto: number | null;
  prima_moneda: Moneda | null;
  prima_periodicidad: Periodicidad;
  cobertura_monto: number | null;
  cobertura_moneda: Moneda | null;
  cobertura_desc: string | null;
  beneficiarios: string | null;
  devuelve_prima: boolean;
  devolucion_pct: number | null;
  fecha_inicio: string | null;
  fecha_termino: string | null;
  componente_ahorro_monto: number | null;
  componente_ahorro_moneda: Moneda | null;
  notas: string | null;
}

export type InmuebleTipo = "inversion" | "habitacion";
export interface Inmueble {
  id: string;
  client_id: string;
  tipo: InmuebleTipo;
  etiqueta: string | null;
  ubicacion: string | null;
  valor_compra_monto: number | null;
  valor_compra_moneda: Moneda | null;
  fecha_compra: string | null;
  valor_estimado_venta_monto: number | null;
  valor_estimado_venta_moneda: Moneda | null;
  tiene_credito: boolean;
  credito_saldo_monto: number | null;
  credito_saldo_moneda: Moneda | null;
  credito_tasa_anual: number | null;
  credito_plazo_meses_restantes: number | null;
  credito_cuota_monto: number | null;
  credito_cuota_moneda: Moneda | null;
  se_arrienda: boolean;
  arriendo_monto: number | null;
  arriendo_moneda: Moneda | null;
  notas: string | null;
}

export type ActivoTipo = "apv" | "afp" | "ahorro_periodico" | "cuenta_ahorro" | "otro";
export interface ActivoFinanciero {
  id: string;
  client_id: string;
  tipo: ActivoTipo;
  institucion: string | null;
  saldo_monto: number | null;
  saldo_moneda: Moneda | null;
  aporte_monto: number | null;
  aporte_moneda: Moneda | null;
  aporte_periodicidad: Periodicidad | null;
  aporte_es_variable: boolean;
  regimen: "A" | "B" | null;
  notas: string | null;
}

export interface PatrimonioData {
  seguros: Seguro[];
  inmuebles: Inmueble[];
  activos: ActivoFinanciero[];
}
```

- [ ] **Step 2: Escribir el test que falla `lib/patrimonio/validate.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { isMoneda, validateMoney, validateSeguro, validateInmueble, validateActivo } from "./validate";

describe("isMoneda", () => {
  it("acepta CLP/UF/USD y rechaza el resto", () => {
    expect(isMoneda("UF")).toBe(true);
    expect(isMoneda("EUR")).toBe(false);
    expect(isMoneda(null)).toBe(false);
  });
});

describe("validateMoney", () => {
  it("exige moneda válida cuando hay monto", () => {
    expect(validateMoney(100, null, "Prima")).toContain("Prima: falta la moneda");
    expect(validateMoney(100, "EUR", "Prima")).toContain("Prima: moneda inválida");
    expect(validateMoney(100, "UF", "Prima")).toEqual([]);
  });
  it("rechaza montos negativos", () => {
    expect(validateMoney(-5, "UF", "Prima")).toContain("Prima: el monto no puede ser negativo");
  });
  it("no exige nada cuando no hay monto", () => {
    expect(validateMoney(null, null, "Prima")).toEqual([]);
  });
});

describe("validateSeguro", () => {
  it("exige tipo válido", () => {
    expect(validateSeguro({ tipo: "auto" as never }).ok).toBe(false);
    expect(validateSeguro({ tipo: "vida" }).ok).toBe(true);
  });
  it("valida devolucion_pct en [0,100]", () => {
    expect(validateSeguro({ tipo: "vida", devolucion_pct: 150 }).errors)
      .toContain("Devolución: el porcentaje debe estar entre 0 y 100");
  });
  it("valida la moneda de la prima", () => {
    expect(validateSeguro({ tipo: "vida", prima_monto: 4, prima_moneda: "EUR" as never }).ok).toBe(false);
  });
});

describe("validateInmueble", () => {
  it("exige tipo válido", () => {
    expect(validateInmueble({ tipo: "bodega" as never }).ok).toBe(false);
  });
  it("si tiene_credito exige cuota con moneda", () => {
    const r = validateInmueble({ tipo: "inversion", tiene_credito: true });
    expect(r.ok).toBe(false);
    expect(r.errors).toContain("Crédito: falta el dividendo (cuota)");
  });
  it("si se_arrienda exige arriendo con moneda", () => {
    const r = validateInmueble({ tipo: "inversion", se_arrienda: true });
    expect(r.errors).toContain("Arriendo: falta el monto");
  });
});

describe("validateActivo", () => {
  it("exige tipo válido", () => {
    expect(validateActivo({ tipo: "cripto" as never }).ok).toBe(false);
  });
  it("regimen solo aplica a APV", () => {
    expect(validateActivo({ tipo: "afp", regimen: "A" }).errors)
      .toContain("Régimen: solo aplica a APV");
    expect(validateActivo({ tipo: "apv", regimen: "A" }).ok).toBe(true);
  });
  it("si hay aporte exige periodicidad", () => {
    expect(validateActivo({ tipo: "ahorro_periodico", aporte_monto: 5, aporte_moneda: "UF" }).errors)
      .toContain("Aporte: falta la periodicidad");
  });
});
```

- [ ] **Step 3: Correr el test y verificar que falla**

Run: `npx vitest run lib/patrimonio/validate.test.ts`
Expected: FAIL — `Failed to resolve import "./validate"`.

- [ ] **Step 4: Escribir `lib/patrimonio/validate.ts`**

```ts
// lib/patrimonio/validate.ts
import { MONEDAS } from "./types";

export interface ValidationResult { ok: boolean; errors: string[]; }

export function isMoneda(v: unknown): boolean {
  return typeof v === "string" && (MONEDAS as string[]).includes(v);
}

/** Reglas de un par monto/moneda. Devuelve lista de errores (vacía = ok). */
export function validateMoney(
  monto: number | null | undefined,
  moneda: string | null | undefined,
  label: string
): string[] {
  const errors: string[] = [];
  if (monto === null || monto === undefined) return errors;
  if (typeof monto !== "number" || Number.isNaN(monto)) {
    errors.push(`${label}: el monto no es válido`);
    return errors;
  }
  if (monto < 0) errors.push(`${label}: el monto no puede ser negativo`);
  if (moneda === null || moneda === undefined || moneda === "") {
    errors.push(`${label}: falta la moneda`);
  } else if (!isMoneda(moneda)) {
    errors.push(`${label}: moneda inválida`);
  }
  return errors;
}

const SEGURO_TIPOS = ["vida", "salud", "vida_con_ahorro", "otros"];
const INMUEBLE_TIPOS = ["inversion", "habitacion"];
const ACTIVO_TIPOS = ["apv", "afp", "ahorro_periodico", "cuenta_ahorro", "otro"];

export function validateSeguro(input: Record<string, unknown>): ValidationResult {
  const errors: string[] = [];
  if (!SEGURO_TIPOS.includes(input.tipo as string)) errors.push("Tipo de seguro inválido");
  errors.push(...validateMoney(input.prima_monto as number, input.prima_moneda as string, "Prima"));
  errors.push(...validateMoney(input.cobertura_monto as number, input.cobertura_moneda as string, "Cobertura"));
  errors.push(...validateMoney(input.componente_ahorro_monto as number, input.componente_ahorro_moneda as string, "Ahorro"));
  const pct = input.devolucion_pct as number | null | undefined;
  if (pct !== null && pct !== undefined && (pct < 0 || pct > 100)) {
    errors.push("Devolución: el porcentaje debe estar entre 0 y 100");
  }
  return { ok: errors.length === 0, errors };
}

export function validateInmueble(input: Record<string, unknown>): ValidationResult {
  const errors: string[] = [];
  if (!INMUEBLE_TIPOS.includes(input.tipo as string)) errors.push("Tipo de inmueble inválido");
  errors.push(...validateMoney(input.valor_compra_monto as number, input.valor_compra_moneda as string, "Precio de compra"));
  errors.push(...validateMoney(input.valor_estimado_venta_monto as number, input.valor_estimado_venta_moneda as string, "Valor de venta"));
  if (input.tiene_credito) {
    errors.push(...validateMoney(input.credito_saldo_monto as number, input.credito_saldo_moneda as string, "Crédito"));
    if (input.credito_cuota_monto === null || input.credito_cuota_monto === undefined) {
      errors.push("Crédito: falta el dividendo (cuota)");
    } else {
      errors.push(...validateMoney(input.credito_cuota_monto as number, input.credito_cuota_moneda as string, "Dividendo"));
    }
    const tasa = input.credito_tasa_anual as number | null | undefined;
    if (tasa !== null && tasa !== undefined && (tasa < 0 || tasa > 100)) {
      errors.push("Crédito: la tasa anual debe estar entre 0 y 100");
    }
  }
  if (input.se_arrienda) {
    if (input.arriendo_monto === null || input.arriendo_monto === undefined) {
      errors.push("Arriendo: falta el monto");
    } else {
      errors.push(...validateMoney(input.arriendo_monto as number, input.arriendo_moneda as string, "Arriendo"));
    }
  }
  return { ok: errors.length === 0, errors };
}

export function validateActivo(input: Record<string, unknown>): ValidationResult {
  const errors: string[] = [];
  if (!ACTIVO_TIPOS.includes(input.tipo as string)) errors.push("Tipo de activo inválido");
  errors.push(...validateMoney(input.saldo_monto as number, input.saldo_moneda as string, "Saldo"));
  errors.push(...validateMoney(input.aporte_monto as number, input.aporte_moneda as string, "Aporte"));
  if (input.regimen !== null && input.regimen !== undefined && input.tipo !== "apv") {
    errors.push("Régimen: solo aplica a APV");
  }
  if (input.aporte_monto !== null && input.aporte_monto !== undefined && !input.aporte_periodicidad) {
    errors.push("Aporte: falta la periodicidad");
  }
  return { ok: errors.length === 0, errors };
}
```

- [ ] **Step 5: Correr los tests y verificar que pasan**

Run: `npx vitest run lib/patrimonio/validate.test.ts`
Expected: PASS (todos verdes).

- [ ] **Step 6: Commit**

```bash
git add lib/patrimonio/types.ts lib/patrimonio/validate.ts lib/patrimonio/validate.test.ts
git commit -m "feat(patrimonio): tipos + validación pura (seguros/inmuebles/activos)"
```

---

### Task 3: Mapa de entidades + whitelist de columnas

**Files:**
- Create: `lib/patrimonio/entidades.ts`
- Test: `lib/patrimonio/entidades.test.ts`

**Interfaces:**
- Consume: `validateSeguro`/`validateInmueble`/`validateActivo` de `./validate`, `ValidationResult`.
- Produce: `EntidadKey = "seguros" | "inmuebles" | "activos"`, `resolveTabla(entidad: string): string | null`, `pickAllowed(entidad: EntidadKey, body: Record<string,unknown>): Record<string,unknown>`, `validateFor(entidad: EntidadKey, input: Record<string,unknown>): ValidationResult`.

- [ ] **Step 1: Escribir el test que falla `lib/patrimonio/entidades.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { resolveTabla, pickAllowed, validateFor } from "./entidades";

describe("resolveTabla", () => {
  it("mapea entidades conocidas", () => {
    expect(resolveTabla("seguros")).toBe("client_seguros");
    expect(resolveTabla("inmuebles")).toBe("client_inmuebles");
    expect(resolveTabla("activos")).toBe("client_activos_financieros");
  });
  it("devuelve null para desconocidas", () => {
    expect(resolveTabla("naves")).toBeNull();
  });
});

describe("pickAllowed", () => {
  it("descarta columnas no permitidas (anti mass-assignment)", () => {
    const out = pickAllowed("seguros", { tipo: "vida", id: "x", client_id: "y", created_by: "z", hack: 1 });
    expect(out).toHaveProperty("tipo", "vida");
    expect(out).not.toHaveProperty("id");
    expect(out).not.toHaveProperty("client_id");
    expect(out).not.toHaveProperty("created_by");
    expect(out).not.toHaveProperty("hack");
  });
});

describe("validateFor", () => {
  it("enruta al validador correcto", () => {
    expect(validateFor("activos", { tipo: "afp", regimen: "A" }).ok).toBe(false);
    expect(validateFor("seguros", { tipo: "vida" }).ok).toBe(true);
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run lib/patrimonio/entidades.test.ts`
Expected: FAIL — `Failed to resolve import "./entidades"`.

- [ ] **Step 3: Escribir `lib/patrimonio/entidades.ts`**

```ts
// lib/patrimonio/entidades.ts
import { validateSeguro, validateInmueble, validateActivo, ValidationResult } from "./validate";

export type EntidadKey = "seguros" | "inmuebles" | "activos";

const TABLAS: Record<EntidadKey, string> = {
  seguros: "client_seguros",
  inmuebles: "client_inmuebles",
  activos: "client_activos_financieros",
};

// Whitelist de columnas escribibles por entidad (excluye id/client_id/created_by/timestamps).
const CAMPOS: Record<EntidadKey, string[]> = {
  seguros: [
    "tipo", "compania", "numero_poliza", "prima_monto", "prima_moneda",
    "prima_periodicidad", "cobertura_monto", "cobertura_moneda", "cobertura_desc",
    "beneficiarios", "devuelve_prima", "devolucion_pct", "fecha_inicio", "fecha_termino",
    "componente_ahorro_monto", "componente_ahorro_moneda", "notas",
  ],
  inmuebles: [
    "tipo", "etiqueta", "ubicacion", "valor_compra_monto", "valor_compra_moneda",
    "fecha_compra", "valor_estimado_venta_monto", "valor_estimado_venta_moneda",
    "tiene_credito", "credito_saldo_monto", "credito_saldo_moneda", "credito_tasa_anual",
    "credito_plazo_meses_restantes", "credito_cuota_monto", "credito_cuota_moneda",
    "se_arrienda", "arriendo_monto", "arriendo_moneda", "notas",
  ],
  activos: [
    "tipo", "institucion", "saldo_monto", "saldo_moneda", "aporte_monto", "aporte_moneda",
    "aporte_periodicidad", "aporte_es_variable", "regimen", "notas",
  ],
};

const VALIDADORES: Record<EntidadKey, (i: Record<string, unknown>) => ValidationResult> = {
  seguros: validateSeguro,
  inmuebles: validateInmueble,
  activos: validateActivo,
};

function isEntidad(e: string): e is EntidadKey {
  return e === "seguros" || e === "inmuebles" || e === "activos";
}

export function resolveTabla(entidad: string): string | null {
  return isEntidad(entidad) ? TABLAS[entidad] : null;
}

export function pickAllowed(entidad: EntidadKey, body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of CAMPOS[entidad]) {
    if (k in body) out[k] = body[k];
  }
  return out;
}

export function validateFor(entidad: EntidadKey, input: Record<string, unknown>): ValidationResult {
  return VALIDADORES[entidad](input);
}
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `npx vitest run lib/patrimonio/entidades.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/patrimonio/entidades.ts lib/patrimonio/entidades.test.ts
git commit -m "feat(patrimonio): mapa entidad->tabla + whitelist + ruteo de validación"
```

---

## PHASE 2 — API (verificación manual)

### Task 4: GET agregado del patrimonio

**Files:**
- Create: `app/api/clients/[id]/patrimonio/route.ts`

**Interfaces:**
- Consume: `requireClientAccess`, `createAdminClient` de `@/lib/auth/api-auth`; `successResponse`, `errorResponse`, `handleApiError` de `@/lib/api-response`; `applyRateLimit` de `@/lib/rate-limit`.
- Produce: `GET /api/clients/[id]/patrimonio` → `{ success: true, seguros: [], inmuebles: [], activos: [] }`.

- [ ] **Step 1: Escribir la ruta**

```ts
// app/api/clients/[id]/patrimonio/route.ts
import { NextRequest } from "next/server";
import { requireClientAccess, createAdminClient } from "@/lib/auth/api-auth";
import { successResponse, errorResponse, handleApiError } from "@/lib/api-response";
import { applyRateLimit } from "@/lib/rate-limit";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rl = await applyRateLimit(request, "patrimonio-get", { limit: 60 });
  if (rl) return rl;

  const { error } = await requireClientAccess(id);
  if (error) return error;

  return handleApiError("patrimonio-get", async () => {
    const supabase = createAdminClient();
    const [seguros, inmuebles, activos] = await Promise.all([
      supabase.from("client_seguros").select("*").eq("client_id", id).order("created_at", { ascending: true }),
      supabase.from("client_inmuebles").select("*").eq("client_id", id).order("created_at", { ascending: true }),
      supabase.from("client_activos_financieros").select("*").eq("client_id", id).order("created_at", { ascending: true }),
    ]);
    if (seguros.error || inmuebles.error || activos.error) {
      return errorResponse("Error al cargar el patrimonio", 500);
    }
    return successResponse({
      seguros: seguros.data ?? [],
      inmuebles: inmuebles.data ?? [],
      activos: activos.data ?? [],
    });
  });
}
```

- [ ] **Step 2: Verificar typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errores nuevos.

- [ ] **Step 3: Smoke test manual**

Arrancar `npm run dev`, autenticado como asesor, abrir en el navegador (o `curl` con la cookie de sesión):
`GET http://localhost:3000/api/clients/<id-de-un-cliente-propio>/patrimonio`
Expected: `{ "success": true, "seguros": [], "inmuebles": [], "activos": [] }`.
Con un `<id>` de cliente NO accesible → `403`/`404` (IDOR cerrado).

- [ ] **Step 4: Commit**

```bash
git add "app/api/clients/[id]/patrimonio/route.ts"
git commit -m "feat(patrimonio): GET agregado de seguros/inmuebles/activos por cliente"
```

---

### Task 5: Crear / editar / borrar ítems (segmento `[entidad]` dinámico)

**Files:**
- Create: `app/api/clients/[id]/patrimonio/[entidad]/route.ts`
- Create: `app/api/clients/[id]/patrimonio/[entidad]/[itemId]/route.ts`

**Interfaces:**
- Consume: `resolveTabla`, `pickAllowed`, `validateFor`, `EntidadKey` de `@/lib/patrimonio/entidades`; auth/response/rate-limit helpers (Task 4).
- Produce: `POST /api/clients/[id]/patrimonio/[entidad]` → `{ success, item }`; `PATCH`/`DELETE /api/clients/[id]/patrimonio/[entidad]/[itemId]` → `{ success, item }` / `{ success }`.

- [ ] **Step 1: Escribir la ruta POST (crear)**

```ts
// app/api/clients/[id]/patrimonio/[entidad]/route.ts
import { NextRequest } from "next/server";
import { requireClientAccess, createAdminClient } from "@/lib/auth/api-auth";
import { successResponse, errorResponse, handleApiError } from "@/lib/api-response";
import { applyRateLimit } from "@/lib/rate-limit";
import { resolveTabla, pickAllowed, validateFor, EntidadKey } from "@/lib/patrimonio/entidades";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; entidad: string }> }
) {
  const { id, entidad } = await params;
  const rl = await applyRateLimit(request, "patrimonio-create", { limit: 30 });
  if (rl) return rl;

  const tabla = resolveTabla(entidad);
  if (!tabla) return errorResponse("Entidad de patrimonio desconocida", 404);

  const { advisor, error } = await requireClientAccess(id);
  if (error) return error;

  return handleApiError("patrimonio-create", async () => {
    const body = (await request.json()) as Record<string, unknown>;
    const v = validateFor(entidad as EntidadKey, body);
    if (!v.ok) return errorResponse(v.errors.join(" · "), 400);

    const fields = pickAllowed(entidad as EntidadKey, body);
    const supabase = createAdminClient();
    const { data, error: dbErr } = await supabase
      .from(tabla)
      .insert({ ...fields, client_id: id, created_by: advisor!.id })
      .select("*")
      .single();
    if (dbErr) return errorResponse("No se pudo crear el registro", 500);
    return successResponse({ item: data });
  });
}
```

- [ ] **Step 2: Escribir la ruta PATCH + DELETE (editar/borrar)**

```ts
// app/api/clients/[id]/patrimonio/[entidad]/[itemId]/route.ts
import { NextRequest } from "next/server";
import { requireClientAccess, createAdminClient } from "@/lib/auth/api-auth";
import { successResponse, errorResponse, handleApiError } from "@/lib/api-response";
import { applyRateLimit } from "@/lib/rate-limit";
import { resolveTabla, pickAllowed, validateFor, EntidadKey } from "@/lib/patrimonio/entidades";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; entidad: string; itemId: string }> }
) {
  const { id, entidad, itemId } = await params;
  const rl = await applyRateLimit(request, "patrimonio-update", { limit: 60 });
  if (rl) return rl;

  const tabla = resolveTabla(entidad);
  if (!tabla) return errorResponse("Entidad de patrimonio desconocida", 404);

  const { error } = await requireClientAccess(id);
  if (error) return error;

  return handleApiError("patrimonio-update", async () => {
    const body = (await request.json()) as Record<string, unknown>;
    const v = validateFor(entidad as EntidadKey, body);
    if (!v.ok) return errorResponse(v.errors.join(" · "), 400);

    const fields = pickAllowed(entidad as EntidadKey, body);
    const supabase = createAdminClient();
    const { data, error: dbErr } = await supabase
      .from(tabla)
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq("id", itemId)
      .eq("client_id", id) // ata el ítem al cliente accesible (defensa IDOR)
      .select("*")
      .single();
    if (dbErr || !data) return errorResponse("No se pudo actualizar el registro", 404);
    return successResponse({ item: data });
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; entidad: string; itemId: string }> }
) {
  const { id, entidad, itemId } = await params;
  const rl = await applyRateLimit(request, "patrimonio-delete", { limit: 60 });
  if (rl) return rl;

  const tabla = resolveTabla(entidad);
  if (!tabla) return errorResponse("Entidad de patrimonio desconocida", 404);

  const { error } = await requireClientAccess(id);
  if (error) return error;

  return handleApiError("patrimonio-delete", async () => {
    const supabase = createAdminClient();
    const { error: dbErr } = await supabase
      .from(tabla)
      .delete()
      .eq("id", itemId)
      .eq("client_id", id);
    if (dbErr) return errorResponse("No se pudo eliminar el registro", 500);
    return successResponse({});
  });
}
```

- [ ] **Step 3: Verificar typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errores nuevos.

- [ ] **Step 4: Smoke test manual (con `npm run dev`, autenticado)**

1. `POST /api/clients/<id>/patrimonio/seguros` con body `{"tipo":"vida","compania":"MetLife","prima_monto":4.5,"prima_moneda":"UF"}` → `{ success:true, item:{...} }`.
2. `POST` con `{"tipo":"vida","prima_monto":4.5,"prima_moneda":"EUR"}` → `400` con mensaje de moneda inválida.
3. `PATCH /api/clients/<id>/patrimonio/seguros/<itemId>` con `{"tipo":"vida","compania":"Confuturo"}` → item actualizado.
4. `DELETE /api/clients/<id>/patrimonio/seguros/<itemId>` → `{ success:true }`.
5. `POST /api/clients/<id>/patrimonio/naves` → `404`.

- [ ] **Step 5: Commit**

```bash
git add "app/api/clients/[id]/patrimonio/[entidad]"
git commit -m "feat(patrimonio): CRUD de items por entidad (POST/PATCH/DELETE) con whitelist y validación"
```

---

## PHASE 3 — UI (verificación manual)

### Task 6: `MoneyInput` (monto + selector de moneda)

**Files:**
- Create: `components/shared/MoneyInput.tsx`

**Interfaces:**
- Produce: `MoneyInput` con props `{ monto: number | null; moneda: string | null; onMonto: (v: number | null) => void; onMoneda: (v: string) => void; placeholder?: string }`.

- [ ] **Step 1: Escribir el componente**

```tsx
// components/shared/MoneyInput.tsx
"use client";
import React from "react";
import { MONEDAS } from "@/lib/patrimonio/types";

interface Props {
  monto: number | null;
  moneda: string | null;
  onMonto: (v: number | null) => void;
  onMoneda: (v: string) => void;
  placeholder?: string;
}

export default function MoneyInput({ monto, moneda, onMonto, onMoneda, placeholder }: Props) {
  return (
    <div className="flex">
      <input
        type="number"
        inputMode="decimal"
        value={monto ?? ""}
        placeholder={placeholder}
        onChange={(e) => onMonto(e.target.value === "" ? null : Number(e.target.value))}
        className="w-full min-w-0 rounded-l-md border border-r-0 border-gb-border px-3 py-2 text-sm text-gb-black focus:outline-none focus:ring-2 focus:ring-gb-primary/40"
      />
      <select
        value={moneda ?? "UF"}
        onChange={(e) => onMoneda(e.target.value)}
        className="rounded-r-md border border-gb-border bg-gb-light px-2 text-xs font-semibold text-gb-black focus:outline-none"
      >
        {MONEDAS.map((m) => (
          <option key={m} value={m}>{m}</option>
        ))}
      </select>
    </div>
  );
}
```

- [ ] **Step 2: Verificar typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errores nuevos.

- [ ] **Step 3: Commit**

```bash
git add components/shared/MoneyInput.tsx
git commit -m "feat(patrimonio): MoneyInput reutilizable (monto + selector UF/CLP/USD)"
```

---

### Task 7: Schemas de campos + formulario genérico

**Files:**
- Create: `components/clients/patrimonio/schemas.ts`
- Create: `components/clients/patrimonio/PatrimonioForm.tsx`

**Interfaces:**
- Consume: `MoneyInput` (Task 6).
- Produce: `FieldDef`, `GRUPOS` (`[{ key: EntidadKey; titulo: string; icono: string; fields: FieldDef[]; tipos: {value,label}[] }]`), `PatrimonioForm` con props `{ fields: FieldDef[]; value: Record<string,unknown>; onChange: (patch: Record<string,unknown>) => void }`.

- [ ] **Step 1: Escribir `components/clients/patrimonio/schemas.ts`**

```ts
// components/clients/patrimonio/schemas.ts
import { EntidadKey } from "@/lib/patrimonio/entidades";

export type FieldType = "text" | "number" | "date" | "money" | "select" | "switch" | "textarea";

export interface FieldDef {
  key: string;           // money: base -> escribe key_monto / key_moneda
  label: string;
  type: FieldType;
  options?: { value: string; label: string }[];
  showIf?: (v: Record<string, unknown>) => boolean;
  width?: "full" | "half" | "third";
}

const PERIODICIDAD = [
  { value: "mensual", label: "Mensual" },
  { value: "anual", label: "Anual" },
];

export const SEGURO_FIELDS: FieldDef[] = [
  { key: "compania", label: "Compañía", type: "text", width: "third" },
  { key: "numero_poliza", label: "N° de póliza", type: "text", width: "third" },
  { key: "prima", label: "Prima", type: "money", width: "third" },
  { key: "prima_periodicidad", label: "Periodicidad", type: "select", options: PERIODICIDAD, width: "third" },
  { key: "cobertura", label: "Monto asegurado", type: "money", width: "third" },
  { key: "cobertura_desc", label: "¿Qué cubre?", type: "text", width: "third" },
  { key: "beneficiarios", label: "Beneficiarios", type: "text", width: "full" },
  { key: "devuelve_prima", label: "Devuelve prima al final", type: "switch", width: "third" },
  { key: "devolucion_pct", label: "% devolución", type: "number", width: "third", showIf: (v) => !!v.devuelve_prima },
  { key: "fecha_termino", label: "Fecha término", type: "date", width: "third", showIf: (v) => !!v.devuelve_prima },
  { key: "componente_ahorro", label: "Saldo de ahorro", type: "money", width: "third", showIf: (v) => v.tipo === "vida_con_ahorro" },
  { key: "fecha_inicio", label: "Fecha inicio", type: "date", width: "third" },
  { key: "notas", label: "Notas", type: "textarea", width: "full" },
];

export const INMUEBLE_FIELDS: FieldDef[] = [
  { key: "etiqueta", label: "Etiqueta", type: "text", width: "third" },
  { key: "ubicacion", label: "Ubicación", type: "text", width: "third" },
  { key: "fecha_compra", label: "Fecha compra", type: "date", width: "third" },
  { key: "valor_compra", label: "Precio de compra", type: "money", width: "half" },
  { key: "valor_estimado_venta", label: "Valor venta estimado (hoy)", type: "money", width: "half" },
  { key: "tiene_credito", label: "Tiene crédito hipotecario", type: "switch", width: "full" },
  { key: "credito_saldo", label: "Saldo del crédito", type: "money", width: "third", showIf: (v) => !!v.tiene_credito },
  { key: "credito_tasa_anual", label: "Tasa anual (%)", type: "number", width: "third", showIf: (v) => !!v.tiene_credito },
  { key: "credito_plazo_meses_restantes", label: "Plazo restante (meses)", type: "number", width: "third", showIf: (v) => !!v.tiene_credito },
  { key: "credito_cuota", label: "Dividendo (cuota mensual)", type: "money", width: "third", showIf: (v) => !!v.tiene_credito },
  { key: "se_arrienda", label: "Se arrienda", type: "switch", width: "full" },
  { key: "arriendo", label: "Arriendo mensual", type: "money", width: "third", showIf: (v) => !!v.se_arrienda },
  { key: "notas", label: "Notas", type: "textarea", width: "full" },
];

export const ACTIVO_FIELDS: FieldDef[] = [
  { key: "institucion", label: "Institución", type: "text", width: "third" },
  { key: "saldo", label: "Saldo actual", type: "money", width: "third" },
  { key: "regimen", label: "Régimen APV", type: "select",
    options: [{ value: "", label: "—" }, { value: "A", label: "A" }, { value: "B", label: "B" }],
    width: "third", showIf: (v) => v.tipo === "apv" },
  { key: "aporte", label: "Aporte periódico", type: "money", width: "third" },
  { key: "aporte_periodicidad", label: "Periodicidad", type: "select", options: PERIODICIDAD, width: "third",
    showIf: (v) => v.aporte_monto !== null && v.aporte_monto !== undefined },
  { key: "aporte_es_variable", label: "Monto variable", type: "switch", width: "third" },
  { key: "notas", label: "Notas", type: "textarea", width: "full" },
];

export const GRUPOS: {
  key: EntidadKey; titulo: string; icono: string;
  fields: FieldDef[]; tipos: { value: string; label: string }[];
}[] = [
  { key: "seguros", titulo: "Seguros", icono: "🛡️", fields: SEGURO_FIELDS,
    tipos: [
      { value: "vida", label: "Vida" }, { value: "salud", label: "Salud" },
      { value: "vida_con_ahorro", label: "Vida con ahorro" }, { value: "otros", label: "Otros" },
    ] },
  { key: "inmuebles", titulo: "Inmuebles", icono: "🏢", fields: INMUEBLE_FIELDS,
    tipos: [
      { value: "inversion", label: "Inversión (arrienda)" }, { value: "habitacion", label: "Habitación (vive)" },
    ] },
  { key: "activos", titulo: "Activos financieros", icono: "💰", fields: ACTIVO_FIELDS,
    tipos: [
      { value: "apv", label: "APV" }, { value: "afp", label: "AFP" },
      { value: "ahorro_periodico", label: "Ahorro periódico" },
      { value: "cuenta_ahorro", label: "Cuenta ahorro" }, { value: "otro", label: "Otro" },
    ] },
];
```

- [ ] **Step 2: Escribir `components/clients/patrimonio/PatrimonioForm.tsx`**

```tsx
// components/clients/patrimonio/PatrimonioForm.tsx
"use client";
import React from "react";
import MoneyInput from "@/components/shared/MoneyInput";
import { FieldDef } from "./schemas";

interface Props {
  fields: FieldDef[];
  value: Record<string, unknown>;
  onChange: (patch: Record<string, unknown>) => void;
}

const WIDTH: Record<string, string> = {
  full: "basis-full", half: "basis-[calc(50%-6px)]", third: "basis-[calc(33.333%-8px)]",
};

export default function PatrimonioForm({ fields, value, onChange }: Props) {
  return (
    <div className="flex flex-wrap gap-3">
      {fields.map((f) => {
        if (f.showIf && !f.showIf(value)) return null;
        const w = WIDTH[f.width ?? "third"];
        return (
          <div key={f.key} className={`${w} min-w-[150px] grow`}>
            <label className="mb-1 block text-[10.5px] font-semibold text-gb-gray">{f.label}</label>
            {f.type === "money" ? (
              <MoneyInput
                monto={(value[`${f.key}_monto`] as number) ?? null}
                moneda={(value[`${f.key}_moneda`] as string) ?? null}
                onMonto={(v) => onChange({ [`${f.key}_monto`]: v })}
                onMoneda={(v) => onChange({ [`${f.key}_moneda`]: v })}
              />
            ) : f.type === "switch" ? (
              <button
                type="button"
                onClick={() => onChange({ [f.key]: !value[f.key] })}
                className={`flex items-center gap-2 text-sm font-semibold ${value[f.key] ? "text-gb-success" : "text-gb-gray"}`}
              >
                <span className={`inline-block h-[19px] w-[34px] rounded-full ${value[f.key] ? "bg-gb-success" : "bg-gb-gray"} relative`}>
                  <span className={`absolute top-[2px] h-[15px] w-[15px] rounded-full bg-white transition-all ${value[f.key] ? "right-[2px]" : "left-[2px]"}`} />
                </span>
                {value[f.key] ? "Sí" : "No"}
              </button>
            ) : f.type === "select" ? (
              <select
                value={(value[f.key] as string) ?? ""}
                onChange={(e) => onChange({ [f.key]: e.target.value })}
                className="w-full rounded-md border border-gb-border bg-white px-3 py-2 text-sm text-gb-black"
              >
                {(f.options ?? []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            ) : f.type === "textarea" ? (
              <textarea
                value={(value[f.key] as string) ?? ""}
                onChange={(e) => onChange({ [f.key]: e.target.value })}
                rows={2}
                className="w-full rounded-md border border-gb-border bg-white px-3 py-2 text-sm text-gb-black"
              />
            ) : (
              <input
                type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"}
                value={(value[f.key] as string | number) ?? ""}
                onChange={(e) => onChange({ [f.key]: f.type === "number" ? (e.target.value === "" ? null : Number(e.target.value)) : e.target.value })}
                className="w-full rounded-md border border-gb-border bg-white px-3 py-2 text-sm text-gb-black"
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 3: Verificar typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errores nuevos.

- [ ] **Step 4: Commit**

```bash
git add components/clients/patrimonio/schemas.ts components/clients/patrimonio/PatrimonioForm.tsx
git commit -m "feat(patrimonio): schemas de campos + formulario genérico dirigido por schema"
```

---

### Task 8: `PatrimonioSection` (acordeón + CRUD) + montaje en la ficha + doc

**Files:**
- Create: `components/clients/patrimonio/PatrimonioSection.tsx`
- Modify: `components/clients/ClientDetail.tsx` (montar la sección bajo la grilla)
- Modify: `CLAUDE.md` (documentar el modelo)

**Interfaces:**
- Consume: `GRUPOS`, `PatrimonioForm` (Task 7); endpoints de Tasks 4-5.
- Produce: `PatrimonioSection` con prop `{ clientId: string }`.

- [ ] **Step 1: Escribir `components/clients/patrimonio/PatrimonioSection.tsx`**

```tsx
// components/clients/patrimonio/PatrimonioSection.tsx
"use client";
import React, { useEffect, useState, useCallback } from "react";
import { Loader, Plus, Trash2, Wallet } from "lucide-react";
import { GRUPOS } from "./schemas";
import PatrimonioForm from "./PatrimonioForm";
import { EntidadKey } from "@/lib/patrimonio/entidades";

type Item = Record<string, unknown> & { id: string; tipo: string };
type Data = Record<EntidadKey, Item[]>;

export default function PatrimonioSection({ clientId }: { clientId: string }) {
  const [data, setData] = useState<Data>({ seguros: [], inmuebles: [], activos: [] });
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<{ entidad: EntidadKey; value: Record<string, unknown> } | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/clients/${clientId}/patrimonio`)
      .then((r) => r.json())
      .then((d) => { if (d.success) setData({ seguros: d.seguros, inmuebles: d.inmuebles, activos: d.activos }); })
      .finally(() => setLoading(false));
  }, [clientId]);
  useEffect(() => { load(); }, [load]);

  const startNew = (entidad: EntidadKey) => {
    const g = GRUPOS.find((x) => x.key === entidad)!;
    setErr(null);
    setDraft({ entidad, value: { tipo: g.tipos[0].value } });
  };
  const startEdit = (entidad: EntidadKey, item: Item) => { setErr(null); setDraft({ entidad, value: { ...item } }); };

  const save = async () => {
    if (!draft) return;
    setSaving(true); setErr(null);
    const isEdit = typeof draft.value.id === "string";
    const url = isEdit
      ? `/api/clients/${clientId}/patrimonio/${draft.entidad}/${draft.value.id}`
      : `/api/clients/${clientId}/patrimonio/${draft.entidad}`;
    const res = await fetch(url, {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft.value),
    });
    const j = await res.json();
    setSaving(false);
    if (!j.success) { setErr(j.error ?? "Error al guardar"); return; }
    setDraft(null); load();
  };

  const remove = async (entidad: EntidadKey, itemId: string) => {
    await fetch(`/api/clients/${clientId}/patrimonio/${entidad}/${itemId}`, { method: "DELETE" });
    load();
  };

  return (
    <div className="rounded-lg border border-gb-border border-l-4 border-l-gb-primary bg-white p-5 shadow-sm">
      <h2 className="mb-4 flex items-center gap-1.5 text-sm font-semibold text-gb-black">
        <Wallet className="h-4 w-4 text-gb-primary" /> Patrimonio
      </h2>

      {loading ? (
        <div className="flex justify-center py-8"><Loader className="h-5 w-5 animate-spin text-gb-gray" /></div>
      ) : (
        GRUPOS.map((g) => {
          const items = data[g.key];
          return (
            <div key={g.key} className="mb-5">
              <div className="mb-2 flex items-center gap-2">
                <span>{g.icono}</span>
                <h3 className="text-sm font-bold text-gb-black">{g.titulo}</h3>
                <span className="text-xs text-gb-gray">{items.length}</span>
                <button onClick={() => startNew(g.key)}
                  className="ml-auto flex items-center gap-1 rounded-md border border-dashed border-gb-primary px-2.5 py-1 text-xs font-semibold text-gb-primary">
                  <Plus className="h-3 w-3" /> Agregar
                </button>
              </div>

              {items.map((it) => {
                const editing = draft?.entidad === g.key && draft.value.id === it.id;
                if (editing) return <EditorCard key={it.id} grupo={g} draft={draft!} setDraft={setDraft} save={save} saving={saving} err={err} onCancel={() => setDraft(null)} />;
                return (
                  <div key={it.id} className="mb-2 flex items-center gap-3 rounded-lg border border-gb-border px-3 py-2.5">
                    <span className="rounded-full bg-gb-primary/10 px-2 py-0.5 text-[9px] font-bold uppercase text-gb-primary">
                      {g.tipos.find((t) => t.value === it.tipo)?.label ?? it.tipo}
                    </span>
                    <span className="text-sm font-semibold text-gb-black">
                      {(it.etiqueta as string) || (it.compania as string) || (it.institucion as string) || "—"}
                    </span>
                    <button onClick={() => startEdit(g.key, it)} className="ml-auto text-xs font-semibold text-gb-info">Editar</button>
                    <button onClick={() => remove(g.key, it.id)} className="text-gb-danger"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                );
              })}

              {draft?.entidad === g.key && !draft.value.id && (
                <EditorCard grupo={g} draft={draft} setDraft={setDraft} save={save} saving={saving} err={err} onCancel={() => setDraft(null)} />
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

function EditorCard({ grupo, draft, setDraft, save, saving, err, onCancel }: {
  grupo: (typeof GRUPOS)[number];
  draft: { entidad: EntidadKey; value: Record<string, unknown> };
  setDraft: (d: { entidad: EntidadKey; value: Record<string, unknown> }) => void;
  save: () => void; saving: boolean; err: string | null; onCancel: () => void;
}) {
  const patch = (p: Record<string, unknown>) => setDraft({ entidad: draft.entidad, value: { ...draft.value, ...p } });
  return (
    <div className="mb-2 rounded-lg border border-gb-primary p-3">
      <div className="mb-3">
        <label className="mb-1 block text-[10.5px] font-semibold text-gb-gray">Tipo</label>
        <select value={draft.value.tipo as string} onChange={(e) => patch({ tipo: e.target.value })}
          className="rounded-md border border-gb-border bg-white px-3 py-2 text-sm text-gb-black">
          {grupo.tipos.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </div>
      <PatrimonioForm fields={grupo.fields} value={draft.value} onChange={patch} />
      {err && <p className="mt-2 text-xs text-gb-danger">{err}</p>}
      <div className="mt-3 flex justify-end gap-2">
        <button onClick={onCancel} className="rounded-md border border-gb-border px-3 py-1.5 text-xs font-semibold text-gb-gray">Cancelar</button>
        <button onClick={save} disabled={saving}
          className="flex items-center gap-1 rounded-md bg-gb-primary px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
          {saving && <Loader className="h-3 w-3 animate-spin" />} Guardar
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Montar la sección en `components/clients/ClientDetail.tsx`**

Agregar el import cerca de los otros imports de `components/clients`:
```tsx
import PatrimonioSection from "@/components/clients/patrimonio/PatrimonioSection";
```
Luego, localizar el cierre del `<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">` (la grilla que contiene `ClientInfoCard` + columna derecha; cierra alrededor de la línea ~600). Inmediatamente DESPUÉS de ese `</div>` de cierre de la grilla, insertar:
```tsx
        <div className="mt-6">
          <PatrimonioSection clientId={client.id} />
        </div>
```

- [ ] **Step 3: Verificar typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errores nuevos.

- [ ] **Step 4: Smoke test end-to-end manual**

Con `npm run dev`, abrir `/clients/<id>` de un cliente propio. En la tarjeta "Patrimonio":
1. Agregar un **seguro de vida** con devolución (activar el switch → aparecen % y fecha término), guardar → aparece la tarjeta.
2. Agregar un **inmueble de inversión** con crédito (switch → campos de crédito) y arriendo (switch → arriendo), guardar.
3. Agregar un **activo APV** (aparece el select Régimen), guardar.
4. Editar uno, cambiar la moneda de un monto, guardar → persiste.
5. Recargar la página → los 3 siguen ahí. Borrar uno → desaparece.
(Si un cambio no se refleja, reiniciar `npm run dev` — gotcha OneDrive.)

- [ ] **Step 5: Documentar en `CLAUDE.md`**

En la sección "Database → Key tables", agregar a la lista:
```
`client_seguros`, `client_inmuebles`, `client_activos_financieros` (patrimonio del cliente — sub-proyecto A, moneda por campo `*_monto`+`*_moneda`, RLS por get_accessible_client_ids)
```
Y en "Key patterns", agregar un bullet:
```
**Patrimonio del cliente (A):** modelo en `lib/patrimonio/` (types + validate + entidades). API REST bajo `/api/clients/[id]/patrimonio` con segmento `[entidad]` dinámico (seguros/inmuebles/activos → client_seguros/client_inmuebles/client_activos_financieros). UI: `components/clients/patrimonio/PatrimonioSection` (acordeón dirigido por schema en `schemas.ts`) montada en `ClientDetail`. El portafolio de inversiones NO se digita aquí (híbrido: se toma del Seguimiento). B (espejo/agregación) y C (simulador que reemplaza APV) son sub-proyectos aparte.
```

- [ ] **Step 6: Correr toda la suite + commit**

Run: `npm run test:run`
Expected: los tests de `lib/patrimonio/*` verdes; sin regresiones nuevas.
```bash
git add components/clients/patrimonio/PatrimonioSection.tsx components/clients/ClientDetail.tsx CLAUDE.md
git commit -m "feat(patrimonio): sección Patrimonio (acordeón+CRUD) en la ficha del cliente + doc"
```

---

## Self-Review (cobertura del spec)

- **3 tablas + moneda por campo + RLS** → Task 1. ✅
- **Frontera A↔C (solo estado actual + estimaciones de hoy)** → schemas capturan estado actual; sin campos de proyección. ✅
- **Inversiones híbrido (portafolio del Seguimiento no se digita)** → aviso implícito: `client_activos_financieros` sólo APV/AFP/ahorro; el pull del portafolio es B (documentado). ✅
- **Captura en la ficha del cliente** → Task 8 monta en `ClientDetail`. ✅ (Adaptación: tarjeta full-width, no pestaña, porque la ficha no tiene sistema de pestañas.)
- **Moneda por campo, convierte al mostrar** → almacenamiento por campo (Task 1) + `MoneyInput` (Task 6); la conversión de visualización es B. ✅
- **API con verificación de acceso (IDOR)** → `requireClientAccess` en todas las rutas + `.eq("client_id", id)` en update/delete. ✅
- **Validación (coherencia condicional)** → Task 2 (crédito/arriendo/régimen/periodicidad). ✅
- **Testing: pure logic Vitest, resto manual** → Tasks 2-3 TDD; 4-8 manual. ✅
- **Fuera de alcance B/C** → no hay tareas de agregación ni simulador. ✅

Nota de decisión: los tres cards de entidad se unifican en un formulario dirigido por schema (`schemas.ts` + `PatrimonioForm`) en vez de tres componentes separados — DRY, y cada entidad queda completamente especificada por su array de `FieldDef`.
