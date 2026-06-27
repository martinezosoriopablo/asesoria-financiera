# Landing Page Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the Global Wealth landing page with editorial dark/light rhythm, copper accent color from new logo, stats bar, numbered services, and 360 narrative.

**Architecture:** Modify existing landing components in `components/landing/`. Add one new component (StatsBar). Replace SVG logo with new image-based logo. Add copper color token to globals.css. No new dependencies.

**Tech Stack:** Next.js App Router, React, Tailwind CSS v4, next/image

## Global Constraints

- Keep all existing gl-* color tokens unchanged
- New copper token: `gl-copper` (#C17F3E) — decorative only, never for interactive elements
- Azure remains the interactive color (buttons, links, hover states)
- All components use existing font variables: `--font-display`, `--font-body`, `--font-data`
- Keep `useScrollReveal` hook as-is
- Mobile-first responsive: stack on mobile, expand on md/lg
- Logo source: `global1.jpeg` from Downloads — copy to `public/images/`
- No new npm dependencies

---

### Task 1: Foundation — Color Token, Logo Assets, Eyebrow Dark Variant

**Files:**
- Modify: `app/globals.css:23-33` (add copper token)
- Modify: `app/globals.css:35-65` (add copper to @theme)
- Create: `components/landing/GlobalLogo.tsx` (complete rewrite)
- Modify: `components/landing/Eyebrow.tsx` (add dark variant prop)
- Copy: `global1.jpeg` → `public/images/global1.jpeg`

**Produces:**
- `gl-copper` Tailwind token usable as `text-gl-copper`, `bg-gl-copper`, `border-gl-copper`
- `GlobalLogo` component: `({ variant?: "dark" | "light", className?: string }) => JSX.Element`
- `Eyebrow` component: `({ children, variant?: "light" | "dark" }) => JSX.Element`

- [ ] **Step 1: Copy logo to public/images/**

```bash
mkdir -p public/images
cp ~/Downloads/global1.jpeg public/images/global1.jpeg
```

- [ ] **Step 2: Add gl-copper token to globals.css**

In `app/globals.css`, add the copper variable in `:root` after `--gl-muted`:

```css
  --gl-copper: #C17F3E;
```

And in the `@theme inline` block, add after the `--color-gl-muted` line:

```css
  --color-gl-copper: var(--gl-copper);
```

- [ ] **Step 3: Rewrite GlobalLogo.tsx to use the new logo image**

```tsx
import Image from "next/image";

interface GlobalLogoProps {
  variant?: "dark" | "light";
  className?: string;
}

export default function GlobalLogo({ variant = "dark", className = "" }: GlobalLogoProps) {
  return (
    <Image
      src="/images/global1.jpeg"
      alt="Global Wealth"
      width={220}
      height={40}
      className={`h-8 w-auto object-contain ${variant === "light" ? "brightness-0 invert" : ""} ${className}`}
      priority
    />
  );
}
```

Note: The light variant uses CSS `brightness-0 invert` to make the logo white for dark backgrounds. This loses the copper accent in the inverted version, which is acceptable — on dark backgrounds the logo appears as clean white. If a proper light SVG becomes available later, swap it in.

- [ ] **Step 4: Update Eyebrow.tsx with dark variant support**

```tsx
interface EyebrowProps {
  children: React.ReactNode;
  variant?: "light" | "dark";
}

export default function Eyebrow({ children, variant = "light" }: EyebrowProps) {
  const textColor = variant === "dark" ? "text-gl-sky/60" : "text-gl-azure";
  const lineColor = variant === "dark" ? "bg-gl-copper/60" : "bg-gl-azure";

  return (
    <p
      className={`flex items-center justify-center gap-2.5 text-xs font-medium ${textColor} tracking-[0.2em] uppercase mb-4`}
      style={{ fontFamily: "var(--font-data)" }}
    >
      <span className={`inline-block w-[26px] h-[2px] ${lineColor} rounded-full`} />
      {children}
    </p>
  );
}
```

- [ ] **Step 5: Verify dev server renders correctly**

```bash
npm run dev
```

Open http://localhost:3000 — verify:
- Logo appears in navbar (may look different from old SVG — that's expected)
- No console errors
- Page still loads all sections

- [ ] **Step 6: Commit**

```bash
git add app/globals.css components/landing/GlobalLogo.tsx components/landing/Eyebrow.tsx public/images/global1.jpeg
git commit -m "feat(landing): add copper token, new logo, eyebrow dark variant"
```

---

### Task 2: Hero Rewrite + StatsBar New Component

**Files:**
- Modify: `components/landing/Hero.tsx` (new copy, institutional line)
- Create: `components/landing/StatsBar.tsx`
- Modify: `app/(public)/page.tsx` (add StatsBar)

**Consumes:**
- `GlobalLogo` component from Task 1
- `gl-copper` token from Task 1

**Produces:**
- Updated Hero with new eyebrow, subtitle, institutional line
- `StatsBar` component (no props, self-contained)

- [ ] **Step 1: Rewrite Hero.tsx**

```tsx
"use client";

import { ArrowRight } from "lucide-react";
import GlobalLogo from "./GlobalLogo";
import { useScrollReveal } from "./useScrollReveal";

export default function Hero() {
  const { ref, visible } = useScrollReveal(0.1);

  return (
    <section className="relative min-h-[90vh] flex items-center overflow-hidden bg-gl-deep">
      {/* Mesh gradient background */}
      <div
        className="absolute inset-0 opacity-40"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 70% 40%, #14467E 0%, transparent 70%), radial-gradient(ellipse 60% 50% at 20% 80%, #2E86E0 0%, transparent 60%)",
        }}
      />
      {/* Subtle grid pattern */}
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />
      {/* Bottom accent */}
      <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-gradient-to-r from-transparent via-gl-azure to-transparent" />

      <div className="relative max-w-7xl mx-auto px-6 sm:px-10 lg:px-16 py-32 w-full">
        <div
          ref={ref}
          className={`max-w-3xl transition-all duration-700 ease-out ${
            visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}
        >
          <div className="flex items-center gap-3 mb-10">
            <GlobalLogo variant="light" className="h-8 w-auto" />
          </div>
          <p
            className="text-xs tracking-[0.3em] text-gl-sky/60 uppercase mb-5"
            style={{ fontFamily: "var(--font-data)" }}
          >
            Asesoria patrimonial integral
          </p>
          <h1
            className="text-5xl md:text-6xl lg:text-7xl text-white mb-8 leading-[1.08] tracking-tight"
            style={{ fontFamily: "var(--font-display)", fontWeight: 400 }}
          >
            Mas de 25 anos de{" "}
            <em className="italic text-gl-sky">experiencia</em> a tu servicio
          </h1>
          <p
            className="text-lg md:text-xl text-white/50 mb-6 leading-relaxed max-w-xl"
            style={{ fontFamily: "var(--font-body)" }}
          >
            Inversiones, planificacion tributaria, seguros y propiedades. Un equipo senior que te acompana en cada decision patrimonial.
          </p>
          <p
            className="text-sm text-gl-sky/40 mb-12"
            style={{ fontFamily: "var(--font-body)" }}
          >
            Equipo con trayectoria en Itau, Corpbanca, BanChile, Santander Investment y AFP Capital
          </p>
          <div className="flex flex-col sm:flex-row gap-4">
            <a
              href="#servicios"
              className="px-8 py-3.5 bg-white text-gl-ink font-semibold rounded-full hover:bg-gl-mist transition-colors inline-flex items-center justify-center gap-2 shadow-lg shadow-white/10"
              style={{ fontFamily: "var(--font-body)" }}
            >
              Conoce nuestros servicios
              <ArrowRight className="w-5 h-5" />
            </a>
            <a
              href="#contacto"
              className="px-8 py-3.5 border border-white/20 text-white font-semibold rounded-full hover:bg-white/5 transition-colors inline-flex items-center justify-center"
              style={{ fontFamily: "var(--font-body)" }}
            >
              Agenda una reunion
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Create StatsBar.tsx**

```tsx
"use client";

import { useScrollReveal } from "./useScrollReveal";

const stats = [
  { number: "+20 anos", label: "de experiencia en mercados financieros" },
  { number: "+USD 60MM", label: "en patrimonio asesorado" },
  { number: "+200,000", label: "instrumentos disponibles" },
  { number: "+40 mercados", label: "acceso global sin restricciones" },
];

export default function StatsBar() {
  const { ref, visible } = useScrollReveal(0.2);

  return (
    <section className="relative bg-gl-ink py-14 px-4">
      <div
        ref={ref}
        className={`max-w-6xl mx-auto transition-all duration-700 ease-out ${
          visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
        }`}
      >
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-0">
          {stats.map((s, i) => (
            <div
              key={s.number}
              className={`text-center ${
                i < stats.length - 1 ? "lg:border-r lg:border-gl-copper/20" : ""
              }`}
            >
              <p
                className="text-2xl md:text-3xl lg:text-4xl text-gl-copper mb-2"
                style={{ fontFamily: "var(--font-data)", fontWeight: 600 }}
              >
                {s.number}
              </p>
              <p
                className="text-sm text-white/50"
                style={{ fontFamily: "var(--font-body)" }}
              >
                {s.label}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Update page.tsx to include StatsBar**

```tsx
import Navbar from "@/components/landing/Navbar";
import Hero from "@/components/landing/Hero";
import StatsBar from "@/components/landing/StatsBar";
import ServiceCards from "@/components/landing/ServiceCards";
import Differentiators from "@/components/landing/Differentiators";
import HowItWorks from "@/components/landing/HowItWorks";
import CTASection from "@/components/landing/CTASection";
import Footer from "@/components/landing/Footer";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gl-paper text-gl-ink" style={{ fontFamily: "var(--font-body)" }}>
      <Navbar />
      <Hero />
      <StatsBar />
      <ServiceCards />
      <Differentiators />
      <HowItWorks />
      <CTASection />
      <Footer />
    </div>
  );
}
```

- [ ] **Step 4: Verify in browser**

Open http://localhost:3000 — verify:
- Hero shows new eyebrow "Asesoría patrimonial integral"
- New subtitle with 360 message
- Institutional line below subtitle in muted sky color
- Stats bar appears below hero with 4 stats in copper
- Stats bar is 2×2 on mobile, 4-across on desktop

- [ ] **Step 5: Commit**

```bash
git add components/landing/Hero.tsx components/landing/StatsBar.tsx "app/(public)/page.tsx"
git commit -m "feat(landing): new hero copy + stats bar with copper accents"
```

---

### Task 3: ServiceCards Rewrite — Numbered Editorial Blocks

**Files:**
- Modify: `components/landing/ServiceCards.tsx` (complete rewrite)

**Consumes:**
- `Eyebrow` component (light variant, default)
- `useScrollReveal` hook
- `gl-copper` token from Task 1

- [ ] **Step 1: Rewrite ServiceCards.tsx**

```tsx
"use client";

import Eyebrow from "./Eyebrow";
import { useScrollReveal } from "./useScrollReveal";

const services = [
  {
    number: "01",
    title: "Global Wealth",
    description:
      "Asesoria de inversiones independiente, local e internacional. Portafolios personalizados segun tu perfil y objetivos.",
  },
  {
    number: "02",
    title: "Global Planning",
    description:
      "Planificacion tributaria y patrimonial. Sociedades de inversion, optimizacion fiscal, sucesion y estructuracion.",
  },
  {
    number: "03",
    title: "Global Properties",
    description:
      "Inversion inmobiliaria. Asesoria en compra, venta y gestion de activos inmobiliarios.",
  },
  {
    number: "04",
    title: "Global Insurance",
    description:
      "Seguros internacionales con companias de primer nivel. Vida, salud y proteccion patrimonial.",
  },
];

export default function ServiceCards() {
  const { ref, visible } = useScrollReveal();

  return (
    <section id="servicios" className="relative py-28 px-4 bg-white overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-gl-line to-transparent" />

      <div className="max-w-6xl mx-auto">
        <div
          ref={ref}
          className={`text-center mb-16 transition-all duration-700 ease-out ${
            visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
          }`}
        >
          <Eyebrow>Nuestros servicios</Eyebrow>
          <h2
            className="text-3xl md:text-4xl text-gl-ink mb-4"
            style={{ fontFamily: "var(--font-display)", fontWeight: 400 }}
          >
            Cuatro areas de <em className="italic text-gl-azure">especialidad</em>
          </h2>
        </div>
        <div className="grid md:grid-cols-2 gap-x-12 gap-y-14">
          {services.map((s) => (
            <div key={s.number} className="group flex gap-6">
              <span
                className="text-5xl lg:text-6xl text-gl-copper/30 group-hover:text-gl-copper/60 transition-colors shrink-0 leading-none"
                style={{ fontFamily: "var(--font-data)", fontWeight: 700 }}
              >
                {s.number}
              </span>
              <div>
                <h3
                  className="text-xl font-semibold text-gl-ink mb-2"
                  style={{ fontFamily: "var(--font-body)" }}
                >
                  {s.title}
                </h3>
                <div className="w-8 h-[2px] bg-gl-copper/40 rounded-full mb-3" />
                <p
                  className="text-sm text-gl-muted leading-relaxed"
                  style={{ fontFamily: "var(--font-body)" }}
                >
                  {s.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Verify in browser**

Open http://localhost:3000#servicios — verify:
- 2×2 grid with large copper numbers (01-04) on the left
- Title + copper line + description on the right of each number
- Numbers are faded copper, darken slightly on hover
- Single column on mobile

- [ ] **Step 3: Commit**

```bash
git add components/landing/ServiceCards.tsx
git commit -m "feat(landing): editorial numbered service blocks with copper accent"
```

---

### Task 4: Differentiators Rewrite — Dark Background

**Files:**
- Modify: `components/landing/Differentiators.tsx` (complete rewrite)

**Consumes:**
- `Eyebrow` component with `variant="dark"`
- `useScrollReveal` hook
- `gl-copper` token from Task 1

- [ ] **Step 1: Rewrite Differentiators.tsx**

```tsx
"use client";

import Eyebrow from "./Eyebrow";
import { useScrollReveal } from "./useScrollReveal";

const items = [
  {
    title: "Siempre alineados a tus intereses",
    description:
      "No representamos a ninguna gestora ni institucion. Nuestras recomendaciones responden solo a tus objetivos.",
  },
  {
    title: "Asesoria 360",
    description:
      "Desde tu portafolio hasta la estructura societaria. Inversiones, planificacion tributaria, seguros y propiedades en un solo lugar.",
  },
  {
    title: "Acceso global",
    description:
      "Mas de 200,000 instrumentos en +40 mercados. Infraestructura institucional para darte acceso al mundo.",
  },
];

export default function Differentiators() {
  const { ref, visible } = useScrollReveal();

  return (
    <section id="nosotros" className="relative py-28 px-4 bg-gl-deep overflow-hidden">
      {/* Subtle mesh gradient */}
      <div
        className="absolute inset-0 opacity-20"
        style={{
          background:
            "radial-gradient(ellipse 60% 50% at 80% 30%, #14467E 0%, transparent 60%)",
        }}
      />
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-gl-copper/30 to-transparent" />

      <div className="relative max-w-6xl mx-auto">
        <div
          ref={ref}
          className={`text-center mb-16 transition-all duration-700 ease-out ${
            visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
          }`}
        >
          <Eyebrow variant="dark">Por que Global</Eyebrow>
          <h2
            className="text-3xl md:text-4xl text-white mb-4"
            style={{ fontFamily: "var(--font-display)", fontWeight: 400 }}
          >
            Lo que nos <em className="italic text-gl-sky">diferencia</em>
          </h2>
        </div>
        <div className="grid md:grid-cols-3 gap-10">
          {items.map((d) => (
            <div key={d.title} className="text-center md:text-left">
              <div className="w-8 h-[2px] bg-gl-copper/60 rounded-full mb-5 mx-auto md:mx-0" />
              <h3
                className="text-lg font-semibold text-white mb-3"
                style={{ fontFamily: "var(--font-body)" }}
              >
                {d.title}
              </h3>
              <p
                className="text-sm text-white/50 leading-relaxed"
                style={{ fontFamily: "var(--font-body)" }}
              >
                {d.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Verify in browser**

Open http://localhost:3000#nosotros — verify:
- Dark background (gl-deep) with subtle gradient
- Copper top line
- Eyebrow in sky/copper style (dark variant)
- 3 columns with copper separator lines, white text
- Content: "Siempre alineados...", "Asesoría 360", "Acceso global"

- [ ] **Step 3: Commit**

```bash
git add components/landing/Differentiators.tsx
git commit -m "feat(landing): dark differentiators with 360 + independence + global access"
```

---

### Task 5: HowItWorks Rewrite — 4 Steps with Copper

**Files:**
- Modify: `components/landing/HowItWorks.tsx` (complete rewrite)

**Consumes:**
- `Eyebrow` component (light variant, default)
- `useScrollReveal` hook
- `gl-copper` token from Task 1

- [ ] **Step 1: Rewrite HowItWorks.tsx**

```tsx
"use client";

import Eyebrow from "./Eyebrow";
import { useScrollReveal } from "./useScrollReveal";

const steps = [
  {
    number: "01",
    title: "Diagnostico",
    description: "Entendemos tu situacion financiera, perfil de riesgo y objetivos.",
  },
  {
    number: "02",
    title: "Estrategia",
    description: "Disenamos un plan personalizado que integra inversiones, planificacion y proteccion.",
  },
  {
    number: "03",
    title: "Ejecucion",
    description: "Tu ejecutas en tu custodia. Nosotros te guiamos en cada paso.",
  },
  {
    number: "04",
    title: "Monitoreo",
    description: "Seguimiento continuo con reportes, rebalanceo y ajustes.",
  },
];

export default function HowItWorks() {
  const { ref, visible } = useScrollReveal();

  return (
    <section id="proceso" className="relative py-28 px-4 bg-gl-mist overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-gl-line to-transparent" />

      <div className="max-w-6xl mx-auto">
        <div
          ref={ref}
          className={`text-center mb-16 transition-all duration-700 ease-out ${
            visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
          }`}
        >
          <Eyebrow>Proceso</Eyebrow>
          <h2
            className="text-3xl md:text-4xl text-gl-ink mb-4"
            style={{ fontFamily: "var(--font-display)", fontWeight: 400 }}
          >
            Como trabajamos
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 relative">
          {/* Connector line — copper */}
          <div className="hidden md:block absolute top-7 left-[15%] right-[15%] h-[2px] bg-gradient-to-r from-gl-copper/10 via-gl-copper/30 to-gl-copper/10" />

          {steps.map((s) => (
            <div key={s.number} className="text-center relative">
              <div
                className="w-14 h-14 border-2 border-gl-copper/40 text-gl-copper rounded-full flex items-center justify-center mx-auto mb-5 relative z-10 bg-gl-mist"
                style={{ fontFamily: "var(--font-data)", fontSize: "1rem", fontWeight: 600 }}
              >
                {s.number}
              </div>
              <h3
                className="text-lg font-semibold text-gl-ink mb-2"
                style={{ fontFamily: "var(--font-body)" }}
              >
                {s.title}
              </h3>
              <p
                className="text-sm text-gl-muted leading-relaxed"
                style={{ fontFamily: "var(--font-body)" }}
              >
                {s.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Verify in browser**

Open http://localhost:3000#proceso — verify:
- 4 steps in a horizontal line on desktop
- Copper border circles with copper numbers (01-04)
- Copper connector line between circles
- Single column on mobile
- Background is gl-mist

- [ ] **Step 3: Commit**

```bash
git add components/landing/HowItWorks.tsx
git commit -m "feat(landing): 4-step process with copper circles and connector"
```

---

### Task 6: CTA, Footer, Navbar Updates + Final Assembly

**Files:**
- Modify: `components/landing/CTASection.tsx` (new copy)
- Modify: `components/landing/Footer.tsx` (new logo)
- Modify: `components/landing/Navbar.tsx` (new logo)

**Consumes:**
- `GlobalLogo` component from Task 1

- [ ] **Step 1: Update CTASection.tsx**

```tsx
"use client";

import { ArrowRight } from "lucide-react";
import { useScrollReveal } from "./useScrollReveal";

export default function CTASection() {
  const { ref, visible } = useScrollReveal();

  return (
    <section id="contacto" className="relative py-28 px-4 overflow-hidden bg-gl-deep">
      {/* Mesh gradient */}
      <div
        className="absolute inset-0 opacity-30"
        style={{
          background:
            "radial-gradient(ellipse 70% 50% at 30% 60%, #2E86E0 0%, transparent 60%), radial-gradient(ellipse 50% 40% at 80% 30%, #14467E 0%, transparent 50%)",
        }}
      />
      {/* Grid pattern */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-gl-copper/30 to-transparent" />

      <div
        ref={ref}
        className={`relative max-w-3xl mx-auto text-center transition-all duration-700 ease-out ${
          visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
        }`}
      >
        <h2
          className="text-3xl md:text-4xl text-white mb-6"
          style={{ fontFamily: "var(--font-display)", fontWeight: 400 }}
        >
          Conversemos sobre tu patrimonio
        </h2>
        <p
          className="text-lg text-white/50 mb-10"
          style={{ fontFamily: "var(--font-body)" }}
        >
          Agenda una reunion sin compromiso con nuestro equipo.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <a
            href="mailto:contacto@global.cl"
            className="px-8 py-3.5 bg-white text-gl-ink font-semibold rounded-full hover:bg-gl-mist transition-colors inline-flex items-center justify-center gap-2 shadow-lg shadow-white/10"
            style={{ fontFamily: "var(--font-body)" }}
          >
            Agenda una reunion
            <ArrowRight className="w-5 h-5" />
          </a>
          <a
            href="#servicios"
            className="px-8 py-3.5 border border-white/20 text-white font-semibold rounded-full hover:bg-white/5 transition-colors inline-flex items-center justify-center"
            style={{ fontFamily: "var(--font-body)" }}
          >
            Conoce mas
          </a>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Update Footer.tsx**

```tsx
import { Mail, Phone } from "lucide-react";
import GlobalLogo from "./GlobalLogo";

export default function Footer() {
  return (
    <footer className="bg-gl-ink py-14 px-4">
      <div className="max-w-7xl mx-auto">
        <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-8 mb-10">
          <div>
            <div className="mb-4">
              <GlobalLogo variant="light" className="h-7 w-auto" />
            </div>
            <p className="text-sm text-white/40 leading-relaxed" style={{ fontFamily: "var(--font-body)" }}>
              Asesoria patrimonial integral. Siempre alineados a tus intereses.
            </p>
          </div>
          <div>
            <h4
              className="font-semibold text-white mb-4 text-xs uppercase tracking-[0.15em]"
              style={{ fontFamily: "var(--font-data)" }}
            >
              Servicios
            </h4>
            <ul className="space-y-2.5 text-sm text-white/40" style={{ fontFamily: "var(--font-body)" }}>
              <li>
                <a href="#servicios" className="hover:text-white transition-colors">
                  Global Wealth
                </a>
              </li>
              <li>
                <a href="#servicios" className="hover:text-white transition-colors">
                  Global Planning
                </a>
              </li>
              <li>
                <a href="#servicios" className="hover:text-white transition-colors">
                  Global Properties
                </a>
              </li>
              <li>
                <a href="#servicios" className="hover:text-white transition-colors">
                  Global Insurance
                </a>
              </li>
            </ul>
          </div>
          <div>
            <h4
              className="font-semibold text-white mb-4 text-xs uppercase tracking-[0.15em]"
              style={{ fontFamily: "var(--font-data)" }}
            >
              Contacto
            </h4>
            <ul className="space-y-2.5 text-sm text-white/40" style={{ fontFamily: "var(--font-body)" }}>
              <li className="flex items-center gap-2">
                <Mail className="w-4 h-4" />
                contacto@global.cl
              </li>
              <li className="flex items-center gap-2">
                <Phone className="w-4 h-4" />
                +56 9 0000 0000
              </li>
            </ul>
          </div>
          <div>
            <h4
              className="font-semibold text-white mb-4 text-xs uppercase tracking-[0.15em]"
              style={{ fontFamily: "var(--font-data)" }}
            >
              Legal
            </h4>
            <ul className="space-y-2.5 text-sm text-white/40" style={{ fontFamily: "var(--font-body)" }}>
              <li>Terminos de Uso</li>
              <li>Privacidad</li>
            </ul>
          </div>
        </div>

        {/* Compliance disclaimer */}
        <div className="border-t border-white/10 pt-6 mb-6">
          <p className="text-xs text-white/25 leading-relaxed text-center max-w-3xl mx-auto" style={{ fontFamily: "var(--font-body)" }}>
            La rentabilidad pasada no garantiza rentabilidades futuras. Toda inversion esta sujeta a riesgos.
            Esta pagina no constituye oferta ni recomendacion de inversion. Sociedad registrada y regulada por la CMF.
          </p>
        </div>

        <div className="border-t border-white/10 pt-6 text-center text-sm text-white/30" style={{ fontFamily: "var(--font-body)" }}>
          <p>&copy; 2026 Global Wealth. Todos los derechos reservados.</p>
        </div>
      </div>
    </footer>
  );
}
```

- [ ] **Step 3: Update Navbar.tsx**

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import GlobalLogo from "./GlobalLogo";

export default function Navbar() {
  const [open, setOpen] = useState(false);

  return (
    <nav className="fixed top-0 w-full bg-gl-paper/95 backdrop-blur-sm border-b border-gl-line z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20">
          <Link href="/" className="flex items-center">
            <GlobalLogo className="h-7 w-auto" />
          </Link>

          {/* Desktop */}
          <div className="hidden md:flex items-center gap-8">
            <a
              href="#servicios"
              className="text-sm text-gl-muted hover:text-gl-ink font-medium transition-colors"
              style={{ fontFamily: "var(--font-body)" }}
            >
              Servicios
            </a>
            <a
              href="#nosotros"
              className="text-sm text-gl-muted hover:text-gl-ink font-medium transition-colors"
              style={{ fontFamily: "var(--font-body)" }}
            >
              Nosotros
            </a>
            <a
              href="#proceso"
              className="text-sm text-gl-muted hover:text-gl-ink font-medium transition-colors"
              style={{ fontFamily: "var(--font-body)" }}
            >
              Proceso
            </a>
            <Link
              href="/portal/login"
              className="px-5 py-2.5 text-sm font-medium border border-gl-line rounded-full text-gl-ink hover:bg-gl-mist transition-colors"
              style={{ fontFamily: "var(--font-body)" }}
            >
              Portal Clientes
            </Link>
            <Link
              href="/login"
              className="px-5 py-2.5 text-sm font-medium bg-gl-ink text-white rounded-full hover:bg-gl-deep transition-colors"
              style={{ fontFamily: "var(--font-body)" }}
            >
              Acceso Asesores
            </Link>
          </div>

          {/* Mobile hamburger */}
          <button
            onClick={() => setOpen(!open)}
            className="md:hidden p-2 text-gl-muted hover:text-gl-ink"
            aria-label={open ? "Cerrar menu" : "Abrir menu"}
          >
            {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="md:hidden border-t border-gl-line bg-gl-paper px-6 py-4 space-y-3">
          <a href="#servicios" onClick={() => setOpen(false)} className="block text-sm font-medium text-gl-muted py-2">
            Servicios
          </a>
          <a href="#nosotros" onClick={() => setOpen(false)} className="block text-sm font-medium text-gl-muted py-2">
            Nosotros
          </a>
          <a href="#proceso" onClick={() => setOpen(false)} className="block text-sm font-medium text-gl-muted py-2">
            Proceso
          </a>
          <div className="flex gap-2 pt-2">
            <Link href="/portal/login" className="flex-1 text-center px-4 py-2.5 text-sm font-medium border border-gl-line rounded-full text-gl-ink">
              Clientes
            </Link>
            <Link href="/login" className="flex-1 text-center px-4 py-2.5 text-sm font-medium bg-gl-ink text-white rounded-full">
              Asesores
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
}
```

- [ ] **Step 4: Full visual verification**

Open http://localhost:3000 and scroll through the entire page. Verify the visual rhythm:

1. Navbar — new logo, links work
2. Hero (dark) — new eyebrow, subtitle, institutional line
3. Stats bar (dark navy) — 4 copper numbers
4. Services (white) — 2×2 numbered editorial blocks
5. Differentiators (dark) — 3 columns, copper accents
6. Process (mist) — 4 copper circles with connector
7. CTA (dark) — new copy
8. Footer (dark navy) — new logo, updated tagline

Check mobile view (resize to 375px width):
- All sections stack to single column
- Stats bar becomes 2×2
- Mobile hamburger menu works

- [ ] **Step 5: Run build to catch any TypeScript errors**

```bash
npx tsc --noEmit
```

Expected: 0 errors

- [ ] **Step 6: Commit**

```bash
git add components/landing/CTASection.tsx components/landing/Footer.tsx components/landing/Navbar.tsx
git commit -m "feat(landing): update CTA, footer, navbar with new logo and copy"
```
