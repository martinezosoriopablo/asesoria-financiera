"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { LogOut, Menu, X, MessageSquare, LayoutDashboard, Home, FileText, FileUp, Lock, ArrowRightLeft } from "lucide-react";

interface PortalTopbarProps {
  clientName: string;
  clientEmail: string;
  unreadCount?: number;
  unreadReports?: number;
  hasAdvisorRole?: boolean;
}

const tabs = [
  { label: "Inicio", href: "/portal/bienvenida", icon: Home },
  { label: "Mi Portafolio", href: "/portal/dashboard", icon: LayoutDashboard },
  { label: "Reportes", href: "/portal/reportes", icon: FileText, badgeKey: "reports" as const },
  { label: "Mis Cartolas", href: "/portal/mis-cartolas", icon: FileUp },
  { label: "Mensajes", href: "/portal/mensajes", icon: MessageSquare, badgeKey: "messages" as const },
];

export default function PortalTopbar({ clientName, clientEmail, unreadCount = 0, unreadReports = 0, hasAdvisorRole = false }: PortalTopbarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
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

  const handleLogout = async () => {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.push("/portal/login");
    router.refresh();
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

  const initials = clientName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <header className="bg-white border-b border-gb-border sticky top-0 z-40">
      <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
        {/* Logo */}
        <Link href="/portal/bienvenida" className="flex items-center gap-2">
          <img src="/logo-greybark.png" alt="Greybark" className="h-7" />
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-1">
          {tabs.map((tab) => {
            const isActive = pathname === tab.href;
            const Icon = tab.icon;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-gb-light text-gb-black"
                    : "text-gb-gray hover:text-gb-black hover:bg-gray-50"
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
                {tab.badgeKey === "messages" && unreadCount > 0 && (
                  <span className="ml-1 bg-blue-600 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
                {tab.badgeKey === "reports" && unreadReports > 0 && (
                  <span className="ml-1 bg-amber-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                    {unreadReports > 9 ? "9+" : unreadReports}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* User + logout */}
        <div className="hidden md:flex items-center gap-3">
          <div className="text-right">
            <p className="text-sm font-medium text-gb-black leading-tight">{clientName}</p>
            <p className="text-xs text-gb-gray leading-tight">{clientEmail}</p>
          </div>
          <div className="w-8 h-8 rounded-full bg-gb-light text-gb-black text-xs font-semibold flex items-center justify-center">
            {initials}
          </div>
          {showAdvisorSwitch && (
            <button
              onClick={handleSwitchToAdvisor}
              disabled={switching}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-gb-gray hover:text-gb-black rounded-md hover:bg-gray-50 border border-gb-border disabled:opacity-50"
              title="Cambiar a vista de asesor"
            >
              <ArrowRightLeft className="w-3.5 h-3.5" />
              {switching ? "Cambiando..." : "Vista Asesor"}
            </button>
          )}
          <Link
            href="/portal/cambiar-password"
            className="p-1.5 text-gb-gray hover:text-gb-black rounded-md hover:bg-gray-50"
            title="Cambiar contraseña"
          >
            <Lock className="w-4 h-4" />
          </Link>
          <button
            onClick={handleLogout}
            className="p-1.5 text-gb-gray hover:text-gb-black rounded-md hover:bg-gray-50"
            title="Cerrar sesión"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>

        {/* Mobile hamburger */}
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="md:hidden p-1.5 text-gb-gray hover:text-gb-black"
        >
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden border-t border-gb-border bg-white px-6 py-3 space-y-1">
          {tabs.map((tab) => {
            const isActive = pathname === tab.href;
            const Icon = tab.icon;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-md text-sm font-medium ${
                  isActive ? "bg-gb-light text-gb-black" : "text-gb-gray"
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
                {tab.badgeKey === "messages" && unreadCount > 0 && (
                  <span className="ml-auto bg-blue-600 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                    {unreadCount}
                  </span>
                )}
                {tab.badgeKey === "reports" && unreadReports > 0 && (
                  <span className="ml-auto bg-amber-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                    {unreadReports}
                  </span>
                )}
              </Link>
            );
          })}
          <div className="border-t border-gb-border pt-2 mt-2">
            <div className="px-3 py-2">
              <p className="text-sm font-medium text-gb-black">{clientName}</p>
              <p className="text-xs text-gb-gray">{clientEmail}</p>
            </div>
            <Link
              href="/portal/cambiar-password"
              onClick={() => setMobileOpen(false)}
              className="flex items-center gap-2 px-3 py-2.5 rounded-md text-sm font-medium text-gb-gray hover:bg-gray-50 w-full"
            >
              <Lock className="w-4 h-4" />
              Cambiar contraseña
            </Link>
            {showAdvisorSwitch && (
              <button
                onClick={handleSwitchToAdvisor}
                disabled={switching}
                className="flex items-center gap-2 px-3 py-2.5 rounded-md text-sm font-medium text-gb-gray hover:bg-gray-50 w-full disabled:opacity-50"
              >
                <ArrowRightLeft className="w-4 h-4" />
                {switching ? "Cambiando..." : "Cambiar a Vista Asesor"}
              </button>
            )}
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 px-3 py-2.5 rounded-md text-sm font-medium text-red-600 hover:bg-red-50 w-full"
            >
              <LogOut className="w-4 h-4" />
              Cerrar sesión
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
