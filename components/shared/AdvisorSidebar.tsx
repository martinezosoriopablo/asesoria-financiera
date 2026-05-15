// components/shared/AdvisorSidebar.tsx
"use client";

import { useState } from "react";
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
  User,
  LogOut,
  Settings,
  RefreshCw,
  ArrowRightLeft,
  FileText,
  LineChart,
  Scale,
} from "lucide-react";
import NotificationBell from "./NotificationBell";

interface AdvisorSidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  advisorName?: string;
  advisorEmail?: string;
  advisorPhoto?: string;
  isAdmin?: boolean;
  hasClientRole?: boolean;
}

const NAV_ITEMS = [
  { href: "/advisor", label: "Dashboard", icon: LayoutDashboard },
  { href: "/clients", label: "Clientes", icon: Users },
  { href: "/advisor/clients-overview", label: "Vista General", icon: Activity },
  { href: "/analisis-cartola", label: "Cartola & Riesgo", icon: Shield },
  { href: "/seguimiento", label: "Seguimiento", icon: LineChart },
  { href: "/portfolio-designer?mode=comparison", label: "Portfolio Designer", icon: BarChart3 },
];

const TOOL_ITEMS = [
  { href: "/fund-center", label: "Centro de Fondos", icon: TrendingUp },
  { href: "/advisor/fondos", label: "Mis Fondos", icon: Star },
  { href: "/advisor/fichas-review", label: "Fichas CMF", icon: FileText },
  { href: "/calculadora-apv", label: "Calculadora APV", icon: Calculator },
  { href: "/tax-optimizer", label: "Simulador Tributario", icon: Scale },
  { href: "/educacion-financiera", label: "Educacion", icon: GraduationCap },
];

export default function AdvisorSidebar({
  collapsed,
  onToggleCollapse,
  advisorName = "",
  advisorEmail = "",
  advisorPhoto,
  isAdmin = false,
  hasClientRole = false,
}: AdvisorSidebarProps) {
  const pathname = usePathname();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [switching, setSwitching] = useState(false);

  const isActive = (href: string) => {
    if (href === "/advisor") return pathname === "/advisor";
    return pathname?.startsWith(href.split("?")[0]) ?? false;
  };

  const initials = advisorName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

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

  return (
    <aside
      className={`flex flex-col fixed top-0 left-0 h-screen bg-gb-sidebar z-40 transition-all duration-200 ease-in-out ${
        collapsed ? "w-16" : "w-60"
      }`}
    >
      {/* Logo + Advisor */}
      <div className={`border-b border-white/10 shrink-0 ${collapsed ? "px-2 py-4" : "px-5 py-4"}`}>
        <Link href="/advisor" className="flex items-center gap-3 overflow-hidden">
          {!collapsed ? (
            <span className="text-lg text-white tracking-wide" style={{ fontFamily: "'Archivo Black', sans-serif" }}>
              GLOBAL
            </span>
          ) : (
            <span className="text-lg text-white" style={{ fontFamily: "'Archivo Black', sans-serif" }}>
              G
            </span>
          )}
        </Link>
        {!collapsed && advisorName && (
          <div className="mt-3 flex items-center gap-2.5">
            {advisorPhoto ? (
              <img
                src={advisorPhoto}
                alt={advisorName}
                className="w-8 h-8 rounded-full object-cover ring-2 ring-white/20 shrink-0"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-gb-primary text-white flex items-center justify-center text-xs font-semibold shrink-0">
                {initials}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-white leading-tight truncate">
                {advisorName}
              </div>
              <div className="text-[11px] text-slate-400 leading-tight truncate">
                {advisorEmail}
              </div>
            </div>
            <div className="shrink-0 [&_button]:text-slate-400 [&_button]:hover:text-white [&_button]:hover:bg-gb-sidebar-hover">
              <NotificationBell />
            </div>
          </div>
        )}
        {collapsed && advisorName && (
          <div className="mt-3 space-y-2">
            <div className="flex justify-center">
              {advisorPhoto ? (
                <img
                  src={advisorPhoto}
                  alt={advisorName}
                  className="w-8 h-8 rounded-full object-cover ring-2 ring-white/20"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-gb-primary text-white flex items-center justify-center text-xs font-semibold">
                  {initials}
                </div>
              )}
            </div>
            <div className="flex justify-center [&_button]:text-slate-400 [&_button]:hover:text-white [&_button]:hover:bg-gb-sidebar-hover">
              <NotificationBell />
            </div>
          </div>
        )}
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

      {/* Bottom section: settings + collapse */}
      <div className="border-t border-white/10 px-2 py-2 space-y-1">
        {/* Settings menu */}
        <div className="relative">
          <button
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            title={collapsed ? "Configuracion" : undefined}
            className={`w-full flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors relative group ${
              collapsed ? "justify-center px-2" : ""
            } text-slate-400 hover:text-slate-200 hover:bg-gb-sidebar-hover`}
          >
            <Settings className="w-[18px] h-[18px] shrink-0" />
            {!collapsed && (
              <span className="text-sm font-medium">Configuracion</span>
            )}
            {collapsed && (
              <div className="absolute left-full ml-2 px-2.5 py-1.5 bg-gb-dark text-white text-xs font-medium rounded-md whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50 shadow-lg">
                Configuracion
              </div>
            )}
          </button>

          {/* User dropdown - opens upward */}
          {userMenuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setUserMenuOpen(false)} />
              <div className={`absolute bottom-full mb-1 bg-white rounded-lg shadow-lg border border-gb-border py-1 w-52 z-50 ${
                collapsed ? "left-full ml-2" : "left-0"
              }`}>
                <Link
                  href="/advisor/profile"
                  onClick={() => setUserMenuOpen(false)}
                  className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-gb-gray hover:text-gb-black hover:bg-gb-light transition-colors"
                >
                  <User className="w-4 h-4" />
                  Mi Perfil
                </Link>
                {isAdmin && (
                  <>
                    <Link
                      href="/admin/advisors"
                      onClick={() => setUserMenuOpen(false)}
                      className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-gb-gray hover:text-gb-black hover:bg-gb-light transition-colors"
                    >
                      <Settings className="w-4 h-4" />
                      Gestion Asesores
                    </Link>
                    <Link
                      href="/admin/data-sync"
                      onClick={() => setUserMenuOpen(false)}
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

        {/* Collapse toggle */}
        <button
          onClick={onToggleCollapse}
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
  );
}
