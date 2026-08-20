# Journey guiado + alta simple + ingreso de fondos (v2.0 · Fase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) o superpowers:executing-plans para implementar tarea por tarea. Los steps usan checkbox (`- [ ]`).

**Goal:** Agregar un checklist de progreso ("journey guiado") en la ficha del cliente, simplificar el formulario de alta, y hacer más intuitivo el ingreso de fondos preferidos — todo sobre los primitivos de la Fase 0.

**Architecture:** Una función pura `computeJourneySteps(client)` decide qué paso está hecho/siguiente desde flags ya presentes en el cliente; un componente presentacional `ClientJourneyChecklist` la renderiza con `Card`/`Button`. El alta colapsa campos avanzados. El ingreso de fondos deja de forzar custodio 'agf', pre-sugiere categoría (función pura familia+nombre→categoría) y agrega filtros client-side.

**Tech Stack:** Next.js 16 · React 19 · Tailwind v4 (tokens `gb-*`) · Vitest+jsdom (tests con `renderToStaticMarkup` de `react-dom/server`, sin `@testing-library`) · primitivos `components/shared/*` (Fase 0).

## Global Constraints

- Solo tokens del proyecto y primitivos Fase 0 (`PageContainer`, `PageHeader`, `Card`, `Button`, `Input`). PROHIBIDO color crudo/gradiente (el guard de ESLint aplica a las páginas migradas; las nuevas también deben cumplir).
- **CERO regresiones funcionales** en los flujos existentes (alta, ficha, fondos): mismos handlers, validaciones, fetch.
- Navegación del journey: siempre al MISMO cliente por id, sin `window.open`.
- Tests con `renderToStaticMarkup`; lógica de decisión en funciones puras testeadas. No agregar dependencias.
- El paso 2 del journey ("Perfil de riesgo") se marca ✓ si `perfil_riesgo` está definido — por cuestionario O estimación manual.

---

## File Structure

**Crear:**
- `lib/journey/steps.ts` — `computeJourneySteps(client)` (pura) + tipos.
- `lib/journey/steps.test.ts`
- `lib/fund-category-suggest.ts` — `suggestFundCategory(familia, fundName)` (pura).
- `lib/fund-category-suggest.test.ts`
- `components/clients/ClientJourneyChecklist.tsx`
- `components/clients/ClientJourneyChecklist.test.tsx`

**Modificar:**
- `app/api/clients/[id]/route.ts` (flag `tiene_cartera_recomendada` en el payload)
- `components/clients/ClientDetail.tsx` (montar el checklist)
- `app/(advisor-shell)/advisor/page.tsx` (reemplazar `FLOW_STEPS` decorativo)
- `app/(advisor-shell)/clients/new/page.tsx` (colapsar avanzados)
- `app/(advisor-shell)/advisor/fondos/page.tsx` (custodio pendiente, sugerir categoría, filtros, info-box)
- `app/api/advisor/preferred-funds/route.ts` (no forzar 'agf')

---

## Task 1: `computeJourneySteps` (función pura)

**Files:**
- Create: `lib/journey/steps.ts`, `lib/journey/steps.test.ts`

**Interfaces:**
- Produces: `export interface JourneyStep { key: string; label: string; done: boolean; isNext: boolean; }` y `export function computeJourneySteps(c: JourneyClient): JourneyStep[]`, con `JourneyClient = { perfil_riesgo?: string | null; tiene_portfolio?: boolean | null; tiene_cartera_recomendada?: boolean | null; }`.

- [ ] **Step 1: Write the failing test**

```ts
// lib/journey/steps.test.ts
import { describe, it, expect } from "vitest";
import { computeJourneySteps } from "./steps";

describe("computeJourneySteps", () => {
  it("cliente recién creado: solo paso 1 done, paso 2 es el siguiente", () => {
    const s = computeJourneySteps({});
    expect(s).toHaveLength(5);
    expect(s[0].done).toBe(true);            // Datos
    expect(s[1].done).toBe(false);           // Perfil
    expect(s[1].isNext).toBe(true);
    expect(s.filter((x) => x.isNext)).toHaveLength(1);
  });
  it("con perfil: pasos 1-2 done, cartola es el siguiente", () => {
    const s = computeJourneySteps({ perfil_riesgo: "moderado" });
    expect(s[1].done).toBe(true);
    expect(s[2].isNext).toBe(true);
  });
  it("con perfil + cartola: paso 4 (recomendación) es el siguiente", () => {
    const s = computeJourneySteps({ perfil_riesgo: "moderado", tiene_portfolio: true });
    expect(s[2].done).toBe(true);
    expect(s[3].isNext).toBe(true);
  });
  it("todo completo: ningún isNext, todos done", () => {
    const s = computeJourneySteps({ perfil_riesgo: "x", tiene_portfolio: true, tiene_cartera_recomendada: true });
    expect(s.every((x) => x.done)).toBe(true);
    expect(s.some((x) => x.isNext)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/journey/steps.test.ts`
Expected: FAIL (Cannot find module './steps').

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/journey/steps.ts
export interface JourneyClient {
  perfil_riesgo?: string | null;
  tiene_portfolio?: boolean | null;
  tiene_cartera_recomendada?: boolean | null;
}

export interface JourneyStep {
  key: "datos" | "perfil" | "cartola" | "recomendacion" | "comparar";
  label: string;
  done: boolean;
  isNext: boolean;
}

export function computeJourneySteps(c: JourneyClient): JourneyStep[] {
  const done = {
    datos: true,
    perfil: !!(c.perfil_riesgo && c.perfil_riesgo.trim()),
    cartola: !!c.tiene_portfolio,
    recomendacion: !!c.tiene_cartera_recomendada,
    comparar: !!c.tiene_cartera_recomendada,
  };
  const labels: Record<JourneyStep["key"], string> = {
    datos: "Datos del cliente",
    perfil: "Perfil de riesgo",
    cartola: "Subir cartola",
    recomendacion: "Recomendación",
    comparar: "Comparar ideal vs actual",
  };
  const order: JourneyStep["key"][] = ["datos", "perfil", "cartola", "recomendacion", "comparar"];
  const firstPending = order.find((k) => !done[k]);
  return order.map((k) => ({ key: k, label: labels[k], done: done[k], isNext: k === firstPending }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/journey/steps.test.ts`
Expected: PASS (4/4).

- [ ] **Step 5: Commit**

```bash
git add lib/journey/steps.ts lib/journey/steps.test.ts
git commit -m "feat(journey): computeJourneySteps (lógica pura de progreso del cliente)"
```

---

## Task 2: Flag `tiene_cartera_recomendada` en el GET del cliente

**Files:**
- Modify: `app/api/clients/[id]/route.ts`

**Interfaces:**
- Produces: el `client` que devuelve `successResponse({ client, ... })` (GET, ~línea 142) incluye un booleano `tiene_cartera_recomendada`.

Tarea de integración (leer el GET completo primero).

- [ ] **Step 1:** En el GET, el select principal del cliente (~línea 98) debe traer la columna `cartera_recomendada` (JSONB) — si no está, agregarla al select. NO cambiar otros campos.
- [ ] **Step 2:** Antes del `successResponse`, derivar el flag y adjuntarlo al objeto client:
```ts
const clientWithFlags = {
  ...client,
  tiene_cartera_recomendada: !!(client as { cartera_recomendada?: unknown }).cartera_recomendada,
};
```
y devolver `clientWithFlags` en vez de `client`. `perfil_riesgo` y `tiene_portfolio` ya vienen.
- [ ] **Step 3: Verificar.** `npx tsc --noEmit -p tsconfig.json` → 0 errores. Confirmar (lectura) que el GET sigue devolviendo todos los campos previos + el flag nuevo.
- [ ] **Step 4: Commit** `git commit -am "feat(journey): expone tiene_cartera_recomendada en el GET del cliente"`

---

## Task 3: `ClientJourneyChecklist` (componente)

**Files:**
- Create: `components/clients/ClientJourneyChecklist.tsx`, `components/clients/ClientJourneyChecklist.test.tsx`

**Interfaces:**
- Consumes: `computeJourneySteps` (Task 1), `Card`/`Button` (Fase 0).
- Produces: `export default function ClientJourneyChecklist({ client }: { client: JourneyClient & { id: string; email?: string } })`.

- [ ] **Step 1: Write the failing test**

```tsx
// components/clients/ClientJourneyChecklist.test.tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import ClientJourneyChecklist from "./ClientJourneyChecklist";

describe("ClientJourneyChecklist", () => {
  it("renderiza los 5 pasos y resalta el siguiente", () => {
    const html = renderToStaticMarkup(<ClientJourneyChecklist client={{ id: "c1", perfil_riesgo: "moderado" }} />);
    expect(html).toContain("Perfil de riesgo");
    expect(html).toContain("Subir cartola");
    expect(html).toContain("Recomendación");
    // el "siguiente" (cartola) lleva el CTA principal navy
    expect(html).toContain("bg-gb-black");
  });
  it("cliente completo muestra journey completo", () => {
    const html = renderToStaticMarkup(
      <ClientJourneyChecklist client={{ id: "c1", perfil_riesgo: "x", tiene_portfolio: true, tiene_cartera_recomendada: true }} />
    );
    expect(html).toContain("completo");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run components/clients/ClientJourneyChecklist.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Write minimal implementation**

```tsx
// components/clients/ClientJourneyChecklist.tsx
"use client";
import Link from "next/link";
import Card from "@/components/shared/Card";
import { computeJourneySteps, type JourneyClient } from "@/lib/journey/steps";

interface Props {
  client: JourneyClient & { id: string; email?: string | null };
}

// CTA por paso (href al MISMO cliente por id). El paso "perfil" ofrece dos accesos.
function ctaHref(key: string, client: Props["client"]): { href: string; label: string }[] {
  switch (key) {
    case "datos": return [{ href: `/clients/${client.id}`, label: "Editar" }];
    case "perfil": return [
      { href: `/analisis-cartola?client=${encodeURIComponent(client.email ?? "")}`, label: "Enviar cuestionario" },
      { href: `/clients/${client.id}#riesgo`, label: "Estimar a mano" },
    ];
    case "cartola": return [{ href: `/clients/${client.id}/seguimiento`, label: "Subir cartola" }];
    case "recomendacion": return [{ href: `/recomendacion/${client.id}`, label: "Generar propuesta" }];
    case "comparar": return [{ href: `/clients/${client.id}/seguimiento`, label: "Comparar ideal vs actual" }];
    default: return [];
  }
}

export default function ClientJourneyChecklist({ client }: Props) {
  const steps = computeJourneySteps(client);
  const doneCount = steps.filter((s) => s.done).length;
  const complete = doneCount === steps.length;

  return (
    <Card title={complete ? "Journey completo ✓" : "Journey del cliente"} className="mb-6"
      action={<span className="text-xs text-gb-gray tabular-nums">{doneCount} de {steps.length}</span>}>
      <ol className="flex flex-col gap-2">
        {steps.map((s, i) => {
          const ctas = ctaHref(s.key, client);
          return (
            <li key={s.key} className={`flex items-center gap-3 rounded-md border p-3 ${s.isNext ? "border-gb-primary bg-gb-primary-light/40" : "border-gb-border"}`}>
              <span className={`w-6 h-6 shrink-0 grid place-items-center rounded-full text-xs font-semibold ${s.done ? "bg-gb-success text-white" : "bg-background text-gb-gray border border-gb-border"}`}>
                {s.done ? "✓" : i + 1}
              </span>
              <span className={`flex-1 text-sm ${s.done ? "text-gb-gray line-through" : "text-gb-black font-medium"}`}>{s.label}</span>
              <span className="flex gap-2">
                {ctas.map((c, j) => (
                  <Link key={c.href} href={c.href}
                    className={`text-xs font-semibold rounded-[3px] px-3 py-1.5 transition-colors ${s.isNext && j === 0 ? "bg-gb-black text-white hover:bg-gb-dark" : "text-gb-info hover:bg-gb-light border border-gb-border"}`}>
                    {c.label}
                  </Link>
                ))}
              </span>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run components/clients/ClientJourneyChecklist.test.tsx`
Expected: PASS (2/2).

- [ ] **Step 5: Commit**

```bash
git add components/clients/ClientJourneyChecklist.tsx components/clients/ClientJourneyChecklist.test.tsx
git commit -m "feat(journey): componente ClientJourneyChecklist (5 pasos + CTAs)"
```

---

## Task 4: Montar el checklist en la ficha

**Files:**
- Modify: `components/clients/ClientDetail.tsx`

- [ ] **Step 1:** Importar `ClientJourneyChecklist`. Montarlo arriba del contenido de la ficha (antes de `ClientInfoCard`, ~línea 542), pasándole `client={client}` (el objeto ya tiene `id`, `email`, `perfil_riesgo`, `tiene_portfolio`, y ahora `tiene_cartera_recomendada` de la Task 2).
- [ ] **Step 2: Verificar.** `npx tsc --noEmit` → 0. Lectura: el checklist queda arriba, el resto de la ficha intacto (ClientInfoCard, riesgo, PatrimonioSection sin cambios).
- [ ] **Step 3: Commit** `git commit -am "feat(journey): monta el checklist en la ficha del cliente"`

---

## Task 5: Dashboard — reemplazar `FLOW_STEPS` decorativo

**Files:**
- Modify: `app/(advisor-shell)/advisor/page.tsx`

- [ ] **Step 1:** Eliminar el bloque decorativo "Flujo de Asesoría" (`FLOW_STEPS`, ~líneas 57-62 y su render ~436-459).
- [ ] **Step 2:** En su lugar, una `Card` "Clientes con journey incompleto" que liste (con `Button`/Link a `/clients/[id]`) los clientes que aún no completaron el journey, reusando `clientes_sin_cartola` que ya se calcula (~línea 207). Mostrar máx. ~5 con un "ver todos". Si no hay, un estado vacío suave ("Todos tus clientes están al día").
- [ ] **Step 3: Verificar.** `grep -nE "FLOW_STEPS"` en el archivo → vacío. `npx tsc --noEmit` → 0. `grep` de color fuera de marca → vacío (guard). Visual: el dashboard muestra la lista en vez de los círculos decorativos.
- [ ] **Step 4: Commit** `git commit -am "feat(journey): dashboard muestra clientes con journey incompleto (reemplaza FLOW_STEPS)"`

---

## Task 6: Alta — colapsar campos avanzados

**Files:**
- Modify: `app/(advisor-shell)/clients/new/page.tsx`

- [ ] **Step 1:** Reorganizar el form: **visibles siempre** nombre, apellido, email, teléfono. **Envolver en un `<details>` "Datos avanzados (opcional)"** (o un acordeón con `useState`) el resto: RUT, fecha de nacimiento, y toda la sección "Perfil de Riesgo (estimado)" (puntaje/tolerancia). NO eliminar ningún campo (el asesor estima el perfil a mano cuando el cliente no contesta).
- [ ] **Step 2:** No tocar `handleSubmit`/`validateForm`/`validateRut` ni los `name`/`value`/`onChange`/`required` de los inputs. Solo cambia qué está dentro del `<details>`.
- [ ] **Step 3: Verificar.** `npx tsc --noEmit` → 0. `grep` color fuera de marca → vacío. Estado del archivo: mismos `onChange`/`required`/`onSubmit` que antes (contar y comparar). Visual: alta muestra 4 campos + "Datos avanzados" plegado; crear un cliente funciona igual.
- [ ] **Step 4: Commit** `git commit -am "feat(alta): colapsa campos avanzados (RUT/fecha/riesgo) bajo Datos avanzados"`

---

## Task 7: Fondos — custodio sin default silencioso

**Files:**
- Modify: `app/(advisor-shell)/advisor/fondos/page.tsx`, `app/api/advisor/preferred-funds/route.ts`

- [ ] **Step 1 (API):** En el POST de `preferred-funds` (~línea 153, `custodian_type: custodian_type || "agf"`), cambiar a `custodian_type: custodian_type || null` — no forzar 'agf' cuando el asesor no eligió.
- [ ] **Step 2 (UI select):** El `<select>` de Custodio en la tabla (columna agregada en Fase demo) debe incluir una opción por defecto **`<option value="">— elegir custodio —</option>`** y, cuando `fund.custodian_type` es null/vacío, mostrar esa opción seleccionada. Al agregar un fondo nuevo NO se manda custodio (queda null → "pendiente").
- [ ] **Step 3 (UI marca "pendiente"):** Los fondos con `custodian_type` null/vacío se resaltan (ej. la celda de custodio con `border-gb-primary`/texto "pendiente" en copper acento) para que el asesor sepa que falta clasificarlos.
- [ ] **Step 4: Verificar.** `npx tsc --noEmit` → 0. `grep` color fuera de marca → vacío. Lectura: el POST ya no fuerza 'agf'; el select tiene la opción vacía; los pendientes se marcan.
- [ ] **Step 5: Commit** `git commit -am "feat(fondos): custodio sin default silencioso (marca pendiente en vez de 'agf')"`

---

## Task 8: Fondos — sugerir categoría desde la ficha CMF

**Files:**
- Create: `lib/fund-category-suggest.ts`, `lib/fund-category-suggest.test.ts`
- Modify: `app/(advisor-shell)/advisor/fondos/page.tsx`

**Interfaces:**
- Produces: `export function suggestFundCategory(familia: string | null | undefined, fundName: string): string | null` — devuelve una de las 18 `FUND_CATEGORIES` o null.

- [ ] **Step 1: Write the failing test**

```ts
// lib/fund-category-suggest.test.ts
import { describe, it, expect } from "vitest";
import { suggestFundCategory } from "./fund-category-suggest";

describe("suggestFundCategory", () => {
  it("RV + Chile/IPSA → Renta Variable Nacional", () => {
    expect(suggestFundCategory("Renta Variable", "ETF SINGULAR IPSA")).toBe("Renta Variable Nacional");
  });
  it("RV + S&P/USA → Renta Variable USA", () => {
    expect(suggestFundCategory("Renta Variable", "ETF SINGULAR S&P 500")).toBe("Renta Variable USA");
  });
  it("RV + Global/LATAM → Renta Variable Internacional", () => {
    expect(suggestFundCategory("Renta Variable", "FALCOM TACTICAL LATAM EQUITIES")).toBe("Renta Variable Internacional");
  });
  it("RF + Chile/Nacional → Renta Fija Nacional", () => {
    expect(suggestFundCategory("Renta Fija", "ETF SINGULAR CHILE CORPORATIVO")).toBe("Renta Fija Nacional");
  });
  it("RF + Global → Renta Fija Internacional", () => {
    expect(suggestFundCategory("Renta Fija", "GLOBAL CORPORATES")).toBe("Renta Fija Internacional");
  });
  it("Balanceado → Balanceado", () => {
    expect(suggestFundCategory("Balanceado", "ETF SINGULAR CORE 40/60")).toBe("Balanceado");
  });
  it("sin familia reconocible → null", () => {
    expect(suggestFundCategory("Otros", "algo raro")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/fund-category-suggest.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/fund-category-suggest.ts
import { stripAccents } from "@/lib/text";

const NACIONAL = /\b(chile|nacional|ipsa|chileno|clp|local)\b/;
const USA = /\b(usa|s&p|sp500|s p 500|nasdaq|estados unidos|ee\.?uu)\b/;
const INTL = /\b(global|internacional|latam|mundial|world|emergentes|emerging|europa|asia)\b/;

export function suggestFundCategory(familia: string | null | undefined, fundName: string): string | null {
  const fam = stripAccents((familia ?? "").toLowerCase());
  const name = stripAccents((fundName ?? "").toLowerCase());
  const geo = NACIONAL.test(name) ? "Nacional" : USA.test(name) ? "USA" : INTL.test(name) ? "Internacional" : null;
  if (fam.includes("balanceado")) return "Balanceado";
  if (fam.includes("renta variable") || fam.includes("accionario")) {
    if (geo === "Nacional") return "Renta Variable Nacional";
    if (geo === "USA") return "Renta Variable USA";
    if (geo === "Internacional") return "Renta Variable Internacional";
    return "Renta Variable Internacional"; // RV sin geo clara → Internacional (default razonable)
  }
  if (fam.includes("renta fija") || fam.includes("deuda")) {
    if (geo === "Nacional") return "Renta Fija Nacional";
    return "Renta Fija Internacional";
  }
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/fund-category-suggest.test.ts`
Expected: PASS (7/7).

- [ ] **Step 5: Wire into the page.** En `advisor/fondos/page.tsx`, al agregar un fondo (o al mostrar uno sin categoría), si su ficha/`familia_estudios` está disponible, pre-rellenar el `CategorySelect` con `suggestFundCategory(familia, fund_name)` como valor sugerido (el asesor confirma o cambia). NO auto-guardar sin que el asesor confirme si no quieres; alternativa: sugerir visualmente ("Sugerido: X") con un botón "usar". El GET de `preferred-funds` ya enriquece con ficha; usar esa `familia_estudios`/`objetivo` si viene, o `fund_name` como fallback.

- [ ] **Step 6: Verificar.** `npx vitest run lib/fund-category-suggest.test.ts` PASS; `npx tsc --noEmit` → 0; `grep` color fuera de marca en la página → vacío.

- [ ] **Step 7: Commit** `git commit -am "feat(fondos): sugiere categoría desde familia CMF + nombre del fondo"`

---

## Task 9: Fondos — filtros de búsqueda + info-box arriba

**Files:**
- Modify: `app/(advisor-shell)/advisor/fondos/page.tsx`

- [ ] **Step 1:** En el buscador de fondos, agregar chips de filtro **client-side** sobre `searchResults`: **Tipo (Todos / FM / FI)** (usando el campo `tipo` que ya trae cada resultado). No cambiar los endpoints `lookup`.
- [ ] **Step 2:** Mover el info-box "esto alimenta la IA / clasifica tus fondos" (hoy al fondo, ~548-554) a **arriba**, junto al botón/área de Agregar, para que el asesor entienda el "para qué".
- [ ] **Step 3: Verificar.** `npx tsc --noEmit` → 0. `grep` color fuera de marca → vacío. Visual: los chips filtran FM/FI; el info-box quedó arriba.
- [ ] **Step 4: Commit** `git commit -am "feat(fondos): filtros FM/FI en la búsqueda + info-box arriba"`

---

## Notas de ejecución

- Tasks 1, 8 (funciones puras) y 3 (componente con test) son transcripción + test → modelo económico-medio. Tasks 2, 4-7, 9 son integración (leer el archivo, aplicar sin romper) → modelo estándar (sonnet). NO usar haiku para implementers (lección Fase 0: se va del rail).
- Al terminar: `npm run test:run` (ignorar los ~5 fallos pre-existentes del worktree viejo `subproyecto-b-benchmark`, ajenos) y `npx tsc --noEmit` + `npm run lint`.
- Trabajar en rama `feat/journey-guiado` desde master; review final de rama (opus) antes de mergear.
- **Gotcha OneDrive:** el file-watcher de `next dev` puede no reflejar cambios; verificar en build/prod.
