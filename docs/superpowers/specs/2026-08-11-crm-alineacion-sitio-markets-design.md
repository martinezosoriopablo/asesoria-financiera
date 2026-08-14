# CRM del asesor — alineación visual con el sitio (Global Markets)

**Fecha:** 2026-08-11
**Alcance:** Chrome + tokens (no se remaqueta pantalla por pantalla)
**Rama sugerida:** `feat/crm-alineacion-sitio-markets`

## Objetivo

Hacer que el CRM del asesor "converse" visualmente con el sitio de marketing
(los 6 HTML estáticos en `public/`), y dejar claro que el CRM es la división
**Global Markets** (research IA + CRM para asesores). La paleta base ya coincide
a nivel de tokens (paper `#F7F6F2`, navy `#0B2140`, copper `#EB7838`); la brecha
real es tipográfica, de logo y de detalle visual.

## Contexto / estado actual

- **Fuentes app:** Fraunces (serif) / Hanken Grotesk (sans) / IBM Plex Mono. Se
  cargan globalmente en `app/layout.tsx` (`<link>` Google Fonts) y se declaran
  como tokens en `app/globals.css` (`@theme inline` + `body`).
- **Fuentes sitio:** Source Serif 4 (serif) / Inter (sans) / Montserrat (wordmark)
  / JetBrains Mono. Paleta idéntica a la del app.
- **Logo sidebar hoy:** `components/shared/AdvisorSidebar.tsx` usa
  `GlobalLogo variant="light"` (G de Global Companies) + un `<span>` "GLOBAL".
- **Asset Markets:** `public/media/global-markets-blanco.svg` (y `.png`). Es un
  **lockup completo blanco**: ícono G con barras cobre + texto "GLOBAL MARKETS"
  como paths. `viewBox` ~ `453.77 × 36` → ratio ~12.6:1. Trae el wordmark
  incrustado (no se necesita texto Montserrat aparte).
- El **portal de cliente** (`app/(portal)/`) y las pantallas de login heredan las
  fuentes del root layout: el cambio de fuentes los afecta también (deseable por
  consistencia). El sitio de marketing es HTML estático con fuentes inline: NO se
  ve afectado.

## Decisiones tomadas (brainstorming)

1. **Alcance:** Chrome + tokens. Se propaga a toda la app sin re-maquetar cada
   página. No se tocan Dashboard/Clientes/Seguimiento individualmente.
2. **Tipografía:** adoptar las del sitio (remapeo 1:1 por rol).
3. **Logo:** lockup Global Markets + wordmark (reemplaza el G de Companies +
   texto "GLOBAL"), solo en el sidebar del asesor.

## Cambios

### 1. Tipografía — remapeo 1:1 (global)

**`app/layout.tsx`** — reemplazar el `<link href="...Fraunces...Hanken+Grotesk...IBM+Plex+Mono...">`
por uno que cargue las familias del sitio:

```
family=Source+Serif+4:wght@300;400;500;600;700
family=Inter:wght@400;500;600;700
family=JetBrains+Mono:wght@400;500
```

(No se incluye Montserrat: el wordmark viene del SVG.)

**`app/globals.css`** — en `@theme inline` y en `body`:

| Token | Antes | Después |
|---|---|---|
| `--font-serif` | `'Fraunces', Georgia, serif` | `'Source Serif 4', Georgia, serif` |
| `--font-sans` | `'Hanken Grotesk', system-ui, …` | `'Inter', system-ui, -apple-system, sans-serif` |
| `--font-mono` | `'IBM Plex Mono', Consolas, monospace` | `'JetBrains Mono', Consolas, monospace` |

`body { font-family }` pasa a `'Inter', system-ui, -apple-system, sans-serif`.

Por ser remapeo por *rol*, cualquier `font-serif`/`font-sans`/`font-mono`
existente adopta automáticamente la fuente del sitio.

### 2. Logo Global Markets (`components/shared/AdvisorSidebar.tsx`)

- **Expandido (`!collapsed`):** reemplazar `GlobalLogo` + `<span>GLOBAL</span>`
  por el lockup `/media/global-markets-blanco.svg` con `next/image` (o `<img>`),
  altura ~`h-4` (≈16px), `w-auto`, `alt="Global Markets"`. Cabe en el sidebar
  expandido (`w-60` = 240px, ~200px útiles). Sigue envuelto en el `Link` a
  `/advisor`.
- **Colapsado (`collapsed`, `w-16` = 64px):** el lockup no cabe → mantener solo
  el ícono `GlobalLogo variant="light"` (barras cobre, común a toda la marca).
- No cambia la lógica del `NotificationBell` ni el resto del sidebar.

### 3. Detalle "sitio" — helpers en `app/globals.css` (opt-in, no forzado)

Agregar utilidades reutilizables que reflejan el lenguaje del sitio, disponibles
para adoptar donde convenga (no se aplican masivamente):

- `.eyebrow` → `font-size:13px; letter-spacing:.24em; text-transform:uppercase;
  color:var(--gb-primary); font-weight:600;`
- `.h-display` → `font-family:var(--font-serif); font-weight:400;
  letter-spacing:-.01em; color:var(--gb-black);`

No se modifica `rounded-lg` de forma masiva ni se remaquetan páginas.

## Fuera de alcance (YAGNI)

- Re-maquetar Dashboard, Clientes, detalle de cliente, Seguimiento, etc.
- Cambiar radios/espaciados globalmente (`rounded-lg` → 2px masivo).
- Tocar el logo del portal de cliente o de las pantallas de login.
- Incluir Montserrat (el wordmark viene del SVG).

## Verificación

- `npm run build` sin errores.
- Levantar `npm run dev` (reiniciar por el file-watcher de OneDrive) y revisar:
  - Sidebar expandido muestra el lockup "Global Markets" blanco, legible.
  - Sidebar colapsado muestra solo el ícono G.
  - Body en Inter, headings `font-serif` en Source Serif 4, datos `font-mono`
    en JetBrains Mono (revisar 2–3 pantallas: Dashboard, un detalle de cliente).
  - Portal de cliente y login heredan las fuentes sin romperse.
- Riesgo principal: pantallas que dependan del ancho de glifo de Fraunces/Hanken
  (poco probable). Ajuste puntual si aparece algún desborde.
