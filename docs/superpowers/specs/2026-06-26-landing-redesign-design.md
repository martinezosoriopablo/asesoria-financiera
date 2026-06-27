# Landing Page Redesign — Global Wealth

**Date:** 2026-06-26
**Status:** Approved
**Inspired by:** arrayanasset.com (editorial dark theme, numbered sections, 4-step process)
**Constraint:** Keep Global's existing color palette + add copper accent from new logo

---

## Summary

Redesign the Global Wealth landing page with an editorial dark/light rhythm, stronger messaging (asesoría 360), real stats backed by StoneX/Allfunds infrastructure, and the new Global Wealth logo (horizontal, with copper accent). Target audience: high-net-worth professionals (doctors, lawyers) who know nothing about finance.

## Color Palette

### Existing tokens (keep as-is in globals.css)
- `gl-ink` (#0B2C5E) — navy, primary text on light
- `gl-deep` (#07203F) — dark backgrounds
- `gl-azure` (#2E86E0) — interactive elements, CTAs, buttons
- `gl-sky` (#6FB2EF) — light accent
- `gl-paper` (#FBFCFE) — page background
- `gl-mist` (#EEF3FA) — light section background
- `gl-line` (#DCE7F4) — borders
- `gl-muted` (#5B6B82) — secondary text

### New token
- `gl-copper` (~#C4873A or similar from logo) — decorative accent: section numbers (01-04), stat numbers, separator lines, process step indicators. NOT for interactive elements (buttons stay azure).

Extract the exact copper hex from the global1.jpeg logo.

## New Logo

**File:** `global1.jpeg` (currently in Downloads, copy to `public/` as optimized assets)
- **Horizontal layout**: Icon (G with bar chart inside circle) + "GLOBAL" bold + "WEALTH" light/copper
- **Two variants needed:**
  - Dark variant (black icon + text, copper "WEALTH") — for light backgrounds
  - Light variant (white icon + text, copper "WEALTH") — for dark backgrounds
- Replace the current SVG logo (`GlobalLogo.tsx`) with the new logo
- Ideally convert to SVG for crispness; if not feasible, use high-res PNG with appropriate sizing

## Page Structure

Visual rhythm: Dark → Dark → Light → Dark → Light → Dark → Dark

### 1. Navbar
- **Background:** Transparent on hero, transitions to gl-paper on scroll
- **Logo:** New Global 1 horizontal, light variant while over hero, dark variant after scroll
- **Nav links:** Servicios, Nosotros, Proceso (anchor links)
- **CTA buttons:** "Portal Clientes" (ghost) + "Asesores" (azure filled)
- **No structural changes** from current, just logo swap

### 2. Hero (dark)
- **Background:** gl-deep with mesh gradient (keep current radial gradients)
- **Subtle grid pattern:** Keep current
- **Content (left-aligned, max-w-3xl):**
  - Logo: New Global 1, light variant, small (like current)
  - Eyebrow: "Asesoría patrimonial integral" (replaces "Asesoría de inversiones independiente")
  - Headline: "Más de 25 años de *experiencia* a tu servicio" (*experiencia* in gl-sky italic, same as current)
  - Subtitle: "Inversiones, planificación tributaria, seguros y propiedades. Un equipo senior que te acompaña en cada decisión patrimonial."
  - Institutional line (new, smaller, gl-sky/40): "Equipo con trayectoria en Itaú, Corpbanca, BanChile, Santander Investment y AFP Capital"
  - Two CTAs: "Conoce nuestros servicios" (white solid, rounded-full) + "Agenda una reunión" (white border, rounded-full)
- **Bottom accent:** Azure gradient line (keep current)

### 3. Stats Bar (NEW section)
- **Background:** gl-ink solid (darker than hero for contrast)
- **Layout:** 4 stats in a horizontal row, centered, with vertical separators (gl-copper/20)
- **Compact height:** py-12 to py-16, not a full section
- **Stats:**

| Number | Label |
|--------|-------|
| +20 años | de experiencia en mercados financieros |
| +USD 60MM | en patrimonio asesorado |
| +200,000 | instrumentos disponibles |
| +40 mercados | acceso global sin restricciones |

- **Number styling:** Large (text-3xl to text-4xl), gl-copper color, font-data
- **Label styling:** Small (text-sm), white/60%
- **Mobile:** 2x2 grid

### 4. Servicios (light)
- **Background:** white
- **Eyebrow:** "Nuestros servicios"
- **Title:** "Cuatro áreas de *especialidad*" (*especialidad* in gl-azure italic)
- **Layout:** 2x2 grid. Each block:
  - Large number in gl-copper (01, 02, 03, 04) — text-5xl or text-6xl, font-data, positioned left
  - Title to the right of number, bold
  - Copper line (w-8, h-[2px]) below title
  - Description text below line, gl-muted
  - No icons — typography-driven editorial design
- **Content:**

**01 — Global Wealth**
Asesoría de inversiones independiente, local e internacional. Portafolios personalizados según tu perfil y objetivos.

**02 — Global Planning**
Planificación tributaria y patrimonial. Sociedades de inversión, optimización fiscal, sucesión y estructuración.

**03 — Global Properties**
Inversión inmobiliaria. Asesoría en compra, venta y gestión de activos inmobiliarios.

**04 — Global Insurance**
Seguros internacionales con compañías de primer nivel. Vida, salud y protección patrimonial.

- **Mobile:** Single column stack
- **Hover:** Subtle shadow + copper line scales in

### 5. Diferenciadores (dark)
- **Background:** gl-deep
- **Eyebrow:** "Por qué Global"
- **Title:** "Lo que nos *diferencia*" (*diferencia* in gl-sky italic)
- **Layout:** 3 columns on desktop, 1 on mobile
- **Each block:**
  - Small copper accent element (line or dot)
  - Title in white, bold
  - Copper separator line (w-8) below title
  - Description in white/60%
- **Content:**

**Siempre alineados a tus intereses**
No representamos a ninguna gestora ni institución. Nuestras recomendaciones responden solo a tus objetivos.

**Asesoría 360**
Desde tu portafolio hasta la estructura societaria. Inversiones, planificación tributaria, seguros y propiedades en un solo lugar.

**Acceso global**
Más de 200,000 instrumentos en +40 mercados. Infraestructura institucional para darte acceso al mundo.

### 6. Proceso (light)
- **Background:** gl-mist
- **Eyebrow:** "Proceso"
- **Title:** "Cómo trabajamos"
- **Layout:** 4 steps in horizontal line with copper connector line between them
- **Each step:**
  - Circle with copper border (not filled navy like current), number inside in gl-copper
  - Title below circle
  - Short description below title, gl-muted
- **Steps:**

01 Diagnóstico — Entendemos tu situación financiera, perfil de riesgo y objetivos.
02 Estrategia — Diseñamos un plan personalizado que integra inversiones, planificación y protección.
03 Ejecución — Tú ejecutas en tu custodia. Nosotros te guiamos en cada paso.
04 Monitoreo — Seguimiento continuo con reportes, rebalanceo y ajustes.

- **Connector line:** Horizontal, gl-copper/30, between circles
- **Mobile:** Vertical stack with vertical connector line

### 7. CTA Section (dark)
- **Background:** gl-deep with mesh gradient (similar to hero)
- **Title:** "Conversemos sobre tu patrimonio"
- **Subtitle:** "Agenda una reunión sin compromiso con nuestro equipo."
- **Two CTAs:** "Agenda una reunión" (white solid) + "Conoce más" (white border)
- **Keep current mesh gradient style**

### 8. Footer (dark)
- **Background:** gl-ink
- **Logo:** New Global 1, light/copper variant
- **4 columns:** Servicios (links to 4 services), Contacto (email, phone), Legal (terms, privacy), brand tagline
- **CMF disclaimer:** Bottom, small text
- **No structural changes** from current, just logo swap

## Animations

- **Keep** current `useScrollReveal` IntersectionObserver hook (respects reduced-motion)
- **Stats bar:** Numbers count up on scroll reveal (optional, nice-to-have)
- **Service blocks:** Staggered fade-in on scroll (delay per block)
- **Process steps:** Sequential reveal left-to-right on scroll

## Files to Modify

| File | Change |
|------|--------|
| `app/globals.css` | Add `gl-copper` token |
| `components/landing/GlobalLogo.tsx` | Replace SVG with new logo (or new component) |
| `components/landing/Navbar.tsx` | Use new logo, adjust variant logic |
| `components/landing/Hero.tsx` | New eyebrow, subtitle, institutional line |
| `components/landing/ServiceCards.tsx` | Complete rewrite — numbered editorial blocks |
| `components/landing/Differentiators.tsx` | Rewrite — dark bg, new content, copper accents |
| `components/landing/HowItWorks.tsx` | Rewrite — 4 steps, copper circles, new content |
| `components/landing/CTASection.tsx` | New title/subtitle copy |
| `components/landing/Footer.tsx` | New logo |
| `components/landing/Eyebrow.tsx` | Maybe adjust color for dark sections (white variant) |
| `components/landing/StatsBar.tsx` | **NEW** component |
| `app/(public)/page.tsx` | Add StatsBar between Hero and ServiceCards |
| `public/` | Add new logo assets (global1-dark.svg, global1-light.svg or PNG equivalents) |

## Out of Scope

- Contact form / booking integration (future)
- Blog / content section
- Team photos (not available)
- Animations beyond scroll-reveal (no parallax, no video)
- SEO/meta tags changes (separate task)
- Portal or advisor app changes
