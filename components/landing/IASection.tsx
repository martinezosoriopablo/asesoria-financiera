"use client";

import { useScrollReveal } from "./useScrollReveal";

const capabilities = [
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-5 h-5" style={{ color: "#C99A5E" }}>
        <path d="M4 19h16M6 16l4-5 3 3 5-7" />
      </svg>
    ),
    title: "Analizamos todos los mercados",
    desc: "Cobertura diaria de mercados y activos globales, no solo los de siempre. Miramos todo el universo invertible, todos los días.",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-5 h-5" style={{ color: "#C99A5E" }}>
        <rect x="3" y="4" width="18" height="14" rx="2" />
        <path d="M7 9h4M7 13h7" />
      </svg>
    ),
    title: "Revisamos todas las noticias",
    desc: "Decenas de fuentes cada día, clasificadas por IA según importancia y contexto. Separamos la señal del ruido.",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-5 h-5" style={{ color: "#C99A5E" }}>
        <path d="M4 5v14l8-2 8 2V5l-8 2-8-2z" />
      </svg>
    ),
    title: "Analizamos cada instrumento",
    desc: "Fondos, acciones, bonos y ETFs evaluados con research propio, datos y una biblioteca de conocimiento que no olvida.",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-5 h-5" style={{ color: "#C99A5E" }}>
        <circle cx="12" cy="8" r="3.2" />
        <path d="M5 20a7 7 0 0114 0" />
      </svg>
    ),
    title: "Monitoreamos lo que mueve el mercado",
    desc: "Seguimiento continuo de lo que importa, para anticipar y no reaccionar tarde.",
  },
];

const stats = [
  { value: "Diario", label: "monitoreo de noticias clasificadas por IA" },
  { value: "Multi-agente", label: "sistema de IA que analiza mercados e instrumentos" },
  { value: "+cientos", label: "de documentos en el repositorio de conocimiento" },
];

export default function IASection() {
  const { ref, visible } = useScrollReveal();

  return (
    <section id="consejo" className="py-[100px]" style={{ background: "linear-gradient(180deg,#0A2140,#05162C)" }}>
      <div className="max-w-[1180px] mx-auto px-8">
        <div
          ref={ref}
          className={`max-w-[720px] mb-[52px] transition-all duration-700 ease-out ${
            visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
          }`}
        >
          <span className="text-xs tracking-[0.3em] uppercase font-semibold" style={{ color: "#C99A5E" }}>
            Departamento de estudios
          </span>
          <h2
            className="text-[clamp(30px,3.7vw,48px)] leading-[1.07] mt-4 mb-3.5"
            style={{ fontFamily: "var(--font-display)", fontWeight: 400, color: "#EEF3FA" }}
          >
            Un departamento de estudios propio, potenciado con IA
          </h2>
          <p className="text-[17px]" style={{ color: "#9DB0CA" }}>
            La capacidad de análisis que normalmente solo tienen los grandes, ahora en una boutique independiente. La IA nos da la escala; el criterio lo pone el equipo.
          </p>
        </div>

        <div
          className="grid grid-cols-1 sm:grid-cols-2 mt-2"
          style={{ gap: "1px", background: "rgba(255,255,255,.09)", border: "1px solid rgba(255,255,255,.09)" }}
        >
          {capabilities.map((c) => (
            <div key={c.title} className="p-[30px]" style={{ background: "#05162C" }}>
              <div className="flex items-center gap-2.5 font-semibold text-[15px] mb-2" style={{ color: "#E3B877" }}>
                {c.icon}
                {c.title}
              </div>
              <p className="text-[14.5px]" style={{ color: "#9DB0CA" }}>{c.desc}</p>
            </div>
          ))}
        </div>

        <p className="text-center max-w-[760px] mx-auto mt-11 text-[17px]" style={{ color: "#9DB0CA" }}>
          Conocemos la visión de las principales gestoras del mundo. Las escuchamos a todas...{" "}
          <span className="font-semibold" style={{ color: "#E3B877" }}>y no nos casamos con ninguna.</span>
        </p>

        <p
          className="text-center max-w-[880px] mx-auto mt-[22px] text-[clamp(22px,2.8vw,32px)] leading-[1.3] italic"
          style={{ fontFamily: "var(--font-display)", color: "#EEF3FA" }}
        >
          La IA nos da la <span style={{ color: "#E3B877" }}>escala</span>. Nuestra independencia, el{" "}
          <span style={{ color: "#E3B877" }}>criterio</span>. La última palabra siempre la tiene un asesor acreditado.
        </p>

        <div className="flex gap-10 justify-center flex-wrap mt-10">
          {stats.map((s) => (
            <div key={s.value} className="text-center">
              <b
                className="block text-[34px]"
                style={{ fontFamily: "var(--font-display)", color: "#E3B877" }}
              >
                {s.value}
              </b>
              <span className="text-[13px]" style={{ color: "#9DB0CA" }}>{s.label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
