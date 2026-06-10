import { Mail, Phone } from "lucide-react";
import GlobalLogo from "./GlobalLogo";

export default function Footer() {
  return (
    <footer className="bg-gl-deep py-14 px-4">
      <div className="max-w-7xl mx-auto">
        <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-8 mb-10">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <GlobalLogo variant="light" size={28} />
              <span
                className="text-lg tracking-[0.12em] text-white"
                style={{ fontFamily: "var(--font-display)" }}
              >
                GLOBAL
              </span>
            </div>
            <p className="text-sm text-white/40 leading-relaxed" style={{ fontFamily: "var(--font-body)" }}>
              Boutique de gestion patrimonial. Independientes y agnosticos — comparamos el mercado y recomendamos lo mejor para ti.
            </p>
          </div>
          <div>
            <h4
              className="font-semibold text-white mb-4 text-xs uppercase tracking-[0.15em]"
              style={{ fontFamily: "var(--font-data)" }}
            >
              Servicios
            </h4>
            <ul className="space-y-2.5 text-sm text-white/40" style={{ fontFamily: "var(--font-body)" }}>
              <li>
                <a href="#servicios" className="hover:text-white transition-colors">
                  Global Wealth
                </a>
              </li>
              <li>
                <a href="#servicios" className="hover:text-white transition-colors">
                  Global Planning
                </a>
              </li>
              <li>
                <a href="#servicios" className="hover:text-white transition-colors">
                  Global Properties
                </a>
              </li>
              <li>
                <a href="#servicios" className="hover:text-white transition-colors">
                  Global Insurance
                </a>
              </li>
            </ul>
          </div>
          <div>
            <h4
              className="font-semibold text-white mb-4 text-xs uppercase tracking-[0.15em]"
              style={{ fontFamily: "var(--font-data)" }}
            >
              Contacto
            </h4>
            <ul className="space-y-2.5 text-sm text-white/40" style={{ fontFamily: "var(--font-body)" }}>
              <li className="flex items-center gap-2">
                <Mail className="w-4 h-4" />
                contacto@global.cl
              </li>
              <li className="flex items-center gap-2">
                <Phone className="w-4 h-4" />
                +56 9 0000 0000
              </li>
            </ul>
          </div>
          <div>
            <h4
              className="font-semibold text-white mb-4 text-xs uppercase tracking-[0.15em]"
              style={{ fontFamily: "var(--font-data)" }}
            >
              Legal
            </h4>
            <ul className="space-y-2.5 text-sm text-white/40" style={{ fontFamily: "var(--font-body)" }}>
              <li>Terminos de Uso</li>
              <li>Privacidad</li>
            </ul>
          </div>
        </div>

        {/* Compliance disclaimer */}
        <div className="border-t border-white/10 pt-6 mb-6">
          <p className="text-xs text-white/25 leading-relaxed text-center max-w-3xl mx-auto" style={{ fontFamily: "var(--font-body)" }}>
            La rentabilidad pasada no garantiza rentabilidades futuras. Toda inversion esta sujeta a riesgos.
            Esta pagina no constituye oferta ni recomendacion de inversion. Sociedad registrada y regulada por la CMF.
          </p>
        </div>

        <div className="border-t border-white/10 pt-6 text-center text-sm text-white/30" style={{ fontFamily: "var(--font-body)" }}>
          <p>&copy; 2026 GLOBAL. Todos los derechos reservados.</p>
        </div>
      </div>
    </footer>
  );
}
