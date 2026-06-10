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
          <Link href="/" className="flex items-center gap-2.5">
            <GlobalLogo size={36} />
            <span
              className="text-xl tracking-[0.12em] text-gl-ink"
              style={{ fontFamily: "var(--font-display)" }}
            >
              GLOBAL
            </span>
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
