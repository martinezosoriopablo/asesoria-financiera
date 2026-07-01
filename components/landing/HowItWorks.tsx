"use client";

import { useScrollReveal } from "./useScrollReveal";

const steps = [
  {
    n: "01",
    title: "Diagnóstico",
    desc: "Entendemos tu situación financiera, tu perfil de riesgo y tus objetivos de largo plazo.",
    img: "/images/proceso-01.jpg",
  },
  {
    n: "02",
    title: "Estrategia",
    desc: "Diseñamos un plan que integra inversiones, planificación tributaria y protección.",
    img: "/images/proceso-02.jpg",
  },
  {
    n: "03",
    title: "Ejecución",
    desc: "Implementamos en tu custodia, seleccionando los instrumentos más eficientes.",
    img: "/images/proceso-03.jpg",
  },
  {
    n: "04",
    title: "Monitoreo",
    desc: "Seguimiento diario, con reportes transparentes, rebalanceo y ajustes.",
    img: "/images/proceso-04.jpg",
  },
];

export default function HowItWorks() {
  const { ref, visible } = useScrollReveal();

  return (
    <section id="proceso" className="py-[100px]" style={{ background: "#0A2140" }}>
      <div className="max-w-[1180px] mx-auto px-8">
        <div
          ref={ref}
          className={`max-w-[720px] mb-[52px] transition-all duration-700 ease-out ${
            visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
          }`}
        >
          <span className="text-xs tracking-[0.3em] uppercase font-semibold" style={{ color: "#C99A5E" }}>
            Nuestro proceso de inversión
          </span>
          <h2
            className="text-[clamp(30px,3.7vw,48px)] leading-[1.07] mt-4 mb-3.5"
            style={{ fontFamily: "var(--font-display)", fontWeight: 400, color: "#EEF3FA" }}
          >
            Cuatro etapas que estructuran cada decisión
          </h2>
          <p className="text-[17px]" style={{ color: "#9DB0CA" }}>
            Disciplina en cada paso: del diagnóstico al monitoreo continuo, con el departamento de estudios y el criterio del equipo trabajando juntos.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-[22px] mt-2">
          {steps.map((s) => (
            <div
              key={s.n}
              className="rounded-[14px] overflow-hidden border transition-all duration-300 hover:-translate-y-[5px]"
              style={{ borderColor: "rgba(255,255,255,.09)", background: "#05162C" }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = "rgba(201,154,94,.45)")}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = "rgba(255,255,255,.09)")}
            >
              <div className="relative" style={{ aspectRatio: "4/3", backgroundImage: `url(${s.img})`, backgroundSize: "cover", backgroundPosition: "center" }}>
                <div
                  className="absolute inset-0"
                  style={{ background: "linear-gradient(180deg,transparent 55%,rgba(5,22,44,.35))" }}
                />
                <span
                  className="absolute top-3.5 left-4 z-[2] w-[34px] h-[34px] rounded-full grid place-items-center text-[15px] text-white"
                  style={{ fontFamily: "var(--font-display)", background: "#D0834C" }}
                >
                  {s.n}
                </span>
              </div>
              <div className="p-[22px_22px_26px]">
                <h4 className="text-[19px] font-bold mb-2 text-white">{s.title}</h4>
                <p className="text-sm" style={{ color: "#9DB0CA" }}>{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
