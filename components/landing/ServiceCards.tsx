"use client";

import GBrandMark from "./GBrandMark";
import { useScrollReveal } from "./useScrollReveal";

const services = [
  { n: "01", line: "Wealth", desc: "Asesoría de inversiones independiente, local e internacional. Portafolios personalizados según tu perfil y objetivos." },
  { n: "02", line: "Planning", desc: "Planificación tributaria y patrimonial. Sociedades de inversión, optimización fiscal, sucesión y estructuración." },
  { n: "03", line: "Properties", desc: "Inversión inmobiliaria. Asesoría en compra, venta y gestión de activos inmobiliarios." },
  { n: "04", line: "Insurance", desc: "Seguros internacionales con compañías de primer nivel. Vida, salud y protección patrimonial." },
];

export default function ServiceCards() {
  const { ref, visible } = useScrollReveal();

  return (
    <section id="servicios" className="py-[100px]" style={{ background: "#05162C" }}>
      <div className="max-w-[1180px] mx-auto px-8">
        <div
          ref={ref}
          className={`max-w-[720px] mb-[52px] transition-all duration-700 ease-out ${
            visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
          }`}
        >
          <span className="text-xs tracking-[0.3em] uppercase font-semibold" style={{ color: "#C99A5E" }}>
            Servicios
          </span>
          <h2
            className="text-[clamp(30px,3.7vw,48px)] leading-[1.07] mt-4 mb-3.5"
            style={{ fontFamily: "var(--font-display)", fontWeight: 400, color: "#EEF3FA" }}
          >
            Cuatro frentes, una sola estrategia
          </h2>
        </div>
        <div
          className="grid grid-cols-1 lg:grid-cols-2"
          style={{ gap: "1px", background: "rgba(255,255,255,.09)", border: "1px solid rgba(255,255,255,.09)" }}
        >
          {services.map((s) => (
            <div
              key={s.n}
              className="p-[38px_36px] transition-colors"
              style={{ background: "#05162C" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#0A2140")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "#05162C")}
            >
              <div className="flex items-center gap-4 mb-3.5">
                <span
                  className="text-[32px] leading-[.9]"
                  style={{ fontFamily: "var(--font-display)", color: "#D0834C" }}
                >
                  {s.n}
                </span>
                <span className="flex items-center gap-2.5">
                  <GBrandMark className="w-[34px] h-[34px] text-white flex-none" />
                  <span className="text-[30px] font-extrabold tracking-[0.02em] text-white">GLOBAL</span>
                  <span className="text-[30px] font-light tracking-[0.01em] text-white">{s.line}</span>
                </span>
              </div>
              <p className="text-[15px] max-w-[42ch]" style={{ color: "#9DB0CA" }}>{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
