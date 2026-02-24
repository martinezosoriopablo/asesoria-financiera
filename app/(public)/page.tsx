// app/page.tsx

"use client";

import React from "react";
import Link from "next/link";
import {
  TrendingUp,
  FileText,
  BarChart3,
  CheckCircle,
  ArrowRight,
  Globe,
  Building2,
} from "lucide-react";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Navbar */}
      <nav className="fixed top-0 w-full bg-white/95 backdrop-blur-sm border-b border-slate-200 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <div className="flex items-center gap-2">
              <Building2 className="w-8 h-8 text-blue-600" />
              <span className="text-xl font-bold text-slate-900">
                Stonex Advisory
              </span>
            </div>

            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center gap-8">
              <Link
                href="/market-dashboard"
                className="text-slate-600 hover:text-slate-900 font-medium transition-colors"
              >
                Panorama del Mercado
              </Link>
              <Link
                href="/portfolio-comparison"
                className="text-slate-600 hover:text-slate-900 font-medium transition-colors"
              >
                Comparador
              </Link>
              <Link
                href="/portfolio-comparison"
                className="px-6 py-2.5 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors shadow-md hover:shadow-lg"
              >
                Comenzar Ahora
              </Link>
            </div>

            {/* Mobile Menu Button */}
            <div className="md:hidden">
              <Link
                href="/portfolio-comparison"
                className="px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg text-sm"
              >
                Comenzar
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-4 bg-gradient-to-br from-blue-50 via-indigo-50 to-slate-50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center max-w-4xl mx-auto">
            <h1 className="text-5xl md:text-6xl font-bold text-slate-900 mb-6 leading-tight">
              Ahorra hasta{" "}
              <span className="text-blue-600">$165,000 al año</span>
              <br />
              en costos de fondos mutuos
            </h1>
            <p className="text-xl text-slate-600 mb-10 leading-relaxed">
              Compara tu portafolio actual con alternativas internacionales de
              bajo costo. Accede a fondos globales con costos desde 0.03% anual.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/market-dashboard"
                className="px-8 py-4 bg-white border-2 border-slate-300 text-slate-900 font-bold text-lg rounded-xl hover:border-slate-400 transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2"
              >
                <Globe className="w-6 h-6" />
                Ver Panorama del Mercado
              </Link>
              <Link
                href="/portfolio-comparison"
                className="px-8 py-4 bg-blue-600 text-white font-bold text-lg rounded-xl hover:bg-blue-700 transition-colors shadow-lg hover:shadow-xl flex items-center justify-center gap-2"
              >
                <TrendingUp className="w-6 h-6" />
                Comparar Mi Portafolio
                <ArrowRight className="w-5 h-5" />
              </Link>
            </div>

            <p className="text-sm text-slate-500 mt-6">
              Sin costo • Sin compromiso • Resultados en menos de 5 minutos
            </p>
          </div>
        </div>
      </section>

      {/* Problem/Solution Section */}
      <section className="py-20 px-4 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-6">
                ¿Sabes cuánto pagas realmente en tu portafolio?
              </h2>
              <p className="text-lg text-slate-600 mb-6">
                La mayoría de los inversionistas en Chile pagan entre{" "}
                <strong className="text-red-600">1.0% - 1.5%</strong> anual en
                costos de administración, sin saberlo.
              </p>
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                    <span className="text-red-600 font-bold">❌</span>
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900">
                      Fondos chilenos tradicionales
                    </p>
                    <p className="text-slate-600">TER promedio: 1.35% anual</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                    <span className="text-green-600 font-bold">✓</span>
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900">
                      Fondos internacionales (ETFs)
                    </p>
                    <p className="text-slate-600">TER desde: 0.03% - 0.6% anual</p>
                  </div>
                </div>
              </div>
              <div className="mt-8 p-6 bg-green-50 border-2 border-green-200 rounded-xl">
                <p className="text-lg font-bold text-green-900 mb-2">
                  💰 Ahorro potencial en $10M CLP:
                </p>
                <p className="text-3xl font-bold text-green-600">
                  $120,000 - $130,000
                </p>
                <p className="text-sm text-green-700 mt-1">por año en costos</p>
              </div>
            </div>
            <div className="bg-gradient-to-br from-slate-100 to-slate-200 rounded-2xl p-8 border border-slate-300">
              <div className="space-y-6">
                <div className="bg-white rounded-xl p-6 shadow-md">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-sm font-medium text-slate-600">
                      TER Promedio Chile
                    </span>
                    <span className="text-sm text-red-600 font-bold">Alto</span>
                  </div>
                  <div className="w-full bg-slate-200 rounded-full h-3">
                    <div className="bg-red-500 h-3 rounded-full w-[90%]"></div>
                  </div>
                  <p className="text-2xl font-bold text-slate-900 mt-3">1.35%</p>
                </div>
                <div className="bg-white rounded-xl p-6 shadow-md">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-sm font-medium text-slate-600">
                      TER Fondos Stonex
                    </span>
                    <span className="text-sm text-green-600 font-bold">Bajo</span>
                  </div>
                  <div className="w-full bg-slate-200 rounded-full h-3">
                    <div className="bg-green-500 h-3 rounded-full w-[15%]"></div>
                  </div>
                  <p className="text-2xl font-bold text-slate-900 mt-3">0.13%</p>
                </div>
                <div className="text-center pt-4">
                  <p className="text-lg font-bold text-slate-900">
                    Diferencia: <span className="text-blue-600">1.22%</span>
                  </p>
                  <p className="text-sm text-slate-600">
                    En $10M = $122,000/año de ahorro
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 px-4 bg-slate-50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-slate-900 mb-4">
              Todo lo que necesitas para tomar la mejor decisión
            </h2>
            <p className="text-xl text-slate-600">
              Herramientas profesionales al alcance de un click
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {/* Feature 1 */}
            <div className="bg-white rounded-2xl p-8 shadow-lg hover:shadow-xl transition-shadow border border-slate-200">
              <div className="w-14 h-14 bg-blue-100 rounded-xl flex items-center justify-center mb-6">
                <Globe className="w-8 h-8 text-blue-600" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-3">
                Panorama del Mercado
              </h3>
              <p className="text-slate-600 mb-4">
                Visualiza estadísticas de todas las AGFs chilenas. Compara costos
                promedio, rentabilidades y identifica las mejores opciones.
              </p>
              <Link
                href="/market-dashboard"
                className="text-blue-600 font-semibold hover:text-blue-700 inline-flex items-center gap-2"
              >
                Explorar mercado
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>

            {/* Feature 2 */}
            <div className="bg-white rounded-2xl p-8 shadow-lg hover:shadow-xl transition-shadow border border-slate-200">
              <div className="w-14 h-14 bg-green-100 rounded-xl flex items-center justify-center mb-6">
                <BarChart3 className="w-8 h-8 text-green-600" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-3">
                Comparador de Portafolios
              </h3>
              <p className="text-slate-600 mb-4">
                Compara tu portafolio actual con alternativas optimizadas. Ve el
                ahorro exacto en costos y mejora en rentabilidad.
              </p>
              <Link
                href="/portfolio-comparison"
                className="text-green-600 font-semibold hover:text-green-700 inline-flex items-center gap-2"
              >
                Comparar ahora
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>

            {/* Feature 3 */}
            <div className="bg-white rounded-2xl p-8 shadow-lg hover:shadow-xl transition-shadow border border-slate-200">
              <div className="w-14 h-14 bg-purple-100 rounded-xl flex items-center justify-center mb-6">
                <FileText className="w-8 h-8 text-purple-600" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-3">
                Reportes en PDF
              </h3>
              <p className="text-slate-600 mb-4">
                Genera reportes profesionales con toda la comparación. Compártelos
                con familia, socios o asesores financieros.
              </p>
              <span className="text-purple-600 font-semibold inline-flex items-center gap-2">
                Incluido en comparador
                <CheckCircle className="w-4 h-4" />
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20 px-4 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-slate-900 mb-4">
              Cómo funciona
            </h2>
            <p className="text-xl text-slate-600">
              Tres pasos simples para empezar a ahorrar
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {/* Step 1 */}
            <div className="text-center">
              <div className="w-16 h-16 bg-blue-600 text-white rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-6 shadow-lg">
                1
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-3">
                Explora el Mercado
              </h3>
              <p className="text-slate-600">
                Ve cómo están las AGFs chilenas en términos de costos y
                rentabilidades. Entiende el panorama completo.
              </p>
            </div>

            {/* Step 2 */}
            <div className="text-center">
              <div className="w-16 h-16 bg-green-600 text-white rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-6 shadow-lg">
                2
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-3">
                Compara tu Portafolio
              </h3>
              <p className="text-slate-600">
                Ingresa tu email, selecciona tus fondos actuales y compáralos con
                alternativas globales optimizadas.
              </p>
            </div>

            {/* Step 3 */}
            <div className="text-center">
              <div className="w-16 h-16 bg-purple-600 text-white rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-6 shadow-lg">
                3
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-3">
                Descarga tu Reporte
              </h3>
              <p className="text-slate-600">
                Genera un PDF profesional con todos los números y compártelo con
                quien necesites. Toma decisiones informadas.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-20 px-4 bg-gradient-to-br from-blue-600 to-indigo-700 text-white">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-3 gap-8 text-center">
            <div>
              <div className="text-5xl font-bold mb-2">2,000+</div>
              <p className="text-xl text-blue-100">Fondos Analizados</p>
              <p className="text-sm text-blue-200 mt-2">
                Base de datos completa de fondos chilenos
              </p>
            </div>
            <div>
              <div className="text-5xl font-bold mb-2">18</div>
              <p className="text-xl text-blue-100">AGFs Comparadas</p>
              <p className="text-sm text-blue-200 mt-2">
                Todas las administradoras del mercado
              </p>
            </div>
            <div>
              <div className="text-5xl font-bold mb-2">100%</div>
              <p className="text-xl text-blue-100">Datos Oficiales</p>
              <p className="text-sm text-blue-200 mt-2">
                Información directo de la CMF
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-20 px-4 bg-white">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl md:text-5xl font-bold text-slate-900 mb-6">
            Empieza a ahorrar hoy
          </h2>
          <p className="text-xl text-slate-600 mb-10">
            Sin costo, sin compromiso. Descubre cuánto puedes ahorrar en menos de
            5 minutos.
          </p>
          <Link
            href="/portfolio-comparison"
            className="inline-flex items-center gap-3 px-10 py-5 bg-blue-600 text-white font-bold text-xl rounded-xl hover:bg-blue-700 transition-colors shadow-2xl hover:shadow-xl"
          >
            <TrendingUp className="w-7 h-7" />
            Comparar Mi Portafolio Ahora
            <ArrowRight className="w-6 h-6" />
          </Link>
          <p className="text-sm text-slate-500 mt-6">
            ✓ Gratis ✓ Sin registro ✓ Resultados instantáneos
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-900 text-slate-300 py-12 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Building2 className="w-6 h-6 text-blue-400" />
                <span className="text-lg font-bold text-white">
                  Stonex Advisory
                </span>
              </div>
              <p className="text-sm text-slate-400">
                Herramientas profesionales para optimizar tu portafolio de
                inversiones.
              </p>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-4">Herramientas</h4>
              <ul className="space-y-2 text-sm">
                <li>
                  <Link
                    href="/market-dashboard"
                    className="hover:text-white transition-colors"
                  >
                    Panorama del Mercado
                  </Link>
                </li>
                <li>
                  <Link
                    href="/portfolio-comparison"
                    className="hover:text-white transition-colors"
                  >
                    Comparador de Portafolios
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-4">Información</h4>
              <ul className="space-y-2 text-sm text-slate-400">
                <li>Sobre Nosotros</li>
                <li>Metodología</li>
                <li>Fuente de Datos: CMF Chile</li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-4">Legal</h4>
              <ul className="space-y-2 text-sm text-slate-400">
                <li>Términos de Uso</li>
                <li>Privacidad</li>
                <li>Disclaimer</li>
              </ul>
            </div>
          </div>
          <div className="border-t border-slate-800 pt-8 text-center text-sm text-slate-400">
            <p>© 2024 Stonex Advisory. Todos los derechos reservados.</p>
            <p className="mt-2">
              Datos actualizados desde la Comisión para el Mercado Financiero
              (CMF) de Chile
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
