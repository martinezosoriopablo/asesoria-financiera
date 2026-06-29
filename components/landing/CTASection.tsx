"use client";

import { ArrowRight } from "lucide-react";
import { useScrollReveal } from "./useScrollReveal";

export default function CTASection() {
  const { ref, visible } = useScrollReveal();

  return (
    <section id="contacto" className="relative py-28 px-4 overflow-hidden bg-gl-deep">
      {/* Mesh gradient */}
      <div
        className="absolute inset-0 opacity-30"
        style={{
          background:
            "radial-gradient(ellipse 70% 50% at 30% 60%, #2E86E0 0%, transparent 60%), radial-gradient(ellipse 50% 40% at 80% 30%, #14467E 0%, transparent 50%)",
        }}
      />
      {/* Grid pattern */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-gl-copper/30 to-transparent" />

      <div
        ref={ref}
        className={`relative max-w-3xl mx-auto text-center transition-all duration-700 ease-out ${
          visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
        }`}
      >
        <h2
          className="text-3xl md:text-4xl text-white mb-6"
          style={{ fontFamily: "var(--font-display)", fontWeight: 400 }}
        >
          Conversemos sobre tu patrimonio
        </h2>
        <p
          className="text-lg text-white/50 mb-10"
          style={{ fontFamily: "var(--font-body)" }}
        >
          Agenda una reunion sin compromiso con nuestro equipo.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <a
            href="mailto:contacto@global.cl"
            className="px-8 py-3.5 bg-white text-gl-ink font-semibold rounded-full hover:bg-gl-mist transition-colors inline-flex items-center justify-center gap-2 shadow-lg shadow-white/10"
            style={{ fontFamily: "var(--font-body)" }}
          >
            Agenda una reunion
            <ArrowRight className="w-5 h-5" />
          </a>
          <a
            href="#servicios"
            className="px-8 py-3.5 border border-white/20 text-white font-semibold rounded-full hover:bg-white/5 transition-colors inline-flex items-center justify-center"
            style={{ fontFamily: "var(--font-body)" }}
          >
            Conoce mas
          </a>
        </div>
      </div>
    </section>
  );
}
