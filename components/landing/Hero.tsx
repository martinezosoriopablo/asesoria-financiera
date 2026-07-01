"use client";

import { useScrollReveal } from "./useScrollReveal";
import Globe from "./Globe";

export default function Hero() {
  const { ref, visible } = useScrollReveal(0.1);

  return (
    <header className="relative overflow-hidden" style={{ background: "linear-gradient(180deg,#0A2140,#05162C)" }}>
      <div
        className="absolute inset-0 z-0"
        style={{
          background: "radial-gradient(130% 90% at 80% 25%, rgba(90,160,230,.18), transparent 55%)",
        }}
      />
      <div
        ref={ref}
        className={`relative z-[2] max-w-[1180px] mx-auto px-8 grid grid-cols-1 lg:grid-cols-[1.05fr_0.95fr] gap-10 items-center min-h-[80vh] py-[84px] transition-all duration-700 ease-out ${
          visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
        }`}
      >
        <div>
          <span
            className="text-xs tracking-[0.3em] uppercase font-semibold"
            style={{ color: "#C99A5E", fontFamily: "var(--font-data)" }}
          >
            Asesoría patrimonial integral · Fee-only
          </span>
          <h1
            className="text-[clamp(42px,5.6vw,78px)] leading-[1.0] tracking-[-0.015em] text-white my-[22px_0_26px]"
            style={{ fontFamily: "var(--font-display)", fontWeight: 400, margin: "22px 0 26px" }}
          >
            Más de 20 años de <em className="italic" style={{ color: "#5AA0E6" }}>experiencia</em> a tu servicio
          </h1>
          <p className="text-[19px] leading-relaxed max-w-[31em]" style={{ color: "#CFDAEA" }}>
            Inversiones, planificación tributaria, seguros y propiedades. Asesoría independiente, sin conflictos de interés.
          </p>
          <p className="text-[13.5px] mt-[22px] mb-8" style={{ color: "#9DB0CA" }}>
            Asesores acreditados ante la CMF. Trayectoria en Itaú, Corpbanca, BanChile, Santander Investment y AFP Capital.
          </p>
          <div className="flex gap-3.5 flex-wrap">
            <a
              href="#servicios"
              className="px-[22px] py-[11px] text-sm font-bold rounded-full bg-gl-azure border border-gl-azure text-[#05162C] no-underline inline-flex items-center gap-2 transition-colors hover:bg-[#7ab4ee]"
            >
              Conoce nuestros servicios →
            </a>
            <a
              href="#contacto"
              className="px-[22px] py-[11px] text-sm rounded-full border text-gl-ink-light no-underline inline-flex items-center gap-2 transition-colors hover:border-gl-gold hover:text-gl-gold2"
              style={{ borderColor: "rgba(255,255,255,.09)" }}
            >
              Agenda una reunión
            </a>
          </div>
        </div>
        <div className="flex justify-center items-center relative order-first lg:order-last">
          <div
            className="absolute w-[74%] aspect-square rounded-full"
            style={{
              background: "radial-gradient(circle, rgba(90,160,230,.18), transparent 65%)",
              filter: "blur(6px)",
            }}
          />
          <Globe />
        </div>
      </div>
    </header>
  );
}
