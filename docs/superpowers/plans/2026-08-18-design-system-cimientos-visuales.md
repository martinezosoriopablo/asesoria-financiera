# Cimientos Visuales (v2.0 · Fase 0) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Crear 5 primitivos de UI compartidos + una regla de paleta sobria (con guard de ESLint) y aplicarlos a las 4 páginas más fuera de marca, para que el CRM se vea sobrio, consistente y alineado con el sitio de marketing.

**Architecture:** Componentes presentacionales en `components/shared/` que componen los tokens existentes `--gb-*` / clases Tailwind del proyecto. Cero tokens nuevos, cero hex hardcodeado. Las 4 páginas se migran a estos primitivos sin cambios funcionales. Un guard de ESLint (scoped a lo migrado) impide reintroducir colores crudos.

**Tech Stack:** Next.js 16 (App Router) · React 19 · Tailwind v4 (tokens `--gb-*` en `app/globals.css`) · Vitest + jsdom (tests con `renderToStaticMarkup` de `react-dom/server`, sin `@testing-library/react`) · ESLint flat config (`eslint.config.mjs`).

## Global Constraints

- **Solo tokens del proyecto** (`text-gb-black`, `border-gb-border`, `bg-background`, `bg-gb-black`, `text-gb-info`, `font-serif`, etc.). **Prohibido hex hardcodeado** y clases de color crudas (`bg-blue-50`, `bg-gradient-*`, `text-teal-600`, badges multicolor).
- **Botón primario = navy** (`bg-gb-black`), NUNCA copper. **Copper solo acento** (eyebrows, reglas, cifra clave). Esquinas sobrias (`rounded-[3px]` botones/inputs, `rounded-md` tarjetas). Eyebrows `tracking-[0.22em] uppercase text-gb-primary`.
- **Verde/rojo (`gb-success`/`gb-danger`) SOLO variaciones de mercado.**
- **Cero cambios funcionales** en las páginas migradas: cada botón/acción/flujo hace exactamente lo mismo.
- **Fuentes:** `font-serif` = Source Serif 4 (ya cargada vía `--font-serif`).
- Tests con `import { renderToStaticMarkup } from "react-dom/server"` — assert que el HTML renderizado contiene la clase esperada según props. No agregar dependencias.
- Cada componente: TypeScript estricto, `React.forwardRef` donde aplica (Input, Button), `className` passthrough.

---

## File Structure

**Crear:**
- `components/shared/Button.tsx`
- `components/shared/Card.tsx`
- `components/shared/PageContainer.tsx`
- `components/shared/PageHeader.tsx`
- `components/shared/Input.tsx`
- `components/shared/Button.test.tsx`, `Card.test.tsx`, `PageLayout.test.tsx` (PageContainer+PageHeader), `Input.test.tsx`

**Modificar (migración):**
- `app/(advisor-shell)/advisor/page.tsx`
- `app/(advisor-shell)/clients/new/page.tsx`
- `app/(advisor-shell)/analisis-cartola/page.tsx`
- `components/portfolio/ComparisonModeV2.tsx`
- `eslint.config.mjs`

---

## Task 1: Button

**Files:**
- Create: `components/shared/Button.tsx`
- Test: `components/shared/Button.test.tsx`

**Interfaces:**
- Produces: `export default function Button` — `ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> { variant?: "primary" | "secondary" | "ghost"; }`. Consumido por PageHeader (actions) y las migraciones.

- [ ] **Step 1: Write the failing test**

```tsx
// components/shared/Button.test.tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import Button from "./Button";

describe("Button", () => {
  it("primary usa navy (bg-gb-black), nunca copper", () => {
    const html = renderToStaticMarkup(<Button>Guardar</Button>);
    expect(html).toContain("bg-gb-black");
    expect(html).not.toContain("gb-primary");
    expect(html).toContain("Guardar");
  });
  it("secondary usa azure (text-gb-info) con borde", () => {
    const html = renderToStaticMarkup(<Button variant="secondary">X</Button>);
    expect(html).toContain("text-gb-info");
    expect(html).toContain("border-gb-border");
  });
  it("pasa className y props nativos", () => {
    const html = renderToStaticMarkup(<Button className="mt-4" disabled>X</Button>);
    expect(html).toContain("mt-4");
    expect(html).toContain("disabled");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run components/shared/Button.test.tsx`
Expected: FAIL (Cannot find module './Button').

- [ ] **Step 3: Write minimal implementation**

```tsx
// components/shared/Button.tsx
import React from "react";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost";
}

const VARIANTS: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary: "bg-gb-black text-white hover:bg-gb-dark border border-transparent",
  secondary: "bg-transparent text-gb-info border border-gb-border hover:bg-gb-light",
  ghost: "bg-transparent text-gb-gray border border-transparent hover:bg-gb-light",
};

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", className = "", children, ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      className={`inline-flex items-center justify-center gap-2 rounded-[3px] px-5 py-2.5 text-sm font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${VARIANTS[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
});

export default Button;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run components/shared/Button.test.tsx`
Expected: PASS (3/3).

- [ ] **Step 5: Commit**

```bash
git add components/shared/Button.tsx components/shared/Button.test.tsx
git commit -m "feat(ui): Button primitivo (primary navy, secondary azure, ghost)"
```

---

## Task 2: Card

**Files:**
- Create: `components/shared/Card.tsx`
- Test: `components/shared/Card.test.tsx`

**Interfaces:**
- Produces: `export default function Card` — `CardProps { children; highlight?: boolean; title?: string; action?: React.ReactNode; className?: string; }`.

- [ ] **Step 1: Write the failing test**

```tsx
// components/shared/Card.test.tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import Card from "./Card";

describe("Card", () => {
  it("default: fondo blanco, borde, esquina sobria", () => {
    const html = renderToStaticMarkup(<Card>contenido</Card>);
    expect(html).toContain("bg-white");
    expect(html).toContain("border-gb-border");
    expect(html).toContain("rounded-md");
    expect(html).toContain("contenido");
  });
  it("highlight: fondo navy", () => {
    const html = renderToStaticMarkup(<Card highlight>x</Card>);
    expect(html).toContain("bg-gb-black");
  });
  it("con title renderiza header serif", () => {
    const html = renderToStaticMarkup(<Card title="Rebalanceo">x</Card>);
    expect(html).toContain("font-serif");
    expect(html).toContain("Rebalanceo");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run components/shared/Card.test.tsx`
Expected: FAIL (Cannot find module './Card').

- [ ] **Step 3: Write minimal implementation**

```tsx
// components/shared/Card.tsx
import React from "react";

interface CardProps {
  children: React.ReactNode;
  highlight?: boolean;
  title?: string;
  action?: React.ReactNode;
  className?: string;
}

export default function Card({ children, highlight = false, title, action, className = "" }: CardProps) {
  const surface = highlight
    ? "bg-gb-black text-white border-gb-black"
    : "bg-white text-gb-black border-gb-border";
  return (
    <div className={`rounded-md border p-5 ${surface} ${className}`}>
      {title && (
        <div className="flex items-center justify-between mb-4">
          <h3 className={`font-serif text-base ${highlight ? "text-white" : "text-gb-black"}`}>{title}</h3>
          {action}
        </div>
      )}
      {children}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run components/shared/Card.test.tsx`
Expected: PASS (3/3).

- [ ] **Step 5: Commit**

```bash
git add components/shared/Card.tsx components/shared/Card.test.tsx
git commit -m "feat(ui): Card primitivo (variante única + highlight navy)"
```

---

## Task 3: PageContainer + PageHeader

**Files:**
- Create: `components/shared/PageContainer.tsx`, `components/shared/PageHeader.tsx`
- Test: `components/shared/PageLayout.test.tsx`

**Interfaces:**
- Produces: `PageContainer({ children, wide?, className? })` y `PageHeader({ title, eyebrow?, subtitle?, actions?, className? })`.

- [ ] **Step 1: Write the failing test**

```tsx
// components/shared/PageLayout.test.tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import PageContainer from "./PageContainer";
import PageHeader from "./PageHeader";

describe("PageContainer", () => {
  it("default max-w-6xl con padding estándar", () => {
    const html = renderToStaticMarkup(<PageContainer>x</PageContainer>);
    expect(html).toContain("max-w-6xl");
    expect(html).toContain("px-5");
    expect(html).toContain("py-8");
  });
  it("wide → max-w-7xl", () => {
    const html = renderToStaticMarkup(<PageContainer wide>x</PageContainer>);
    expect(html).toContain("max-w-7xl");
  });
});

describe("PageHeader", () => {
  it("título serif navy + eyebrow copper con tracking amplio", () => {
    const html = renderToStaticMarkup(<PageHeader title="Seguimiento" eyebrow="Cliente" />);
    expect(html).toContain("font-serif");
    expect(html).toContain("Seguimiento");
    expect(html).toContain("Cliente");
    expect(html).toContain("text-gb-primary");
    expect(html).toContain("tracking-[0.22em]");
  });
  it("renderiza actions", () => {
    const html = renderToStaticMarkup(<PageHeader title="X" actions={<button>Ir</button>} />);
    expect(html).toContain("Ir");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run components/shared/PageLayout.test.tsx`
Expected: FAIL (Cannot find module './PageContainer').

- [ ] **Step 3: Write minimal implementation**

```tsx
// components/shared/PageContainer.tsx
import React from "react";

interface PageContainerProps {
  children: React.ReactNode;
  wide?: boolean;
  className?: string;
}

export default function PageContainer({ children, wide = false, className = "" }: PageContainerProps) {
  return (
    <div className={`mx-auto w-full px-5 py-8 ${wide ? "max-w-7xl" : "max-w-6xl"} ${className}`}>
      {children}
    </div>
  );
}
```

```tsx
// components/shared/PageHeader.tsx
import React from "react";

interface PageHeaderProps {
  title: string;
  eyebrow?: string;
  subtitle?: string;
  actions?: React.ReactNode;
  className?: string;
}

export default function PageHeader({ title, eyebrow, subtitle, actions, className = "" }: PageHeaderProps) {
  return (
    <div className={`flex items-end justify-between gap-4 flex-wrap mb-6 ${className}`}>
      <div>
        {eyebrow && (
          <div className="text-xs font-semibold tracking-[0.22em] uppercase text-gb-primary">{eyebrow}</div>
        )}
        <h1 className="font-serif text-2xl font-semibold text-gb-black mt-1">{title}</h1>
        {subtitle && <p className="text-sm text-gb-gray mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run components/shared/PageLayout.test.tsx`
Expected: PASS (4/4).

- [ ] **Step 5: Commit**

```bash
git add components/shared/PageContainer.tsx components/shared/PageHeader.tsx components/shared/PageLayout.test.tsx
git commit -m "feat(ui): PageContainer + PageHeader primitivos"
```

---

## Task 4: Input

**Files:**
- Create: `components/shared/Input.tsx`
- Test: `components/shared/Input.test.tsx`

**Interfaces:**
- Produces: `Input` (forwardRef) — `InputProps extends React.InputHTMLAttributes<HTMLInputElement> { label?: string; hint?: string; }`.

- [ ] **Step 1: Write the failing test**

```tsx
// components/shared/Input.test.tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import Input from "./Input";

describe("Input", () => {
  it("borde de marca + focus copper (nunca ring azul crudo)", () => {
    const html = renderToStaticMarkup(<Input placeholder="Email" />);
    expect(html).toContain("border-gb-border");
    expect(html).toContain("focus:border-gb-primary");
    expect(html).not.toContain("focus:ring-blue");
  });
  it("renderiza label y hint", () => {
    const html = renderToStaticMarkup(<Input label="Nombre" hint="Requerido" />);
    expect(html).toContain("Nombre");
    expect(html).toContain("Requerido");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run components/shared/Input.test.tsx`
Expected: FAIL (Cannot find module './Input').

- [ ] **Step 3: Write minimal implementation**

```tsx
// components/shared/Input.tsx
import React from "react";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, className = "", id, ...rest },
  ref
) {
  return (
    <div>
      {label && <label htmlFor={id} className="block text-xs font-medium text-gb-dark mb-1.5">{label}</label>}
      <input
        ref={ref}
        id={id}
        className={`w-full border border-gb-border rounded-[3px] px-3 py-2.5 text-sm text-gb-black bg-white placeholder:text-gb-gray/60 focus:border-gb-primary focus:outline-none focus:ring-1 focus:ring-gb-primary/30 transition-colors disabled:opacity-60 ${className}`}
        {...rest}
      />
      {hint && <p className="text-xs text-gb-gray mt-1">{hint}</p>}
    </div>
  );
});

export default Input;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run components/shared/Input.test.tsx`
Expected: PASS (2/2).

- [ ] **Step 5: Commit**

```bash
git add components/shared/Input.tsx components/shared/Input.test.tsx
git commit -m "feat(ui): Input primitivo (borde de marca + focus copper)"
```

---

## Task 5: Migrar dashboard (`advisor/page.tsx`)

**Files:**
- Modify: `app/(advisor-shell)/advisor/page.tsx`

**Interfaces:**
- Consumes: `PageContainer`, `PageHeader`, `Card`, `Button` de `@/components/shared/*`.

Tarea de integración (leer el archivo completo primero). Cambios, SIN tocar lógica ni handlers:

- [ ] **Step 1:** Envolver el contenido en `<PageContainer>` (reemplaza el wrapper `max-w-6xl mx-auto px-5 py-8`).
- [ ] **Step 2:** Reemplazar el título suelto por `<PageHeader title=... eyebrow=... actions=... />`.
- [ ] **Step 3:** Tarjetas de stat → `<Card>`; la tarjeta de AUM → `<Card highlight>`.
- [ ] **Step 4:** Badges de reunión de 4 colores (`bg-blue-100`/`bg-emerald-100`/`bg-amber-100`/`bg-purple-100`, ~líneas 99-103) → un chip neutro `bg-background text-gb-gray border border-gb-border` + icono. Botón "Recordatorio" `bg-amber-500` (~299) → `<Button variant="secondary">`.
- [ ] **Step 5:** El bloque decorativo "Flujo de Asesoría" (`FLOW_STEPS`, ~57-62 y ~436-459) **se deja igual** (se rehace en Fase 1).
- [ ] **Step 6: Verificar.** Run: `grep -nE "bg-(blue|emerald|amber|purple|teal|indigo|sky|violet|slate|green|red)-(50|100|200|300|400|500|600)|bg-gradient" "app/(advisor-shell)/advisor/page.tsx"` → Expected: **sin resultados** (salvo `gb-success`/`gb-danger` de mercado, que no matchean). `npx tsc --noEmit -p tsconfig.json` → 0 errores. Verificación visual: dashboard carga, se ve sobrio, todos los botones/links funcionan igual.
- [ ] **Step 7: Commit** `git commit -am "refactor(ui): dashboard usa primitivos + paleta sobria"`

---

## Task 6: Migrar `clients/new/page.tsx`

**Files:**
- Modify: `app/(advisor-shell)/clients/new/page.tsx`

Tarea de integración. SIN cambiar campos ni validaciones (la simplificación de campos es de la Fase 1).

- [ ] **Step 1:** Envolver en `<PageContainer>` (reemplaza `max-w-4xl mx-auto px-4 sm:px-6 lg:px-8`).
- [ ] **Step 2:** Header → `<PageHeader>`.
- [ ] **Step 3:** Cada `<input>` con `border-slate-300` / `focus:ring-blue-500` (líneas ~262, 276, 290, 303, 319, 335, 360, 376, 402, 414, 443, 464) → `<Input>` (o, si el input está muy acoplado al form, aplicar las clases estándar: `border-gb-border ... focus:border-gb-primary`). Mantener `value`/`onChange`/`required` idénticos.
- [ ] **Step 4:** Botón submit → `<Button>`. Contenedores de sección con borde/tarjeta → `<Card>` donde aplique.
- [ ] **Step 5: Verificar.** Run: `grep -nE "border-slate-300|focus:ring-blue|bg-(blue|emerald|amber|purple|teal|indigo|sky|violet|slate|green|red)-(50|100|200|300|400|500|600)|bg-gradient" "app/(advisor-shell)/clients/new/page.tsx"` → sin resultados. `npx tsc --noEmit` → 0. Visual: el form crea un cliente igual que antes (probar submit).
- [ ] **Step 6: Commit** `git commit -am "refactor(ui): clients/new usa primitivos (inputs de marca)"`

---

## Task 7: Migrar `analisis-cartola/page.tsx`

**Files:**
- Modify: `app/(advisor-shell)/analisis-cartola/page.tsx`

Tarea de integración.

- [ ] **Step 1:** `<PageContainer>` + `<PageHeader>`.
- [ ] **Step 2:** Badges/paneles multicolor → neutros/chips estándar: `bg-indigo-50` (~422), `bg-blue-50` (~433), `bg-indigo-50` (~441), `bg-teal-50` (~490), `bg-emerald-50` (~647), badges de clase de activo `indigo/purple/teal` (~719-722) → chip neutro `bg-background text-gb-gray border border-gb-border`.
- [ ] **Step 3:** CTA `bg-teal-600` (~797) → `<Button>` (navy). El botón "Copiar link" existente → `<Button variant="secondary">`. "Enviar Cuestionario" → `<Button>`.
- [ ] **Step 4: Verificar.** Run: `grep -nE "bg-(blue|emerald|amber|purple|teal|indigo|sky|violet|slate|green|red)-(50|100|200|300|400|500|600)|bg-gradient" "app/(advisor-shell)/analisis-cartola/page.tsx"` → sin resultados. `npx tsc --noEmit` → 0. Visual: la pantalla funciona igual (copiar link, enviar cuestionario, ver perfil).
- [ ] **Step 5: Commit** `git commit -am "refactor(ui): analisis-cartola usa primitivos + paleta sobria"`

---

## Task 8: Migrar `ComparisonModeV2.tsx`

**Files:**
- Modify: `components/portfolio/ComparisonModeV2.tsx`

Tarea de integración (la de mayor densidad de color: 25 `bg-*-50/100` + 6 gradientes).

- [ ] **Step 1:** CTA `bg-gradient-to-r from-purple-600 to-blue-600 ... shadow-lg` (~1260) → `<Button>` (navy).
- [ ] **Step 2:** Header `bg-gradient-to-r from-green-50 to-emerald-50` (~1274) y tiles `bg-blue-50`/`bg-purple-50` (~1511-1517) → `<Card>` / fondos neutros.
- [ ] **Step 3:** Verdes/azules/púrpuras de UI (`bg-green-50/100 text-green-700`, ~1295-1497) → neutros. **Conservar verde/rojo SOLO donde marca rentabilidad** (usar `text-gb-success`/`text-gb-danger`).
- [ ] **Step 4: Verificar.** Run: `grep -nE "bg-(blue|emerald|amber|purple|teal|indigo|sky|violet|slate|green|red)-(50|100|200|300|400|500|600)|bg-gradient" components/portfolio/ComparisonModeV2.tsx` → sin resultados (verde/rojo de mercado ahora vía tokens `gb-*`, no matchean). `npx tsc --noEmit` → 0. Visual: la comparación se ve/comporta igual.
- [ ] **Step 5: Commit** `git commit -am "refactor(ui): ComparisonModeV2 sobrio (sin gradientes ni color crudo)"`

---

## Task 9: Guard de ESLint

**Files:**
- Modify: `eslint.config.mjs`

**Interfaces:**
- Consumes: los 4 archivos migrados + `components/shared/**` ya limpios.

- [ ] **Step 1: Escribir el override en `eslint.config.mjs`.** Agregar un bloque al final del array `defineConfig` que aplique una regla `no-restricted-syntax` SOLO a los archivos ya migrados y a `components/shared/**`, prohibiendo las clases de color crudas y gradientes:

```js
// Guard de paleta sobria — SOLO sobre lo migrado en la Fase 0 (se amplía el glob en fases siguientes).
{
  files: [
    "components/shared/**/*.tsx",
    "app/(advisor-shell)/advisor/page.tsx",
    "app/(advisor-shell)/clients/new/page.tsx",
    "app/(advisor-shell)/analisis-cartola/page.tsx",
    "components/portfolio/ComparisonModeV2.tsx",
  ],
  rules: {
    "no-restricted-syntax": [
      "error",
      {
        selector:
          "Literal[value=/\\\\b(bg|text|border|from|to|via)-(blue|indigo|purple|teal|emerald|sky|violet|slate|amber|green|red)-(50|100|200|300|400|500|600|700|800|900)\\\\b/]",
        message:
          "Color crudo fuera de marca. Usa tokens gb-* (navy domina, copper acento, azure acciones, gb-success/gb-danger solo mercado).",
      },
      {
        selector: "Literal[value=/bg-gradient-/]",
        message: "Sin gradientes en el shell del asesor. Usa navy sólido o neutros.",
      },
    ],
  },
},
```

Nota: los tests (`*.test.tsx`) de `components/shared/` afirman AUSENCIA de esas clases pero podrían contener el string en un `.not.toContain("focus:ring-blue")` → excluir los tests del glob si el lint marca falso positivo (agregar `"!components/shared/**/*.test.tsx"` o ajustar el selector para que solo aplique a `JSXAttribute[name.name="className"]`). Preferir acotar el selector a className si hay ruido.

- [ ] **Step 2: Verificar que el lint pasa sobre lo migrado.**

Run: `npm run lint`
Expected: PASS — sin errores del guard (las 4 páginas + shared ya están limpias tras Tasks 5-8). Si marca algún residuo, corregir ese color en la página correspondiente hasta que pase.

- [ ] **Step 3: Verificar que el guard efectivamente atrapa.** Insertar temporalmente `<div className="bg-blue-50" />` en `components/shared/Card.tsx`, correr `npm run lint`, confirmar que **falla** con el mensaje del guard, luego revertir.

- [ ] **Step 4: Commit** `git commit -am "chore(lint): guard de paleta sobria sobre lo migrado (Fase 0)"`

---

## Notas de ejecución

- Tasks 1-4 (primitivos) son transcripción + test → modelo económico. Tasks 5-8 (migraciones) son integración (leer la página, aplicar, no romper funcionalidad) → modelo estándar. Task 9 (ESLint) es cuidadosa por el selector regex → modelo estándar.
- Al terminar, correr la suite completa (`npm run test:run`) y `npx tsc --noEmit` una vez más antes del review de rama.
- **Gotcha OneDrive:** el file-watcher de `next dev` puede no reflejar cambios; verificar en build/prod, no confiar solo en localhost.
