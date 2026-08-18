# Cimientos visuales (v2.0 · Fase 0) — Design

**Fecha:** 2026-08-18
**Rama sugerida:** `feat/design-system-fase0`
**Estado:** Diseño aprobado (mockup + dirección visual). Pendiente review del spec → plan de implementación.

## Contexto y visión

La plataforma (CRM del asesor) funciona (v1.0) pero cada página inventó su propio ancho, padding, estilo de tarjeta y — en los peores casos — su propia paleta (azul/emerald/slate/púrpura genéricos). La auditoría encontró: **11 wrappers de página distintos**, sin componente `Card`/`PageHeader` compartido, **~106 fondos `bg-{color}-50/100`**, **14 gradientes** y **137 hex hardcodeados** en el route group `app/(advisor-shell)/`.

**Objetivo de la Fase 0:** crear un **design system mínimo** (4 primitivos + una regla de paleta) y aplicarlo a las 4 páginas más fuera de marca, para que el CRM se vea **sobrio, consistente y como continuación del sitio de marketing** (no como otra app).

**Alineación con el sitio de marketing (`public/*.html`):** el sitio ya usa los MISMOS tokens y fuentes que el CRM (navy `#0B2140`, copper `#EB7838`, paper `#F7F6F2`, line `#E7E4DD`, Source Serif 4 + Inter + JetBrains Mono). Lo que faltaba es alinear la **gramática de componentes**. Del sitio se adopta:
- **Botón primario = navy sólido** (NO copper). Esquinas sobrias (radius ~3px).
- **Copper = acento puro**: eyebrows, reglas/líneas, la cifra clave. Nunca un fill de botón ni gradiente.
- **Eyebrows** en copper, MAYÚSCULAS, `letter-spacing` amplio (~.22em).
- **Tarjetas** con esquinas sobrias (radius ~6px), borde `--gb-border`, sin sombras pesadas.
- **Montserrat** reservado para la marca/wordmark (no para UI/body).

**Restricción transversal (de todo v2.0):** los asesores NO son especialistas → **simple pero completo**. Los primitivos deben ser triviales de usar.

## Alcance (esta Fase)

**Incluye:**
1. Crear **5 primitivos** en `components/shared/`: `PageContainer`, `PageHeader`, `Card`, `Button`, `Input`.
2. Documentar la **regla de paleta** (operativa) + una **regla de ESLint** que la sostenga (incluida en esta fase).
3. **Migrar 4 páginas** a los primitivos + paleta: `advisor/page.tsx` (dashboard), `clients/new/page.tsx`, `analisis-cartola/page.tsx`, `components/portfolio/ComparisonModeV2.tsx` (portfolio-designer).

**NO incluye (fases/pasadas posteriores):**
- Las otras ~11 páginas del shell (se migran incrementalmente después, página por página, con los mismos primitivos).
- `calculadora-apv` — se elimina/reabsorbe en la Fase 3 (Patrimonio); rebrandearla ahora sería trabajo botado.
- Cualquier cambio funcional (esta fase es 100% cosmética/estructural).
- Portal del cliente (`app/(portal)/`).
- Dark mode del CRM (el shell del asesor es light-only por diseño; los primitivos usan los tokens light `--gb-*`).

## Los 5 primitivos

Todos en `components/shared/`, client components solo si necesitan interacción (Button no la necesita; son presentacionales). Usan los tokens `--gb-*` / clases Tailwind del proyecto — **cero hex hardcodeado**.

### 1. `PageContainer` (`components/shared/PageContainer.tsx`)

Único wrapper de contenido de página. Reemplaza los 11 wrappers ad-hoc.

```tsx
interface PageContainerProps {
  children: React.ReactNode;
  wide?: boolean;          // true → tablas anchas (max-w-7xl); default max-w-6xl
  className?: string;
}
```
Render: `<div className={`mx-auto w-full px-5 py-8 ${wide ? "max-w-7xl" : "max-w-6xl"} ${className ?? ""}`}>{children}</div>`

- El fondo (`bg-background`) y `min-h-screen` los provee el layout del route group; `PageContainer` solo centra y da padding consistentes.
- Un solo padding vertical (`py-8`) y horizontal (`px-5`) para TODAS las páginas.

### 2. `PageHeader` (`components/shared/PageHeader.tsx`)

Encabezado de página unificado.

```tsx
interface PageHeaderProps {
  title: string;
  eyebrow?: string;        // ej. "Cliente · Heraldo Álvarez" — copper, uppercase
  subtitle?: string;
  actions?: React.ReactNode;   // slot derecho (botones)
  className?: string;
}
```
Estructura:
- Contenedor `flex items-end justify-between gap-4 flex-wrap mb-6`.
- Izquierda: si `eyebrow` → `<div className="text-xs font-semibold tracking-[0.22em] uppercase text-gb-primary">`. Título `<h1 className="font-serif text-2xl font-semibold text-gb-black mt-1">` (usa el token `--font-serif`). `subtitle` → `<p className="text-sm text-gb-gray mt-0.5">`.
- Derecha: `{actions}` (típicamente 1 `Button` primario + opcional secundario).

Notas:
- `font-serif` = Source Serif 4 (ya cargado en `app/layout.tsx` / `--font-serif`).
- `tracking-[0.22em]` para el eyebrow (gramática del sitio).

### 3. `Card` (`components/shared/Card.tsx`)

Única variante de tarjeta. Prohíbe `shadow-2xl`/`border-2`/gradientes.

```tsx
interface CardProps {
  children: React.ReactNode;
  highlight?: boolean;     // true → fondo navy (tarjeta hero, ej. patrimonio total)
  title?: string;          // si viene, renderiza header serif + slot action
  action?: React.ReactNode;
  className?: string;
}
```
Estructura:
- Base: `<div className="rounded-md border p-5 {highlight ? "bg-gb-black text-white border-gb-black" : "bg-white border-gb-border"}">`.
- Si `title`: header `<div className="flex items-center justify-between mb-4"><h3 className="font-serif text-base text-gb-black">{title}</h3>{action}</div>` (en highlight, el título va `text-white`).
- `rounded-md` ≈ 6px (esquina sobria).

### 4. `Button` (`components/shared/Button.tsx`)

Botón consistente. Primario = navy (gramática del sitio); copper NO es botón.

```tsx
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost";   // default "primary"
  children: React.ReactNode;
}
```
Estilos (radius ~3px = `rounded-[3px]`, `text-sm font-semibold px-5 py-2.5`, `disabled:opacity-40 transition-colors`):
- `primary`: `bg-gb-black text-white hover:bg-gb-dark` (navy sólido).
- `secondary`: `bg-transparent text-gb-info border border-gb-border hover:bg-gb-light` (azure).
- `ghost`: `bg-transparent text-gb-gray hover:bg-gb-light`.

Nota: NO se toca el token global `--gb-primary` (sigue siendo copper para otros usos como el focus outline); el botón primario usa `--gb-black` (navy) explícitamente.

### 5. `Input` (`components/shared/Input.tsx`)

Campo de formulario consistente. Reemplaza los inputs ad-hoc con `border-slate-300`/`focus:ring-blue-500` (que chocan con el outline copper global).

```tsx
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
}
```
Estructura (usa `forwardRef` para compatibilidad con formularios):
- Opcional `label`: `<label className="block text-xs font-medium text-gb-dark mb-1.5">`.
- Input: `w-full border border-gb-border rounded-[3px] px-3 py-2.5 text-sm text-gb-black bg-white placeholder:text-gb-gray/60 focus:border-gb-primary focus:outline-none focus:ring-1 focus:ring-gb-primary/30 transition-colors disabled:opacity-60`.
- Opcional `hint`: `<p className="text-xs text-gb-gray mt-1">`.
- Focus en copper (`--gb-primary`), consistente con el outline global del proyecto (elimina el `focus:ring-blue-500` fuera de marca).

## Regla de paleta (operativa)

Documentar en un comentario de cabecera compartido y aplicar en la migración:
- **Navy (`gb-black`/`gb-sidebar`) domina**: títulos, tarjeta destacada, íconos principales, chrome.
- **Copper (`gb-primary`) SOLO acento**: eyebrows, reglas/líneas (`.rule` de 3px), la cifra clave. Nunca fills grandes ni gradientes ni botones.
- **Azure (`gb-info`) para acciones secundarias / datos / links** y líneas de gráfico de serie única.
- **Verde/rojo (`gb-success`/`gb-danger`) SOLO variaciones de mercado** (rentabilidad ±). Nunca para "éxito de UI" ni fondos de sección.
- **Neutros (`gb-gray`, `gb-border`, `gb-light`/`background`)** para todo lo demás: chips, badges, fondos de sección → gris/off-white en vez de `bg-blue-50`/`bg-teal-50`/etc.
- **Chips de clase de activo** (RV/RF/ALT/Caja): chip neutro `bg-background text-gb-gray border border-gb-border` (no 4 colores).

### Guard de ESLint (incluido)
Regla que prohíba clases de color crudas fuera de marca en el shell del asesor. Implementación pragmática con `eslint` + una regla `no-restricted-syntax` sobre `Literal`/`JSXAttribute` (o el plugin de Tailwind si ya está) que matchee `bg-(blue|indigo|purple|teal|emerald|sky|violet|slate|amber|green|red)-(50|100|200|300|400|500|600|700|800|900)` y `bg-gradient-`, con `message` explicando la regla de paleta.
- **Scope:** `app/(advisor-shell)/**` y `components/**`.
- **Excepción:** archivos de gráficos (`**/*Chart*.tsx`, `components/**/charts/**`) — las paletas categóricas de datos están permitidas (CLAUDE.md).
- Verde/rojo de mercado se usan vía los tokens `gb-success`/`gb-danger`, no vía `green-*/red-*` crudos.
- **Rollout del guard:** se agrega al config de ESLint pero, para no romper el lint del código aún-no-migrado, se activa con `overrides` SOLO sobre los archivos ya migrados en esta fase (las 4 páginas + `components/shared/**`). En fases siguientes se amplía el glob a medida que se migran más páginas. Así el guard sostiene lo migrado sin bloquear el resto.

## Migración de las 4 páginas

Para cada página: (1) envolver el contenido en `PageContainer` (con `wide` si es tabla ancha), (2) reemplazar el encabezado ad-hoc por `PageHeader`, (3) reemplazar tarjetas ad-hoc por `Card`, (4) reemplazar botones por `Button`, (5) sustituir clases de color fuera de marca por neutros/tokens según la regla. **Sin cambios funcionales.**

1. **`app/(advisor-shell)/advisor/page.tsx` (dashboard):** wrapper `max-w-6xl px-5 py-8` → `PageContainer`. Título suelto → `PageHeader`. Tarjetas de stat → `Card` (la de AUM → `Card highlight`). Badges de reunión de 4 colores (`bg-blue-100/emerald-100/amber-100/purple-100`, líneas ~99-103) → chip neutro + icono. Botón "Recordatorio" `bg-amber-500` (~299) → `Button variant="secondary"`. El bloque decorativo "Flujo de Asesoría" (`FLOW_STEPS`, ~57-62 y ~436-459) se deja como está en esta fase (se rehace en la Fase 1 · Journey guiado).
2. **`app/(advisor-shell)/clients/new/page.tsx`:** wrapper `max-w-4xl` → `PageContainer`. `border-slate-300`→`border-gb-border`, `focus:ring-blue-500`→ focus copper/azure del proyecto (o `Input` con el estilo estándar) en todos los inputs (líneas 262-464). Botón submit → `Button`. (La simplificación/colapso de campos avanzados es de la Fase 1, no de esta.)
3. **`app/(advisor-shell)/analisis-cartola/page.tsx`:** wrapper → `PageContainer`. Header → `PageHeader`. Badges/paneles multicolor (`bg-indigo-50` ~422, `bg-blue-50` ~433, `bg-teal-50` ~490, `bg-emerald-50` ~647, badges de clase ~719-722) → neutros/chips estándar. CTA `bg-teal-600` (~797) → `Button primary` (navy). El botón "Copiar link" ya existe (Fase demo) → normalizar a `Button variant="secondary"`.
4. **`components/portfolio/ComparisonModeV2.tsx` (portfolio-designer):** CTA `bg-gradient-to-r from-purple-600 to-blue-600` (~1260) → `Button primary`. Header `bg-gradient-to-r from-green-50 to-emerald-50` (~1274) → `Card`/neutro. Verdes/azules/púrpuras de UI (`bg-green-50/100`, `bg-blue-50`, `bg-purple-50`, ~1295-1517) → neutros; conservar verde/rojo SOLO donde marca rentabilidad. Stat tiles → `Card`.

## Reuso (no reimplementar)

- Tokens `--gb-*` de `app/globals.css` y las clases Tailwind del proyecto (`text-gb-black`, `border-gb-border`, `bg-background`, `font-serif`, etc.).
- Fuentes ya cargadas (`--font-serif` Source Serif 4, `--font-sans` Inter) en `app/layout.tsx`.
- No se crean tokens nuevos; los primitivos son composición de los existentes.

## Testing

- **Componentes:** son presentacionales; un test de render mínimo por primitivo (que renderice children, que `highlight`/`variant`/`wide` apliquen la clase esperada) con la suite existente (Vitest). No hay lógica pura nueva relevante salvo la selección de clases.
- **Migración:** verificación manual/visual — cada una de las 4 páginas debe: cargar sin errores, verse consistente con el mockup (navy domina, 1 CTA navy, cobre solo acento, chips neutros), y **no perder ninguna funcionalidad** (los botones/acciones siguen haciendo lo mismo).
- `tsc` sin errores nuevos; suite sin regresiones.

## Criterios de éxito

1. Existen `PageContainer`, `PageHeader`, `Card`, `Button`, `Input` en `components/shared/`, usando solo tokens del proyecto.
2. Las 4 páginas usan los primitivos; **no queda ninguna clase de color fuera de marca** (`bg-blue-50`, gradientes, `bg-teal-600`, badges multicolor) en ellas.
3. El look de las 4 páginas es sobrio y consistente con el mockup aprobado y con el sitio de marketing (botón navy, esquinas sobrias, cobre acento, eyebrows con tracking amplio).
4. Cero cambios funcionales: cada acción/botón/flujo hace exactamente lo mismo que antes.
5. `tsc` limpio; suite sin regresiones.
6. El guard de ESLint está activo sobre `components/shared/**` + las 4 páginas migradas y corre sin falsos positivos; `npm run lint` pasa.
