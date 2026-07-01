"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import GBrandMark from "./GBrandMark";

export default function Navbar() {
  const [open, setOpen] = useState(false);

  return (
    <nav
      className="sticky top-0 z-30 border-b"
      style={{
        background: "rgba(5,22,44,.7)",
        WebkitBackdropFilter: "blur(12px)",
        backdropFilter: "blur(12px)",
        borderColor: "rgba(255,255,255,.09)",
      }}
    >
      <div className="max-w-[1180px] mx-auto px-8 flex items-center justify-between h-[78px]">
        <Link href="/" className="flex items-center gap-[15px] no-underline">
          <GBrandMark className="w-9 h-9 text-white flex-none" />
          <span className="w-px h-8" style={{ background: "rgba(255,255,255,.22)" }} />
          <span className="leading-none">
            <span className="block font-extrabold text-[21px] tracking-[0.2em] text-white">
              GLOBAL
            </span>
            <span
              className="block font-normal text-[10px] tracking-[0.46em] mt-1"
              style={{ color: "#E3B877" }}
            >
              ADVISORS
            </span>
          </span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden lg:flex items-center gap-8">
          <a href="#servicios" className="text-[15px] font-medium text-[#E7EDF6] hover:text-[#E3B877] transition-colors no-underline">
            Servicios
          </a>
          <a href="#consejo" className="text-[15px] font-medium text-[#E7EDF6] hover:text-[#E3B877] transition-colors no-underline">
            Estudios
          </a>
          <a href="#proceso" className="text-[15px] font-medium text-[#E7EDF6] hover:text-[#E3B877] transition-colors no-underline">
            Proceso
          </a>
          <Link
            href="/portal/login"
            className="px-[22px] py-[11px] text-sm rounded-full border text-gl-ink-light no-underline inline-flex items-center gap-2 transition-colors hover:border-gl-gold hover:text-gl-gold2"
            style={{ borderColor: "rgba(255,255,255,.09)" }}
          >
            Portal Clientes
          </Link>
          <Link
            href="/login"
            className="px-[22px] py-[11px] text-sm font-bold rounded-full bg-gl-azure border border-gl-azure text-[#05162C] no-underline inline-flex items-center gap-2 transition-colors hover:bg-[#7ab4ee]"
          >
            Acceso Asesores
          </Link>
        </div>

        {/* Mobile hamburger */}
        <button
          onClick={() => setOpen(!open)}
          className="lg:hidden p-2 text-gl-ink-light"
          aria-label={open ? "Cerrar menú" : "Abrir menú"}
        >
          {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile menu */}
      {open && (
        <div
          className="lg:hidden px-8 py-4 space-y-3 border-t"
          style={{ borderColor: "rgba(255,255,255,.09)", background: "rgba(5,22,44,.95)" }}
        >
          <a href="#servicios" onClick={() => setOpen(false)} className="block text-sm font-medium text-gl-ink-light py-2 no-underline">
            Servicios
          </a>
          <a href="#consejo" onClick={() => setOpen(false)} className="block text-sm font-medium text-gl-ink-light py-2 no-underline">
            Estudios
          </a>
          <a href="#proceso" onClick={() => setOpen(false)} className="block text-sm font-medium text-gl-ink-light py-2 no-underline">
            Proceso
          </a>
          <div className="flex gap-2 pt-2">
            <Link href="/portal/login" className="flex-1 text-center px-4 py-2.5 text-sm font-medium border rounded-full text-gl-ink-light no-underline" style={{ borderColor: "rgba(255,255,255,.09)" }}>
              Clientes
            </Link>
            <Link href="/login" className="flex-1 text-center px-4 py-2.5 text-sm font-bold bg-gl-azure text-[#05162C] rounded-full no-underline">
              Asesores
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
}
