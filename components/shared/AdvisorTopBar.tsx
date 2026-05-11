// components/shared/AdvisorTopBar.tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import {
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
}

export default function AdvisorTopBar({
  advisorName,
  advisorEmail,
  advisorPhoto,
  isAdmin = false,
  hasClientRole = false,
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
    <header className="h-16 bg-white border-b border-gb-border flex items-center justify-end px-5 sticky top-0 z-30">
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
