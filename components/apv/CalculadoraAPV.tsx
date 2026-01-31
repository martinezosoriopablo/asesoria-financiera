"use client";

import React, { useState, useEffect } from "react";
import {
  Calculator,
  TrendingUp,
  DollarSign,
  Calendar,
  Target,
  AlertCircle,
  ArrowRight,
  Sparkles,
} from "lucide-react";

// ============================================================
// TIPOS
// ============================================================

interface ClienteAPV {
  salarioBrutoMensual: number;
  montoAPVMensual: number;
  edad: number;
  edadRetiro: number;
  perfilInversion: "conservador" | "moderado" | "agresivo";
}

interface ResultadoAPV {
  // Beneficio tributario
  ahorroMensualA: number;
  ahorroAnualA: number;
  rentabilidadEquivalenteA: number;
  creditoMensualB: number;
  creditoAnualB: number;
  
  // Proyección
  aniosHastaRetiro: number;
  totalAportado: number;
  saldoFinalConAPV: number;
  saldoFinalSinAPV: number;
  diferenciaTotal: number;
  multiplicador: number;
  
  // Desglose
  gananciaPorRentabilidad: number;
  gananciaPorBeneficio: number;
  
  // Evolución año por año
  evolucion: EvolucionAnual[];
  
  // Costo de postergar
  costoPostergar: CostoPostergar[];
}

interface EvolucionAnual {
  edad: number;
  anio: number;
  aportadoAcumulado: number;
  saldoConAPV: number;
  saldoSinAPV: number;
  diferencia: number;
}

interface CostoPostergar {
  aniosPostergados: number;
  edadInicio: number;
  saldoFinal: number;
  perdida: number;
}

// ============================================================
// CONSTANTES
// ============================================================

const UF_VALOR_DEFAULT = 37800;
let UF_VALOR = UF_VALOR_DEFAULT;

const tramosImpuesto2024 = [
  { desde: 0, hasta: 13.5, tasa: 0 },
  { desde: 13.5, hasta: 30, tasa: 0.04 },
  { desde: 30, hasta: 50, tasa: 0.08 },
  { desde: 50, hasta: 70, tasa: 0.135 },
  { desde: 70, hasta: 90, tasa: 0.23 },
  { desde: 90, hasta: 120, tasa: 0.304 },
  { desde: 120, hasta: 310, tasa: 0.355 },
  { desde: 310, hasta: Infinity, tasa: 0.40 },
];

const rentabilidadesHistoricas = {
  conservador: {
    nombre: "Conservador",
    descripcion: "70% Bonos, 30% Acciones",
    rentabilidadAnual: 0.045,
    riesgo: "Bajo",
    ejemplos: "Fondo E (multifondos)",
    historico: { mejor: 12, peor: -2, promedio: 4.5 },
  },
  moderado: {
    nombre: "Moderado",
    descripcion: "50% Bonos, 50% Acciones",
    rentabilidadAnual: 0.07,
    riesgo: "Medio",
    ejemplos: "Fondo C (multifondos)",
    historico: { mejor: 28, peor: -15, promedio: 7 },
  },
  agresivo: {
    nombre: "Agresivo",
    descripcion: "90% Acciones, 10% Bonos",
    rentabilidadAnual: 0.10,
    riesgo: "Alto",
    ejemplos: "Fondo A (multifondos)",
    historico: { mejor: 45, peor: -35, promedio: 10 },
  },
};

// ============================================================
// FUNCIONES DE CÁLCULO
// ============================================================

function calcularImpuesto(baseImponible: number): number {
  const baseEnUF = baseImponible / UF_VALOR;
  let impuesto = 0;

  for (let i = 0; i < tramosImpuesto2024.length; i++) {
    const tramo = tramosImpuesto2024[i];

    if (baseEnUF <= tramo.desde) break;

    const limiteInferior = tramo.desde;
    const limiteSuperior = Math.min(baseEnUF, tramo.hasta);
    const baseGravable = limiteSuperior - limiteInferior;

    impuesto += baseGravable * UF_VALOR * tramo.tasa;
  }

  return impuesto;
}

function calcularAPV_A(salarioAnual: number, aporteAnual: number) {
  // Tope: menor entre 600 UF/año o 30% del salario
  const tope600UF = 600 * UF_VALOR;
  const tope30Porciento = salarioAnual * 0.3;
  const topeAPV = Math.min(tope600UF, tope30Porciento);

  const aporteElegible = Math.min(aporteAnual, topeAPV);

  const impuestoSinAPV = calcularImpuesto(salarioAnual);
  const impuestoConAPV = calcularImpuesto(salarioAnual - aporteElegible);

  const ahorroAnual = impuestoSinAPV - impuestoConAPV;
  const rentabilidadEquivalente = (ahorroAnual / aporteAnual) * 100;

  return {
    ahorroAnual,
    ahorroMensual: ahorroAnual / 12,
    rentabilidadEquivalente,
  };
}

function calcularAPV_B(aporteAnual: number) {
  const tope = 600 * UF_VALOR;
  const aporteElegible = Math.min(aporteAnual, tope);
  const creditoAnual = aporteElegible * 0.15;

  return {
    creditoAnual,
    creditoMensual: creditoAnual / 12,
  };
}

function calcularValorFuturo(
  aporteAnual: number,
  rentabilidadAnual: number,
  años: number
): number {
  if (años === 0) return 0;
  const factor = Math.pow(1 + rentabilidadAnual, años) - 1;
  return aporteAnual * (factor / rentabilidadAnual);
}

function calcularEvolucionAnual(
  datos: ClienteAPV,
  beneficioAnualA: number,
  rentabilidadAnual: number
): EvolucionAnual[] {
  const evolucion: EvolucionAnual[] = [];
  const aporteAnual = datos.montoAPVMensual * 12;
  const aporteConBeneficio = aporteAnual + beneficioAnualA;

  const aniosHastaRetiro = datos.edadRetiro - datos.edad;
  const hitos = [0, 2, 5, 7, 10, 12, 15, aniosHastaRetiro];

  hitos.forEach((anio) => {
    if (anio <= aniosHastaRetiro) {
      const saldoConAPV = calcularValorFuturo(aporteConBeneficio, rentabilidadAnual, anio);
      const saldoSinAPV = calcularValorFuturo(aporteAnual, rentabilidadAnual, anio);

      evolucion.push({
        edad: datos.edad + anio,
        anio,
        aportadoAcumulado: aporteAnual * anio,
        saldoConAPV,
        saldoSinAPV,
        diferencia: saldoConAPV - saldoSinAPV,
      });
    }
  });

  return evolucion;
}

function calcularCostoPostergar(
  datos: ClienteAPV,
  beneficioAnualA: number,
  rentabilidadAnual: number
): CostoPostergar[] {
  const aporteAnual = datos.montoAPVMensual * 12;
  const aporteConBeneficio = aporteAnual + beneficioAnualA;

  const aniosHastaRetiro = datos.edadRetiro - datos.edad;
  const saldoBaseHoy = calcularValorFuturo(aporteConBeneficio, rentabilidadAnual, aniosHastaRetiro);

  const postergar = [0, 1, 3, 5];
  return postergar.map((aniosPostergados) => {
    const nuevaEdadInicio = datos.edad + aniosPostergados;
    const nuevosAniosInversion = datos.edadRetiro - nuevaEdadInicio;
    const saldoFinal = calcularValorFuturo(
      aporteConBeneficio,
      rentabilidadAnual,
      nuevosAniosInversion
    );
    const perdida = saldoBaseHoy - saldoFinal;

    return {
      aniosPostergados,
      edadInicio: nuevaEdadInicio,
      saldoFinal,
      perdida,
    };
  });
}

function calcularTodo(datos: ClienteAPV): ResultadoAPV {
  const salarioAnual = datos.salarioBrutoMensual * 12;
  const aporteAnual = datos.montoAPVMensual * 12;

  const resultadoA = calcularAPV_A(salarioAnual, aporteAnual);
  const resultadoB = calcularAPV_B(aporteAnual);

  const perfil = rentabilidadesHistoricas[datos.perfilInversion];
  const rentabilidadAnual = perfil.rentabilidadAnual;

  const aniosHastaRetiro = datos.edadRetiro - datos.edad;
  const totalAportado = aporteAnual * aniosHastaRetiro;

  const aporteConBeneficio = aporteAnual + resultadoA.ahorroAnual;

  const saldoFinalConAPV = calcularValorFuturo(
    aporteConBeneficio,
    rentabilidadAnual,
    aniosHastaRetiro
  );
  const saldoFinalSinAPV = calcularValorFuturo(aporteAnual, rentabilidadAnual, aniosHastaRetiro);

  const diferenciaTotal = saldoFinalConAPV - saldoFinalSinAPV;
  const gananciaPorRentabilidad = saldoFinalSinAPV - totalAportado;
  const gananciaPorBeneficio = diferenciaTotal;

  const evolucion = calcularEvolucionAnual(datos, resultadoA.ahorroAnual, rentabilidadAnual);
  const costoPostergar = calcularCostoPostergar(datos, resultadoA.ahorroAnual, rentabilidadAnual);

  return {
    ahorroMensualA: resultadoA.ahorroMensual,
    ahorroAnualA: resultadoA.ahorroAnual,
    rentabilidadEquivalenteA: resultadoA.rentabilidadEquivalente,
    creditoMensualB: resultadoB.creditoMensual,
    creditoAnualB: resultadoB.creditoAnual,

    aniosHastaRetiro,
    totalAportado,
    saldoFinalConAPV,
    saldoFinalSinAPV,
    diferenciaTotal,
    multiplicador: saldoFinalConAPV / totalAportado,

    gananciaPorRentabilidad,
    gananciaPorBeneficio,

    evolucion,
    costoPostergar,
  };
}

// ============================================================
// COMPONENTE PRINCIPAL
// ============================================================

export default function CalculadoraAPV() {
  const [datos, setDatos] = useState<ClienteAPV>({
    salarioBrutoMensual: 5000000,
    montoAPVMensual: 200000,
    edad: 48,
    edadRetiro: 65,
    perfilInversion: "moderado",
  });

  const [resultado, setResultado] = useState<ResultadoAPV | null>(null);
  const [ufActual, setUfActual] = useState(UF_VALOR_DEFAULT);

  useEffect(() => {
    fetch("https://mindicador.cl/api/uf")
      .then((r) => r.json())
      .then((data) => {
        const valor = data?.serie?.[0]?.valor;
        if (typeof valor === "number" && valor > 0) {
          UF_VALOR = Math.round(valor);
          setUfActual(Math.round(valor));
        }
      })
      .catch(() => {});
  }, []);

  const handleCalcular = () => {
    const res = calcularTodo(datos);
    setResultado(res);
  };

  const formatearPesos = (valor: number) => {
    return new Intl.NumberFormat("es-CL", {
      style: "currency",
      currency: "CLP",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(valor);
  };

  const formatearMillones = (valor: number) => {
    const millones = valor / 1000000;
    return `$${millones.toFixed(1)}M`;
  };

  const perfil = rentabilidadesHistoricas[datos.perfilInversion];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 py-12">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-green-500 to-emerald-600 rounded-full mb-4">
            <Calculator className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-4xl font-bold text-slate-900 mb-2">
            Calculadora APV con Proyección
          </h1>
          <p className="text-lg text-slate-600">
            Descubre cuánto ahorrarás en impuestos y cuánto tendrás al jubilar
          </p>
        </div>

        {/* Inputs */}
        <div className="bg-white rounded-xl shadow-lg p-8 mb-8">
          <h2 className="text-2xl font-bold text-slate-900 mb-6 flex items-center gap-2">
            <Calendar className="w-6 h-6 text-blue-600" />
            Paso 1: Tus Datos
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Edad */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Edad Actual
              </label>
              <input
                type="number"
                value={datos.edad}
                onChange={(e) => setDatos({ ...datos, edad: Number(e.target.value) })}
                className="w-full border-2 border-slate-200 rounded-lg px-4 py-3 text-lg focus:outline-none focus:border-blue-500"
              />
            </div>

            {/* Edad Retiro */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Edad de Retiro
              </label>
              <input
                type="number"
                value={datos.edadRetiro}
                onChange={(e) => setDatos({ ...datos, edadRetiro: Number(e.target.value) })}
                className="w-full border-2 border-slate-200 rounded-lg px-4 py-3 text-lg focus:outline-none focus:border-blue-500"
              />
              <p className="text-sm text-slate-500 mt-1">
                Años hasta retiro: {datos.edadRetiro - datos.edad} años
              </p>
            </div>

            {/* Salario */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Salario Bruto Mensual
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-medium">
                  $
                </span>
                <input
                  type="text"
                  value={datos.salarioBrutoMensual.toLocaleString("es-CL")}
                  onChange={(e) => {
                    const valor = Number(e.target.value.replace(/\D/g, ""));
                    setDatos({ ...datos, salarioBrutoMensual: valor });
                  }}
                  className="w-full border-2 border-slate-200 rounded-lg pl-8 pr-4 py-3 text-lg focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            {/* Aporte APV */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Aporte APV Mensual
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-medium">
                  $
                </span>
                <input
                  type="text"
                  value={datos.montoAPVMensual.toLocaleString("es-CL")}
                  onChange={(e) => {
                    const valor = Number(e.target.value.replace(/\D/g, ""));
                    setDatos({ ...datos, montoAPVMensual: valor });
                  }}
                  className="w-full border-2 border-slate-200 rounded-lg pl-8 pr-4 py-3 text-lg focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Perfil de Inversión */}
          <div className="mt-8">
            <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-green-600" />
              Paso 2: Perfil de Inversión
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {(["conservador", "moderado", "agresivo"] as const).map((tipo) => {
                const p = rentabilidadesHistoricas[tipo];
                const isSelected = datos.perfilInversion === tipo;

                return (
                  <button
                    key={tipo}
                    onClick={() => setDatos({ ...datos, perfilInversion: tipo })}
                    className={`p-4 rounded-lg border-2 transition-all text-left ${
                      isSelected
                        ? "border-blue-500 bg-blue-50"
                        : "border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <div
                        className={`w-4 h-4 rounded-full border-2 ${
                          isSelected
                            ? "border-blue-500 bg-blue-500"
                            : "border-slate-300"
                        }`}
                      >
                        {isSelected && (
                          <div className="w-full h-full rounded-full bg-white scale-50" />
                        )}
                      </div>
                      <span className="font-semibold text-slate-900">{p.nombre}</span>
                    </div>
                    <p className="text-sm text-slate-600 mb-1">{p.descripcion}</p>
                    <p className="text-sm font-semibold text-green-600">
                      {(p.rentabilidadAnual * 100).toFixed(1)}% anual
                    </p>
                    <p className="text-xs text-slate-500 mt-1">Riesgo: {p.riesgo}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Botón Calcular */}
          <button
            onClick={handleCalcular}
            className="w-full mt-8 bg-gradient-to-r from-blue-600 to-blue-700 text-white font-semibold py-4 px-6 rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all shadow-lg hover:shadow-xl flex items-center justify-center gap-2"
          >
            <Calculator className="w-5 h-5" />
            Calcular Proyección
          </button>
        </div>

        {/* Resultados */}
        {resultado && (
          <div className="space-y-8">
            {/* Proyección Principal */}
            <div className="bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl shadow-xl p-8 text-white">
              <div className="flex items-center gap-3 mb-6">
                <Target className="w-8 h-8" />
                <h2 className="text-3xl font-bold">
                  Tu Proyección a los {datos.edadRetiro} Años
                </h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white/10 backdrop-blur rounded-lg p-6">
                  <p className="text-green-100 text-sm mb-2">Vas a aportar</p>
                  <p className="text-4xl font-bold">{formatearMillones(resultado.totalAportado)}</p>
                  <p className="text-green-100 text-xs mt-1">
                    {resultado.aniosHastaRetiro} años × {formatearMillones(datos.montoAPVMensual * 12)}/año
                  </p>
                </div>

                <div className="bg-white/10 backdrop-blur rounded-lg p-6">
                  <p className="text-green-100 text-sm mb-2">Se transformará en</p>
                  <p className="text-4xl font-bold flex items-center gap-2">
                    <Sparkles className="w-8 h-8" />
                    {formatearMillones(resultado.saldoFinalConAPV)}
                  </p>
                  <p className="text-green-100 text-xs mt-1">
                    Con APV Tipo A + {perfil.nombre}
                  </p>
                </div>

                <div className="bg-white/10 backdrop-blur rounded-lg p-6">
                  <p className="text-green-100 text-sm mb-2">Multiplicador</p>
                  <p className="text-4xl font-bold">{resultado.multiplicador.toFixed(1)}x</p>
                  <p className="text-green-100 text-xs mt-1">
                    Tu dinero se multiplica por {resultado.multiplicador.toFixed(1)}
                  </p>
                </div>
              </div>
            </div>

            {/* Continúa en el siguiente mensaje... */}
          </div>
        )}

        {/* Valor del Beneficio */}
        {resultado && (
          <div className="bg-white rounded-xl shadow-lg p-8">
            <h3 className="text-2xl font-bold text-slate-900 mb-6 flex items-center gap-2">
              <Sparkles className="w-6 h-6 text-yellow-500" />
              Valor del Beneficio Tributario APV
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div className="bg-slate-50 rounded-lg p-6">
                <p className="text-slate-600 text-sm mb-2">SIN APV (inversión directa)</p>
                <p className="text-3xl font-bold text-slate-700">
                  {formatearMillones(resultado.saldoFinalSinAPV)}
                </p>
              </div>

              <div className="bg-green-50 rounded-lg p-6">
                <p className="text-green-700 text-sm mb-2">CON APV Tipo A</p>
                <p className="text-3xl font-bold text-green-700">
                  {formatearMillones(resultado.saldoFinalConAPV)}
                </p>
              </div>
            </div>

            <div className="bg-gradient-to-r from-yellow-50 to-amber-50 border-2 border-yellow-200 rounded-lg p-6">
              <p className="text-lg font-semibold text-slate-900 mb-2">
                ✅ DIFERENCIA: {formatearMillones(resultado.diferenciaTotal)}
              </p>
              <p className="text-slate-700">
                El beneficio tributario te regala{" "}
                <span className="font-bold text-green-600">
                  {formatearMillones(resultado.diferenciaTotal)}
                </span>{" "}
                extras que no tendrías invirtiendo directo.
              </p>
            </div>
          </div>
        )}

        {/* Desglose */}
        {resultado && (
          <div className="bg-white rounded-xl shadow-lg p-8">
            <h3 className="text-2xl font-bold text-slate-900 mb-6">
              💡 ¿De dónde vienen los {formatearMillones(resultado.saldoFinalConAPV)}?
            </h3>

            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
                  <DollarSign className="w-8 h-8 text-blue-600" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-slate-900">
                    {formatearMillones(resultado.totalAportado)} son tus aportes
                  </p>
                  <p className="text-sm text-slate-600">Lo que tú pones mes a mes</p>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
                  <TrendingUp className="w-8 h-8 text-green-600" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-slate-900">
                    {formatearMillones(resultado.gananciaPorRentabilidad)} vienen de rentabilidad
                  </p>
                  <p className="text-sm text-slate-600">
                    Interés compuesto al {(perfil.rentabilidadAnual * 100).toFixed(1)}% anual
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center">
                  <Sparkles className="w-8 h-8 text-yellow-600" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-slate-900">
                    {formatearMillones(resultado.gananciaPorBeneficio)} son REGALO del beneficio APV
                  </p>
                  <p className="text-sm text-slate-600">
                    El Estado te regala ~{resultado.rentabilidadEquivalenteA.toFixed(1)}% de tu aporte cada año
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-6 p-4 bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg border border-blue-200">
              <p className="text-center text-lg font-semibold text-slate-900">
                🎁 El Estado te está regalando prácticamente lo que aportaste
              </p>
            </div>
          </div>
        )}

        {/* Evolución Año por Año */}
        {resultado && (
          <div className="bg-white rounded-xl shadow-lg p-8">
            <h3 className="text-2xl font-bold text-slate-900 mb-6">
              📈 Evolución de tu Ahorro
            </h3>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b-2 border-slate-200">
                    <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">
                      Edad
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">
                      Años
                    </th>
                    <th className="text-right py-3 px-4 text-sm font-semibold text-slate-700">
                      Aportado
                    </th>
                    <th className="text-right py-3 px-4 text-sm font-semibold text-slate-700">
                      Saldo Con APV
                    </th>
                    <th className="text-right py-3 px-4 text-sm font-semibold text-slate-700">
                      Saldo Sin APV
                    </th>
                    <th className="text-right py-3 px-4 text-sm font-semibold text-slate-700">
                      Diferencia
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {resultado.evolucion.map((ev, idx) => {
                    const isUltimo = idx === resultado.evolucion.length - 1;
                    return (
                      <tr
                        key={ev.edad}
                        className={`border-b border-slate-100 ${
                          isUltimo ? "bg-green-50 font-semibold" : ""
                        }`}
                      >
                        <td className="py-3 px-4">{ev.edad}</td>
                        <td className="py-3 px-4">{ev.anio}</td>
                        <td className="py-3 px-4 text-right">
                          {formatearMillones(ev.aportadoAcumulado)}
                        </td>
                        <td className="py-3 px-4 text-right text-green-600">
                          {formatearMillones(ev.saldoConAPV)}
                          {isUltimo && " 🎯"}
                        </td>
                        <td className="py-3 px-4 text-right text-slate-600">
                          {formatearMillones(ev.saldoSinAPV)}
                        </td>
                        <td className="py-3 px-4 text-right text-amber-600">
                          {formatearMillones(ev.diferencia)}
                          {isUltimo && " ✨"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <p className="text-sm text-slate-600 mt-4">
              💡 Observa cómo la diferencia entre Con APV y Sin APV crece exponencialmente
            </p>
          </div>
        )}

        {/* Costo de Postergar */}
        {resultado && (
          <div className="bg-gradient-to-br from-red-50 to-orange-50 border-2 border-red-200 rounded-xl shadow-lg p-8">
            <h3 className="text-2xl font-bold text-slate-900 mb-4 flex items-center gap-2">
              <AlertCircle className="w-6 h-6 text-red-600" />
              ⏰ Costo de Postergar
            </h3>

            <p className="text-slate-700 mb-6">
              Cada año que esperas te cuesta MILLONES. El mejor momento para empezar es HOY.
            </p>

            <div className="space-y-4">
              {resultado.costoPostergar.map((cp) => {
                if (cp.aniosPostergados === 0) {
                  return (
                    <div
                      key={cp.aniosPostergados}
                      className="bg-green-100 border-2 border-green-300 rounded-lg p-4"
                    >
                      <p className="font-semibold text-green-800">
                        ✅ Si empiezas HOY ({datos.edad} años):
                      </p>
                      <p className="text-2xl font-bold text-green-700 mt-2">
                        A los {datos.edadRetiro} tendrás: {formatearMillones(cp.saldoFinal)}
                      </p>
                    </div>
                  );
                }

                return (
                  <div
                    key={cp.aniosPostergados}
                    className="bg-white border-2 border-red-200 rounded-lg p-4"
                  >
                    <p className="font-semibold text-slate-800">
                      Si empiezas en {cp.aniosPostergados} año{cp.aniosPostergados > 1 ? "s" : ""} ({cp.edadInicio} años):
                    </p>
                    <div className="flex items-baseline gap-4 mt-2">
                      <p className="text-xl font-bold text-slate-700">
                        Tendrás: {formatearMillones(cp.saldoFinal)}
                      </p>
                      <p className="text-lg font-bold text-red-600">
                        ❌ PIERDES: {formatearMillones(cp.perdida)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-6 p-4 bg-white rounded-lg border-2 border-red-300">
              <p className="text-center font-semibold text-slate-900">
                💡 El mejor momento para empezar fue ayer. El segundo mejor momento es HOY.
              </p>
            </div>
          </div>
        )}

        {/* Rentabilidades Históricas */}
        {resultado && (
          <div className="bg-white rounded-xl shadow-lg p-8">
            <h3 className="text-2xl font-bold text-slate-900 mb-6">
              📈 Rentabilidades Históricas (2010-2024)
            </h3>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
              <p className="font-semibold text-slate-900 mb-3">
                Perfil {perfil.nombre}: {perfil.descripcion}
              </p>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-sm text-slate-600">Promedio</p>
                  <p className="text-2xl font-bold text-blue-600">
                    {perfil.historico.promedio}%/año
                  </p>
                </div>
                <div>
                  <p className="text-sm text-slate-600">Mejor año</p>
                  <p className="text-2xl font-bold text-green-600">
                    +{perfil.historico.mejor}%
                  </p>
                </div>
                <div>
                  <p className="text-sm text-slate-600">Peor año</p>
                  <p className="text-2xl font-bold text-red-600">
                    {perfil.historico.peor}%
                  </p>
                </div>
              </div>
              <p className="text-sm text-slate-600 mt-4">
                Ejemplos: {perfil.ejemplos}
              </p>
            </div>

            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <p className="text-sm text-slate-700">
                ⚠️ <strong>Importante:</strong> Rentabilidades pasadas no garantizan resultados futuros,
                pero dan contexto histórico real del mercado chileno.
              </p>
            </div>
          </div>
        )}

        {/* Comparación Tipo A vs Tipo B */}
        {resultado && (
          <div className="bg-white rounded-xl shadow-lg p-8">
            <h3 className="text-2xl font-bold text-slate-900 mb-6">
              ⚖️ Comparación: APV Tipo A vs Tipo B
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="border-2 border-green-300 rounded-lg p-6 bg-green-50">
                <h4 className="text-xl font-bold text-green-700 mb-4">
                  APV Tipo A (Recomendado)
                </h4>
                <div className="space-y-3">
                  <div>
                    <p className="text-sm text-slate-600">Ahorro Mensual</p>
                    <p className="text-2xl font-bold text-green-700">
                      {formatearPesos(resultado.ahorroMensualA)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-600">Ahorro Anual</p>
                    <p className="text-2xl font-bold text-green-700">
                      {formatearPesos(resultado.ahorroAnualA)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-600">Rentabilidad Equivalente</p>
                    <p className="text-2xl font-bold text-green-700">
                      {resultado.rentabilidadEquivalenteA.toFixed(1)}%
                    </p>
                  </div>
                </div>
              </div>

              <div className="border-2 border-slate-300 rounded-lg p-6 bg-slate-50">
                <h4 className="text-xl font-bold text-slate-700 mb-4">APV Tipo B</h4>
                <div className="space-y-3">
                  <div>
                    <p className="text-sm text-slate-600">Crédito Mensual</p>
                    <p className="text-2xl font-bold text-slate-700">
                      {formatearPesos(resultado.creditoMensualB)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-600">Crédito Anual</p>
                    <p className="text-2xl font-bold text-slate-700">
                      {formatearPesos(resultado.creditoAnualB)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-600">Rentabilidad</p>
                    <p className="text-2xl font-bold text-slate-700">15.0% (fijo)</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 p-6 bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-300 rounded-lg">
              <p className="font-bold text-green-800 text-lg mb-2">
                ✅ RECOMENDACIÓN: APV Tipo A es mejor para tu caso
              </p>
              <p className="text-slate-700 mb-2">
                Ahorras{" "}
                <span className="font-bold text-green-600">
                  {formatearPesos(resultado.ahorroAnualA - resultado.creditoAnualB)}
                </span>{" "}
                más al año (
                {(
                  ((resultado.ahorroAnualA - resultado.creditoAnualB) / resultado.creditoAnualB) *
                  100
                ).toFixed(0)}
                % más beneficio)
              </p>
              <p className="text-sm text-slate-600">
                ¿Por qué? Tu tramo impositivo ({resultado.rentabilidadEquivalenteA.toFixed(1)}%) es
                mayor que el crédito fiscal (15%)
              </p>
            </div>
          </div>
        )}

        {/* Explicación Didáctica */}
        <div className="bg-gradient-to-br from-purple-50 to-blue-50 border-2 border-purple-200 rounded-xl shadow-lg p-8">
          <h3 className="text-2xl font-bold text-slate-900 mb-6">🎓 Explicación Didáctica</h3>

          <div className="space-y-6">
            <div>
              <h4 className="font-bold text-lg text-slate-900 mb-2">
                ¿Por qué se multiplica tanto tu dinero?
              </h4>
              <div className="space-y-3">
                <div className="flex gap-3">
                  <span className="text-2xl">1️⃣</span>
                  <div>
                    <p className="font-semibold text-slate-900">INTERÉS COMPUESTO</p>
                    <p className="text-slate-600 text-sm">
                      No solo ganas sobre tu plata, sino también sobre las ganancias. Es como una
                      bola de nieve que crece exponencialmente.
                    </p>
                  </div>
                </div>

                <div className="flex gap-3">
                  <span className="text-2xl">2️⃣</span>
                  <div>
                    <p className="font-semibold text-slate-900">BENEFICIO TRIBUTARIO</p>
                    <p className="text-slate-600 text-sm">
                      El Estado te "regala" ~{resultado?.rentabilidadEquivalenteA.toFixed(0)}% de tu aporte
                      cada año (en tu tramo). Es dinero extra que también genera rentabilidad.
                    </p>
                  </div>
                </div>

                <div className="flex gap-3">
                  <span className="text-2xl">3️⃣</span>
                  <div>
                    <p className="font-semibold text-slate-900">TIEMPO</p>
                    <p className="text-slate-600 text-sm">
                      {resultado?.aniosHastaRetiro} años es suficiente tiempo para que el interés
                      compuesto haga magia. Mientras más tiempo, mayor el efecto.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-4 bg-white rounded-lg border-2 border-purple-300">
              <p className="text-center font-semibold text-slate-900">
                💡 Regla Simple: Si tu tramo impositivo es {">"} 15% → APV Tipo A es mejor
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
