"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { LogOut, Menu, X, MessageSquare, LayoutDashboard, Home, FileText, FileUp } from "lucide-react";

interface PortalTopbarProps {
  clientName: string;
  clientEmail: string;
  unreadCount?: number;
  unreadReports?: number;
}

const tabs = [
  { label: "Inicio", href: "/portal/bienvenida", icon: Home },
  { label: "Mi Portafolio", href: "/portal/dashboard", icon: LayoutDashboard },
  { label: "Reportes", href: "/portal/reportes", icon: FileText, badgeKey: "reports" as const },
  { label: "Mis Cartolas", href: "/portal/mis-cartolas", icon: FileUp },
  { label: "Mensajes", href: "/portal/mensajes", icon: MessageSquare, badgeKey: "messages" as const },
];

export default function PortalTopbar({ clientName, clientEmail, unreadCount = 0, unreadReports = 0 }: PortalTopbarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = async () => {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.push("/portal/login");
    router.refresh();
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
