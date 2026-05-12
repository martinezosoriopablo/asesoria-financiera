// components/shared/AdvisorSidebar.tsx
"use client";


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
  collapsed: boolean;
  onToggleCollapse: () => void;
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

export default function AdvisorSidebar({ collapsed, onToggleCollapse }: AdvisorSidebarProps) {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === "/advisor") return pathname === "/advisor";
    return pathname?.startsWith(href.split("?")[0]) ?? false;
  };

  return (
    <>
      {/* Sidebar */}
      <aside
        className={`flex flex-col fixed top-0 left-0 h-screen bg-gb-sidebar z-40 transition-all duration-200 ease-in-out ${
          collapsed ? "w-16" : "w-60"
        }`}
      >
        {/* Logo */}
        <div className={`flex items-center h-16 border-b border-white/10 shrink-0 ${collapsed ? "justify-center px-2" : "px-5"}`}>
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
    </>
  );
}
