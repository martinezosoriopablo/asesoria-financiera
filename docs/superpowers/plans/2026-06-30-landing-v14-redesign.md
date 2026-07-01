# Landing Page v14 Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current landing page with a faithful translation of `global-concepto-v14.html` (in `~/Downloads/`) into React/Next.js components — all-dark-navy aesthetic with animated globe, bordered grids, IA department section, and portal mockup.

**Architecture:** Rewrite all `components/landing/*.tsx` files. Add new components for Globe canvas, GBrandMark SVG, IA section, and Portal preview. Extract globe point data from the reference HTML into a static JSON file. No new npm dependencies.

**Tech Stack:** Next.js App Router, React 19, Tailwind CSS v4, HTML Canvas API

**Reference file:** `C:/Users/marti/Downloads/global-concepto-v14.html` — the single source of truth for all copy, colors, layout, and interactions.

## Global Constraints

- Do NOT modify existing `gl-ink`, `gl-paper`, or other tokens used by the advisor app — add new landing-specific tokens
- All copy must match v14 verbatim, including Spanish accents (á, é, í, ó, ú, ñ)
- All font families via existing CSS vars: `--font-display` (Fraunces), `--font-body` (Hanken Grotesk), `--font-data` (IBM Plex Mono)
- No new npm dependencies
- Keep `useScrollReveal` hook unchanged
- Files to modify are ONLY in `components/landing/`, `app/(public)/page.tsx`, and `app/globals.css`
- Colors from v14: navy-900 `#05162C`, navy-800 `#0A2140`, navy-700 `#0F2D54`, ink `#EEF3FA`, muted `#9DB0CA`, azure `#5AA0E6`, gold `#C99A5E`, gold-2 `#E3B877`, copper `#D0834C`, line `rgba(255,255,255,.09)`
- The body background for the landing is navy-900 (`#05162C`), NOT the current `gl-paper`
- Process cards use gradient placeholder backgrounds (no real photos available)
- Mobile breakpoints: ≤980px (grids→2col), ≤880px (hero→1col, nav-links hidden, services→1col), ≤620px (all grids→1col)

---

### Task 1: Color Tokens + GBrandMark + Delete Unused Components

**Files:**
- Modify: `app/globals.css:3-34` (add landing tokens in `:root`)
- Modify: `app/globals.css:36-67` (add tokens to `@theme inline`)
- Create: `components/landing/GBrandMark.tsx`
- Delete: `components/landing/GlobalLogo.tsx`
- Delete: `components/landing/Eyebrow.tsx`
- Delete: `components/landing/StatsBar.tsx`
- Delete: `components/landing/CTASection.tsx`

**Produces:**
- New Tailwind tokens: `gl-navy`, `gl-panel`, `gl-gold`, `gl-gold2`, `gl-ink-light`, `gl-muted-light`
- Updated `gl-deep` to match v14 navy-900 (`#05162C`), `gl-copper` to v14 copper (`#D0834C`)
- `GBrandMark` component: `({ className?: string }) => JSX.Element` — the G ring + copper bars SVG

- [ ] **Step 1: Update globals.css — add/update landing tokens in `:root`**

In `app/globals.css`, update and add variables in `:root` (lines 23-34). Keep all `--gb-*` vars unchanged. Update the `--gl-*` section to:

```css
  /* Global Landing brand */
  --gl-ink:    #0B2C5E;      /* dark text — advisor app uses this, keep */
  --gl-ink-light: #EEF3FA;   /* light text on dark bg — landing */
  --gl-deep:   #05162C;      /* navy-900 */
  --gl-navy:   #0A2140;      /* navy-800 */
  --gl-panel:  #0F2D54;      /* navy-700 */
  --gl-ring:   #14467E;
  --gl-azure:  #5AA0E6;
  --gl-sky:    #6FB2EF;
  --gl-paper:  #FBFCFE;
  --gl-mist:   #EEF3FA;
  --gl-line:   rgba(255,255,255,0.09);
  --gl-muted:  #5B6B82;      /* muted for light bg — advisor app */
  --gl-muted-light: #9DB0CA; /* muted for dark bg — landing */
  --gl-copper: #D0834C;
  --gl-gold:   #C99A5E;
  --gl-gold2:  #E3B877;
```

- [ ] **Step 2: Update globals.css — add tokens to @theme inline block**

In the `@theme inline` block, add after the existing `--color-gl-copper` line:

```css
  --color-gl-navy: var(--gl-navy);
  --color-gl-panel: var(--gl-panel);
  --color-gl-gold: var(--gl-gold);
  --color-gl-gold2: var(--gl-gold2);
  --color-gl-ink-light: var(--gl-ink-light);
  --color-gl-muted-light: var(--gl-muted-light);
```

Also update `--color-gl-line` to use the new rgba value:
```css
  --color-gl-line: var(--gl-line);
```

- [ ] **Step 3: Create GBrandMark.tsx**

```tsx
interface GBrandMarkProps {
  className?: string;
}

export default function GBrandMark({ className = "w-9 h-9" }: GBrandMarkProps) {
  return (
    <svg className={className} viewBox="0 0 100 100">
      <path
        d="M72 28 A33 33 0 1 0 80 56 L56 56"
        fill="none"
        stroke="currentColor"
        strokeWidth="8"
      />
      <rect x="40" y="52" width="6" height="22" rx="1" fill="#D0834C" />
      <rect x="50" y="44" width="6" height="30" rx="1" fill="#D0834C" />
      <rect x="60" y="37" width="6" height="37" rx="1" fill="#D0834C" />
    </svg>
  );
}
```

- [ ] **Step 4: Delete unused components**

```bash
rm components/landing/GlobalLogo.tsx components/landing/Eyebrow.tsx components/landing/StatsBar.tsx components/landing/CTASection.tsx
```

- [ ] **Step 5: Commit**

```bash
git add app/globals.css components/landing/GBrandMark.tsx
git add -u components/landing/GlobalLogo.tsx components/landing/Eyebrow.tsx components/landing/StatsBar.tsx components/landing/CTASection.tsx
git commit -m "feat(landing): v14 tokens, GBrandMark SVG, remove unused components"
```

---

### Task 2: Globe Canvas Component + Data Extraction

**Files:**
- Create: `components/landing/globe-data.json` (extracted from v14 HTML)
- Create: `components/landing/Globe.tsx`

**Produces:**
- `Globe` component: `() => JSX.Element` — animated canvas with continent dots and stock exchange labels, auto-rotating

- [ ] **Step 1: Extract globe data from v14 HTML**

Read `C:/Users/marti/Downloads/global-concepto-v14.html` and extract the `PTS` array (continent point data: `[x, y, z, isLand]` tuples) and the `EX` array (stock exchange markers: `{n, p, home}` objects). Write them to a JSON file:

```bash
node -e "
const fs = require('fs');
const html = fs.readFileSync('C:/Users/marti/Downloads/global-concepto-v14.html','utf8');
const ptsMatch = html.match(/const PTS=(\[[\s\S]*?\]);/);
const exMatch = html.match(/const EX=(\[[\s\S]*?\]);/);
const data = { PTS: JSON.parse(ptsMatch[1]), EX: JSON.parse(exMatch[1]) };
fs.writeFileSync('components/landing/globe-data.json', JSON.stringify(data));
"
```

- [ ] **Step 2: Create Globe.tsx**

```tsx
"use client";

import { useEffect, useRef } from "react";
import globeData from "./globe-data.json";

const PTS = globeData.PTS as number[][];
const EX = globeData.EX as { n: string; p: number[]; home?: boolean }[];
const TILT = -0.32;

function rot(p: number[], a: number): [number, number, number] {
  const [x, y, z] = p;
  const y1 = y * Math.cos(TILT) - z * Math.sin(TILT);
  const z1 = y * Math.sin(TILT) + z * Math.cos(TILT);
  const x2 = x * Math.cos(a) + z1 * Math.sin(a);
  const z2 = -x * Math.sin(a) + z1 * Math.cos(a);
  return [x2, y1, z2];
}

export default function Globe() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cvs = canvasRef.current;
    if (!cvs) return;
    const ctx = cvs.getContext("2d");
    if (!ctx) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let W: number, H: number, cx: number, cy: number, R: number;
    let ang = 2.0;
    let rafId: number;

    function size() {
      const r = cvs!.getBoundingClientRect();
      W = r.width; H = r.height; cx = W / 2; cy = H / 2;
      R = Math.min(W, H) * 0.44;
      cvs!.width = W * dpr; cvs!.height = H * dpr;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function frame() {
      ctx!.clearRect(0, 0, W, H);

      for (let k = 0; k < PTS.length; k++) {
        const p = PTS[k];
        const rr = rot(p, ang);
        if (rr[2] < -0.04) continue;
        const sx = cx - rr[0] * R;
        const sy = cy - rr[1] * R;
        const d = (rr[2] + 1) / 2;
        ctx!.beginPath();
        ctx!.arc(sx, sy, p[3] ? 0.7 + d * 1.5 : 0.6 + d * 0.7, 0, 6.283);
        ctx!.fillStyle = p[3]
          ? `rgba(208,131,76,${(0.25 + d * 0.7).toFixed(2)})`
          : `rgba(95,150,205,${(0.05 + d * 0.13).toFixed(2)})`;
        ctx!.fill();
      }

      ctx!.font = '600 12px "Hanken Grotesk",sans-serif';
      ctx!.textBaseline = "middle";
      const vis: { e: typeof EX[0]; sx: number; sy: number; d: number }[] = [];
      for (const e of EX) {
        if (e.n === "Nasdaq") continue;
        const rr = rot(e.p, ang);
        if (rr[2] < -0.02) continue;
        vis.push({ e, sx: cx - rr[0] * R, sy: cy - rr[1] * R, d: (rr[2] + 1) / 2 });
      }
      vis.sort((a, b) => b.d - a.d);

      const placed: { x: number; y: number; w: number; h: number }[] = [];
      for (const v of vis) {
        const col = v.e.home ? "#E3B877" : "#7ab4ee";
        ctx!.beginPath(); ctx!.arc(v.sx, v.sy, v.e.home ? 4 : 3, 0, 6.283);
        ctx!.fillStyle = col; ctx!.fill();
        ctx!.beginPath(); ctx!.arc(v.sx, v.sy, 7, 0, 6.283);
        ctx!.strokeStyle = col + "99"; ctx!.lineWidth = 1; ctx!.stroke();
        if (v.d > 0.5) {
          const a = Math.min(1, (v.d - 0.5) / 0.2);
          const tw = ctx!.measureText(v.e.n).width;
          const lx = v.sx + 11, ly = v.sy;
          const rc = { x: lx - 3, y: ly - 9, w: tw + 6, h: 18 };
          const ov = placed.some(
            (p) => !(rc.x > p.x + p.w || rc.x + rc.w < p.x || rc.y > p.y + p.h || rc.y + rc.h < p.y)
          );
          if (!ov) {
            ctx!.fillStyle = (v.e.home ? "rgba(227,184,119," : "rgba(225,232,244,") + a.toFixed(2) + ")";
            ctx!.fillText(v.e.n, lx, ly);
            placed.push(rc);
          }
        }
      }

      if (!reduce) {
        ang -= 0.0011;
        rafId = requestAnimationFrame(frame);
      }
    }

    size();
    frame();
    const onResize = () => { size(); if (reduce) frame(); };
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return <canvas ref={canvasRef} className="w-full aspect-square relative z-[1]" style={{ maxWidth: 500 }} />;
}
```

- [ ] **Step 3: Verify globe renders in isolation**

Temporarily import Globe in page.tsx to confirm it renders and animates. Check browser console for errors. Then revert.

- [ ] **Step 4: Commit**

```bash
git add components/landing/globe-data.json components/landing/Globe.tsx
git commit -m "feat(landing): animated globe canvas with continent data"
```

---

### Task 3: Navbar + Hero Rewrite

**Files:**
- Modify: `components/landing/Navbar.tsx` (complete rewrite)
- Modify: `components/landing/Hero.tsx` (complete rewrite)

**Consumes:**
- `GBrandMark` from Task 1
- `Globe` from Task 2
- `useScrollReveal` hook (existing)

- [ ] **Step 1: Rewrite Navbar.tsx**

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import GBrandMark from "./GBrandMark";

export default function Navbar() {
  const [open, setOpen] = useState(false);

  return (
    <nav
      className="sticky top-0 z-30 border-b"
      style={{
        background: "rgba(5,22,44,.7)",
        WebkitBackdropFilter: "blur(12px)",
        backdropFilter: "blur(12px)",
        borderColor: "rgba(255,255,255,.09)",
      }}
    >
      <div className="max-w-[1180px] mx-auto px-8 flex items-center justify-between h-[78px]">
        <Link href="/" className="flex items-center gap-[15px] no-underline">
          <GBrandMark className="w-9 h-9 text-white flex-none" />
          <span className="w-px h-8" style={{ background: "rgba(255,255,255,.22)" }} />
          <span className="leading-none">
            <span className="block font-extrabold text-[21px] tracking-[0.2em] text-white">
              GLOBAL
            </span>
            <span
              className="block font-normal text-[10px] tracking-[0.46em] mt-1"
              style={{ color: "#E3B877" }}
            >
              ADVISORS
            </span>
          </span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden lg:flex items-center gap-8">
          <a href="#servicios" className="text-[15px] font-medium text-[#E7EDF6] hover:text-[#E3B877] transition-colors no-underline">
            Servicios
          </a>
          <a href="#consejo" className="text-[15px] font-medium text-[#E7EDF6] hover:text-[#E3B877] transition-colors no-underline">
            Estudios
          </a>
          <a href="#proceso" className="text-[15px] font-medium text-[#E7EDF6] hover:text-[#E3B877] transition-colors no-underline">
            Proceso
          </a>
          <Link
            href="/portal/login"
            className="px-[22px] py-[11px] text-sm rounded-full border text-gl-ink-light no-underline inline-flex items-center gap-2 transition-colors hover:border-gl-gold hover:text-gl-gold2"
            style={{ borderColor: "rgba(255,255,255,.09)" }}
          >
            Portal Clientes
          </Link>
          <Link
            href="/login"
            className="px-[22px] py-[11px] text-sm font-bold rounded-full bg-gl-azure border border-gl-azure text-[#05162C] no-underline inline-flex items-center gap-2 transition-colors hover:bg-[#7ab4ee]"
          >
            Acceso Asesores
          </Link>
        </div>

        {/* Mobile hamburger */}
        <button
          onClick={() => setOpen(!open)}
          className="lg:hidden p-2 text-gl-ink-light"
          aria-label={open ? "Cerrar menú" : "Abrir menú"}
        >
          {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile menu */}
      {open && (
        <div
          className="lg:hidden px-8 py-4 space-y-3 border-t"
          style={{ borderColor: "rgba(255,255,255,.09)", background: "rgba(5,22,44,.95)" }}
        >
          <a href="#servicios" onClick={() => setOpen(false)} className="block text-sm font-medium text-gl-ink-light py-2 no-underline">
            Servicios
          </a>
          <a href="#consejo" onClick={() => setOpen(false)} className="block text-sm font-medium text-gl-ink-light py-2 no-underline">
            Estudios
          </a>
          <a href="#proceso" onClick={() => setOpen(false)} className="block text-sm font-medium text-gl-ink-light py-2 no-underline">
            Proceso
          </a>
          <div className="flex gap-2 pt-2">
            <Link href="/portal/login" className="flex-1 text-center px-4 py-2.5 text-sm font-medium border rounded-full text-gl-ink-light no-underline" style={{ borderColor: "rgba(255,255,255,.09)" }}>
              Clientes
            </Link>
            <Link href="/login" className="flex-1 text-center px-4 py-2.5 text-sm font-bold bg-gl-azure text-[#05162C] rounded-full no-underline">
              Asesores
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
}
```

- [ ] **Step 2: Rewrite Hero.tsx**

```tsx
"use client";

import { useScrollReveal } from "./useScrollReveal";
import Globe from "./Globe";

export default function Hero() {
  const { ref, visible } = useScrollReveal(0.1);

  return (
    <header className="relative overflow-hidden" style={{ background: "linear-gradient(180deg,#0A2140,#05162C)" }}>
      <div
        className="absolute inset-0 z-0"
        style={{
          background: "radial-gradient(130% 90% at 80% 25%, rgba(90,160,230,.18), transparent 55%)",
        }}
      />
      <div
        ref={ref}
        className={`relative z-[2] max-w-[1180px] mx-auto px-8 grid grid-cols-1 lg:grid-cols-[1.05fr_0.95fr] gap-10 items-center min-h-[80vh] py-[84px] transition-all duration-700 ease-out ${
          visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
        }`}
      >
        <div>
          <span
            className="text-xs tracking-[0.3em] uppercase font-semibold"
            style={{ color: "#C99A5E", fontFamily: "var(--font-data)" }}
          >
            Asesoría patrimonial integral · Fee-only
          </span>
          <h1
            className="text-[clamp(42px,5.6vw,78px)] leading-[1.0] tracking-[-0.015em] text-white my-[22px_0_26px]"
            style={{ fontFamily: "var(--font-display)", fontWeight: 400, margin: "22px 0 26px" }}
          >
            Más de 20 años de <em className="italic" style={{ color: "#5AA0E6" }}>experiencia</em> a tu servicio
          </h1>
          <p className="text-[19px] leading-relaxed max-w-[31em]" style={{ color: "#CFDAEA" }}>
            Inversiones, planificación tributaria, seguros y propiedades. Asesoría independiente, sin conflictos de interés.
          </p>
          <p className="text-[13.5px] mt-[22px] mb-8" style={{ color: "#9DB0CA" }}>
            Asesores acreditados ante la CMF. Trayectoria en Itaú, Corpbanca, BanChile, Santander Investment y AFP Capital.
          </p>
          <div className="flex gap-3.5 flex-wrap">
            <a
              href="#servicios"
              className="px-[22px] py-[11px] text-sm font-bold rounded-full bg-gl-azure border border-gl-azure text-[#05162C] no-underline inline-flex items-center gap-2 transition-colors hover:bg-[#7ab4ee]"
            >
              Conoce nuestros servicios →
            </a>
            <a
              href="#contacto"
              className="px-[22px] py-[11px] text-sm rounded-full border text-gl-ink-light no-underline inline-flex items-center gap-2 transition-colors hover:border-gl-gold hover:text-gl-gold2"
              style={{ borderColor: "rgba(255,255,255,.09)" }}
            >
              Agenda una reunión
            </a>
          </div>
        </div>
        <div className="flex justify-center items-center relative order-first lg:order-last">
          <div
            className="absolute w-[74%] aspect-square rounded-full"
            style={{
              background: "radial-gradient(circle, rgba(90,160,230,.18), transparent 65%)",
              filter: "blur(6px)",
            }}
          />
          <Globe />
        </div>
      </div>
    </header>
  );
}
```

- [ ] **Step 3: Verify in browser**

Open `localhost:3000`. The page will likely error because `page.tsx` still imports deleted components — that's expected. Verify that Navbar and Hero render if you temporarily adjust `page.tsx`. The globe should rotate with labeled stock exchanges.

- [ ] **Step 4: Commit**

```bash
git add components/landing/Navbar.tsx components/landing/Hero.tsx
git commit -m "feat(landing): v14 navbar with brand mark + hero with animated globe"
```

---

### Task 4: Differentiators + ServiceCards Rewrite

**Files:**
- Modify: `components/landing/Differentiators.tsx` (complete rewrite)
- Modify: `components/landing/ServiceCards.tsx` (complete rewrite)

**Consumes:**
- `GBrandMark` from Task 1
- `useScrollReveal` hook (existing)

- [ ] **Step 1: Rewrite Differentiators.tsx**

```tsx
"use client";

import { useScrollReveal } from "./useScrollReveal";

const pillars = [
  { n: "01", title: "Fee-only", desc: "Cobramos solo de ti. Sin retrocesiones ni comisiones de productos. Independencia real." },
  { n: "02", title: "Departamento de estudios con IA", desc: "Analizamos mercados, noticias e instrumentos, todos los días." },
  { n: "03", title: "Acceso institucional", desc: "+40 mercados vía StoneX y +200.000 fondos vía Allfunds." },
  { n: "04", title: "Asesoría 360", desc: "Inversiones, tributario, seguros y propiedades, bajo una sola estrategia." },
];

export default function Differentiators() {
  const { ref, visible } = useScrollReveal();

  return (
    <section id="dif" className="py-[100px]" style={{ background: "#05162C" }}>
      <div className="max-w-[1180px] mx-auto px-8">
        <div
          ref={ref}
          className={`max-w-[720px] mb-[52px] transition-all duration-700 ease-out ${
            visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
          }`}
        >
          <span className="text-xs tracking-[0.3em] uppercase font-semibold" style={{ color: "#C99A5E" }}>
            Por qué Global
          </span>
          <h2
            className="text-[clamp(30px,3.7vw,48px)] leading-[1.07] mt-4 mb-3.5"
            style={{ fontFamily: "var(--font-display)", fontWeight: 400, color: "#EEF3FA" }}
          >
            Cuatro razones que nos hacen distintos
          </h2>
        </div>
        <div
          className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4"
          style={{ gap: "1px", background: "rgba(255,255,255,.09)", border: "1px solid rgba(255,255,255,.09)" }}
        >
          {pillars.map((p) => (
            <div key={p.n} className="p-[34px_30px]" style={{ background: "#05162C" }}>
              <span
                className="block text-[46px] leading-[.9] mb-2"
                style={{ fontFamily: "var(--font-display)", color: "#D0834C" }}
              >
                {p.n}
              </span>
              <h3 className="text-[19px] font-bold my-[12px_0_9px] text-white" style={{ margin: "12px 0 9px" }}>
                {p.title}
              </h3>
              <p className="text-sm" style={{ color: "#9DB0CA" }}>{p.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Rewrite ServiceCards.tsx**

```tsx
"use client";

import GBrandMark from "./GBrandMark";
import { useScrollReveal } from "./useScrollReveal";

const services = [
  { n: "01", line: "Wealth", desc: "Asesoría de inversiones independiente, local e internacional. Portafolios personalizados según tu perfil y objetivos." },
  { n: "02", line: "Planning", desc: "Planificación tributaria y patrimonial. Sociedades de inversión, optimización fiscal, sucesión y estructuración." },
  { n: "03", line: "Properties", desc: "Inversión inmobiliaria. Asesoría en compra, venta y gestión de activos inmobiliarios." },
  { n: "04", line: "Insurance", desc: "Seguros internacionales con compañías de primer nivel. Vida, salud y protección patrimonial." },
];

export default function ServiceCards() {
  const { ref, visible } = useScrollReveal();

  return (
    <section id="servicios" className="py-[100px]" style={{ background: "#05162C" }}>
      <div className="max-w-[1180px] mx-auto px-8">
        <div
          ref={ref}
          className={`max-w-[720px] mb-[52px] transition-all duration-700 ease-out ${
            visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
          }`}
        >
          <span className="text-xs tracking-[0.3em] uppercase font-semibold" style={{ color: "#C99A5E" }}>
            Servicios
          </span>
          <h2
            className="text-[clamp(30px,3.7vw,48px)] leading-[1.07] mt-4 mb-3.5"
            style={{ fontFamily: "var(--font-display)", fontWeight: 400, color: "#EEF3FA" }}
          >
            Cuatro frentes, una sola estrategia
          </h2>
        </div>
        <div
          className="grid grid-cols-1 lg:grid-cols-2"
          style={{ gap: "1px", background: "rgba(255,255,255,.09)", border: "1px solid rgba(255,255,255,.09)" }}
        >
          {services.map((s) => (
            <div
              key={s.n}
              className="p-[38px_36px] transition-colors"
              style={{ background: "#05162C" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#0A2140")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "#05162C")}
            >
              <div className="flex items-center gap-4 mb-3.5">
                <span
                  className="text-[32px] leading-[.9]"
                  style={{ fontFamily: "var(--font-display)", color: "#D0834C" }}
                >
                  {s.n}
                </span>
                <span className="flex items-center gap-2.5">
                  <GBrandMark className="w-[34px] h-[34px] text-white flex-none" />
                  <span className="text-[30px] font-extrabold tracking-[0.02em] text-white">GLOBAL</span>
                  <span className="text-[30px] font-light tracking-[0.01em] text-white">{s.line}</span>
                </span>
              </div>
              <p className="text-[15px] max-w-[42ch]" style={{ color: "#9DB0CA" }}>{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add components/landing/Differentiators.tsx components/landing/ServiceCards.tsx
git commit -m "feat(landing): v14 differentiators pillars + service cards with brand mark"
```

---

### Task 5: IA Section (Departamento de Estudios)

**Files:**
- Create: `components/landing/IASection.tsx`

**Consumes:**
- `useScrollReveal` hook (existing)

- [ ] **Step 1: Create IASection.tsx**

```tsx
"use client";

import { useScrollReveal } from "./useScrollReveal";

const capabilities = [
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-5 h-5" style={{ color: "#C99A5E" }}>
        <path d="M4 19h16M6 16l4-5 3 3 5-7" />
      </svg>
    ),
    title: "Analizamos todos los mercados",
    desc: "Cobertura diaria de mercados y activos globales, no solo los de siempre. Miramos todo el universo invertible, todos los días.",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-5 h-5" style={{ color: "#C99A5E" }}>
        <rect x="3" y="4" width="18" height="14" rx="2" />
        <path d="M7 9h4M7 13h7" />
      </svg>
    ),
    title: "Revisamos todas las noticias",
    desc: "Decenas de fuentes cada día, clasificadas por IA según importancia y contexto. Separamos la señal del ruido.",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-5 h-5" style={{ color: "#C99A5E" }}>
        <path d="M4 5v14l8-2 8 2V5l-8 2-8-2z" />
      </svg>
    ),
    title: "Analizamos cada instrumento",
    desc: "Fondos, acciones, bonos y ETFs evaluados con research propio, datos y una biblioteca de conocimiento que no olvida.",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-5 h-5" style={{ color: "#C99A5E" }}>
        <circle cx="12" cy="8" r="3.2" />
        <path d="M5 20a7 7 0 0114 0" />
      </svg>
    ),
    title: "Monitoreamos lo que mueve el mercado",
    desc: "Seguimiento continuo de lo que importa, para anticipar y no reaccionar tarde.",
  },
];

const stats = [
  { value: "Diario", label: "monitoreo de noticias clasificadas por IA" },
  { value: "Multi-agente", label: "sistema de IA que analiza mercados e instrumentos" },
  { value: "+cientos", label: "de documentos en el repositorio de conocimiento" },
];

export default function IASection() {
  const { ref, visible } = useScrollReveal();

  return (
    <section id="consejo" className="py-[100px]" style={{ background: "linear-gradient(180deg,#0A2140,#05162C)" }}>
      <div className="max-w-[1180px] mx-auto px-8">
        <div
          ref={ref}
          className={`max-w-[720px] mb-[52px] transition-all duration-700 ease-out ${
            visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
          }`}
        >
          <span className="text-xs tracking-[0.3em] uppercase font-semibold" style={{ color: "#C99A5E" }}>
            Departamento de estudios
          </span>
          <h2
            className="text-[clamp(30px,3.7vw,48px)] leading-[1.07] mt-4 mb-3.5"
            style={{ fontFamily: "var(--font-display)", fontWeight: 400, color: "#EEF3FA" }}
          >
            Un departamento de estudios propio, potenciado con IA
          </h2>
          <p className="text-[17px]" style={{ color: "#9DB0CA" }}>
            La capacidad de análisis que normalmente solo tienen los grandes, ahora en una boutique independiente. La IA nos da la escala; el criterio lo pone el equipo.
          </p>
        </div>

        <div
          className="grid grid-cols-1 sm:grid-cols-2 mt-2"
          style={{ gap: "1px", background: "rgba(255,255,255,.09)", border: "1px solid rgba(255,255,255,.09)" }}
        >
          {capabilities.map((c) => (
            <div key={c.title} className="p-[30px]" style={{ background: "#05162C" }}>
              <div className="flex items-center gap-2.5 font-semibold text-[15px] mb-2" style={{ color: "#E3B877" }}>
                {c.icon}
                {c.title}
              </div>
              <p className="text-[14.5px]" style={{ color: "#9DB0CA" }}>{c.desc}</p>
            </div>
          ))}
        </div>

        <p className="text-center max-w-[760px] mx-auto mt-11 text-[17px]" style={{ color: "#9DB0CA" }}>
          Conocemos la visión de las principales gestoras del mundo. Las escuchamos a todas...{" "}
          <span className="font-semibold" style={{ color: "#E3B877" }}>y no nos casamos con ninguna.</span>
        </p>

        <p
          className="text-center max-w-[880px] mx-auto mt-[22px] text-[clamp(22px,2.8vw,32px)] leading-[1.3] italic"
          style={{ fontFamily: "var(--font-display)", color: "#EEF3FA" }}
        >
          La IA nos da la <span style={{ color: "#E3B877" }}>escala</span>. Nuestra independencia, el{" "}
          <span style={{ color: "#E3B877" }}>criterio</span>. La última palabra siempre la tiene un asesor acreditado.
        </p>

        <div className="flex gap-10 justify-center flex-wrap mt-10">
          {stats.map((s) => (
            <div key={s.value} className="text-center">
              <b
                className="block text-[34px]"
                style={{ fontFamily: "var(--font-display)", color: "#E3B877" }}
              >
                {s.value}
              </b>
              <span className="text-[13px]" style={{ color: "#9DB0CA" }}>{s.label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/landing/IASection.tsx
git commit -m "feat(landing): v14 IA department section with capabilities grid and stats"
```

---

### Task 6: HowItWorks (Proceso) + PortalPreview + Footer + Page Assembly

**Files:**
- Modify: `components/landing/HowItWorks.tsx` (complete rewrite)
- Create: `components/landing/PortalPreview.tsx`
- Modify: `components/landing/Footer.tsx` (complete rewrite)
- Modify: `app/(public)/page.tsx` (new assembly)

**Consumes:**
- `GBrandMark` from Task 1
- `useScrollReveal` hook (existing)

- [ ] **Step 1: Rewrite HowItWorks.tsx**

```tsx
"use client";

import { useScrollReveal } from "./useScrollReveal";

const steps = [
  {
    n: "01",
    title: "Diagnóstico",
    desc: "Entendemos tu situación financiera, tu perfil de riesgo y tus objetivos de largo plazo.",
    gradient: "linear-gradient(135deg, #0F2D54, #14467E)",
  },
  {
    n: "02",
    title: "Estrategia",
    desc: "Diseñamos un plan que integra inversiones, planificación tributaria y protección.",
    gradient: "linear-gradient(135deg, #14467E, #1a5090)",
  },
  {
    n: "03",
    title: "Ejecución",
    desc: "Implementamos en tu custodia, seleccionando los instrumentos más eficientes.",
    gradient: "linear-gradient(135deg, #0A2140, #0F2D54)",
  },
  {
    n: "04",
    title: "Monitoreo",
    desc: "Seguimiento diario, con reportes transparentes, rebalanceo y ajustes.",
    gradient: "linear-gradient(135deg, #0F2D54, #0A2140)",
  },
];

export default function HowItWorks() {
  const { ref, visible } = useScrollReveal();

  return (
    <section id="proceso" className="py-[100px]" style={{ background: "#0A2140" }}>
      <div className="max-w-[1180px] mx-auto px-8">
        <div
          ref={ref}
          className={`max-w-[720px] mb-[52px] transition-all duration-700 ease-out ${
            visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
          }`}
        >
          <span className="text-xs tracking-[0.3em] uppercase font-semibold" style={{ color: "#C99A5E" }}>
            Nuestro proceso de inversión
          </span>
          <h2
            className="text-[clamp(30px,3.7vw,48px)] leading-[1.07] mt-4 mb-3.5"
            style={{ fontFamily: "var(--font-display)", fontWeight: 400, color: "#EEF3FA" }}
          >
            Cuatro etapas que estructuran cada decisión
          </h2>
          <p className="text-[17px]" style={{ color: "#9DB0CA" }}>
            Disciplina en cada paso: del diagnóstico al monitoreo continuo, con el departamento de estudios y el criterio del equipo trabajando juntos.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-[22px] mt-2">
          {steps.map((s) => (
            <div
              key={s.n}
              className="rounded-[14px] overflow-hidden border transition-all duration-300 hover:-translate-y-[5px]"
              style={{ borderColor: "rgba(255,255,255,.09)", background: "#05162C" }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = "rgba(201,154,94,.45)")}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = "rgba(255,255,255,.09)")}
            >
              <div className="relative" style={{ aspectRatio: "4/3", background: s.gradient }}>
                <div
                  className="absolute inset-0"
                  style={{ background: "linear-gradient(180deg,transparent 55%,rgba(5,22,44,.35))" }}
                />
                <span
                  className="absolute top-3.5 left-4 z-[2] w-[34px] h-[34px] rounded-full grid place-items-center text-[15px] text-white"
                  style={{ fontFamily: "var(--font-display)", background: "#D0834C" }}
                >
                  {s.n}
                </span>
              </div>
              <div className="p-[22px_22px_26px]">
                <h4 className="text-[19px] font-bold mb-2 text-white">{s.title}</h4>
                <p className="text-sm" style={{ color: "#9DB0CA" }}>{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Create PortalPreview.tsx**

```tsx
"use client";

import { useEffect, useRef } from "react";
import { useScrollReveal } from "./useScrollReveal";

function PortalChart() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    function draw() {
      const w = c!.getBoundingClientRect().width;
      const h = 150;
      c!.width = w * dpr;
      c!.height = h * dpr;
      const x = c!.getContext("2d")!;
      x.setTransform(dpr, 0, 0, dpr, 0, 0);

      const n = 46;
      const v: number[] = [];
      let val = 50, s = 9;
      const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
      for (let i = 0; i < n; i++) { val += Math.sin(i * 0.4) * 1.4 + (i / n) * 1.5 + (rnd() - 0.4); v.push(val); }

      const mn = Math.min(...v), mx = Math.max(...v), pad = 6, gw = w - pad * 2, gh = h - pad * 2;
      const X = (i: number) => pad + (i / (n - 1)) * gw;
      const Y = (q: number) => pad + gh - ((q - mn) / (mx - mn)) * gh;

      x.beginPath(); x.moveTo(X(0), Y(v[0]));
      for (let i = 1; i < n; i++) x.lineTo(X(i), Y(v[i]));
      x.strokeStyle = "#5AA0E6"; x.lineWidth = 2; x.stroke();
      x.lineTo(X(n - 1), h); x.lineTo(X(0), h); x.closePath();
      const grd = x.createLinearGradient(0, 0, 0, h);
      grd.addColorStop(0, "rgba(90,160,230,.3)");
      grd.addColorStop(1, "rgba(90,160,230,0)");
      x.fillStyle = grd; x.fill();
    }

    draw();
    window.addEventListener("resize", draw);
    return () => window.removeEventListener("resize", draw);
  }, []);

  return <canvas ref={canvasRef} className="w-full block" height={150} />;
}

const tiles = [
  { label: "Rentab. YTD", value: "+12,4%", cls: "up" },
  { label: "Mercados", value: "+40", cls: "" },
  { label: "Fondos", value: "+200K", cls: "gd" },
  { label: "Update", value: "Diario", cls: "" },
];

export default function PortalPreview() {
  const { ref, visible } = useScrollReveal();

  return (
    <section id="portal" className="py-[100px]" style={{ background: "#05162C" }}>
      <div className="max-w-[1180px] mx-auto px-8">
        <div
          ref={ref}
          className={`text-center max-w-[720px] mx-auto mb-[52px] transition-all duration-700 ease-out ${
            visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
          }`}
        >
          <span className="text-xs tracking-[0.3em] uppercase font-semibold" style={{ color: "#C99A5E" }}>
            Tu portal
          </span>
          <h2
            className="text-[clamp(30px,3.7vw,48px)] leading-[1.07] mt-4 mb-3.5"
            style={{ fontFamily: "var(--font-display)", fontWeight: 400, color: "#EEF3FA" }}
          >
            Tu patrimonio, siempre a la vista
          </h2>
        </div>

        <div
          className="max-w-[760px] mx-auto rounded-xl overflow-hidden"
          style={{
            background: "#060D18",
            border: "1px solid rgba(255,255,255,.09)",
            fontFamily: "var(--font-data)",
            boxShadow: "0 30px 60px rgba(0,0,0,.4)",
          }}
        >
          {/* Title bar */}
          <div
            className="flex items-center gap-2 px-4 py-[11px]"
            style={{ borderBottom: "1px solid rgba(255,255,255,.09)", background: "#04101e" }}
          >
            <div className="flex gap-1.5">
              <i className="w-2.5 h-2.5 rounded-full" style={{ background: "rgba(255,255,255,.22)" }} />
              <i className="w-2.5 h-2.5 rounded-full" style={{ background: "rgba(255,255,255,.22)" }} />
              <i className="w-2.5 h-2.5 rounded-full" style={{ background: "rgba(255,255,255,.22)" }} />
            </div>
            <span className="ml-2 text-xs" style={{ color: "#7E93AD" }}>Global · Portal de clientes</span>
          </div>

          {/* Body */}
          <div
            className="grid grid-cols-1 md:grid-cols-[1.6fr_1fr]"
            style={{ gap: "1px", background: "rgba(255,255,255,.09)" }}
          >
            <div className="p-[16px_18px]" style={{ background: "#060D18" }}>
              <div className="flex justify-between items-baseline mb-2.5 text-xs">
                <h4 className="text-[13px] font-semibold" style={{ color: "#cdd9ea" }}>Tu portafolio</h4>
                <span className="font-semibold" style={{ color: "#2ECC8F" }}>▲ +12,4% YTD</span>
              </div>
              <PortalChart />
            </div>
            <div
              className="grid grid-cols-2"
              style={{ gap: "1px", background: "rgba(255,255,255,.09)", borderTop: "1px solid rgba(255,255,255,.09)" }}
            >
              {tiles.map((t) => (
                <div key={t.label} className="p-[13px_16px]" style={{ background: "#060D18" }}>
                  <div className="text-[11px]" style={{ color: "#7E93AD" }}>{t.label}</div>
                  <div
                    className="text-[22px] mt-0.5"
                    style={{
                      fontFamily: "var(--font-display)",
                      color: t.cls === "up" ? "#2ECC8F" : t.cls === "gd" ? "#E3B877" : "#dfe7f1",
                    }}
                  >
                    {t.value}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <p className="text-center text-[13px] mt-3.5" style={{ color: "#9DB0CA" }}>
          Vista ilustrativa. Tu portal se actualiza diariamente desde feeds institucionales.
        </p>
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Rewrite Footer.tsx**

```tsx
import GBrandMark from "./GBrandMark";

export default function Footer() {
  return (
    <footer className="py-[50px] px-8" style={{ borderTop: "1px solid rgba(255,255,255,.09)", background: "#05162C", color: "#9DB0CA", fontSize: "14px" }}>
      <div className="max-w-[1180px] mx-auto flex justify-between items-start flex-wrap gap-[22px]">
        <a href="#" className="flex items-center gap-[15px] no-underline" style={{ opacity: 0.92 }}>
          <GBrandMark className="w-[30px] h-[30px] text-white" />
          <span className="w-px" style={{ height: 28, background: "rgba(255,255,255,.22)" }} />
          <span className="leading-none">
            <span className="block font-extrabold text-[18px] tracking-[0.2em] text-white">GLOBAL</span>
            <span className="block font-normal text-[9px] tracking-[0.46em] mt-1" style={{ color: "#E3B877" }}>ADVISORS</span>
          </span>
        </a>
        <p className="max-w-[560px] text-xs leading-relaxed" style={{ color: "#6f83a0" }}>
          La rentabilidad pasada no garantiza rentabilidades futuras. Toda inversión está sujeta a riesgos. Esta página no constituye oferta ni recomendación de inversión. Global Advisors es una sociedad registrada y regulada por la Comisión para el Mercado Financiero (CMF); sus asesores se encuentran acreditados ante la CMF. © 2026 Global Advisors · Santiago, Chile.
        </p>
      </div>
    </footer>
  );
}
```

- [ ] **Step 4: Rewrite page.tsx**

```tsx
import Navbar from "@/components/landing/Navbar";
import Hero from "@/components/landing/Hero";
import Differentiators from "@/components/landing/Differentiators";
import ServiceCards from "@/components/landing/ServiceCards";
import IASection from "@/components/landing/IASection";
import HowItWorks from "@/components/landing/HowItWorks";
import PortalPreview from "@/components/landing/PortalPreview";
import Footer from "@/components/landing/Footer";

export default function LandingPage() {
  return (
    <div style={{ background: "#05162C", color: "#EEF3FA", fontFamily: "var(--font-body)" }}>
      <Navbar />
      <Hero />
      <Differentiators />
      <ServiceCards />
      <IASection />
      <HowItWorks />
      <PortalPreview />
      <Footer />
    </div>
  );
}
```

- [ ] **Step 5: Verify full page in browser**

Open `localhost:3000` and scroll through. Verify:
1. Navbar — sticky translucent, G brand mark + "GLOBAL ADVISORS", azure button
2. Hero — two columns, globe animating on right with exchange labels
3. Diferenciadores — 4-column bordered grid with copper numbers
4. Servicios — 2×2 bordered grid with G marks, hover changes bg
5. IA — 2×2 capabilities + quote + stats
6. Proceso — 4 gradient cards with copper badges, hover lift
7. Portal — terminal mockup with chart + tiles
8. Footer — brand + disclaimer

Also run:
```bash
npx tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add components/landing/HowItWorks.tsx components/landing/PortalPreview.tsx components/landing/Footer.tsx "app/(public)/page.tsx"
git commit -m "feat(landing): v14 proceso, portal preview, footer + full page assembly"
```
