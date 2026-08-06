# Journey stepper de la ficha del cliente — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convertir la ficha del cliente (`/clients/[id]`) en un journey guiado: un stepper horizontal con 5 hitos, estado por hito derivado del cliente, y un botón "Continuar →" al paso pendiente.

**Architecture:** Una función pura `computeJourneySteps(client, today)` deriva los 5 hitos y su estado del objeto `client` ya cargado por `useClientData` (sin queries nuevas). Un componente `JourneyStepper` la renderiza como banner horizontal arriba de `ClientDetail`. La tarjeta "Acciones" se adelgaza a "Más herramientas" (solo lo que no es hito).

**Tech Stack:** Next.js 16 (App Router) + React 19 + TypeScript + Vitest + ESLint.

## Global Constraints

- Sin cambios de backend/DB: todo el estado se deriva del `client` ya cargado. La API `/api/clients/[id]` ya devuelve `cartera_recomendada` (usa `select("*")`); solo hay que tiparla.
- `computeJourneySteps` es **pura** y recibe `today: Date` como parámetro (NO usar `new Date()` dentro) para poder testear el caso "por renovar".
- 5 hitos fijos: Datos → Perfil de Riesgo → Cartola → Recomendación → Seguimiento. Radiografía NO es hito.
- Estilo con tokens del app (`gb-*`), consistente con el shell del asesor. Código/comentarios en español.
- Tests con Vitest (`npx vitest run <archivo>`); `npx tsc --noEmit` y `npx eslint <archivos>` limpios.

---

### Task 1: Función pura `computeJourneySteps` + tipos

**Files:**
- Create: `lib/clients/journey.ts`
- Test: `lib/clients/journey.test.ts`

**Interfaces:**
- Produces:
  - `type JourneyStatus = "done" | "current" | "pending"`
  - `type JourneyKey = "datos" | "perfil" | "cartola" | "recomendacion" | "seguimiento"`
  - `interface JourneyStep { key: JourneyKey; label: string; status: JourneyStatus; detail: string; href: string; warn?: boolean }`
  - `interface JourneyClient { id: string; email: string | null; perfil_riesgo: string | null; puntaje_riesgo: number | null; tiene_portfolio: boolean | null; cartera_recomendada: unknown; next_questionnaire_date: string | null }`
  - `function computeJourneySteps(c: JourneyClient, today: Date): JourneyStep[]`

- [ ] **Step 1: Write the failing test**

Create `lib/clients/journey.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { computeJourneySteps, type JourneyClient } from "./journey";

const HOY = new Date("2026-08-05T00:00:00Z");
const base: JourneyClient = {
  id: "c1", email: "a@b.cl", perfil_riesgo: null, puntaje_riesgo: null,
  tiene_portfolio: false, cartera_recomendada: null, next_questionnaire_date: null,
};
const st = (steps: ReturnType<typeof computeJourneySteps>, key: string) => steps.find(s => s.key === key)!;

describe("computeJourneySteps", () => {
  it("cliente nuevo (solo email): datos done, current = perfil, resto pending", () => {
    const s = computeJourneySteps(base, HOY);
    expect(s.map(x => x.key)).toEqual(["datos", "perfil", "cartola", "recomendacion", "seguimiento"]);
    expect(st(s, "datos").status).toBe("done");
    expect(st(s, "perfil").status).toBe("current");
    expect(st(s, "cartola").status).toBe("pending");
    expect(st(s, "recomendacion").status).toBe("pending");
    expect(st(s, "seguimiento").status).toBe("pending");
  });

  it("sin email: datos current", () => {
    const s = computeJourneySteps({ ...base, email: null }, HOY);
    expect(st(s, "datos").status).toBe("current");
  });

  it("perfil real (puntaje>0): perfil done con detalle, current = cartola", () => {
    const s = computeJourneySteps({ ...base, perfil_riesgo: "moderado", puntaje_riesgo: 62 }, HOY);
    expect(st(s, "perfil").status).toBe("done");
    expect(st(s, "perfil").detail).toBe("moderado · 62");
    expect(st(s, "cartola").status).toBe("current");
  });

  it("perfil solo estimado (puntaje=0): perfil NO done", () => {
    const s = computeJourneySteps({ ...base, perfil_riesgo: "moderado", puntaje_riesgo: 0 }, HOY);
    expect(st(s, "perfil").status).toBe("current");
  });

  it("con cartola: current = recomendacion", () => {
    const s = computeJourneySteps({ ...base, perfil_riesgo: "moderado", puntaje_riesgo: 62, tiene_portfolio: true }, HOY);
    expect(st(s, "cartola").status).toBe("done");
    expect(st(s, "recomendacion").status).toBe("current");
  });

  it("con recomendación con contenido: seguimiento done (en curso), sin current", () => {
    const s = computeJourneySteps({
      ...base, perfil_riesgo: "moderado", puntaje_riesgo: 62, tiene_portfolio: true,
      cartera_recomendada: { cartera: [{ ticker: "VOO", porcentaje: 100 }] },
    }, HOY);
    expect(st(s, "recomendacion").status).toBe("done");
    expect(st(s, "seguimiento").status).toBe("done");
    expect(st(s, "seguimiento").detail).toBe("en curso");
    expect(s.some(x => x.status === "current")).toBe(false);
  });

  it("cartera_recomendada vacía → recomendacion pending", () => {
    const s = computeJourneySteps({
      ...base, perfil_riesgo: "moderado", puntaje_riesgo: 62, tiene_portfolio: true,
      cartera_recomendada: { cartera: [] },
    }, HOY);
    expect(st(s, "recomendacion").status).toBe("current");
  });

  it("next_questionnaire_date vencida → perfil done + warn", () => {
    const s = computeJourneySteps({
      ...base, perfil_riesgo: "moderado", puntaje_riesgo: 62, next_questionnaire_date: "2026-01-01",
    }, HOY);
    expect(st(s, "perfil").status).toBe("done");
    expect(st(s, "perfil").warn).toBe(true);
  });

  it("hrefs scopeados al cliente", () => {
    const s = computeJourneySteps(base, HOY);
    expect(st(s, "recomendacion").href).toBe("/recomendacion/c1");
    expect(st(s, "cartola").href).toBe("/clients/c1/seguimiento");
    expect(st(s, "perfil").href).toBe("/analisis-cartola?client=a%40b.cl");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/clients/journey.test.ts`
Expected: FAIL con "Failed to resolve import ./journey".

- [ ] **Step 3: Implement**

Create `lib/clients/journey.ts`:

```ts
// Deriva los 5 hitos del "journey" del cliente y su estado desde el objeto client
// ya cargado por useClientData. Función pura (today inyectable) — sin queries.

export type JourneyStatus = "done" | "current" | "pending";
export type JourneyKey = "datos" | "perfil" | "cartola" | "recomendacion" | "seguimiento";

export interface JourneyStep {
  key: JourneyKey;
  label: string;
  status: JourneyStatus;
  detail: string;
  href: string;
  warn?: boolean;
}

export interface JourneyClient {
  id: string;
  email: string | null;
  perfil_riesgo: string | null;
  puntaje_riesgo: number | null;
  tiene_portfolio: boolean | null;
  cartera_recomendada: unknown;
  next_questionnaire_date: string | null;
}

// La cartera recomendada puede venir como array o como { cartera: [...] }; se
// considera "hecha" solo si tiene al menos una posición.
function carteraTieneContenido(cr: unknown): boolean {
  if (!cr) return false;
  if (Array.isArray(cr)) return cr.length > 0;
  if (typeof cr === "object") {
    const arr = (cr as { cartera?: unknown }).cartera;
    return Array.isArray(arr) && arr.length > 0;
  }
  return false;
}

export function computeJourneySteps(c: JourneyClient, today: Date): JourneyStep[] {
  const datosOk = !!c.email;
  const perfilOk = !!c.perfil_riesgo && (c.puntaje_riesgo ?? 0) > 0;
  const cartolaOk = c.tiene_portfolio === true;
  const recomOk = carteraTieneContenido(c.cartera_recomendada);
  const seguimientoOk = cartolaOk && recomOk;

  const perfilWarn =
    perfilOk && !!c.next_questionnaire_date && new Date(c.next_questionnaire_date) <= today;

  const email = encodeURIComponent(c.email ?? "");
  const rows: Array<Omit<JourneyStep, "status"> & { done: boolean }> = [
    { key: "datos", label: "Datos", done: datosOk,
      detail: datosOk ? "completado" : "faltan datos", href: `/clients/${c.id}` },
    { key: "perfil", label: "Perfil de Riesgo", done: perfilOk,
      detail: perfilOk ? `${c.perfil_riesgo} · ${c.puntaje_riesgo}` : "pendiente",
      href: `/analisis-cartola?client=${email}`, warn: perfilWarn },
    { key: "cartola", label: "Cartola", done: cartolaOk,
      detail: cartolaOk ? "cargada" : "pendiente", href: `/clients/${c.id}/seguimiento` },
    { key: "recomendacion", label: "Recomendación", done: recomOk,
      detail: recomOk ? "guardada" : "pendiente", href: `/recomendacion/${c.id}` },
    { key: "seguimiento", label: "Seguimiento", done: seguimientoOk,
      detail: seguimientoOk ? "en curso" : "pendiente", href: `/clients/${c.id}/seguimiento` },
  ];

  // "current" = primer hito no-hecho, excluyendo Seguimiento (es continuo, nunca bloquea).
  const currentIdx = rows.findIndex((r) => !r.done && r.key !== "seguimiento");

  return rows.map((r, i) => {
    const { done, ...rest } = r;
    const status: JourneyStatus = done ? "done" : i === currentIdx ? "current" : "pending";
    return { ...rest, status };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/clients/journey.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Verify tsc**

Run: `npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 6: Commit**

```bash
git add lib/clients/journey.ts lib/clients/journey.test.ts
git commit -m "feat(journey): computeJourneySteps (estado de los 5 hitos, función pura)"
```

---

### Task 2: Componente `JourneyStepper`

**Files:**
- Create: `components/clients/JourneyStepper.tsx`

**Interfaces:**
- Consumes (Task 1): `computeJourneySteps`, `JourneyClient`, `JourneyStep` de `@/lib/clients/journey`.
- Produces: `export default function JourneyStepper({ client }: { client: JourneyClient })`.

- [ ] **Step 1: Implement el componente**

Create `components/clients/JourneyStepper.tsx`:

```tsx
"use client";

import React from "react";
import Link from "next/link";
import { Check, ArrowRight, AlertTriangle } from "lucide-react";
import { computeJourneySteps, type JourneyClient, type JourneyStep } from "@/lib/clients/journey";

function NodeCircle({ step, index }: { step: JourneyStep; index: number }) {
  const base = "w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0";
  if (step.status === "done") {
    return <div className={`${base} bg-gb-success text-white`}><Check className="w-4 h-4" /></div>;
  }
  if (step.status === "current") {
    return <div className={`${base} bg-gb-primary text-white ring-4 ring-gb-primary/20`}>{index + 1}</div>;
  }
  return <div className={`${base} bg-gb-light text-gb-gray border border-gb-border`}>{index + 1}</div>;
}

export default function JourneyStepper({ client }: { client: JourneyClient }) {
  const steps = computeJourneySteps(client, new Date());
  const current = steps.find((s) => s.status === "current");

  return (
    <div className="bg-white rounded-lg border border-gb-border p-4 mb-6 shadow-sm">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex-1 min-w-0 overflow-x-auto">
          <div className="flex items-center gap-1 min-w-max">
            {steps.map((step, i) => (
              <React.Fragment key={step.key}>
                <Link href={step.href} className="flex flex-col items-center gap-1 px-2 group">
                  <NodeCircle step={step} index={i} />
                  <span className={`text-xs font-medium ${step.status === "pending" ? "text-gb-gray" : "text-gb-black"} group-hover:underline`}>
                    {step.label}
                  </span>
                  <span className="text-[10px] text-gb-gray flex items-center gap-0.5">
                    {step.warn && <AlertTriangle className="w-3 h-3 text-amber-500" />}
                    {step.detail}
                  </span>
                </Link>
                {i < steps.length - 1 && (
                  <div className={`h-0.5 w-8 shrink-0 ${steps[i].status === "done" ? "bg-gb-success" : "bg-gb-border"}`} />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>
        <div className="shrink-0">
          {current ? (
            <Link
              href={current.href}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium text-white bg-gb-primary hover:bg-gb-primary/90 transition-colors"
            >
              Continuar → {current.label}
              <ArrowRight className="w-4 h-4" />
            </Link>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium text-gb-success bg-green-50">
              <Check className="w-4 h-4" /> Todo al día
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify tsc + eslint**

Run: `npx tsc --noEmit` → 0 errores.
Run: `npx eslint components/clients/JourneyStepper.tsx` → limpio.

- [ ] **Step 3: Commit**

```bash
git add components/clients/JourneyStepper.tsx
git commit -m "feat(journey): componente JourneyStepper (banner horizontal + Continuar)"
```

---

### Task 3: Integración en `ClientDetail` + tipar `cartera_recomendada`

**Files:**
- Modify: `components/clients/hooks/useClientData.ts` (agregar `cartera_recomendada` al `interface Client`)
- Modify: `components/clients/ClientDetail.tsx` (montar el stepper)

**Interfaces:**
- Consumes (Task 2): `JourneyStepper` de `@/components/clients/JourneyStepper`.
- El `client` de `useClientData` cumple estructuralmente `JourneyClient` una vez agregado `cartera_recomendada`.

- [ ] **Step 1: Tipar `cartera_recomendada` en `useClientData`**

En `components/clients/hooks/useClientData.ts`, dentro de `export interface Client { ... }` (donde ya están `perfil_riesgo`, `puntaje_riesgo`, `tiene_portfolio`, `next_questionnaire_date?`), agregar el campo:

```ts
  cartera_recomendada?: unknown;
```

(La API `/api/clients/[id]` ya lo devuelve vía `select("*")`; esto solo lo tipa.)

- [ ] **Step 2: Montar el stepper en `ClientDetail`**

En `components/clients/ClientDetail.tsx`:

2a. Agregar el import (junto a los otros de `@/components/clients`):

```tsx
import JourneyStepper from "@/components/clients/JourneyStepper";
```

2b. Localizar el header de la ficha (el bloque con el nombre del cliente y el badge de `status`, alrededor de `<div className="flex items-center justify-between mb-6">`). Inmediatamente **después** de ese header (antes del grid/contenido principal de tarjetas), insertar:

```tsx
        <JourneyStepper
          client={{
            id: client.id,
            email: client.email,
            perfil_riesgo: client.perfil_riesgo ?? null,
            puntaje_riesgo: client.puntaje_riesgo ?? null,
            tiene_portfolio: client.tiene_portfolio ?? null,
            cartera_recomendada: client.cartera_recomendada ?? null,
            next_questionnaire_date: client.next_questionnaire_date ?? null,
          }}
        />
```

(Se construye el subset `JourneyClient` explícitamente para no depender de que `Client` sea idéntico. `client` está garantizado no-null en el punto de render — el early-return de loading/no-cliente ya ocurrió antes.)

- [ ] **Step 3: Verify tsc + eslint**

Run: `npx tsc --noEmit` → 0 errores.
Run: `npx eslint components/clients/ClientDetail.tsx components/clients/hooks/useClientData.ts` → limpio.

- [ ] **Step 4: Verificación manual**

Abrir un cliente en la ficha: el banner del stepper aparece arriba, con el estado correcto por hito y "Continuar →" apuntando al primer pendiente (o "Todo al día").

- [ ] **Step 5: Commit**

```bash
git add components/clients/ClientDetail.tsx components/clients/hooks/useClientData.ts
git commit -m "feat(journey): monta JourneyStepper en la ficha del cliente + tipa cartera_recomendada"
```

---

### Task 4: Adelgazar la tarjeta "Acciones" → "Más herramientas"

**Files:**
- Modify: `components/clients/ClientInfoCard.tsx`

**Interfaces:**
- Ninguna nueva. Solo edita el bloque de "Acciones" (el stepper ya cubre Seguimiento/Perfil/Recomendación).

- [ ] **Step 1: Reemplazar el bloque "Acciones"**

En `components/clients/ClientInfoCard.tsx`, localizar el bloque `{/* Quick actions */}` (la tarjeta con `<h2>Acciones</h2>` que hoy contiene: Seguimiento de Cartolas, Perfil de Riesgo / Cartola, Recomendación, Comparar Ideal vs Actual, Construir Modelo, Analizar Fondos). Reemplazar TODO ese bloque por esta versión adelgazada (renombra el título y deja solo las 3 herramientas que NO son hitos del journey; los `href` de esas 3 quedan igual que hoy):

```tsx
      {/* Más herramientas (los hitos del journey viven en el stepper de arriba) */}
      <div className="bg-white rounded-lg border border-gb-border border-l-4 border-l-blue-500 p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-gb-black mb-3">Más herramientas</h2>
        <div className="space-y-1">
          <Link
            href={`/portfolio-comparison?client=${client.email}`}
            className="flex items-center gap-2 px-3 py-2 rounded-md text-sm text-blue-600 hover:bg-blue-50 transition-colors"
          >
            <BarChart3 className="w-4 h-4" />
            Comparar Ideal vs Actual
          </Link>
          <Link
            href={`/modelo-cartera?client=${client.email}`}
            className="flex items-center gap-2 px-3 py-2 rounded-md text-sm text-blue-600 hover:bg-blue-50 transition-colors"
          >
            <Briefcase className="w-4 h-4" />
            Construir Modelo
          </Link>
          <Link
            href="/fund-center"
            className="flex items-center gap-2 px-3 py-2 rounded-md text-sm text-blue-600 hover:bg-blue-50 transition-colors"
          >
            <TrendingUp className="w-4 h-4" />
            Analizar Fondos
          </Link>
        </div>
      </div>
```

Los iconos `BarChart3`, `Briefcase`, `TrendingUp` ya están importados en el archivo. Los iconos que queden sin usar tras quitar los links (p.ej. `LineChart`, `Shield`, `Target`) — verificá con `eslint` y quitalos del import solo si el linter marca `no-unused-vars` por ellos (Shield/Target/LineChart pueden seguir usándose en otras partes de la tarjeta; no los quites a ciegas).

- [ ] **Step 2: Verify tsc + eslint**

Run: `npx tsc --noEmit` → 0 errores.
Run: `npx eslint components/clients/ClientInfoCard.tsx` → limpio (sin unused imports).

- [ ] **Step 3: Verificación manual**

En la ficha: la tarjeta ahora dice "Más herramientas" con solo Comparar / Construir Modelo / Analizar Fondos; Seguimiento/Perfil/Recomendación ya no se duplican (viven en el stepper).

- [ ] **Step 4: Commit**

```bash
git add components/clients/ClientInfoCard.tsx
git commit -m "feat(journey): adelgaza 'Acciones' a 'Más herramientas' (hitos ya en el stepper)"
```

---

## Verificación final

- `npx vitest run` completo verde (incluye `journey.test.ts`).
- `npx tsc --noEmit` limpio; `npx eslint` sin warnings en los archivos tocados.
- Manual end-to-end: cliente nuevo → stepper marca "Continuar → Perfil de Riesgo"; cliente con todo → "Todo al día"; los nodos linkean a la herramienta correcta scopeada.
