"use client";

import { useScrollReveal } from "./useScrollReveal";

const pillars = [
  { n: "01", title: "Fee-only", desc: "Cobramos solo de ti. Sin retrocesiones ni comisiones de productos. Independencia real." },
  { n: "02", title: "Departamento de estudios con IA", desc: "Analizamos mercados, noticias e instrumentos, todos los días." },
  { n: "03", title: "Acceso institucional", desc: "+40 mercados vía StoneX y +200.000 fondos vía Allfunds." },
  { n: "04", title: "Asesoría 360", desc: "Inversiones, tributario, seguros y propiedades, bajo una sola estrategia." },
];

export default function Differentiators() {
  const { ref, visible } = useScrollReveal();

  return (
    <section id="dif" className="py-[100px]" style={{ background: "#05162C" }}>
      <div className="max-w-[1180px] mx-auto px-8">
        <div
          ref={ref}
          className={`max-w-[720px] mb-[52px] transition-all duration-700 ease-out ${
            visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
          }`}
        >
          <span className="text-xs tracking-[0.3em] uppercase font-semibold" style={{ color: "#C99A5E" }}>
            Por qué Global
          </span>
          <h2
            className="text-[clamp(30px,3.7vw,48px)] leading-[1.07] mt-4 mb-3.5"
            style={{ fontFamily: "var(--font-display)", fontWeight: 400, color: "#EEF3FA" }}
          >
            Cuatro razones que nos hacen distintos
          </h2>
        </div>
        <div
          className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4"
          style={{ gap: "1px", background: "rgba(255,255,255,.09)", border: "1px solid rgba(255,255,255,.09)" }}
        >
          {pillars.map((p) => (
            <div key={p.n} className="p-[34px_30px]" style={{ background: "#05162C" }}>
              <span
                className="block text-[46px] leading-[.9] mb-2"
                style={{ fontFamily: "var(--font-display)", color: "#D0834C" }}
              >
                {p.n}
              </span>
              <h3 className="text-[19px] font-bold my-[12px_0_9px] text-white" style={{ margin: "12px 0 9px" }}>
                {p.title}
              </h3>
              <p className="text-sm" style={{ color: "#9DB0CA" }}>{p.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
