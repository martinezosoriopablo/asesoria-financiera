# Landing Page v14 Redesign — Design Spec

## Goal

Replace the current landing page with a faithful translation of `global-concepto-v14.html` into React/Next.js components. The reference HTML is the single source of truth for layout, copy, colors, and interactions.

## Source of Truth

`~/Downloads/global-concepto-v14.html` — standalone HTML file with all CSS inline and a canvas-based animated globe.

## Architecture

Rewrite all existing `components/landing/*.tsx` files. No new npm dependencies. Reuse existing Tailwind tokens where they match v14 CSS vars; add missing ones.

### Color Mapping (v14 CSS vars → Tailwind tokens)

| v14 var | Value | Tailwind token | Status |
|---------|-------|---------------|--------|
| `--navy-900` | `#05162C` | `gl-deep` | exists |
| `--navy-800` | `#0A2140` | `gl-navy` | **add** |
| `--navy-700` | `#0F2D54` | `gl-panel` | **add** |
| `--line` | `rgba(255,255,255,.09)` | `gl-line` | exists (check value) |
| `--ink` | `#EEF3FA` | `gl-ink` | exists (currently dark, need `gl-ink-light` or use directly) |
| `--muted` | `#9DB0CA` | `gl-muted` | exists (check value) |
| `--azure` | `#5AA0E6` | `gl-azure` | exists |
| `--gold` | `#C99A5E` | `gl-gold` | **add** |
| `--gold-2` | `#E3B877` | `gl-gold2` | **add** |
| `--copper` | `#D0834C` | `gl-copper` | exists |
| `--up` | `#2ECC8F` | `gl-up` | exists |
| `--down` | `#EF5B5B` | `gl-down` | exists |
| `--t-bg` | `#060D18` | hardcode | terminal only |
| `--t-mut` | `#7E93AD` | hardcode | terminal only |

Note: The current codebase uses `gl-ink` as a dark text color for light backgrounds. v14 uses `--ink: #EEF3FA` as light text on dark backgrounds. The landing page is entirely dark-on-navy, so within landing components use the v14 ink value directly via a new `gl-ink-light` token or inline. Do NOT change the existing `gl-ink` token which is used across the advisor app.

### Sections (top to bottom, matching v14 exactly)

1. **Navbar** — Sticky, translucent navy (`rgba(5,22,44,.7)`) + backdrop blur. Left: SVG brand mark (G ring + copper bars) + divider + "GLOBAL / ADVISORS" text. Right: links (Servicios, Estudios, Proceso) + "Portal Clientes" outline button + "Acceso Asesores" azure solid button. Mobile: hide nav-links.

2. **Hero** — Two-column grid (1.05fr / 0.95fr). Left: gold eyebrow "Asesoría patrimonial integral · Fee-only", h1 "Más de 20 años de *experiencia* a tu servicio" (Fraunces serif, italic azure on "experiencia"), lead text, trust line (CMF + banks), two CTA buttons (azure solid + outline). Right: animated canvas globe (dotted wireframe sphere, auto-rotating) with radial glow behind. Mobile: globe above text, smaller.

3. **Diferenciadores** — Section "Por qué Global" / "Cuatro razones que nos hacen distintos". 4-column bordered grid (1px border lines between cells). Each pillar: copper Fraunces number (01-04), bold title, muted description. Content: Fee-only, Depto estudios con IA, Acceso institucional, Asesoría 360. Responsive: 2-col on tablet, 1-col on mobile.

4. **Servicios** — Section "Servicios" / "Cuatro frentes, una sola estrategia". 2×2 bordered grid. Each card: copper number + SVG G mark + "GLOBAL Wealth/Planning/Properties/Insurance" in bold+light weight. Description below. Hover: bg changes to navy-800. Responsive: 1-col on mobile.

5. **Departamento de Estudios (IA)** — Gradient bg (navy-800 → navy-900). Section "Departamento de estudios" / "Un departamento de estudios propio, potenciado con IA" + subtitle. 2×2 bordered grid with 4 capabilities (each: icon + gold-2 title + muted description):
   - "Analizamos todos los mercados"
   - "Revisamos todas las noticias"
   - "Analizamos cada instrumento"
   - "Monitoreamos lo que mueve el mercado"

   Below: gestoras quote, italic Fraunces quote about IA/escala/criterio, 3 stats (Diario, Multi-agente, +cientos).

6. **Proceso** — bg navy-800. Section "Nuestro proceso de inversión" / "Cuatro etapas que estructuran cada decisión" + subtitle. 4 cards with:
   - Image area (aspect-ratio 4/3) with gradient overlay — use placeholder gradient backgrounds since we don't have the photos
   - Copper number badge (circle, top-left)
   - Title + description below
   - Hover: translateY(-5px) + gold border

   Steps: Diagnóstico, Estrategia, Ejecución, Monitoreo. Responsive: 2-col tablet, 1-col mobile.

7. **Portal** — Section "Tu portal" / "Tu patrimonio, siempre a la vista". Terminal-style mockup (dark bg, dots bar, two-panel grid: left chart + right data tiles). Chart drawn on canvas (simple area chart). Tiles: Rentabilidad, USD, Instrumentos, Frecuencia. Note below: "Vista ilustrativa...". Responsive: single-column panels on mobile.

8. **Footer** — Border-top line. Left: SVG brand mark. Right: compliance disclaimer. Compact single row.

### Interactive Elements

- **Globe canvas**: Port the v14 JavaScript directly into a React `useEffect` + `useRef` pattern. Draws dots on a sphere using fibonacci distribution, projects to 2D, auto-rotates. ~50 lines of logic.
- **Portal chart canvas**: Small area chart drawn with canvas. Static data, simple gradient fill.
- **Scroll reveal**: IntersectionObserver adding `.in` class — reuse existing `useScrollReveal` hook.
- **Hover effects**: Service cards bg transition, process cards translateY + border color.

### SVG Brand Mark

The G mark SVG is defined inline in v14:
```svg
<svg viewBox="0 0 100 100">
  <path d="M72 28 A33 33 0 1 0 80 56 L56 56" fill="none" stroke="currentColor" stroke-width="8"/>
  <rect x="40" y="52" width="6" height="22" rx="1" fill="#D0834C"/>
  <rect x="50" y="44" width="6" height="30" rx="1" fill="#D0834C"/>
  <rect x="60" y="37" width="6" height="37" rx="1" fill="#D0834C"/>
</svg>
```
Extract as a reusable `GBrandMark` component. Used in navbar, each service card, and footer.

### Component Mapping

| v14 Section | Component File | New/Rewrite |
|-------------|---------------|-------------|
| Navbar | `Navbar.tsx` | Rewrite |
| Hero + Globe | `Hero.tsx` + `Globe.tsx` | Rewrite + New |
| Diferenciadores | `Differentiators.tsx` | Rewrite |
| Servicios | `ServiceCards.tsx` | Rewrite |
| Depto IA | `IASection.tsx` | New |
| Proceso | `HowItWorks.tsx` | Rewrite |
| Portal | `PortalPreview.tsx` | New |
| Footer | `Footer.tsx` | Rewrite |
| Brand mark | `GBrandMark.tsx` | New |
| — | `GlobalLogo.tsx` | Delete (replaced by GBrandMark + text) |
| — | `Eyebrow.tsx` | Delete (eyebrow is just a styled span, no separate component needed) |
| — | `StatsBar.tsx` | Delete (stats are inside IA section) |
| — | `CTASection.tsx` | Delete (no separate CTA section in v14) |

### Page Assembly (`app/(public)/page.tsx`)

```tsx
<Navbar />
<Hero />        {/* includes Globe */}
<Differentiators />
<ServiceCards />
<IASection />
<HowItWorks />
<PortalPreview />
<Footer />
```

### Fonts

Already loaded in the project: Fraunces (`--font-display`), Hanken Grotesk (`--font-body`), IBM Plex Mono (`--font-data`). No changes needed.

### Responsive Breakpoints (from v14)

- `≤980px`: pillars and IA grid → 2-col, process cards → 2-col
- `≤880px`: hero → single column (globe on top), nav-links hidden, service grid → 1-col, portal panels → 1-col
- `≤620px`: pillars, IA grid, process cards → 1-col

### What NOT to change

- Existing Tailwind tokens used by the advisor app (`gl-ink`, `gl-paper`, etc.)
- Any files outside `components/landing/` and `app/(public)/page.tsx` and `app/globals.css`
- The `app/page.tsx` re-export pattern
- The `useScrollReveal` hook

### Copy

All text taken verbatim from v14 HTML. Includes proper Spanish accents (á, é, í, ó, ú, ñ) as in the reference.
