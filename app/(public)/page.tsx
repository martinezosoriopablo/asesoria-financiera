import Link from "next/link";
import {
  TrendingUp,
  Shield,
  FileText,
  Building2,
  Globe,
  Users,
  BarChart3,
  ArrowRight,
  Phone,
  Mail,
} from "lucide-react";

const services = [
  {
    title: "Asesoria Financiera",
    icon: TrendingUp,
    description:
      "Gestion de portafolios, analisis de costos, recomendaciones personalizadas con datos CMF en tiempo real.",
  },
  {
    title: "Seguros Internacionales",
    icon: Shield,
    description:
      "Polizas con companias de USA. Productos no disponibles en Chile. Coberturas de vida, salud, patrimonio.",
  },
  {
    title: "Asesoria Tributaria",
    icon: FileText,
    description:
      "Planificacion tributaria personalizada. Optimizacion de carga fiscal. Red de especialistas.",
  },
  {
    title: "Soluciones Inmobiliarias",
    icon: Building2,
    description:
      "Productos de inversion inmobiliaria. Asesoria en compra/venta. Gestion patrimonial.",
  },
];

const differentiators = [
  {
    icon: Globe,
    title: "Acceso internacional",
    description:
      "Productos de USA y mercados globales que no estan disponibles en Chile.",
  },
  {
    icon: Users,
    title: "Todo integrado",
    description:
      "Un solo equipo para inversiones, seguros, impuestos e inmobiliario.",
  },
  {
    icon: BarChart3,
    title: "Tecnologia + experiencia",
    description:
      "Plataforma propia con datos en tiempo real, respaldada por asesores humanos.",
  },
];

const steps = [
  {
    number: "1",
    title: "Agenda una reunion",
    description: "Conecta con tu asesor para entender tu situacion actual y objetivos.",
  },
  {
    number: "2",
    title: "Definimos tu estrategia",
    description: "Creamos un plan personalizado que integre todos los servicios que necesitas.",
  },
  {
    number: "3",
    title: "Gestion continua",
    description: "Seguimiento permanente con reportes, ajustes y acompanamiento profesional.",
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white text-gb-black">
      {/* Navbar */}
      <nav className="fixed top-0 w-full bg-white/95 backdrop-blur-sm border-b border-gray-100 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-20">
            <span
              className="text-2xl tracking-[0.15em] text-gb-black"
              style={{ fontFamily: "'Archivo Black', sans-serif" }}
            >
              GLOBAL
            </span>

            <div className="hidden md:flex items-center gap-8">
              <a
                href="#servicios"
                className="text-sm text-gray-500 hover:text-gb-black font-medium transition-colors"
              >
                Servicios
              </a>
              <a
                href="#nosotros"
                className="text-sm text-gray-500 hover:text-gb-black font-medium transition-colors"
              >
                Nosotros
              </a>
              <Link
                href="/login"
                className="px-5 py-2.5 text-sm font-medium border border-gray-300 rounded text-gb-black hover:bg-gray-50 transition-colors"
              >
                Portal Clientes
              </Link>
              <Link
                href="/login"
                className="px-5 py-2.5 text-sm font-medium bg-gb-black text-white rounded hover:bg-gb-dark transition-colors"
              >
                Acceso Asesores
              </Link>
            </div>

            {/* Mobile */}
            <div className="flex md:hidden items-center gap-2">
              <Link
                href="/login"
                className="px-3 py-1.5 text-xs font-medium border border-gray-300 rounded text-gb-black"
              >
                Clientes
              </Link>
              <Link
                href="/login"
                className="px-3 py-1.5 text-xs font-medium bg-gb-black text-white rounded"
              >
                Asesores
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero — full-width photo background */}
      <section className="relative min-h-[90vh] flex items-center justify-center overflow-hidden">
        {/* Background image */}
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage:
              "url('https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=1920&q=80')",
          }}
        />
        {/* Dark overlay */}
        <div className="absolute inset-0 bg-black/60" />

        <div className="relative max-w-4xl mx-auto text-center px-4 py-32">
          <p
            className="text-base md:text-lg tracking-[0.3em] text-white/70 mb-8"
            style={{ fontFamily: "'Archivo Black', sans-serif" }}
          >
            GLOBAL
          </p>
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-6 leading-tight">
            Tu equipo financiero completo
          </h1>
          <p className="text-lg md:text-xl text-white/70 mb-12 leading-relaxed max-w-2xl mx-auto">
            Asesoria de inversiones, seguros internacionales, planificacion
            tributaria y soluciones inmobiliarias. Todo en un solo lugar.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a
              href="#servicios"
              className="px-8 py-3.5 bg-white text-gb-black font-semibold rounded hover:bg-gray-100 transition-colors inline-flex items-center justify-center gap-2"
            >
              Conoce nuestros servicios
              <ArrowRight className="w-5 h-5" />
            </a>
            <a
              href="#contacto"
              className="px-8 py-3.5 border border-white/40 text-white font-semibold rounded hover:bg-white/10 transition-colors inline-flex items-center justify-center"
            >
              Agenda una reunion
            </a>
          </div>
        </div>
      </section>

      {/* Servicios */}
      <section id="servicios" className="py-24 px-4 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-xs font-semibold text-gray-400 tracking-[0.2em] uppercase mb-3">
              Nuestros servicios
            </p>
            <h2 className="text-3xl md:text-4xl font-bold text-gb-black mb-4">
              Cuatro verticales para tus necesidades
            </h2>
            <p className="text-lg text-gray-500">
              Cobertura integral para todo tu patrimonio
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {services.map((s) => {
              const Icon = s.icon;
              return (
                <div
                  key={s.title}
                  className="border border-gray-200 rounded-lg p-6 hover:border-gray-300 hover:shadow-sm transition-all"
                >
                  <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center mb-5">
                    <Icon className="w-6 h-6 text-gb-black" />
                  </div>
                  <h3 className="text-lg font-semibold text-gb-black mb-2">
                    {s.title}
                  </h3>
                  <p className="text-sm text-gray-500 leading-relaxed">
                    {s.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Diferenciadores */}
      <section id="nosotros" className="py-24 px-4 bg-[#f7f7f7]">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-xs font-semibold text-gray-400 tracking-[0.2em] uppercase mb-3">
              Por que elegirnos
            </p>
            <h2 className="text-3xl md:text-4xl font-bold text-gb-black mb-4">
              Por que GLOBAL
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-10">
            {differentiators.map((d) => {
              const Icon = d.icon;
              return (
                <div key={d.title} className="text-center">
                  <div className="w-14 h-14 bg-white border border-gray-200 rounded-full flex items-center justify-center mx-auto mb-5">
                    <Icon className="w-7 h-7 text-gb-black" />
                  </div>
                  <h3 className="text-lg font-semibold text-gb-black mb-2">
                    {d.title}
                  </h3>
                  <p className="text-sm text-gray-500 leading-relaxed">
                    {d.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Como funciona */}
      <section className="py-24 px-4 bg-white">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-xs font-semibold text-gray-400 tracking-[0.2em] uppercase mb-3">
              Proceso
            </p>
            <h2 className="text-3xl md:text-4xl font-bold text-gb-black mb-4">
              Como funciona
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-8 relative">
            {/* Connector line (desktop) */}
            <div className="hidden md:block absolute top-7 left-[20%] right-[20%] h-px bg-gray-200" />
            {steps.map((s) => (
              <div key={s.number} className="text-center relative">
                <div className="w-14 h-14 bg-gb-black text-white rounded-full flex items-center justify-center text-xl font-bold mx-auto mb-5 relative z-10">
                  {s.number}
                </div>
                <h3 className="text-lg font-semibold text-gb-black mb-2">
                  {s.title}
                </h3>
                <p className="text-sm text-gray-500 leading-relaxed">
                  {s.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA final — photo background */}
      <section id="contacto" className="relative py-24 px-4 overflow-hidden">
        {/* Background image */}
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage:
              "url('https://images.unsplash.com/photo-1560520653-9e0e4c89eb11?w=1920&q=80')",
          }}
        />
        <div className="absolute inset-0 bg-black/65" />

        <div className="relative max-w-3xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-6">
            Empieza hoy
          </h2>
          <p className="text-lg text-white/70 mb-10">
            Accede a tu portal o contacta a nuestro equipo para agendar una
            reunion.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/login"
              className="px-8 py-3.5 border border-white/40 text-white font-semibold rounded hover:bg-white/10 transition-colors inline-flex items-center justify-center"
            >
              Portal Clientes
            </Link>
            <Link
              href="/login"
              className="px-8 py-3.5 bg-white text-gb-black font-semibold rounded hover:bg-gray-100 transition-colors inline-flex items-center justify-center gap-2"
            >
              Acceso Asesores
              <ArrowRight className="w-5 h-5" />
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gb-black py-14 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-8 mb-10">
            <div>
              <span
                className="text-lg tracking-[0.15em] text-white"
                style={{ fontFamily: "'Archivo Black', sans-serif" }}
              >
                GLOBAL
              </span>
              <p className="text-sm text-white/40 mt-4 leading-relaxed">
                Tu equipo financiero completo. Inversiones, seguros, tributario
                e inmobiliario.
              </p>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-4 text-sm uppercase tracking-wider">
                Servicios
              </h4>
              <ul className="space-y-2.5 text-sm text-white/40">
                <li>
                  <a href="#servicios" className="hover:text-white transition-colors">
                    Asesoria Financiera
                  </a>
                </li>
                <li>
                  <a href="#servicios" className="hover:text-white transition-colors">
                    Seguros Internacionales
                  </a>
                </li>
                <li>
                  <a href="#servicios" className="hover:text-white transition-colors">
                    Asesoria Tributaria
                  </a>
                </li>
                <li>
                  <a href="#servicios" className="hover:text-white transition-colors">
                    Soluciones Inmobiliarias
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-4 text-sm uppercase tracking-wider">
                Contacto
              </h4>
              <ul className="space-y-2.5 text-sm text-white/40">
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
              <h4 className="font-semibold text-white mb-4 text-sm uppercase tracking-wider">
                Legal
              </h4>
              <ul className="space-y-2.5 text-sm text-white/40">
                <li>Terminos de Uso</li>
                <li>Privacidad</li>
              </ul>
            </div>
          </div>
          <div className="border-t border-white/10 pt-8 text-center text-sm text-white/30">
            <p>&copy; 2026 GLOBAL. Todos los derechos reservados.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
