import GBrandMark from "./GBrandMark";

export default function Footer() {
  return (
    <footer className="py-[50px] px-8" style={{ borderTop: "1px solid rgba(255,255,255,.09)", background: "#05162C", color: "#9DB0CA", fontSize: "14px" }}>
      <div className="max-w-[1180px] mx-auto flex justify-between items-start flex-wrap gap-[22px]">
        <a href="#" className="flex items-center gap-[15px] no-underline" style={{ opacity: 0.92 }}>
          <GBrandMark className="w-[30px] h-[30px] text-white" />
          <span className="w-px" style={{ height: 28, background: "rgba(255,255,255,.22)" }} />
          <span className="leading-none">
            <span className="block font-extrabold text-[18px] tracking-[0.2em] text-white">GLOBAL</span>
            <span className="block font-normal text-[9px] tracking-[0.46em] mt-1" style={{ color: "#E3B877" }}>ADVISORS</span>
          </span>
        </a>
        <p className="max-w-[560px] text-xs leading-relaxed" style={{ color: "#6f83a0" }}>
          La rentabilidad pasada no garantiza rentabilidades futuras. Toda inversión está sujeta a riesgos. Esta página no constituye oferta ni recomendación de inversión. Global Advisors es una sociedad registrada y regulada por la Comisión para el Mercado Financiero (CMF); sus asesores se encuentran acreditados ante la CMF. © 2026 Global Advisors · Santiago, Chile.
        </p>
      </div>
    </footer>
  );
}
