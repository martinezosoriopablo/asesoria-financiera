"use client";

import React, { useState } from "react";
import {
  GraduationCap,
  TrendingUp,
  TrendingDown,
  Shield,
  AlertCircle,
  CheckCircle,
  Clock,
  Target,
  BarChart3,
  Activity,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  BarChart,
  Bar,
} from "recharts";

// ============================================================
// DATOS HISTÓRICOS
// ============================================================

const crashesSP500 = [
  {
    nombre: "COVID-19",
    año: 2020,
    caida: -34,
    mesesRecuperacion: 5,
    contexto: "Pandemia global",
    destacado: false,
  },
  {
    nombre: "Crisis Financiera",
    año: 2008,
    caida: -57,
    mesesRecuperacion: 49,
    contexto: "Crisis subprime hipotecaria",
    destacado: true, // Peor caída
  },
  {
    nombre: "Burbuja Dot-com",
    año: 2000,
    caida: -49,
    mesesRecuperacion: 79,
    contexto: "Burbuja tecnológica",
    destacado: true, // Peor recuperación
  },
  {
    nombre: "Lunes Negro",
    año: 1987,
    caida: -34,
    mesesRecuperacion: 20,
    contexto: "Crash bursátil global",
    destacado: false,
  },
  {
    nombre: "Crisis Petróleo",
    año: 1973,
    caida: -48,
    mesesRecuperacion: 69,
    contexto: "Embargo petrolero OPEP",
    destacado: false,
  },
];

const estadisticasCrashes = {
  peorCaida: -57,
  mejorRecuperacion: 5,
  promedioCaida: -44,
  promedioRecuperacion: 44,
};

const comparacionActivos = {
  acciones: {
    nombre: "Acciones (100%)",
    retornoAnual: 10,
    volatilidad: 18,
    peorAño: -37,
    mejorAño: 32,
    recuperacionPromedio: 24,
    color: "#2563eb",
  },
  bonos: {
    nombre: "Bonos (100%)",
    retornoAnual: 5,
    volatilidad: 6,
    peorAño: -8,
    mejorAño: 20,
    recuperacionPromedio: 12,
    color: "#64748b",
  },
  balanceado: {
    nombre: "Balanceado (60/40)",
    retornoAnual: 7.5,
    volatilidad: 10,
    peorAño: -22,
    mejorAño: 24,
    recuperacionPromedio: 18,
    color: "#059669",
  },
};

// Datos para scatter plot riesgo-retorno
const datosRiesgoRetorno = [
  { nombre: "Bonos", volatilidad: 6, retorno: 5 },
  { nombre: "Balanceado", volatilidad: 10, retorno: 7.5 },
  { nombre: "Acciones", volatilidad: 18, retorno: 10 },
];

// Datos para gráfico de diversificación
const datosDiversificacion = [
  { fondos: "1 Fondo", volatilidad: 20 },
  { fondos: "2 Fondos", volatilidad: 14 },
  { fondos: "5 Fondos", volatilidad: 11 },
  { fondos: "10+ Fondos", volatilidad: 10 },
];

// Simulación de evolución S&P 500 (simplificada)
const evolucionSP500 = [
  { año: 1950, valor: 100 },
  { año: 1960, valor: 250 },
  { año: 1970, valor: 400 },
  { año: 1973, valor: 350 }, // Caída petróleo
  { año: 1980, valor: 550 },
  { año: 1987, valor: 700 }, // Lunes negro
  { año: 1987.5, valor: 500 }, // Caída
  { año: 1990, valor: 850 },
  { año: 2000, valor: 1200 }, // Dot-com
  { año: 2002, valor: 800 }, // Caída
  { año: 2007, valor: 1400 },
  { año: 2008, valor: 900 }, // Crisis financiera
  { año: 2012, valor: 1300 },
  { año: 2019, valor: 2800 },
  { año: 2020, valor: 2000 }, // COVID
  { año: 2021, valor: 3500 },
  { año: 2024, valor: 4500 },
];

// Simulación 20 años con $10M
const simulacion20Anos = [
  { activo: "Bonos (5%)", valorFinal: 26.5, color: "#64748b" },
  { activo: "Balanceado (7.5%)", valorFinal: 42.5, color: "#059669" },
  { activo: "Acciones (10%)", valorFinal: 67.3, color: "#2563eb" },
];

// ============================================================
// COMPONENTE PRINCIPAL
// ============================================================

export default function EducacionFinanciera() {
  const [moduloActivo, setModuloActivo] = useState<number>(1);

  const modulos = [
    { id: 1, titulo: "Riesgo y Retorno", icono: TrendingUp },
    { id: 2, titulo: "Diversificación", icono: Shield },
    { id: 3, titulo: "Caídas Históricas", icono: TrendingDown },
    { id: 4, titulo: "Comparación Final", icono: BarChart3 },
  ];

  return (
    <div className="min-h-screen bg-gb-light py-12">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gb-black rounded-full mb-4">
            <GraduationCap className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-4xl font-bold text-gb-black mb-2">
            Educacion Financiera
          </h1>
          <p className="text-lg text-gb-gray">
            Aprende los conceptos clave para invertir con confianza
          </p>
        </div>

        {/* Navigation */}
        <div className="bg-white border border-gb-border rounded-lg p-4 mb-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {modulos.map((modulo) => {
              const Icono = modulo.icono;
              const isActive = moduloActivo === modulo.id;

              return (
                <button
                  key={modulo.id}
                  onClick={() => setModuloActivo(modulo.id)}
                  className={`p-4 rounded-lg border-2 transition-all text-center ${
                    isActive
                      ? "border-gb-accent bg-gb-light"
                      : "border-gb-border bg-white hover:border-gb-gray"
                  }`}
                >
                  <Icono
                    className={`w-6 h-6 mx-auto mb-2 ${
                      isActive ? "text-gb-accent" : "text-gb-gray"
                    }`}
                  />
                  <p
                    className={`text-sm font-semibold ${
                      isActive ? "text-gb-black" : "text-gb-dark"
                    }`}
                  >
                    {modulo.titulo}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Contenido de Módulos */}
        {moduloActivo === 1 && <ModuloRiesgoRetorno />}
        {moduloActivo === 2 && <ModuloDiversificacion />}
        {moduloActivo === 3 && <ModuloCaidasHistoricas />}
        {moduloActivo === 4 && <ModuloComparacion />}

        {/* Navegación */}
        <div className="flex justify-between mt-8">
          <button
            onClick={() => setModuloActivo(Math.max(1, moduloActivo - 1))}
            disabled={moduloActivo === 1}
            className={`px-6 py-3 rounded-lg font-semibold transition-all ${
              moduloActivo === 1
                ? "bg-gb-light text-gb-gray cursor-not-allowed"
                : "bg-white border-2 border-gb-border text-gb-dark hover:border-gb-gray"
            }`}
          >
            ← Anterior
          </button>
          <button
            onClick={() => setModuloActivo(Math.min(4, moduloActivo + 1))}
            disabled={moduloActivo === 4}
            className={`px-6 py-3 rounded-lg font-semibold transition-all ${
              moduloActivo === 4
                ? "bg-gb-light text-gb-gray cursor-not-allowed"
                : "bg-gb-black text-white hover:bg-gb-dark"
            }`}
          >
            Siguiente →
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// MÓDULO 1: RIESGO Y RETORNO
// ============================================================

function ModuloRiesgoRetorno() {
  return (
    <div className="space-y-8">
      {/* Explicación */}
      <div className="bg-white border border-gb-border rounded-lg p-8">
        <h2 className="text-3xl font-bold text-gb-black mb-4 flex items-center gap-3">
          <TrendingUp className="w-8 h-8 text-gb-accent" />
          Riesgo y Retorno: La Relacion Clave
        </h2>

        <div className="bg-gb-light border-2 border-gb-border rounded-lg p-6 mb-6">
          <p className="text-lg font-semibold text-gb-black mb-3">
            Concepto Simple:
          </p>
          <div className="space-y-2 text-gb-dark">
            <p>• Mas riesgo = Mas sube y baja tu inversion</p>
            <p>• Pero tambien = Mas ganancia promedio a largo plazo</p>
          </div>
        </div>

        <div className="mb-6">
          <h3 className="text-xl font-bold text-gb-black mb-4">
            Grafico: Riesgo vs Retorno
          </h3>

          <ResponsiveContainer width="100%" height={400}>
            <ScatterChart>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis
                type="number"
                dataKey="volatilidad"
                name="Volatilidad"
                unit="%"
                domain={[0, 20]}
                stroke="#64748b"
                label={{ value: "Volatilidad (Riesgo)", position: "insideBottom", offset: -5 }}
              />
              <YAxis
                type="number"
                dataKey="retorno"
                name="Retorno"
                unit="%"
                domain={[0, 12]}
                stroke="#64748b"
                label={{ value: "Retorno Anual (%)", angle: -90, position: "insideLeft" }}
              />
              <Tooltip
                cursor={{ strokeDasharray: "3 3" }}
                formatter={(value: any) => `${value}%`}
                contentStyle={{
                  backgroundColor: "white",
                  border: "1px solid #e2e8f0",
                  borderRadius: "8px",
                }}
              />
              <Scatter
                data={datosRiesgoRetorno}
                fill="#2563eb"
                shape="circle"
                r={12}
              />
            </ScatterChart>
          </ResponsiveContainer>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
            {Object.values(comparacionActivos).map((activo) => (
              <div
                key={activo.nombre}
                className="p-4 bg-gb-light rounded-lg border border-gb-border"
              >
                <div
                  className="w-4 h-4 rounded-full mb-2"
                  style={{ backgroundColor: activo.color }}
                />
                <p className="font-semibold text-gb-black">{activo.nombre}</p>
                <p className="text-sm text-gb-gray">
                  Retorno: {activo.retornoAnual}%/año
                </p>
                <p className="text-sm text-gb-gray">
                  Volatilidad: {activo.volatilidad}%
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="p-6 bg-gb-light border-2 border-gb-border rounded-lg">
          <p className="text-lg font-semibold text-gb-black mb-2">Mensaje Clave:</p>
          <p className="text-gb-dark">
            Si quieres mas ganancia, tienes que aceptar que tu inversion va a subir y
            bajar mas. <strong>Pero a largo plazo, vale la pena.</strong> Es el precio
            que pagas por obtener mejores retornos.
          </p>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// MÓDULO 2: DIVERSIFICACIÓN
// ============================================================

function ModuloDiversificacion() {
  return (
    <div className="space-y-8">
      <div className="bg-white border border-gb-border rounded-lg p-8">
        <h2 className="text-3xl font-bold text-gb-black mb-4 flex items-center gap-3">
          <Shield className="w-8 h-8 text-gb-accent" />
          Diversificacion: No Pongas Todos los Huevos en la Misma Canasta
        </h2>

        {/* Analogía */}
        <div className="bg-gb-light border-2 border-gb-border rounded-lg p-6 mb-6">
          <p className="text-lg font-semibold text-gb-black mb-3">Analogia Simple:</p>
          <p className="text-gb-dark mb-3">
            Imagina que tienes 3 negocios:
          </p>
          <ul className="space-y-2 text-gb-dark ml-6">
            <li>• <strong>Heladeria:</strong> Va bien en verano</li>
            <li>• <strong>Cafeteria:</strong> Va bien en invierno</li>
            <li>• <strong>Panaderia:</strong> Va bien todo el año</li>
          </ul>
          <p className="text-gb-dark mt-3">
            Si solo tienes heladeria, en invierno pierdes. Pero con los 3 negocios,
            siempre estas ganando. <strong>Eso es diversificacion.</strong>
          </p>
        </div>

        {/* Gráfico de Reducción de Volatilidad */}
        <div className="mb-6">
          <h3 className="text-xl font-bold text-gb-black mb-4">
            Efecto de la Diversificacion
          </h3>

          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={datosDiversificacion}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="fondos" stroke="#64748b" />
              <YAxis
                stroke="#64748b"
                label={{ value: "Volatilidad (%)", angle: -90, position: "insideLeft" }}
              />
              <Tooltip
                formatter={(value: any) => `${value}%`}
                contentStyle={{
                  backgroundColor: "white",
                  border: "1px solid #e2e8f0",
                  borderRadius: "8px",
                }}
              />
              <Bar dataKey="volatilidad" fill="#2563eb" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
            {datosDiversificacion.map((item) => (
              <div
                key={item.fondos}
                className="p-4 bg-gb-light rounded-lg border border-gb-border text-center"
              >
                <p className="font-semibold text-gb-black">{item.fondos}</p>
                <p className="text-2xl font-bold text-gb-accent mt-2">
                  {item.volatilidad}%
                </p>
                <p className="text-xs text-gb-gray mt-1">volatilidad</p>
              </div>
            ))}
          </div>
        </div>

        <div className="p-6 bg-gb-light border-2 border-gb-border rounded-lg">
          <p className="text-lg font-semibold text-gb-black mb-2">Mensaje Clave:</p>
          <p className="text-gb-dark">
            Con mas fondos, reduces el riesgo <strong>SIN sacrificar mucha
            rentabilidad.</strong> Es como tener un seguro gratis. Un portafolio
            diversificado (10+ fondos) tiene la mitad del riesgo de un solo fondo.
          </p>
        </div>
      </div>
    </div>
  );
}

// Continúa en el siguiente archivo...

// ============================================================
// MÓDULO 3: CAÍDAS HISTÓRICAS (MÁS IMPORTANTE)
// ============================================================

function ModuloCaidasHistoricas() {
  return (
    <div className="space-y-8">
      <div className="bg-white border border-gb-border rounded-lg p-8">
        <h2 className="text-3xl font-bold text-gb-black mb-4 flex items-center gap-3">
          <TrendingDown className="w-8 h-8 text-gb-accent" />
          Analisis de Caidas Historicas del S&P 500
        </h2>

        <div className="bg-gb-light border-2 border-gb-border rounded-lg p-6 mb-6">
          <p className="text-lg text-gb-dark">
            <strong>S&P 500:</strong> Indice que representa las 500 empresas mas grandes de
            Estados Unidos. Es el mejor indicador de como le va al mercado de acciones
            global.
          </p>
        </div>

        {/* Tabla de Crashes */}
        <div className="mb-8">
          <h3 className="text-xl font-bold text-gb-black mb-4">
            Crashes Historicos Principales
          </h3>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b-2 border-gb-border bg-gb-light">
                  <th className="text-left py-3 px-4 text-sm font-semibold text-gb-dark">
                    Evento
                  </th>
                  <th className="text-center py-3 px-4 text-sm font-semibold text-gb-dark">
                    Año
                  </th>
                  <th className="text-center py-3 px-4 text-sm font-semibold text-gb-dark">
                    Caida
                  </th>
                  <th className="text-center py-3 px-4 text-sm font-semibold text-gb-dark">
                    Recuperacion
                  </th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-gb-dark">
                    Contexto
                  </th>
                </tr>
              </thead>
              <tbody>
                {crashesSP500.map((crash) => (
                  <tr
                    key={crash.año}
                    className={`border-b border-gb-border ${
                      crash.destacado ? "bg-gb-light" : ""
                    }`}
                  >
                    <td className="py-3 px-4 font-semibold text-gb-black">
                      {crash.nombre}
                    </td>
                    <td className="py-3 px-4 text-center text-gb-dark">
                      {crash.año}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="font-bold text-red-600">
                        {crash.caida}%
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="font-semibold text-gb-dark">
                        {crash.mesesRecuperacion} meses
                      </span>
                    </td>
                    <td className="py-3 px-4 text-sm text-gb-gray">
                      {crash.contexto}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Estadísticas */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="p-6 bg-red-50 rounded-lg border-2 border-red-200 text-center">
            <p className="text-sm text-gb-gray mb-2">Peor Caida</p>
            <p className="text-4xl font-bold text-red-600">
              {estadisticasCrashes.peorCaida}%
            </p>
            <p className="text-xs text-gb-gray mt-1">2008</p>
          </div>

          <div className="p-6 bg-emerald-50 rounded-lg border-2 border-emerald-200 text-center">
            <p className="text-sm text-gb-gray mb-2">Mejor Recuperacion</p>
            <p className="text-4xl font-bold text-emerald-600">
              {estadisticasCrashes.mejorRecuperacion}
            </p>
            <p className="text-xs text-gb-gray mt-1">meses (2020)</p>
          </div>

          <div className="p-6 bg-gb-light rounded-lg border-2 border-gb-border text-center">
            <p className="text-sm text-gb-gray mb-2">Caida Promedio</p>
            <p className="text-4xl font-bold text-gb-dark">
              {estadisticasCrashes.promedioCaida}%
            </p>
          </div>

          <div className="p-6 bg-gb-light rounded-lg border-2 border-gb-border text-center">
            <p className="text-sm text-gb-gray mb-2">Recuperacion Promedio</p>
            <p className="text-4xl font-bold text-gb-accent">
              {estadisticasCrashes.promedioRecuperacion}
            </p>
            <p className="text-xs text-gb-gray mt-1">meses</p>
          </div>
        </div>

        {/* Gráfico Histórico */}
        <div className="mb-8">
          <h3 className="text-xl font-bold text-gb-black mb-4">
            Evolucion del S&P 500 (1950-2024)
          </h3>

          <ResponsiveContainer width="100%" height={400}>
            <LineChart data={evolucionSP500}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis
                dataKey="año"
                stroke="#64748b"
                label={{ value: "Año", position: "insideBottom", offset: -5 }}
              />
              <YAxis
                stroke="#64748b"
                label={{ value: "Valor Índice", angle: -90, position: "insideLeft" }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "white",
                  border: "1px solid #e2e8f0",
                  borderRadius: "8px",
                }}
              />
              <Line
                type="monotone"
                dataKey="valor"
                stroke="#2563eb"
                strokeWidth={3}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
            <div className="p-4 bg-red-50 rounded-lg border border-red-200">
              <p className="text-sm font-semibold text-gb-black mb-1">
                Caidas visibles:
              </p>
              <p className="text-sm text-gb-dark">
                1973, 1987, 2000-2002, 2008, 2020
              </p>
            </div>
            <div className="p-4 bg-emerald-50 rounded-lg border border-emerald-200">
              <p className="text-sm font-semibold text-gb-black mb-1">
                Tendencia general:
              </p>
              <p className="text-sm text-gb-dark">
                Siempre hacia ARRIBA a largo plazo
              </p>
            </div>
            <div className="p-4 bg-gb-light rounded-lg border border-gb-border">
              <p className="text-sm font-semibold text-gb-black mb-1">
                Crecimiento:
              </p>
              <p className="text-sm text-gb-dark">
                De 100 a 4,500 en 74 años (45x)
              </p>
            </div>
          </div>
        </div>

        {/* MENSAJE CLAVE (MUY IMPORTANTE) */}
        <div className="p-8 bg-gb-black rounded-lg border border-gb-border text-white">
          <div className="text-center mb-6">
            <h3 className="text-3xl font-bold mb-4">EL MENSAJE CLAVE</h3>
            <p className="text-2xl font-bold mb-2">
              "Las caidas son TEMPORALES,
            </p>
            <p className="text-2xl font-bold">
              el crecimiento es PERMANENTE."
            </p>
          </div>

          <div className="space-y-4">
            <div className="flex items-start gap-3 bg-white/10 backdrop-blur rounded-lg p-4">
              <CheckCircle className="w-6 h-6 flex-shrink-0 mt-1" />
              <div>
                <p className="font-semibold mb-1">Todas las caidas se recuperaron</p>
                <p className="text-sm text-white/70">
                  En los ultimos 74 años, ha habido 15 caidas grandes ({">"} 20%). TODAS se
                  recuperaron. Sin excepcion.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 bg-white/10 backdrop-blur rounded-lg p-4">
              <TrendingUp className="w-6 h-6 flex-shrink-0 mt-1" />
              <div>
                <p className="font-semibold mb-1">La tendencia siempre es hacia arriba</p>
                <p className="text-sm text-white/70">
                  A pesar de guerras, pandemias, crisis financieras, el mercado siempre
                  termina mas alto que antes.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 bg-white/10 backdrop-blur rounded-lg p-4">
              <Clock className="w-6 h-6 flex-shrink-0 mt-1" />
              <div>
                <p className="font-semibold mb-1">Solo necesitas TIEMPO</p>
                <p className="text-sm text-white/70">
                  Si inviertes hoy y el mercado cae mañana 30%, tu dinero NO desaparece.
                  Esta ahi, esperando a recuperarse. Historicamente, SIEMPRE se recupera.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 bg-white/10 backdrop-blur rounded-lg p-4">
              <AlertCircle className="w-6 h-6 flex-shrink-0 mt-1" />
              <div>
                <p className="font-semibold mb-1">Tu unica enemiga es el PANICO</p>
                <p className="text-sm text-white/70">
                  Si vendes en la caida, pierdes. Si esperas con paciencia, ganas. La
                  historia lo ha demostrado una y otra vez.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-6 p-4 bg-white/20 backdrop-blur rounded-lg text-center">
            <p className="text-xl font-bold">
              TIEMPO {">"} TIMING
            </p>
            <p className="text-sm mt-2 text-white/70">
              Mas importante que el momento perfecto para entrar, es el tiempo que te quedas
              invertido.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// MÓDULO 4: COMPARACIÓN FINAL
// ============================================================

function ModuloComparacion() {
  const calcularValorFinal = (retornoAnual: number, años: number = 20) => {
    return 10 * Math.pow(1 + retornoAnual / 100, años);
  };

  return (
    <div className="space-y-8">
      <div className="bg-white border border-gb-border rounded-lg p-8">
        <h2 className="text-3xl font-bold text-gb-black mb-4 flex items-center gap-3">
          <BarChart3 className="w-8 h-8 text-gb-accent" />
          Comparacion Final: Que Elegir?
        </h2>

        {/* Tabla Comparativa */}
        <div className="mb-8">
          <h3 className="text-xl font-bold text-gb-black mb-4">
            Acciones vs Bonos vs Balanceado
          </h3>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b-2 border-gb-border bg-gb-light">
                  <th className="text-left py-3 px-4 text-sm font-semibold text-gb-dark">
                    Caracteristica
                  </th>
                  <th className="text-center py-3 px-4 text-sm font-semibold text-gb-dark">
                    Acciones (100%)
                  </th>
                  <th className="text-center py-3 px-4 text-sm font-semibold text-gb-dark">
                    Bonos (100%)
                  </th>
                  <th className="text-center py-3 px-4 text-sm font-semibold text-gb-dark">
                    Balanceado (60/40)
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-gb-border">
                  <td className="py-3 px-4 font-semibold text-gb-black">
                    Retorno Anual
                  </td>
                  <td className="py-3 px-4 text-center text-gb-accent font-bold">
                    {comparacionActivos.acciones.retornoAnual}%
                  </td>
                  <td className="py-3 px-4 text-center text-gb-gray font-semibold">
                    {comparacionActivos.bonos.retornoAnual}%
                  </td>
                  <td className="py-3 px-4 text-center text-emerald-600 font-bold">
                    {comparacionActivos.balanceado.retornoAnual}%
                  </td>
                </tr>
                <tr className="border-b border-gb-border">
                  <td className="py-3 px-4 font-semibold text-gb-black">Peor Año</td>
                  <td className="py-3 px-4 text-center text-red-600 font-bold">
                    {comparacionActivos.acciones.peorAño}%
                  </td>
                  <td className="py-3 px-4 text-center text-gb-gray font-semibold">
                    {comparacionActivos.bonos.peorAño}%
                  </td>
                  <td className="py-3 px-4 text-center text-orange-600 font-semibold">
                    {comparacionActivos.balanceado.peorAño}%
                  </td>
                </tr>
                <tr className="border-b border-gb-border">
                  <td className="py-3 px-4 font-semibold text-gb-black">
                    Recuperacion Promedio
                  </td>
                  <td className="py-3 px-4 text-center text-gb-gray">
                    {comparacionActivos.acciones.recuperacionPromedio} meses
                  </td>
                  <td className="py-3 px-4 text-center text-gb-gray">
                    {comparacionActivos.bonos.recuperacionPromedio} meses
                  </td>
                  <td className="py-3 px-4 text-center text-gb-gray">
                    {comparacionActivos.balanceado.recuperacionPromedio} meses
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Simulación 20 años */}
        <div className="mb-8">
          <h3 className="text-xl font-bold text-gb-black mb-4">
            Simulacion: $10M invertidos por 20 años
          </h3>

          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={simulacion20Anos}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="activo" stroke="#64748b" />
              <YAxis
                stroke="#64748b"
                label={{ value: "Valor Final (Millones $)", angle: -90, position: "insideLeft" }}
              />
              <Tooltip
                formatter={(value: any) => `$${value.toFixed(1)}M`}
                contentStyle={{
                  backgroundColor: "white",
                  border: "1px solid #e2e8f0",
                  borderRadius: "8px",
                }}
              />
              <Bar dataKey="valorFinal" fill="#2563eb" radius={[8, 8, 0, 0]}>
                {simulacion20Anos.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
            {Object.entries(comparacionActivos).map(([key, activo]) => {
              const valorFinal = calcularValorFinal(activo.retornoAnual);
              return (
                <div
                  key={key}
                  className="p-6 bg-gb-light rounded-lg border-2 border-gb-border text-center"
                >
                  <div
                    className="w-6 h-6 rounded-full mx-auto mb-3"
                    style={{ backgroundColor: activo.color }}
                  />
                  <p className="font-semibold text-gb-black mb-2">{activo.nombre}</p>
                  <p className="text-3xl font-bold mb-1" style={{ color: activo.color }}>
                    ${valorFinal.toFixed(1)}M
                  </p>
                  <p className="text-sm text-gb-gray">
                    Ganancia: ${(valorFinal - 10).toFixed(1)}M
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Conclusión */}
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-6 bg-gb-light rounded-lg border-2 border-gb-border">
              <p className="font-bold text-gb-black mb-2 flex items-center gap-2">
                <Shield className="w-5 h-5 text-gb-gray" />
                Solo Bonos
              </p>
              <p className="text-sm text-gb-dark">
                Mas seguro, menos volatilidad
              </p>
              <p className="text-sm text-gb-dark mt-2">
                Crece poco, pierdes poder adquisitivo
              </p>
            </div>

            <div className="p-6 bg-gb-light rounded-lg border-2 border-gb-accent">
              <p className="font-bold text-gb-black mb-2 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-gb-accent" />
                Solo Acciones
              </p>
              <p className="text-sm text-gb-dark">
                Maxima rentabilidad (2.5x mas que bonos)
              </p>
              <p className="text-sm text-gb-dark mt-2">
                Mas volatilidad, requiere paciencia
              </p>
            </div>

            <div className="p-6 bg-gb-light rounded-lg border-2 border-emerald-300">
              <p className="font-bold text-gb-black mb-2 flex items-center gap-2">
                <Target className="w-5 h-5 text-emerald-600" />
                Balanceado
              </p>
              <p className="text-sm text-gb-dark">
                Lo mejor de ambos mundos
              </p>
              <p className="text-sm text-gb-dark mt-2">
                Buen retorno con riesgo moderado
              </p>
            </div>
          </div>

          <div className="p-8 bg-gb-light border-2 border-gb-border rounded-lg">
            <p className="text-2xl font-bold text-gb-black mb-4 text-center">
              Conclusion Final
            </p>
            <div className="space-y-3 text-gb-dark">
              <p className="flex items-start gap-3">
                <CheckCircle className="w-6 h-6 text-emerald-600 flex-shrink-0 mt-0.5" />
                <span>
                  Si tienes <strong>TIEMPO</strong> (10+ años), vale la pena aceptar mas
                  riesgo con acciones o balanceado.
                </span>
              </p>
              <p className="flex items-start gap-3">
                <CheckCircle className="w-6 h-6 text-emerald-600 flex-shrink-0 mt-0.5" />
                <span>
                  La diferencia en 20 años es <strong>ENORME:</strong> $67M (acciones) vs
                  $26M (bonos).
                </span>
              </p>
              <p className="flex items-start gap-3">
                <CheckCircle className="w-6 h-6 text-emerald-600 flex-shrink-0 mt-0.5" />
                <span>
                  El <strong>portafolio balanceado</strong> es ideal para la mayoria: buen
                  retorno ($42M) sin tanto estres.
                </span>
              </p>
              <p className="flex items-start gap-3">
                <CheckCircle className="w-6 h-6 text-emerald-600 flex-shrink-0 mt-0.5" />
                <span>
                  Recuerda: Las caidas son temporales, el crecimiento es permanente. Solo
                  necesitas <strong>no vender en panico.</strong>
                </span>
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Mensaje Final Motivacional */}
      <div className="bg-gb-black rounded-lg border border-gb-border p-8 text-white text-center">
        <Activity className="w-16 h-16 mx-auto mb-4" />
        <h3 className="text-3xl font-bold mb-4">Felicitaciones!</h3>
        <p className="text-xl mb-6">
          Ahora tienes las herramientas para invertir con confianza.
        </p>
        <div className="bg-white/10 backdrop-blur rounded-lg p-6">
          <p className="text-lg font-semibold mb-2">Recuerda los 3 pilares:</p>
          <div className="space-y-2 text-left">
            <p>1. <strong>Riesgo-Retorno:</strong> Mas riesgo = Mas ganancia</p>
            <p>2. <strong>Diversificacion:</strong> Reduce riesgo gratis</p>
            <p>3. <strong>Tiempo:</strong> Las caidas se recuperan, siempre</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// Agregar Cell component for recharts
import { Cell } from "recharts";
