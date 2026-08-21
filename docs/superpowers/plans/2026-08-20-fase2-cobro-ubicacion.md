# Cobro (fees) + Consolidado por custodio (v2.0 · Fase 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Registrar el modelo de cobro por cliente (con defaults del asesor) y su ingreso estimado en la ficha, y desglosar el patrimonio por custodio en el Seguimiento.

**Architecture:** 4 columnas nullable en `advisors` (defaults) + 4 en `clients`. Dos funciones puras testeadas (`estimateAnnualRevenue`, `groupByCustodian`). Un bloque de cobro en la ficha (`CobroSection`) y un toggle Consolidado/Por-custodio en el Seguimiento (`CustodianBreakdown`) que lee los holdings crudos de la última snapshot. Reusa primitivos Fase 0 y la paleta sobria.

**Tech Stack:** Next.js 16 (App Router) + React 19 + Supabase (Postgres+RLS) + Tailwind v4 + Vitest.

## Global Constraints

- **Paleta sobria (guard ESLint):** prohibidas clases de color crudas de Tailwind (`bg-blue-*`, `text-green-*`, `border-gray-*`, `bg-gradient-*`); solo tokens de marca `gb-*` (`gb-black` navy dominante, `gb-primary` copper SOLO acento, `gb-info` azure acciones, `gb-success`/`gb-danger` SOLO variación de mercado), `background`/`foreground`. `CobroSection.tsx` (en `components/clients/`) NO está bajo el guard hoy, pero debe respetar la misma gramática; el dashboard/clients-new/shared sí lo están.
- **Primitivos Fase 0:** reusar `components/shared/` (`Card`, `Button`, `Input`, `PageHeader`); no reimplementar.
- **Columnas nullable = "no configurado":** null se muestra como "— sin configurar —", nunca un 0 engañoso. El `CHECK` de `cobro_tipo` permite NULL.
- **Porcentajes:** se guardan como número decimal (ej. `0.8` = 0,8 %). Validar rango 0–100 en la escritura.
- **Cobro interno del asesor:** NO se muestra al cliente (sin cambios en portal ni reportes).
- **Comisión de transacción:** solo informativa (tasa por operación); NO entra al ingreso estimado.
- **Commits:** staging explícito por archivo (NO `git add -A` ni `git commit -am` — el working tree tiene archivos ajenos). Trailer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` NO es necesario en estos commits (los hace el subagente); usar mensajes `feat(...)`/`test(...)`.
- **Rama:** `feat/cobro-ubicacion` desde master. Verificar con `git rev-parse --abbrev-ref HEAD` al inicio de cada tarea.
- **Verificación por tarea:** `npx tsc --noEmit -p tsconfig.json` → 0 errores nuevos; funciones puras con `npx vitest run <archivo>`; lint con `npx eslint <archivos>` sin errores nuevos.
- **Gotcha OneDrive:** el file-watcher de `next dev` puede no reflejar cambios; verificar en build. Los warnings `.git/worktrees/*: Permission denied` en commits son inocuos (worktrees viejos de otras sesiones).

---

## File Structure

**Crear:**
- `supabase/migrations/20260820_fees_model.sql` — columnas de cobro en advisors + clients.
- `lib/fees/estimate.ts` + `lib/fees/estimate.test.ts` — ingreso estimado (pura).
- `lib/portfolio/group-by-custodian.ts` + `lib/portfolio/group-by-custodian.test.ts` — desglose por custodio (pura).
- `components/clients/CobroSection.tsx` — bloque de cobro en la ficha.
- `components/seguimiento/CustodianBreakdown.tsx` — desglose por custodio + su render.

**Modificar:**
- `app/api/clients/route.ts` — POST: prefill de defaults del asesor.
- `app/api/clients/[id]/route.ts` — PATCH: aceptar/validar los 4 campos de cobro.
- `components/clients/hooks/useClientData.ts` — tipar los 4 campos en `Client`.
- `components/clients/ClientDetail.tsx` — montar `CobroSection`.
- `app/api/advisor/profile/route.ts` — PUT: aceptar los 4 `default_*`.
- `app/(advisor-shell)/advisor/profile/page.tsx` — bloque "Cobro por defecto".
- `components/seguimiento/SeguimientoPage.tsx` — toggle Consolidado/Por-custodio.

---

## Task 1: Migración de columnas de cobro

**Files:**
- Create: `supabase/migrations/20260820_fees_model.sql`

**Interfaces:**
- Produces: columnas `advisors.default_cobro_tipo|default_rebate_pct|default_advisory_fee_pct|default_comision_transaccion_pct` y `clients.cobro_tipo|rebate_pct|advisory_fee_pct|comision_transaccion_pct` (todas nullable).

- [ ] **Step 1: Escribir la migración**

```sql
-- supabase/migrations/20260820_fees_model.sql
-- Fase 2 v2.0: modelo de cobro (fees) con defaults del asesor + por cliente.
-- Todas las columnas nullable (null = "no configurado"). El CHECK permite NULL.

ALTER TABLE advisors
  ADD COLUMN IF NOT EXISTS default_cobro_tipo TEXT
    CHECK (default_cobro_tipo IN ('agf', 'corredora', 'mixto')),
  ADD COLUMN IF NOT EXISTS default_rebate_pct NUMERIC,
  ADD COLUMN IF NOT EXISTS default_advisory_fee_pct NUMERIC,
  ADD COLUMN IF NOT EXISTS default_comision_transaccion_pct NUMERIC;

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS cobro_tipo TEXT
    CHECK (cobro_tipo IN ('agf', 'corredora', 'mixto')),
  ADD COLUMN IF NOT EXISTS rebate_pct NUMERIC,
  ADD COLUMN IF NOT EXISTS advisory_fee_pct NUMERIC,
  ADD COLUMN IF NOT EXISTS comision_transaccion_pct NUMERIC;
```

- [ ] **Step 2: Verificar sintaxis SQL (lectura)**

Confirmar: 8 columnas, todas `IF NOT EXISTS`, el `CHECK` usa `IN (...)` (permite NULL por semántica de CHECK). No hay `NOT NULL` ni `DEFAULT`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260820_fees_model.sql
git commit -m "feat(cobro): migración columnas de cobro (advisors defaults + clients)"
```

**NOTA para el controlador:** esta migración debe aplicarse manualmente en el dashboard de Supabase (prod `zysotxkelepvotzujhxe`) antes de que las rutas escriban esos campos. El código tolera su ausencia solo en lectura (columnas undefined → "— sin configurar —"), pero el PATCH/POST fallará si las columnas no existen. Anotarlo en el reporte.

---

## Task 2: Función pura `estimateAnnualRevenue`

**Files:**
- Create: `lib/fees/estimate.ts`, `lib/fees/estimate.test.ts`

**Interfaces:**
- Produces: `export function estimateAnnualRevenue(fees: FeeInputs, base: number | null | undefined): number | null` y `export interface FeeInputs { advisory_fee_pct?: number | null; rebate_pct?: number | null; }`.

- [ ] **Step 1: Escribir el test que falla**

```ts
// lib/fees/estimate.test.ts
import { describe, it, expect } from "vitest";
import { estimateAnnualRevenue } from "./estimate";

describe("estimateAnnualRevenue", () => {
  it("advisory + rebate sobre la base", () => {
    expect(estimateAnnualRevenue({ advisory_fee_pct: 1, rebate_pct: 0.5 }, 100_000_000)).toBe(1_500_000);
  });
  it("solo advisory", () => {
    expect(estimateAnnualRevenue({ advisory_fee_pct: 0.8, rebate_pct: null }, 50_000_000)).toBe(400_000);
  });
  it("solo rebate", () => {
    expect(estimateAnnualRevenue({ rebate_pct: 1 }, 10_000_000)).toBe(100_000);
  });
  it("sin porcentajes → null", () => {
    expect(estimateAnnualRevenue({ advisory_fee_pct: 0, rebate_pct: 0 }, 100)).toBeNull();
  });
  it("base 0 o null → null", () => {
    expect(estimateAnnualRevenue({ advisory_fee_pct: 1 }, 0)).toBeNull();
    expect(estimateAnnualRevenue({ advisory_fee_pct: 1 }, null)).toBeNull();
  });
});
```

- [ ] **Step 2: Correr el test → falla**

Run: `npx vitest run lib/fees/estimate.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Escribir la implementación**

```ts
// lib/fees/estimate.ts
export interface FeeInputs {
  advisory_fee_pct?: number | null;
  rebate_pct?: number | null;
}

// Ingreso anual recurrente estimado = (advisory_fee% + rebate%)/100 × base.
// La comisión de transacción NO entra (es por evento, no recurrente).
// Devuelve null si no hay base positiva o no hay ningún % configurado.
export function estimateAnnualRevenue(fees: FeeInputs, base: number | null | undefined): number | null {
  if (!base || base <= 0) return null;
  const adv = fees.advisory_fee_pct ?? 0;
  const reb = fees.rebate_pct ?? 0;
  if (adv <= 0 && reb <= 0) return null;
  return ((adv + reb) / 100) * base;
}
```

- [ ] **Step 4: Correr el test → pasa (5/5)**

Run: `npx vitest run lib/fees/estimate.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/fees/estimate.ts lib/fees/estimate.test.ts
git commit -m "feat(cobro): estimateAnnualRevenue (ingreso estimado, lógica pura)"
```

---

## Task 3: Función pura `groupByCustodian`

**Files:**
- Create: `lib/portfolio/group-by-custodian.ts`, `lib/portfolio/group-by-custodian.test.ts`

**Interfaces:**
- Consumes: `stripAccents` de `@/lib/text`.
- Produces: `export interface CustodianGroup { custodio: string; valorCLP: number; pct: number; }` y `export function groupByCustodian<T>(holdings: T[], getSource: (h: T) => string | null | undefined, getValueCLP: (h: T) => number): CustodianGroup[]`.

- [ ] **Step 1: Escribir el test que falla**

```ts
// lib/portfolio/group-by-custodian.test.ts
import { describe, it, expect } from "vitest";
import { groupByCustodian } from "./group-by-custodian";

interface H { src?: string | null; clp: number; }
const src = (h: H) => h.src;
const val = (h: H) => h.clp;

describe("groupByCustodian", () => {
  it("agrupa y calcula % sobre el total", () => {
    const r = groupByCustodian<H>(
      [{ src: "Banchile AGF", clp: 60 }, { src: "Security AGF", clp: 40 }],
      src, val
    );
    expect(r).toEqual([
      { custodio: "Banchile AGF", valorCLP: 60, pct: 60 },
      { custodio: "Security AGF", valorCLP: 40, pct: 40 },
    ]);
  });
  it("unifica tildes/casing ('Itaú' == 'Itau')", () => {
    const r = groupByCustodian<H>(
      [{ src: "Itaú AGF", clp: 30 }, { src: "ITAU agf", clp: 70 }],
      src, val
    );
    expect(r).toHaveLength(1);
    expect(r[0].valorCLP).toBe(100);
    expect(r[0].custodio).toBe("Itaú AGF"); // conserva el primer nombre "bonito"
  });
  it("source vacío/null → grupo 'Sin custodio'", () => {
    const r = groupByCustodian<H>([{ src: null, clp: 50 }, { src: "  ", clp: 50 }], src, val);
    expect(r).toEqual([{ custodio: "Sin custodio", valorCLP: 100, pct: 100 }]);
  });
  it("ordena por valor descendente", () => {
    const r = groupByCustodian<H>(
      [{ src: "A", clp: 10 }, { src: "B", clp: 90 }],
      src, val
    );
    expect(r.map((g) => g.custodio)).toEqual(["B", "A"]);
  });
  it("lista vacía → []", () => {
    expect(groupByCustodian<H>([], src, val)).toEqual([]);
  });
});
```

- [ ] **Step 2: Correr el test → falla**

Run: `npx vitest run lib/portfolio/group-by-custodian.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Escribir la implementación**

```ts
// lib/portfolio/group-by-custodian.ts
import { stripAccents } from "@/lib/text";

export interface CustodianGroup {
  custodio: string;
  valorCLP: number;
  pct: number;
}

// Clave de agrupación: sin tildes, minúsculas, espacios colapsados.
function normKey(s: string): string {
  return stripAccents(s).toLowerCase().replace(/\s+/g, " ").trim();
}

// Agrupa holdings por custodio. `getSource` extrae el custodio (nombre "bonito"),
// `getValueCLP` su valor en CLP. Vacío/null → "Sin custodio". Ordena por valor desc
// y calcula el % de cada grupo sobre el total.
export function groupByCustodian<T>(
  holdings: T[],
  getSource: (h: T) => string | null | undefined,
  getValueCLP: (h: T) => number
): CustodianGroup[] {
  const byKey = new Map<string, { custodio: string; valorCLP: number }>();
  for (const h of holdings) {
    const raw = (getSource(h) ?? "").trim();
    const key = raw ? normKey(raw) : "__none__";
    const label = raw || "Sin custodio";
    const value = getValueCLP(h) || 0;
    const existing = byKey.get(key);
    if (existing) existing.valorCLP += value;
    else byKey.set(key, { custodio: label, valorCLP: value });
  }
  const total = Array.from(byKey.values()).reduce((s, g) => s + g.valorCLP, 0);
  return Array.from(byKey.values())
    .map((g) => ({ custodio: g.custodio, valorCLP: g.valorCLP, pct: total > 0 ? (g.valorCLP / total) * 100 : 0 }))
    .sort((a, b) => b.valorCLP - a.valorCLP);
}
```

- [ ] **Step 4: Correr el test → pasa (5/5)**

Run: `npx vitest run lib/portfolio/group-by-custodian.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/portfolio/group-by-custodian.ts lib/portfolio/group-by-custodian.test.ts
git commit -m "feat(cobro): groupByCustodian (desglose por custodio, lógica pura)"
```

---

## Task 4: Prefill de defaults del asesor al crear cliente

**Files:**
- Modify: `app/api/clients/route.ts`

**Interfaces:**
- Consumes: `requireAdvisor()` (ya devuelve `advisor` con `id`, pero SIN los `default_*` — hay que traerlos aparte).
- Produces: el POST inserta `cobro_tipo|rebate_pct|advisory_fee_pct|comision_transaccion_pct` heredados del asesor si el body no los trae.

Tarea de integración (leer el POST completo primero — la función `emptyToNull` ya existe en el archivo).

- [ ] **Step 1:** En el handler POST, ANTES del `.insert([{...}])` (el objeto que arma el cliente nuevo, hoy termina en `parent_client_id`), traer los defaults del asesor:

```ts
    // Defaults de cobro del asesor (para pre-rellenar el cliente nuevo).
    const { data: advisorDefaults } = await supabase
      .from("advisors")
      .select("default_cobro_tipo, default_rebate_pct, default_advisory_fee_pct, default_comision_transaccion_pct")
      .eq("id", advisor!.id)
      .single();
```

(`supabase` es el mismo cliente admin ya usado en el handler para el insert.)

- [ ] **Step 2:** Agregar 4 campos al objeto insertado (dentro del `.insert([{ ... }])`, junto a `parent_client_id`). El body del cliente puede sobreescribir el default; si ninguno viene, se usa el default del asesor; si tampoco hay default, queda null:

```ts
          cobro_tipo: body.cobro_tipo ?? advisorDefaults?.default_cobro_tipo ?? null,
          rebate_pct: emptyToNull(body.rebate_pct) ?? advisorDefaults?.default_rebate_pct ?? null,
          advisory_fee_pct: emptyToNull(body.advisory_fee_pct) ?? advisorDefaults?.default_advisory_fee_pct ?? null,
          comision_transaccion_pct: emptyToNull(body.comision_transaccion_pct) ?? advisorDefaults?.default_comision_transaccion_pct ?? null,
```

- [ ] **Step 3: Verificar.** `npx tsc --noEmit -p tsconfig.json` → 0 errores. Lectura: el insert incluye los 4 campos; el resto del objeto (nombre, email, asesor_id, etc.) intacto.

- [ ] **Step 4: Commit**

```bash
git add app/api/clients/route.ts
git commit -m "feat(cobro): el alta hereda los defaults de cobro del asesor"
```

---

## Task 5: PATCH de campos de cobro + tipo en Client

**Files:**
- Modify: `app/api/clients/[id]/route.ts`, `components/clients/hooks/useClientData.ts`

**Interfaces:**
- Produces: el PATCH `/api/clients/[id]` acepta `cobro_tipo`, `rebate_pct`, `advisory_fee_pct`, `comision_transaccion_pct` (valida rango 0–100 en los pct y set cerrado en cobro_tipo). El tipo `Client` incluye los 4 campos.

Tarea de integración (leer el handler PATCH `export async function PATCH` — ~línea 332 — que ya maneja `questionnaire_frequency`, `perfil_riesgo`, `display_currency`, `fund_selection_mode` con bloques `if (body.x !== undefined)`).

- [ ] **Step 1:** En el handler PATCH, dentro del armado de `updateData` (después del bloque de `fund_selection_mode`, antes de aplicar el update), agregar:

```ts
    // Campos de cobro (Fase 2). pct nullable, rango 0–100; cobro_tipo set cerrado.
    const pctFields = ["rebate_pct", "advisory_fee_pct", "comision_transaccion_pct"] as const;
    for (const f of pctFields) {
      if (body[f] !== undefined) {
        if (body[f] === "" || body[f] === null) {
          updateData[f] = null;
        } else {
          const n = Number(body[f]);
          if (Number.isNaN(n) || n < 0 || n > 100) {
            return errorResponse(`${f} debe estar entre 0 y 100`, 400);
          }
          updateData[f] = n;
        }
      }
    }
    if (body.cobro_tipo !== undefined) {
      const validTipos = ["agf", "corredora", "mixto"];
      if (body.cobro_tipo && !validTipos.includes(body.cobro_tipo)) {
        return errorResponse("cobro_tipo inválido", 400);
      }
      updateData.cobro_tipo = body.cobro_tipo || null;
    }
```

(Usar el mismo helper `errorResponse` que el resto del handler ya importa. Si el patrón local usa otra firma para el error, seguir el patrón existente del archivo.)

- [ ] **Step 2:** En `components/clients/hooks/useClientData.ts`, en la `interface Client` (después de `tiene_cartera_recomendada?`), agregar:

```ts
  cobro_tipo?: "agf" | "corredora" | "mixto" | null;
  rebate_pct?: number | null;
  advisory_fee_pct?: number | null;
  comision_transaccion_pct?: number | null;
```

- [ ] **Step 3: Verificar.** `npx tsc --noEmit -p tsconfig.json` → 0 errores. Lectura: el PATCH valida y setea los 4 campos; los bloques previos del PATCH intactos.

- [ ] **Step 4: Commit**

```bash
git add "app/api/clients/[id]/route.ts" components/clients/hooks/useClientData.ts
git commit -m "feat(cobro): PATCH de campos de cobro del cliente + tipos"
```

---

## Task 6: Componente `CobroSection` en la ficha

**Files:**
- Create: `components/clients/CobroSection.tsx`
- Modify: `components/clients/ClientDetail.tsx`

**Interfaces:**
- Consumes: `estimateAnnualRevenue` (Task 2), `Client` con campos de cobro (Task 5), primitivos `Card`/`Button`/`Input`.
- Produces: `export default function CobroSection({ client, onSaved }: { client: Client; onSaved?: () => void })`.

- [ ] **Step 1:** Crear `components/clients/CobroSection.tsx`. Presentacional + guarda vía PATCH. Base del estimado = `client.patrimonio_estimado` (etiquetado). Comisión de transacción solo informativa. Usa SOLO tokens de marca.

```tsx
// components/clients/CobroSection.tsx
"use client";
import { useState } from "react";
import Card from "@/components/shared/Card";
import Button from "@/components/shared/Button";
import Input from "@/components/shared/Input";
import { estimateAnnualRevenue } from "@/lib/fees/estimate";
import type { Client } from "@/components/clients/hooks/useClientData";

const TIPOS = [
  { value: "", label: "— sin configurar —" },
  { value: "agf", label: "AGF (rebate)" },
  { value: "corredora", label: "Corredora (advisory fee)" },
  { value: "mixto", label: "Mixto" },
];

function fmt(n: number | null, currency = "CLP"): string {
  if (n == null) return "— sin configurar —";
  return new Intl.NumberFormat("es-CL", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
}

export default function CobroSection({ client, onSaved }: { client: Client; onSaved?: () => void }) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    cobro_tipo: client.cobro_tipo ?? "",
    rebate_pct: client.rebate_pct ?? "",
    advisory_fee_pct: client.advisory_fee_pct ?? "",
    comision_transaccion_pct: client.comision_transaccion_pct ?? "",
  });

  const base = client.patrimonio_estimado ?? null;
  const estimado = estimateAnnualRevenue(
    { advisory_fee_pct: Number(form.advisory_fee_pct) || null, rebate_pct: Number(form.rebate_pct) || null },
    base
  );

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/clients/${client.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cobro_tipo: form.cobro_tipo || null,
          rebate_pct: form.rebate_pct === "" ? null : Number(form.rebate_pct),
          advisory_fee_pct: form.advisory_fee_pct === "" ? null : Number(form.advisory_fee_pct),
          comision_transaccion_pct: form.comision_transaccion_pct === "" ? null : Number(form.comision_transaccion_pct),
        }),
      });
      if (res.ok) {
        setEditing(false);
        onSaved?.();
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card title="Cobro" className="mb-6" action={
      !editing ? <button onClick={() => setEditing(true)} className="text-xs font-semibold text-gb-info hover:underline">Editar</button> : undefined
    }>
      {!editing ? (
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div><p className="text-gb-gray text-xs">Tipo de cobro</p><p className="text-gb-black font-medium">{TIPOS.find(t => t.value === (client.cobro_tipo ?? ""))?.label}</p></div>
          <div><p className="text-gb-gray text-xs">Advisory fee</p><p className="text-gb-black font-medium">{client.advisory_fee_pct != null ? `${client.advisory_fee_pct}%` : "— sin configurar —"}</p></div>
          <div><p className="text-gb-gray text-xs">Rebate</p><p className="text-gb-black font-medium">{client.rebate_pct != null ? `${client.rebate_pct}%` : "— sin configurar —"}</p></div>
          <div><p className="text-gb-gray text-xs">Comisión transacción</p><p className="text-gb-black font-medium">{client.comision_transaccion_pct != null ? `${client.comision_transaccion_pct}% por operación` : "— sin configurar —"}</p></div>
          <div className="col-span-2 border-t border-gb-border pt-3 mt-1">
            <p className="text-gb-gray text-xs">Ingreso anual estimado <span className="text-gb-gray">(sobre patrimonio estimado)</span></p>
            <p className="text-lg font-semibold text-gb-primary">{fmt(estimateAnnualRevenue({ advisory_fee_pct: client.advisory_fee_pct, rebate_pct: client.rebate_pct }, base))}</p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <label className="text-xs font-medium text-gb-gray">Tipo de cobro
            <select value={form.cobro_tipo} onChange={(e) => setForm({ ...form, cobro_tipo: e.target.value })}
              className="mt-1 w-full rounded-md border border-gb-border px-3 py-2 text-sm text-gb-black focus:border-gb-primary focus:outline-none">
              {TIPOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </label>
          <div className="grid grid-cols-3 gap-3">
            <Input label="Advisory fee %" name="advisory_fee_pct" type="number" step="0.01" value={form.advisory_fee_pct} onChange={(e) => setForm({ ...form, advisory_fee_pct: e.target.value })} />
            <Input label="Rebate %" name="rebate_pct" type="number" step="0.01" value={form.rebate_pct} onChange={(e) => setForm({ ...form, rebate_pct: e.target.value })} />
            <Input label="Comisión tx %" name="comision_transaccion_pct" type="number" step="0.01" value={form.comision_transaccion_pct} onChange={(e) => setForm({ ...form, comision_transaccion_pct: e.target.value })} />
          </div>
          <p className="text-xs text-gb-gray">Ingreso anual estimado: <span className="font-semibold text-gb-primary">{fmt(estimado)}</span> (advisory + rebate sobre patrimonio estimado; la comisión de transacción no se anualiza).</p>
          <div className="flex gap-2">
            <Button onClick={save} disabled={saving}>{saving ? "Guardando…" : "Guardar"}</Button>
            <Button variant="secondary" onClick={() => setEditing(false)} disabled={saving}>Cancelar</Button>
          </div>
        </div>
      )}
    </Card>
  );
}
```

**NOTA:** verificar la firma real del primitivo `Input` (`components/shared/Input.tsx`): usa `label`, `name`, y pasa el resto de props al `<input>` (incluido `type`, `step`, `value`, `onChange`). Si `Input` no acepta `type`/`step` como passthrough, usar un `<input>` con las mismas clases de marca. Verificar también la firma de `Button` (variant `primary` por defecto, `secondary`). Ajustar solo si difieren.

- [ ] **Step 2:** Montar en `components/clients/ClientDetail.tsx`. Leer el archivo, importar `CobroSection` y montarlo en el cuerpo de la ficha (junto a `ClientInfoCard` / bloque de patrimonio). Pasar `client={client}` y `onSaved={/* el refetch del cliente que ya use la ficha, p.ej. refresh de useClientData */}` (si no hay un refetch trivial, omitir `onSaved` — el PATCH persiste igual y el valor se ve al recargar).

```tsx
import CobroSection from "@/components/clients/CobroSection";
// … en el JSX de la ficha, junto a los otros bloques del cliente:
<CobroSection client={client} />
```

- [ ] **Step 3: Verificar.** `npx tsc --noEmit -p tsconfig.json` → 0 errores. `npx eslint components/clients/CobroSection.tsx components/clients/ClientDetail.tsx` → sin errores nuevos (paleta de marca). Lectura: el bloque aparece en la ficha; el resto intacto.

- [ ] **Step 4: Commit**

```bash
git add components/clients/CobroSection.tsx components/clients/ClientDetail.tsx
git commit -m "feat(cobro): bloque de cobro + ingreso estimado en la ficha del cliente"
```

---

## Task 7: Defaults de cobro en el perfil del asesor

**Files:**
- Modify: `app/api/advisor/profile/route.ts`, `app/(advisor-shell)/advisor/profile/page.tsx`

**Interfaces:**
- Produces: el PUT `/api/advisor/profile` acepta `default_cobro_tipo|default_rebate_pct|default_advisory_fee_pct|default_comision_transaccion_pct`; la página de perfil los edita.

Tarea de integración (leer ambos archivos; el PUT usa un array `allowedFields`).

- [ ] **Step 1 (API):** En `app/api/advisor/profile/route.ts`, agregar los 4 campos al array `allowedFields` (hoy `['nombre', 'apellido', 'telefono', 'especialidad', 'bio', 'linkedin_url', 'preferred_ai_model', 'contact_email']`):

```ts
    const allowedFields = ['nombre', 'apellido', 'telefono', 'especialidad', 'bio', 'linkedin_url', 'preferred_ai_model', 'contact_email',
      'default_cobro_tipo', 'default_rebate_pct', 'default_advisory_fee_pct', 'default_comision_transaccion_pct'];
```

Y tras el loop que arma `updateData`, normalizar strings vacíos de los pct a null (junto al bloque que ya hace `contact_email === '' → null`):

```ts
    for (const f of ['default_rebate_pct', 'default_advisory_fee_pct', 'default_comision_transaccion_pct'] as const) {
      if (updateData[f] === '' ) updateData[f] = null;
    }
    if (updateData.default_cobro_tipo === '') updateData.default_cobro_tipo = null;
```

Confirmar (lectura) que el GET del perfil devuelve estos campos (si usa `select("*")` o devuelve la fila completa, ya vienen; si lista columnas, agregarlas).

- [ ] **Step 2 (UI):** En `app/(advisor-shell)/advisor/profile/page.tsx`, leer el archivo y agregar un bloque "Cobro por defecto" con 4 inputs (tipo select agf/corredora/mixto + 3 numéricos), cargados del perfil (GET) y enviados en el PUT junto al resto del form. Usar los primitivos/estilos que la página ya usa (seguir su patrón de campos); tokens de marca `gb-*`, sin colores crudos. Texto guía: "Se usan para pre-rellenar el cobro de cada cliente nuevo; podés ajustarlo por cliente."

- [ ] **Step 3: Verificar.** `npx tsc --noEmit -p tsconfig.json` → 0 errores. `npx eslint "app/(advisor-shell)/advisor/profile/page.tsx" app/api/advisor/profile/route.ts` → sin errores nuevos. Lectura: el PUT acepta los 4 default_*; el form los muestra/guarda.

- [ ] **Step 4: Commit**

```bash
git add app/api/advisor/profile/route.ts "app/(advisor-shell)/advisor/profile/page.tsx"
git commit -m "feat(cobro): defaults de cobro del asesor en su perfil"
```

---

## Task 8: Toggle Consolidado / Por custodio en el Seguimiento

**Files:**
- Create: `components/seguimiento/CustodianBreakdown.tsx`
- Modify: `components/seguimiento/SeguimientoPage.tsx`

**Interfaces:**
- Consumes: `groupByCustodian` (Task 3), la lista `snapshots` que `SeguimientoPage` ya tiene, primitivo `Card`.
- Produces: `export default function CustodianBreakdown({ snapshots }: { snapshots: Array<{ snapshot_date: string; source?: string; holdings?: unknown[] | null }> })`.

**Contexto de datos (verificado):** hay UN snapshot por (cliente, fecha); la última snapshot contiene TODOS los holdings, y cada holding crudo lleva `source` (= custodio) y `marketValueCLP`. El desglose lee la última snapshot con holdings (excluyendo `source === "api-prices"`, que son auto-generados) y agrupa por `holding.source`.

- [ ] **Step 1:** Crear `components/seguimiento/CustodianBreakdown.tsx`:

```tsx
// components/seguimiento/CustodianBreakdown.tsx
"use client";
import { useMemo } from "react";
import Card from "@/components/shared/Card";
import { groupByCustodian } from "@/lib/portfolio/group-by-custodian";

interface RawHolding { source?: string | null; marketValue?: number; marketValueCLP?: number; }
interface Snap { snapshot_date: string; source?: string; holdings?: unknown[] | null; }

function fmtCLP(n: number): string {
  return new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(n);
}

export default function CustodianBreakdown({ snapshots }: { snapshots: Snap[] }) {
  const groups = useMemo(() => {
    const withHoldings = snapshots
      .filter((s) => s.source !== "api-prices" && Array.isArray(s.holdings) && s.holdings.length > 0)
      .sort((a, b) => (a.snapshot_date < b.snapshot_date ? 1 : -1));
    const latest = withHoldings[0];
    const holdings = (Array.isArray(latest?.holdings) ? latest!.holdings : []) as RawHolding[];
    return groupByCustodian<RawHolding>(
      holdings,
      (h) => h.source,
      (h) => (h.marketValueCLP && h.marketValueCLP > 0 ? h.marketValueCLP : h.marketValue || 0)
    );
  }, [snapshots]);

  if (groups.length === 0) {
    return <p className="text-sm text-gb-gray py-4">No hay holdings para desglosar por custodio.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {groups.map((g) => (
        <div key={g.custodio} className="flex items-center justify-between gap-3 rounded-md border border-gb-border px-3 py-2 text-sm">
          <span className="text-gb-black font-medium">{g.custodio}</span>
          <span className="flex items-center gap-3">
            <span className="text-gb-gray tabular-nums">{g.pct.toFixed(1)}%</span>
            <span className="text-gb-black font-semibold tabular-nums">{fmtCLP(g.valorCLP)}</span>
          </span>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2:** En `components/seguimiento/SeguimientoPage.tsx`, leer dónde se monta `<CompositionBoxes … />` (~línea 320) y la variable `snapshots`. Agregar un estado de toggle y renderizar el desglose como alternativa a la composición consolidada:

```tsx
// import arriba:
import CustodianBreakdown from "@/components/seguimiento/CustodianBreakdown";
// junto a los otros useState de la página:
const [vistaCustodio, setVistaCustodio] = useState(false);
```

Reemplazar el bloque donde hoy se renderiza la composición consolidada por uno con el toggle encima (mantener `CompositionBoxes` intacto para el modo consolidado):

```tsx
{seg.holdingReturnsData && snapshots.length > 0 && (
  <div>
    <div className="flex items-center gap-2 mb-3">
      <button onClick={() => setVistaCustodio(false)}
        className={`text-xs font-semibold rounded-[3px] px-3 py-1.5 border ${!vistaCustodio ? "bg-gb-black text-white border-transparent" : "text-gb-info border-gb-border hover:bg-gb-light"}`}>
        Consolidado
      </button>
      <button onClick={() => setVistaCustodio(true)}
        className={`text-xs font-semibold rounded-[3px] px-3 py-1.5 border ${vistaCustodio ? "bg-gb-black text-white border-transparent" : "text-gb-info border-gb-border hover:bg-gb-light"}`}>
        Por custodio
      </button>
    </div>
    {vistaCustodio
      ? <Card title="Patrimonio por custodio"><CustodianBreakdown snapshots={snapshots} /></Card>
      : <CompositionBoxes holdingReturnsData={seg.holdingReturnsData} /* …resto de props existentes… */ />}
  </div>
)}
```

**IMPORTANTE:** conservar TODAS las props que `CompositionBoxes` ya recibía (copiarlas tal cual desde el JSX actual — no inventar ni omitir props). El toggle solo envuelve; no cambia la composición consolidada. Verificar el tipo real de `snapshots` (debe tener `snapshot_date`, `source`, `holdings`); si el nombre de la variable difiere, usar el correcto.

- [ ] **Step 3: Verificar.** `npx tsc --noEmit -p tsconfig.json` → 0 errores. `npx eslint components/seguimiento/CustodianBreakdown.tsx components/seguimiento/SeguimientoPage.tsx` → sin errores nuevos. Lectura: el toggle alterna sin romper la vista consolidada; `CompositionBoxes` conserva sus props.

- [ ] **Step 4: Commit**

```bash
git add components/seguimiento/CustodianBreakdown.tsx components/seguimiento/SeguimientoPage.tsx
git commit -m "feat(cobro): toggle Consolidado/Por-custodio en el Seguimiento"
```

---

## Notas de ejecución

- **Modelos:** Tasks 2, 3 (funciones puras con código completo) → transcripción, subagente económico-medio. Tasks 1, 4, 5, 6, 7, 8 (integración) → sonnet. **NO usar haiku** para implementers (lección Fase 0/1: se va del rail).
- **Orden:** 1 → 2 → 3 (base) → 4, 5 (API) → 6 (ficha, usa 2+5) → 7 (perfil) → 8 (seguimiento, usa 3). Task 6 depende de Task 5 (tipo Client). Task 8 depende de Task 3.
- **Migración:** aplicar `20260820_fees_model.sql` en Supabase prod antes de probar el guardado (el controlador lo recuerda al usuario).
- **Al terminar:** `npx tsc --noEmit` + `npx vitest run lib/fees/estimate.test.ts lib/portfolio/group-by-custodian.test.ts` + lint de los archivos tocados; review final de rama (opus) antes de mergear a master.
- **Gotcha OneDrive:** verificar en build si algo "no aparece" en localhost tras un edit.
