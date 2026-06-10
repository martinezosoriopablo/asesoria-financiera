"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  Home,
  LayoutDashboard,
  Briefcase,
  FileText,
  FileUp,
  MessageSquare,
  ChevronsLeft,
  ChevronsRight,
  LogOut,
  ArrowRightLeft,
  Lock,
  Search,
  User,
} from "lucide-react";

interface PortalSidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  clientName: string;
  clientEmail: string;
  hasAdvisorRole?: boolean;
  unreadMessages?: number;
  unreadReports?: number;
}

const NAV_ITEMS = [
  { href: "/portal/bienvenida", label: "Inicio", icon: Home },
  { href: "/portal/dashboard", label: "Mi Portafolio", icon: LayoutDashboard },
  { href: "/portal/radiografia", label: "Radiografia", icon: Search },
  { href: "/portal/mis-servicios", label: "Mis Servicios", icon: Briefcase },
  { href: "/portal/reportes", label: "Reportes", icon: FileText, badgeKey: "reports" as const },
  { href: "/portal/mis-cartolas", label: "Mis Cartolas", icon: FileUp },
  { href: "/portal/mensajes", label: "Mensajes", icon: MessageSquare, badgeKey: "messages" as const },
];

export default function PortalSidebar({
  collapsed,
  onToggleCollapse,
  clientName,
  clientEmail,
  hasAdvisorRole = false,
  unreadMessages = 0,
  unreadReports = 0,
}: PortalSidebarProps) {
  const pathname = usePathname();
  const [switching, setSwitching] = useState(false);
  const [detectedAdvisorRole, setDetectedAdvisorRole] = useState(false);

  // Auto-detect if user also has advisor role
  useEffect(() => {
    if (!hasAdvisorRole) {
      const supabase = createSupabaseBrowserClient();
      supabase.auth.getUser().then(({ data: { user } }) => {
        const roles = (user?.user_metadata?.roles as string[]) || [];
        if (roles.includes("advisor")) setDetectedAdvisorRole(true);
      });
    }
  }, [hasAdvisorRole]);

  const showAdvisorSwitch = hasAdvisorRole || detectedAdvisorRole;

  const isActive = (href: string) => {
    if (href === "/portal/bienvenida") return pathname === "/portal/bienvenida";
    return pathname?.startsWith(href) ?? false;
  };

  const initials = clientName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const handleLogout = async () => {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    window.location.href = "/portal/login";
  };

  const handleSwitchToAdvisor = async () => {
    setSwitching(true);
    try {
      const res = await fetch("/api/auth/switch-role", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "advisor" }),
      });
      const data = await res.json();
      if (data.success) {
        window.location.href = data.redirectTo || "/advisor";
      }
    } catch {
      setSwitching(false);
    }
  };

  const getBadgeCount = (badgeKey?: "messages" | "reports") => {
    if (badgeKey === "messages") return unreadMessages;
    if (badgeKey === "reports") return unreadReports;
    return 0;
  };

  return (
    <aside
      className={`flex flex-col fixed top-0 left-0 h-screen bg-gb-sidebar z-40 transition-all duration-200 ease-in-out ${
        collapsed ? "w-16" : "w-60"
      }`}
    >
      {/* Logo + Client info */}
      <div className={`border-b border-white/10 shrink-0 ${collapsed ? "px-2 py-4" : "px-5 py-4"}`}>
        <Link href="/portal/bienvenida" className="flex items-center gap-3 overflow-hidden">
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
        {!collapsed && clientName && (
          <div className="mt-3 flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-gb-primary text-white flex items-center justify-center text-xs font-semibold shrink-0">
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-white leading-tight truncate">
                {clientName}
              </div>
              <div className="text-[11px] text-slate-400 leading-tight truncate">
                {clientEmail}
              </div>
            </div>
          </div>
        )}
        {collapsed && clientName && (
          <div className="mt-3 flex justify-center">
            <div className="w-8 h-8 rounded-full bg-gb-primary text-white flex items-center justify-center text-xs font-semibold">
              {initials}
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-1">
        <p className={`text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2 ${collapsed ? "text-center" : "px-3"}`}>
          {collapsed ? "\u2014" : "Mi Portal"}
        </p>
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          const badge = getBadgeCount(item.badgeKey);
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
              <div className="relative shrink-0">
                <Icon className="w-[18px] h-[18px]" />
                {badge > 0 && collapsed && (
                  <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-blue-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                    {badge > 9 ? "9+" : badge}
                  </span>
                )}
              </div>
              {!collapsed && (
                <>
                  <span className="text-sm font-medium truncate flex-1">{item.label}</span>
                  {badge > 0 && (
                    <span className={`ml-auto w-5 h-5 text-[10px] font-bold rounded-full flex items-center justify-center ${
                      item.badgeKey === "reports" ? "bg-amber-500 text-white" : "bg-blue-500 text-white"
                    }`}>
                      {badge > 9 ? "9+" : badge}
                    </span>
                  )}
                </>
              )}
              {collapsed && (
                <div className="absolute left-full ml-2 px-2.5 py-1.5 bg-gb-dark text-white text-xs font-medium rounded-md whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50 shadow-lg">
                  {item.label}
                  {badge > 0 && ` (${badge})`}
                </div>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Bottom section */}
      <div className="border-t border-white/10 px-2 py-2 space-y-1">
        {/* Profile */}
        <Link
          href="/portal/perfil"
          title={collapsed ? "Mi Perfil" : undefined}
          className={`w-full flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors relative group ${
            collapsed ? "justify-center px-2" : ""
          } ${pathname === "/portal/perfil" ? "text-white bg-gb-sidebar-hover" : "text-slate-400 hover:text-slate-200 hover:bg-gb-sidebar-hover"}`}
        >
          <User className="w-[18px] h-[18px] shrink-0" />
          {!collapsed && (
            <span className="text-sm font-medium">Mi Perfil</span>
          )}
          {collapsed && (
            <div className="absolute left-full ml-2 px-2.5 py-1.5 bg-gb-dark text-white text-xs font-medium rounded-md whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50 shadow-lg">
              Mi Perfil
            </div>
          )}
        </Link>

        {/* Change password */}
        <Link
          href="/portal/cambiar-password"
          title={collapsed ? "Cambiar contrasena" : undefined}
          className={`w-full flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors relative group ${
            collapsed ? "justify-center px-2" : ""
          } text-slate-400 hover:text-slate-200 hover:bg-gb-sidebar-hover`}
        >
          <Lock className="w-[18px] h-[18px] shrink-0" />
          {!collapsed && (
            <span className="text-sm font-medium">Cambiar contrasena</span>
          )}
          {collapsed && (
            <div className="absolute left-full ml-2 px-2.5 py-1.5 bg-gb-dark text-white text-xs font-medium rounded-md whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50 shadow-lg">
              Cambiar contrasena
            </div>
          )}
        </Link>

        {/* Switch to advisor role */}
        {showAdvisorSwitch && (
          <button
            onClick={handleSwitchToAdvisor}
            disabled={switching}
            title={collapsed ? "Vista Asesor" : undefined}
            className={`w-full flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors relative group ${
              collapsed ? "justify-center px-2" : ""
            } text-slate-400 hover:text-slate-200 hover:bg-gb-sidebar-hover disabled:opacity-50`}
          >
            <ArrowRightLeft className="w-[18px] h-[18px] shrink-0" />
            {!collapsed && (
              <span className="text-sm font-medium">
                {switching ? "Cambiando..." : "Vista Asesor"}
              </span>
            )}
            {collapsed && (
              <div className="absolute left-full ml-2 px-2.5 py-1.5 bg-gb-dark text-white text-xs font-medium rounded-md whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50 shadow-lg">
                {switching ? "Cambiando..." : "Vista Asesor"}
              </div>
            )}
          </button>
        )}

        {/* Logout */}
        <button
          onClick={handleLogout}
          title={collapsed ? "Cerrar sesion" : undefined}
          className={`w-full flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors relative group ${
            collapsed ? "justify-center px-2" : ""
          } text-slate-400 hover:text-red-400 hover:bg-gb-sidebar-hover`}
        >
          <LogOut className="w-[18px] h-[18px] shrink-0" />
          {!collapsed && (
            <span className="text-sm font-medium">Cerrar sesion</span>
          )}
          {collapsed && (
            <div className="absolute left-full ml-2 px-2.5 py-1.5 bg-gb-dark text-white text-xs font-medium rounded-md whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50 shadow-lg">
              Cerrar sesion
            </div>
          )}
        </button>

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
