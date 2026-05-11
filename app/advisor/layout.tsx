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
  Loader,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("sidebar-collapsed") === "true";
    }
    return false;
  });
  const pathname = usePathname();

  const toggleSidebar = () => {
    const next = !sidebarCollapsed;
    setSidebarCollapsed(next);
    localStorage.setItem("sidebar-collapsed", String(next));
  };

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
        collapsed={sidebarCollapsed}
        onToggleCollapse={toggleSidebar}
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
      <div className={`${sidebarCollapsed ? "lg:pl-16" : "lg:pl-60"} min-h-screen flex flex-col transition-all duration-200`}>
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
