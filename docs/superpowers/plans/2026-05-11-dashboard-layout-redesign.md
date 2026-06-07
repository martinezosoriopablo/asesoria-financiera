# Dashboard & Layout Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the advisor platform with a collapsible dark sidebar + top bar layout, fintech-moderna visual identity (Plus Jakarta Sans, teal palette), and a redesigned dashboard with contextual greeting, timeline agenda, and alerts panel.

**Architecture:** New `app/advisor/layout.tsx` wraps all `/advisor/*` routes with `AdvisorSidebar` + `AdvisorTopBar`. Dashboard page is redesigned with new layout zones. Non-advisor routes keep using `AdvisorHeader` unchanged.

**Tech Stack:** Next.js App Router, React 19, Tailwind v4, Lucide icons, Google Fonts (Plus Jakarta Sans)

**Spec:** `docs/superpowers/specs/2026-05-11-dashboard-layout-redesign.md`

---

### Task 1: Update Visual Identity (globals.css + layout.tsx)

**Files:**
- Modify: `app/globals.css`
- Modify: `app/layout.tsx`

- [ ] **Step 1: Update font import in layout.tsx**

Replace Inter with Plus Jakarta Sans:

```tsx
// app/layout.tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Global",
  description: "Tu equipo financiero completo",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 2: Update globals.css with new palette, font, and animations**

```css
/* app/globals.css */
@import "tailwindcss";

:root {
  --background: #F8FAFC;
  --foreground: #0F172A;
  --gb-primary: #0D9488;
  --gb-primary-dark: #0F766E;
  --gb-primary-light: #CCFBF1;
  --gb-sidebar: #0F172A;
  --gb-sidebar-hover: #1E293B;
  --gb-black: #0F172A;
  --gb-dark: #1E293B;
  --gb-gray: #64748B;
  --gb-light: #F1F5F9;
  --gb-border: #E2E8F0;
  --gb-accent: #0D9488;
  --gb-white: #ffffff;
  --gb-success: #059669;
  --gb-warning: #D97706;
  --gb-danger: #DC2626;
  --gb-info: #2563eb;
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-gb-primary: var(--gb-primary);
  --color-gb-primary-dark: var(--gb-primary-dark);
  --color-gb-primary-light: var(--gb-primary-light);
  --color-gb-sidebar: var(--gb-sidebar);
  --color-gb-sidebar-hover: var(--gb-sidebar-hover);
  --color-gb-black: var(--gb-black);
  --color-gb-dark: var(--gb-dark);
  --color-gb-gray: var(--gb-gray);
  --color-gb-light: var(--gb-light);
  --color-gb-border: var(--gb-border);
  --color-gb-accent: var(--gb-accent);
  --color-gb-white: var(--gb-white);
  --color-gb-success: var(--gb-success);
  --color-gb-warning: var(--gb-warning);
  --color-gb-danger: var(--gb-danger);
  --color-gb-info: var(--gb-info);
  --font-sans: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;
  --font-mono: var(--font-geist-mono);
}

body {
  background: var(--background);
  font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;
  color: var(--foreground);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

/* Scrollbar styling */
::-webkit-scrollbar {
  width: 6px;
}
::-webkit-scrollbar-track {
  background: transparent;
}
::-webkit-scrollbar-thumb {
  background: #d1d5db;
  border-radius: 3px;
}
::-webkit-scrollbar-thumb:hover {
  background: #9ca3af;
}

/* Table styling */
table {
  border-collapse: collapse;
}

/* Focus ring */
*:focus-visible {
  outline: 2px solid var(--gb-primary);
  outline-offset: 2px;
}

/* Smooth transitions */
a, button {
  transition: all 0.15s ease;
}

/* Animations */
@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.animate-fade-in-up {
  animation: fadeInUp 0.4s ease-out forwards;
  opacity: 0;
}

@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}

.skeleton {
  background: linear-gradient(90deg, var(--gb-light) 25%, #e2e8f0 50%, var(--gb-light) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
  border-radius: 0.375rem;
}
```

- [ ] **Step 3: Verify dev server renders with new font and colors**

Run: `npm run dev`
Check: Open browser, confirm Plus Jakarta Sans is loading and background is slate-50.

- [ ] **Step 4: Commit**

```bash
git add app/globals.css app/layout.tsx
git commit -m "style: update visual identity — Plus Jakarta Sans font + teal fintech palette"
```

---

### Task 2: Create AdvisorSidebar Component

**Files:**
- Create: `components/shared/AdvisorSidebar.tsx`

- [ ] **Step 1: Create AdvisorSidebar component**

```tsx
// components/shared/AdvisorSidebar.tsx
"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Activity,
  Shield,
  BarChart3,
  TrendingUp,
  Star,
  Calculator,
  GraduationCap,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";

interface AdvisorSidebarProps {
  advisorLogo?: string | null;
  companyName?: string | null;
}

const NAV_ITEMS = [
  { href: "/advisor", label: "Dashboard", icon: LayoutDashboard },
  { href: "/clients", label: "Clientes", icon: Users },
  { href: "/advisor/clients-overview", label: "Vista General", icon: Activity },
  { href: "/analisis-cartola", label: "Cartola & Riesgo", icon: Shield },
  { href: "/portfolio-designer?mode=comparison", label: "Portfolio Designer", icon: BarChart3 },
];

const TOOL_ITEMS = [
  { href: "/fund-center", label: "Centro de Fondos", icon: TrendingUp },
  { href: "/advisor/fondos", label: "Mis Fondos", icon: Star },
  { href: "/calculadora-apv", label: "Calculadora APV", icon: Calculator },
  { href: "/educacion-financiera", label: "Educacion", icon: GraduationCap },
];

export default function AdvisorSidebar({ advisorLogo, companyName }: AdvisorSidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const saved = localStorage.getItem("sidebar-collapsed");
    if (saved === "true") setCollapsed(true);
  }, []);

  const toggleCollapse = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem("sidebar-collapsed", String(next));
  };

  const isActive = (href: string) => {
    if (href === "/advisor") return pathname === "/advisor";
    return pathname?.startsWith(href.split("?")[0]) ?? false;
  };

  const logoSrc = advisorLogo || "/logo-greybark.png";
  const logoAlt = companyName || "Greybark Advisors";

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={`hidden lg:flex flex-col fixed top-0 left-0 h-screen bg-gb-sidebar z-40 transition-all duration-200 ease-in-out ${
          collapsed ? "w-16" : "w-60"
        }`}
      >
        {/* Logo */}
        <div className={`flex items-center h-16 border-b border-white/10 shrink-0 ${collapsed ? "justify-center px-2" : "px-4"}`}>
          <Link href="/advisor" className="flex items-center gap-2 overflow-hidden">
            <div className="bg-white/10 rounded-md p-1.5 shrink-0">
              <img
                src={logoSrc}
                alt={logoAlt}
                className={`${collapsed ? "h-7 w-7 object-contain" : "h-8 max-w-[140px] object-contain"}`}
              />
            </div>
            {!collapsed && (
              <span className="text-sm font-semibold text-white truncate">
                {companyName || "Greybark"}
              </span>
            )}
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-1">
          <p className={`text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2 ${collapsed ? "text-center" : "px-3"}`}>
            {collapsed ? "—" : "Principal"}
          </p>
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                title={collapsed ? item.label : undefined}
                className={`flex items-center gap-3 rounded-lg transition-colors relative group ${
                  collapsed ? "justify-center px-2 py-2.5" : "px-3 py-2.5"
                } ${
                  active
                    ? "bg-gb-primary/20 text-white before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2 before:w-[3px] before:h-5 before:bg-gb-primary before:rounded-r-full"
                    : "text-slate-400 hover:text-slate-200 hover:bg-gb-sidebar-hover"
                }`}
              >
                <Icon className="w-[18px] h-[18px] shrink-0" />
                {!collapsed && (
                  <span className="text-sm font-medium truncate">{item.label}</span>
                )}
                {/* Tooltip when collapsed */}
                {collapsed && (
                  <div className="absolute left-full ml-2 px-2.5 py-1.5 bg-gb-dark text-white text-xs font-medium rounded-md whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50 shadow-lg">
                    {item.label}
                  </div>
                )}
              </Link>
            );
          })}

          <div className="pt-4">
            <p className={`text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2 ${collapsed ? "text-center" : "px-3"}`}>
              {collapsed ? "—" : "Herramientas"}
            </p>
            {TOOL_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={collapsed ? item.label : undefined}
                  className={`flex items-center gap-3 rounded-lg transition-colors relative group ${
                    collapsed ? "justify-center px-2 py-2.5" : "px-3 py-2.5"
                  } ${
                    active
                      ? "bg-gb-primary/20 text-white before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2 before:w-[3px] before:h-5 before:bg-gb-primary before:rounded-r-full"
                      : "text-slate-400 hover:text-slate-200 hover:bg-gb-sidebar-hover"
                  }`}
                >
                  <Icon className="w-[18px] h-[18px] shrink-0" />
                  {!collapsed && (
                    <span className="text-sm font-medium truncate">{item.label}</span>
                  )}
                  {collapsed && (
                    <div className="absolute left-full ml-2 px-2.5 py-1.5 bg-gb-dark text-white text-xs font-medium rounded-md whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50 shadow-lg">
                      {item.label}
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
        </nav>

        {/* Collapse toggle */}
        <div className="border-t border-white/10 p-2">
          <button
            onClick={toggleCollapse}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-gb-sidebar-hover transition-colors"
          >
            {collapsed ? (
              <ChevronsRight className="w-4 h-4" />
            ) : (
              <>
                <ChevronsLeft className="w-4 h-4" />
                <span className="text-xs font-medium">Colapsar</span>
              </>
            )}
          </button>
        </div>
      </aside>
    </>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/shared/AdvisorSidebar.tsx
git commit -m "feat: create AdvisorSidebar component with dark theme + collapsible"
```

---

### Task 3: Create AdvisorTopBar Component

**Files:**
- Create: `components/shared/AdvisorTopBar.tsx`

- [ ] **Step 1: Create AdvisorTopBar component**

```tsx
// components/shared/AdvisorTopBar.tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Menu,
  User,
  LogOut,
  Settings,
  RefreshCw,
  ArrowRightLeft,
  ChevronDown,
} from "lucide-react";
import NotificationBell from "./NotificationBell";

interface AdvisorTopBarProps {
  advisorName: string;
  advisorEmail: string;
  advisorPhoto?: string;
  isAdmin?: boolean;
  hasClientRole?: boolean;
  onMobileMenuToggle: () => void;
}

export default function AdvisorTopBar({
  advisorName,
  advisorEmail,
  advisorPhoto,
  isAdmin = false,
  hasClientRole = false,
  onMobileMenuToggle,
}: AdvisorTopBarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [switching, setSwitching] = useState(false);

  const handleLogout = async () => {
    const { createSupabaseBrowserClient } = await import("@/lib/supabase/client");
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  const handleSwitchToClient = async () => {
    setSwitching(true);
    try {
      const res = await fetch("/api/auth/switch-role", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "client" }),
      });
      const data = await res.json();
      if (data.success) {
        window.location.href = data.redirectTo || "/portal/dashboard";
      }
    } catch {
      setSwitching(false);
    }
  };

  const initials = advisorName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <header className="h-16 bg-white border-b border-gb-border flex items-center justify-between px-5 sticky top-0 z-30">
      {/* Left: mobile hamburger */}
      <div className="flex items-center gap-3">
        <button
          onClick={onMobileMenuToggle}
          className="lg:hidden p-2 rounded-md hover:bg-gb-light transition-colors"
          aria-label="Menu"
        >
          <Menu className="w-5 h-5 text-gb-gray" />
        </button>
      </div>

      {/* Right: notifications + user */}
      <div className="flex items-center gap-2">
        <NotificationBell />

        <div className="relative">
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-gb-light transition-colors"
          >
            {advisorPhoto ? (
              <img
                src={advisorPhoto}
                alt={advisorName}
                className="w-8 h-8 rounded-full object-cover ring-2 ring-gb-border"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-gb-primary text-white flex items-center justify-center text-xs font-semibold">
                {initials}
              </div>
            )}
            <div className="text-right hidden md:block">
              <div className="text-sm font-medium text-gb-black leading-tight">
                {advisorName}
              </div>
              <div className="text-[11px] text-gb-gray leading-tight">
                {advisorEmail}
              </div>
            </div>
            <ChevronDown className={`w-3.5 h-3.5 text-gb-gray hidden md:block transition-transform ${menuOpen ? "rotate-180" : ""}`} />
          </button>

          {menuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-full mt-1 bg-white rounded-lg shadow-lg border border-gb-border py-1 w-52 z-50">
                <Link
                  href="/advisor/profile"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-gb-gray hover:text-gb-black hover:bg-gb-light transition-colors"
                >
                  <User className="w-4 h-4" />
                  Mi Perfil
                </Link>
                {isAdmin && (
                  <>
                    <Link
                      href="/admin/advisors"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-gb-gray hover:text-gb-black hover:bg-gb-light transition-colors"
                    >
                      <Settings className="w-4 h-4" />
                      Gestion Asesores
                    </Link>
                    <Link
                      href="/admin/data-sync"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-gb-gray hover:text-gb-black hover:bg-gb-light transition-colors"
                    >
                      <RefreshCw className="w-4 h-4" />
                      Sincronizacion de Datos
                    </Link>
                  </>
                )}
                {hasClientRole && (
                  <>
                    <hr className="my-1 border-gb-border" />
                    <button
                      onClick={handleSwitchToClient}
                      disabled={switching}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gb-gray hover:text-gb-black hover:bg-gb-light disabled:opacity-50 transition-colors"
                    >
                      <ArrowRightLeft className="w-4 h-4" />
                      {switching ? "Cambiando..." : "Ir a mi Portal"}
                    </button>
                  </>
                )}
                <hr className="my-1 border-gb-border" />
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  Cerrar Sesion
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/shared/AdvisorTopBar.tsx
git commit -m "feat: create AdvisorTopBar component with user menu + notifications"
```

---

### Task 4: Create Advisor Layout Shell

**Files:**
- Create: `app/advisor/layout.tsx`

- [ ] **Step 1: Create the advisor layout with sidebar + topbar + mobile overlay**

```tsx
// app/advisor/layout.tsx
"use client";

import { useState } from "react";
import { useAdvisor } from "@/lib/hooks/useAdvisor";
import AdvisorSidebar from "@/components/shared/AdvisorSidebar";
import AdvisorTopBar from "@/components/shared/AdvisorTopBar";
import {
  LayoutDashboard,
  Users,
  Activity,
  Shield,
  BarChart3,
  TrendingUp,
  Star,
  Calculator,
  GraduationCap,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Loader } from "lucide-react";

const MOBILE_NAV = [
  { href: "/advisor", label: "Dashboard", icon: LayoutDashboard },
  { href: "/clients", label: "Clientes", icon: Users },
  { href: "/advisor/clients-overview", label: "Vista General", icon: Activity },
  { href: "/analisis-cartola", label: "Cartola & Riesgo", icon: Shield },
  { href: "/portfolio-designer?mode=comparison", label: "Portfolio Designer", icon: BarChart3 },
];

const MOBILE_TOOLS = [
  { href: "/fund-center", label: "Centro de Fondos", icon: TrendingUp },
  { href: "/advisor/fondos", label: "Mis Fondos", icon: Star },
  { href: "/calculadora-apv", label: "Calculadora APV", icon: Calculator },
  { href: "/educacion-financiera", label: "Educacion", icon: GraduationCap },
];

export default function AdvisorLayout({ children }: { children: React.ReactNode }) {
  const { advisor, loading } = useAdvisor();
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader className="w-8 h-8 text-gb-primary animate-spin" />
      </div>
    );
  }

  if (!advisor) return null;

  const isActive = (href: string) => {
    if (href === "/advisor") return pathname === "/advisor";
    return pathname?.startsWith(href.split("?")[0]) ?? false;
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Sidebar (desktop) */}
      <AdvisorSidebar
        advisorLogo={advisor.logo}
        companyName={advisor.companyName}
      />

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <div className="absolute left-0 top-0 bottom-0 w-72 bg-gb-sidebar overflow-y-auto">
            <div className="flex items-center justify-between h-16 px-4 border-b border-white/10">
              <div className="flex items-center gap-2">
                <div className="bg-white/10 rounded-md p-1.5">
                  <img
                    src={advisor.logo || "/logo-greybark.png"}
                    alt={advisor.companyName || "Greybark"}
                    className="h-7 object-contain"
                  />
                </div>
                <span className="text-sm font-semibold text-white truncate">
                  {advisor.companyName || "Greybark"}
                </span>
              </div>
              <button onClick={() => setMobileOpen(false)} className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-white/10">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Mobile user info */}
            <div className="flex items-center gap-3 px-4 py-4 border-b border-white/10">
              {advisor.photo ? (
                <img src={advisor.photo} alt={advisor.name} className="w-9 h-9 rounded-full object-cover" />
              ) : (
                <div className="w-9 h-9 rounded-full bg-gb-primary text-white flex items-center justify-center text-xs font-semibold">
                  {advisor.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)}
                </div>
              )}
              <div className="min-w-0">
                <div className="text-sm font-medium text-white truncate">{advisor.name}</div>
                <div className="text-xs text-slate-400 truncate">{advisor.email}</div>
              </div>
            </div>

            <nav className="py-4 px-2 space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 px-3 mb-2">Principal</p>
              {MOBILE_NAV.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                      active
                        ? "bg-gb-primary/20 text-white"
                        : "text-slate-400 hover:text-slate-200 hover:bg-gb-sidebar-hover"
                    }`}
                  >
                    <Icon className="w-[18px] h-[18px]" />
                    {item.label}
                  </Link>
                );
              })}

              <div className="pt-4">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 px-3 mb-2">Herramientas</p>
                {MOBILE_TOOLS.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMobileOpen(false)}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                        active
                          ? "bg-gb-primary/20 text-white"
                          : "text-slate-400 hover:text-slate-200 hover:bg-gb-sidebar-hover"
                      }`}
                    >
                      <Icon className="w-[18px] h-[18px]" />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </nav>
          </div>
        </div>
      )}

      {/* Main content area — offset by sidebar width */}
      <div className="lg:pl-60 min-h-screen flex flex-col transition-all duration-200">
        <AdvisorTopBar
          advisorName={advisor.name}
          advisorEmail={advisor.email}
          advisorPhoto={advisor.photo}
          isAdmin={advisor.isAdmin}
          hasClientRole={advisor.hasClientRole}
          onMobileMenuToggle={() => setMobileOpen(true)}
        />
        <main className="flex-1">
          {children}
        </main>
      </div>
    </div>
  );
}
```

**Note:** The `lg:pl-60` matches the sidebar's `w-60`. When the sidebar is collapsed (`w-16`), we need to sync the padding. This will be handled by lifting the collapse state: for now, the sidebar defaults to expanded and the layout uses `lg:pl-60`. A follow-up enhancement can sync collapse state via context. For MVP, the default expanded state works.

- [ ] **Step 2: Verify the layout renders by visiting /advisor in the browser**

Run: `npm run dev`
Check: Visit `/advisor` — sidebar should appear on the left, topbar at top, dashboard content in the main area.

- [ ] **Step 3: Commit**

```bash
git add app/advisor/layout.tsx
git commit -m "feat: create advisor layout shell with sidebar + topbar"
```

---

### Task 5: Remove AdvisorHeader from Advisor Sub-pages

**Files:**
- Modify: `app/advisor/page.tsx` (remove AdvisorHeader import + usage)
- Modify: `app/advisor/profile/page.tsx` (remove AdvisorHeader import + usage)
- Modify: `app/advisor/fondos/page.tsx` (remove AdvisorHeader import + usage)
- Modify: `app/advisor/fichas-review/page.tsx` (remove AdvisorHeader import + usage)
- Modify: `app/advisor/clients-overview/page.tsx` (remove AdvisorHeader import + usage)

Since the layout now provides navigation, each advisor sub-page no longer needs to import and render `<AdvisorHeader>`. This task removes the import and the wrapping `<AdvisorHeader>` component from each page, keeping the rest of the page content intact.

- [ ] **Step 1: In each file listed above, remove the AdvisorHeader import and its JSX usage**

For each file:
1. Remove the line `import AdvisorHeader from "@/components/shared/AdvisorHeader";`
2. Remove the `<AdvisorHeader ... />` JSX element
3. Remove the outer `<div className="min-h-screen bg-background">` wrapper if it exists (the layout provides this)
4. Keep all other content and logic intact
5. If the page uses `useAdvisor()` only for passing props to AdvisorHeader, keep `useAdvisor()` if it's also used for other things (like `advisor.name` in the greeting), otherwise remove it

**Important:** Do NOT remove `useAdvisor()` from `app/advisor/page.tsx` — it's used for the greeting and fetching data. Only remove AdvisorHeader-related code.

- [ ] **Step 2: Verify no duplicate headers appear**

Run: `npm run dev`
Check: Navigate to `/advisor`, `/advisor/profile`, `/advisor/fondos` — only sidebar+topbar should show, no old header.

- [ ] **Step 3: Commit**

```bash
git add app/advisor/page.tsx app/advisor/profile/page.tsx app/advisor/fondos/page.tsx app/advisor/fichas-review/page.tsx app/advisor/clients-overview/page.tsx
git commit -m "refactor: remove AdvisorHeader from advisor sub-pages (layout provides nav)"
```

---

### Task 6: Redesign Dashboard Content (advisor/page.tsx)

**Files:**
- Modify: `app/advisor/page.tsx`

- [ ] **Step 1: Rewrite the dashboard page with new layout zones**

Replace the entire content of `app/advisor/page.tsx` with:

```tsx
// app/advisor/page.tsx
"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useAdvisor } from "@/lib/hooks/useAdvisor";
import WeeklyCalendar from "@/components/dashboard/WeeklyCalendar";
import NewMeetingForm from "@/components/dashboard/NewMeetingForm";
import GoogleCalendarConnect from "@/components/dashboard/GoogleCalendarConnect";
import ComiteReportsPanel from "@/components/comite/ComiteReportsPanel";
import {
  Users,
  UserCheck,
  UserPlus,
  DollarSign,
  Calendar,
  Plus,
  Shield,
  Briefcase,
  BarChart3,
  ArrowRight,
  Clock,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  FileWarning,
  Video,
  Phone,
  MapPin,
  User,
  Edit3,
  Trash2,
  Loader,
} from "lucide-react";

interface Stats {
  total_clientes: number;
  clientes_activos: number;
  prospectos: number;
  aum_total: number;
  reuniones_pendientes: number;
  reuniones_esta_semana: number;
}

interface Meeting {
  id: string;
  titulo: string;
  fecha: string;
  duracion_minutos?: number;
  tipo: string;
  ubicacion?: string;
  descripcion?: string;
  client_id?: string;
  google_event_id?: string;
  clients?: { nombre: string; apellido: string };
  client?: { nombre: string; apellido: string };
}

const FLOW_STEPS = [
  { href: "/clients", icon: Users, title: "Clientes" },
  { href: "/analisis-cartola", icon: Shield, title: "Riesgo & Cartola" },
  { href: "/portfolio-designer?mode=comparison", icon: BarChart3, title: "Comparacion" },
  { href: "/portfolio-designer?mode=model", icon: Briefcase, title: "Modelo" },
];

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Buenos dias";
  if (hour < 20) return "Buenas tardes";
  return "Buenas noches";
}

function formatDate(): string {
  return new Date().toLocaleDateString("es-CL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    minimumFractionDigits: 0,
  }).format(amount);
}

function getTypeIcon(tipo: string) {
  switch (tipo?.toLowerCase()) {
    case "virtual": return <Video className="w-3.5 h-3.5" />;
    case "llamada": return <Phone className="w-3.5 h-3.5" />;
    default: return <MapPin className="w-3.5 h-3.5" />;
  }
}

function getTypeBadgeClass(tipo: string): string {
  switch (tipo?.toLowerCase()) {
    case "virtual": return "bg-blue-100 text-blue-700";
    case "llamada": return "bg-emerald-100 text-emerald-700";
    default: return "bg-purple-100 text-purple-700";
  }
}

function getClientName(meeting: Meeting): string {
  const client = meeting.clients || meeting.client;
  if (!client) return "Cliente";
  return `${client.nombre || ""} ${client.apellido || ""}`.trim() || "Cliente";
}

function formatTime(dateString: string): string {
  try {
    return new Date(dateString).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "--:--";
  }
}

// Skeleton components
function StatsSkeleton() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="bg-white rounded-xl border border-gb-border p-5">
          <div className="skeleton h-3 w-20 mb-3" />
          <div className="skeleton h-7 w-16" />
        </div>
      ))}
    </div>
  );
}

function AgendaSkeleton() {
  return (
    <div className="space-y-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex gap-4 items-start">
          <div className="skeleton h-4 w-12" />
          <div className="flex-1 skeleton h-16 rounded-xl" />
        </div>
      ))}
    </div>
  );
}

export default function AdvisorDashboard() {
  const { advisor, loading: authLoading } = useAdvisor();
  const [stats, setStats] = useState<Stats | null>(null);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewMeeting, setShowNewMeeting] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [editingMeeting, setEditingMeeting] = useState<any>(null);
  const [showWeekView, setShowWeekView] = useState(false);

  useEffect(() => {
    if (advisor) fetchData();
  }, [advisor]);

  if (authLoading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader className="w-8 h-8 text-gb-primary animate-spin" />
      </div>
    );
  }

  if (!advisor) return null;

  const fetchData = async () => {
    try {
      const [statsRes, meetingsRes] = await Promise.all([
        fetch("/api/advisor/stats"),
        fetch("/api/advisor/meetings?timeframe=week"),
      ]);
      const statsData = await statsRes.json();
      const meetingsData = await meetingsRes.json();
      if (statsData.success) setStats(statsData.stats);
      if (meetingsData.success) setMeetings(meetingsData.meetings);
    } catch {
      // Error silencioso
    } finally {
      setLoading(false);
    }
  };

  const todayMeetings = meetings.filter((m) => {
    const d = new Date(m.fecha);
    const today = new Date();
    return d.getDate() === today.getDate() && d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
  });

  const handleDeleteMeeting = async (meeting: Meeting) => {
    if (!confirm(`Cancelar reunion "${meeting.titulo}"?`)) return;
    try {
      const res = await fetch(`/api/advisor/meetings?id=${meeting.id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) fetchData();
    } catch { /* silencioso */ }
  };

  const STAT_CARDS = [
    { label: "Total Clientes", value: stats?.total_clientes ?? 0, icon: Users, highlight: false },
    { label: "Activos", value: stats?.clientes_activos ?? 0, icon: UserCheck, highlight: false },
    { label: "Prospectos", value: stats?.prospectos ?? 0, icon: UserPlus, highlight: false },
    { label: "AUM Total", value: formatCurrency(stats?.aum_total ?? 0), icon: DollarSign, highlight: true },
  ];

  return (
    <div className="max-w-6xl mx-auto px-5 py-8">
      {/* Greeting */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gb-black">
          {getGreeting()}, {advisor.name.split(" ")[0]}
        </h1>
        <p className="text-sm text-gb-gray capitalize mt-0.5">{formatDate()}</p>
      </div>

      {/* Stats */}
      {loading ? (
        <StatsSkeleton />
      ) : stats ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {STAT_CARDS.map((s, i) => {
            const Icon = s.icon;
            return (
              <div
                key={s.label}
                className={`rounded-xl border p-5 transition-all hover:-translate-y-0.5 hover:shadow-md animate-fade-in-up ${
                  s.highlight
                    ? "bg-gb-primary text-white border-gb-primary-dark"
                    : "bg-white border-gb-border"
                }`}
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <div className="flex items-center justify-between mb-3">
                  <span className={`text-xs font-semibold uppercase tracking-wide ${s.highlight ? "text-white/70" : "text-gb-gray"}`}>
                    {s.label}
                  </span>
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${s.highlight ? "bg-white/20" : "bg-gb-primary-light"}`}>
                    <Icon className={`w-4 h-4 ${s.highlight ? "text-white" : "text-gb-primary"}`} />
                  </div>
                </div>
                <p className={`text-2xl font-bold ${s.highlight ? "text-white" : "text-gb-black"}`}>
                  {s.value}
                </p>
              </div>
            );
          })}
        </div>
      ) : null}

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Agenda */}
        <div className="lg:col-span-2 space-y-4">
          {/* Today's agenda */}
          <div className="bg-white rounded-xl border border-gb-border p-5">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold text-gb-black flex items-center gap-2">
                <Calendar className="w-4 h-4 text-gb-primary" />
                Agenda de Hoy
                {!loading && (
                  <span className="text-xs font-normal text-gb-gray ml-1">
                    ({todayMeetings.length} reunion{todayMeetings.length !== 1 ? "es" : ""})
                  </span>
                )}
              </h2>
              <button
                onClick={() => setShowNewMeeting(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-gb-primary text-white rounded-lg hover:bg-gb-primary-dark transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Nueva Reunion
              </button>
            </div>

            {loading ? (
              <AgendaSkeleton />
            ) : todayMeetings.length > 0 ? (
              <div className="space-y-3">
                {todayMeetings
                  .sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime())
                  .map((meeting) => (
                    <div
                      key={meeting.id}
                      className="flex gap-4 items-start group"
                    >
                      {/* Time */}
                      <div className="text-sm font-semibold text-gb-gray w-12 pt-3 text-right shrink-0">
                        {formatTime(meeting.fecha)}
                      </div>
                      {/* Timeline dot + line */}
                      <div className="flex flex-col items-center pt-3 shrink-0">
                        <div className="w-2.5 h-2.5 rounded-full bg-gb-primary ring-4 ring-gb-primary-light" />
                        <div className="w-0.5 flex-1 bg-gb-border mt-1" />
                      </div>
                      {/* Card */}
                      <div className="flex-1 bg-gb-light/50 border border-gb-border rounded-xl p-4 hover:border-gb-primary/30 transition-colors relative">
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <User className="w-3.5 h-3.5 text-gb-gray" />
                              <span className="text-sm font-semibold text-gb-black">
                                {getClientName(meeting)}
                              </span>
                            </div>
                            <p className="text-xs text-gb-gray mb-2">{meeting.titulo || "Reunion"}</p>
                            <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full ${getTypeBadgeClass(meeting.tipo)}`}>
                              {getTypeIcon(meeting.tipo)}
                              {meeting.tipo || "Presencial"}
                            </span>
                          </div>
                          {/* Actions */}
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => { setEditingMeeting(meeting); setShowNewMeeting(true); }}
                              className="p-1.5 rounded-md hover:bg-white transition-colors"
                              title="Editar"
                            >
                              <Edit3 className="w-3.5 h-3.5 text-gb-gray" />
                            </button>
                            <button
                              onClick={() => handleDeleteMeeting(meeting)}
                              className="p-1.5 rounded-md hover:bg-red-50 transition-colors"
                              title="Eliminar"
                            >
                              <Trash2 className="w-3.5 h-3.5 text-red-500" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <Calendar className="w-8 h-8 text-gb-border mx-auto mb-2" />
                <p className="text-sm text-gb-gray">Sin reuniones hoy</p>
              </div>
            )}

            {/* Week view toggle */}
            <button
              onClick={() => setShowWeekView(!showWeekView)}
              className="flex items-center gap-1.5 mt-4 pt-4 border-t border-gb-border text-sm font-medium text-gb-primary hover:text-gb-primary-dark transition-colors w-full justify-center"
            >
              {showWeekView ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              {showWeekView ? "Ocultar semana" : "Ver semana completa"}
            </button>

            {showWeekView && (
              <div className="mt-4 pt-4 border-t border-gb-border">
                <WeeklyCalendar
                  meetings={meetings}
                  onEdit={(meeting) => { setEditingMeeting(meeting); setShowNewMeeting(true); }}
                  onDelete={handleDeleteMeeting}
                />
              </div>
            )}
          </div>

          {showNewMeeting && (
            <NewMeetingForm
              onClose={() => { setShowNewMeeting(false); setEditingMeeting(null); }}
              onSuccess={() => fetchData()}
              editMeeting={editingMeeting}
            />
          )}

          <GoogleCalendarConnect />
        </div>

        {/* Right: Alerts + Flow + Comite */}
        <div className="space-y-4">
          {/* Alerts & Pendientes */}
          {stats && (stats.reuniones_pendientes > 0) && (
            <div className="bg-white rounded-xl border border-gb-border p-5 animate-fade-in-up" style={{ animationDelay: "200ms" }}>
              <h2 className="text-base font-semibold text-gb-black mb-3 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-gb-warning" />
                Pendientes
              </h2>
              <div className="space-y-2">
                {stats.reuniones_pendientes > 0 && (
                  <div className="flex items-center gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <Clock className="w-4 h-4 text-amber-600 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-amber-800">
                        {stats.reuniones_pendientes} reunion(es) pendiente(s)
                      </p>
                      <p className="text-xs text-amber-600">Esta semana</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Flujo de Asesoria */}
          <div className="bg-white rounded-xl border border-gb-border p-5 animate-fade-in-up" style={{ animationDelay: "250ms" }}>
            <h2 className="text-sm font-semibold text-gb-black mb-4">Flujo de Asesoria</h2>
            <div className="flex items-center justify-between relative">
              {/* Connecting line */}
              <div className="absolute top-4 left-6 right-6 h-0.5 bg-gb-border" />

              {FLOW_STEPS.map((step, i) => {
                const Icon = step.icon;
                return (
                  <Link
                    key={step.href}
                    href={step.href}
                    className="relative flex flex-col items-center gap-1.5 group z-10"
                  >
                    <div className="w-8 h-8 rounded-full bg-gb-primary text-white flex items-center justify-center text-xs font-bold shadow-sm group-hover:scale-110 transition-transform">
                      {i + 1}
                    </div>
                    <span className="text-[10px] font-medium text-gb-gray group-hover:text-gb-primary text-center leading-tight max-w-[60px] transition-colors">
                      {step.title}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>

          {/* Comite Reports */}
          <div className="animate-fade-in-up" style={{ animationDelay: "300ms" }}>
            <ComiteReportsPanel />
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify dashboard renders correctly**

Run: `npm run dev`
Check: Visit `/advisor` — should show contextual greeting, teal AUM card, today's timeline, flow stepper, alerts panel.

- [ ] **Step 3: Commit**

```bash
git add app/advisor/page.tsx
git commit -m "feat: redesign advisor dashboard with timeline agenda, teal stats, flow stepper"
```

---

### Task 7: Update WeeklyCalendar Theme

**Files:**
- Modify: `components/dashboard/WeeklyCalendar.tsx`

- [ ] **Step 1: Update colors to match new theme**

Replace hardcoded Tailwind colors (`slate-*`, `blue-*`) with theme tokens:

In `WeeklyCalendar.tsx`, update the following class mappings:

1. Today column: `border-blue-500 bg-blue-50` → `border-gb-primary bg-gb-primary-light/30`
2. Non-today column: `border-slate-200 bg-slate-50` → `border-gb-border bg-gb-light/50`
3. Day header border: `border-slate-200` → `border-gb-border`
4. Day header text: `text-slate-500` → `text-gb-gray`
5. Today number: `text-blue-600` → `text-gb-primary`
6. Non-today number: `text-slate-900` → `text-gb-black`
7. Month text: `text-slate-500` → `text-gb-gray`
8. Empty day text: `text-slate-400` → `text-gb-gray`
9. Legend border colors: keep type-specific colors (purple, blue, green) as-is — they're semantic
10. Legend text: `text-slate-600` → `text-gb-gray`
11. Bottom border: `border-slate-200` → `border-gb-border`
12. Edit button hover: `text-slate-600` → `text-gb-gray`

- [ ] **Step 2: Verify calendar still renders correctly inside the expandable section**

Run: `npm run dev`
Check: On `/advisor`, click "Ver semana completa" — calendar should use teal for today, consistent grays.

- [ ] **Step 3: Commit**

```bash
git add components/dashboard/WeeklyCalendar.tsx
git commit -m "style: update WeeklyCalendar to use theme colors"
```

---

### Task 8: Update GoogleCalendarConnect Theme

**Files:**
- Modify: `components/dashboard/GoogleCalendarConnect.tsx`

- [ ] **Step 1: Update colors to match new theme**

Replace hardcoded colors:

1. Connected state: `bg-emerald-50 border-emerald-200` → `bg-gb-primary-light/50 border-gb-primary/20`
2. Connected icon bg: `bg-emerald-100` → `bg-gb-primary-light`
3. Connected icon color: `text-emerald-600` → `text-gb-primary`
4. Connected text: `text-emerald-800` → `text-gb-black`
5. Connected subtitle: `text-emerald-600` → `text-gb-primary`
6. Check icon: `text-emerald-600` → `text-gb-primary`
7. Not connected state: keep `bg-blue-50 border-blue-200` (it's a CTA, blue is appropriate for Google branding)
8. Error state: keep red colors (semantic)

- [ ] **Step 2: Commit**

```bash
git add components/dashboard/GoogleCalendarConnect.tsx
git commit -m "style: update GoogleCalendarConnect to use theme colors"
```

---

### Task 9: Handle Sidebar Collapse State Sync

**Files:**
- Modify: `app/advisor/layout.tsx`
- Modify: `components/shared/AdvisorSidebar.tsx`

The sidebar collapse needs to sync with the layout's padding. Lift the collapse state to the layout.

- [ ] **Step 1: Add `collapsed` and `onToggleCollapse` props to AdvisorSidebar**

In `components/shared/AdvisorSidebar.tsx`:
- Remove the internal `collapsed` state and `useEffect` for localStorage
- Add props: `collapsed: boolean` and `onToggleCollapse: () => void`
- Use props instead of internal state

Replace the component signature and state:

```tsx
interface AdvisorSidebarProps {
  advisorLogo?: string | null;
  companyName?: string | null;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export default function AdvisorSidebar({ advisorLogo, companyName, collapsed, onToggleCollapse }: AdvisorSidebarProps) {
  const pathname = usePathname();
  // ... remove useState and useEffect for collapsed
  // replace toggleCollapse() calls with onToggleCollapse()
```

- [ ] **Step 2: Manage collapse state in the layout**

In `app/advisor/layout.tsx`:
- Add `collapsed` state with localStorage init
- Pass `collapsed` and `onToggleCollapse` to AdvisorSidebar
- Use dynamic padding: `lg:pl-60` when expanded, `lg:pl-16` when collapsed

Add after existing state:

```tsx
const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

useEffect(() => {
  const saved = localStorage.getItem("sidebar-collapsed");
  if (saved === "true") setSidebarCollapsed(true);
}, []);

const toggleSidebar = () => {
  const next = !sidebarCollapsed;
  setSidebarCollapsed(next);
  localStorage.setItem("sidebar-collapsed", String(next));
};
```

Update the main div className:

```tsx
<div className={`${sidebarCollapsed ? "lg:pl-16" : "lg:pl-60"} min-h-screen flex flex-col transition-all duration-200`}>
```

Update AdvisorSidebar usage:

```tsx
<AdvisorSidebar
  advisorLogo={advisor.logo}
  companyName={advisor.companyName}
  collapsed={sidebarCollapsed}
  onToggleCollapse={toggleSidebar}
/>
```

- [ ] **Step 3: Verify collapse works end-to-end**

Run: `npm run dev`
Check: Click collapse button in sidebar — sidebar shrinks to 64px, content area expands, tooltips appear on hover. Refresh page — state persists.

- [ ] **Step 4: Commit**

```bash
git add components/shared/AdvisorSidebar.tsx app/advisor/layout.tsx
git commit -m "feat: sync sidebar collapse state between layout and sidebar"
```

---

### Task 10: Verify Build + Final Review

**Files:** None (verification only)

- [ ] **Step 1: Run lint**

Run: `npm run lint`
Expected: No errors related to changed files.

- [ ] **Step 2: Run build**

Run: `npm run build`
Expected: Build succeeds with no type errors.

- [ ] **Step 3: Manual verification checklist**

Run: `npm run dev`
Check each item:
- [ ] `/advisor` loads with sidebar + topbar + redesigned dashboard
- [ ] Sidebar collapse/expand works, persists on refresh
- [ ] Mobile: hamburger opens overlay sidebar
- [ ] Stats cards animate in with stagger
- [ ] AUM card has teal background
- [ ] Greeting shows time-contextual message
- [ ] Today's agenda shows timeline with meetings
- [ ] "Ver semana completa" toggles weekly calendar
- [ ] "Nueva Reunion" opens form
- [ ] Flow stepper navigates correctly
- [ ] `/advisor/profile` shows content without duplicate header
- [ ] `/advisor/fondos` shows content without duplicate header
- [ ] Other non-advisor pages (e.g., `/fund-center`) still use AdvisorHeader normally
- [ ] Plus Jakarta Sans font renders everywhere

- [ ] **Step 4: Final commit if any cleanup needed**

```bash
git add -A
git commit -m "chore: final cleanup after dashboard + layout redesign"
```
