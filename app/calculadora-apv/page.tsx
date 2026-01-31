"use client";

import React, { useState } from "react";
import {
  Calculator,
  TrendingUp,
  DollarSign,
  Calendar,
  Target,
  AlertCircle,
  Settings,
  Sparkles,
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
  Area,
  AreaChart,
} from "recharts";

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

interface RentabilidadPerfil {
  nombre: string;
  descripcion: string;
  rentabilidadReal: number;
  rentabilidadEditable: number;
  riesgo: string;
  ejemplos: string;
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
  evolucionCompleta: EvolucionAnual[];
  
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

// ============================================================
// FUNCIONES DE CÁLCULO
// ============================================================

function calcularImpuesto(baseImponible: number, valorUF: number): number {
  const baseEnUF = baseImponible / valorUF;
  let impuesto = 0;

  for (let i = 0; i < tramosImpuesto2024.length; i++) {
    const tramo = tramosImpuesto2024[i];
    if (baseEnUF <= tramo.desde) break;

    const limiteInferior = tramo.desde;
    const limiteSuperior = Math.min(baseEnUF, tramo.hasta);
    const baseGravable = limiteSuperior - limiteInferior;

    impuesto += baseGravable * valorUF * tramo.tasa;
  }

  return impuesto;
}

function calcularAPV_A(salarioAnual: number, aporteAnual: number, valorUF: number) {
  const tope600UF = 600 * valorUF;
  const tope30Porciento = salarioAnual * 0.3;
  const topeAPV = Math.min(tope600UF, tope30Porciento);
  const aporteElegible = Math.min(aporteAnual, topeAPV);

  const impuestoSinAPV = calcularImpuesto(salarioAnual, valorUF);
  const impuestoConAPV = calcularImpuesto(salarioAnual - aporteElegible, valorUF);

  const ahorroAnual = impuestoSinAPV - impuestoConAPV;
  const rentabilidadEquivalente = (ahorroAnual / aporteAnual) * 100;

  return { ahorroAnual, ahorroMensual: ahorroAnual / 12, rentabilidadEquivalente };
}

function calcularAPV_B(aporteAnual: number, valorUF: number) {
  const tope = 600 * valorUF;
  const aporteElegible = Math.min(aporteAnual, tope);
  const creditoAnual = aporteElegible * 0.15;
  return { creditoAnual, creditoMensual: creditoAnual / 12 };
}

function calcularValorFuturo(
  aporteAnual: number,
  rentabilidadReal: number,
  años: number
): number {
  if (años === 0) return 0;
  const factor = Math.pow(1 + rentabilidadReal, años) - 1;
  return aporteAnual * (factor / rentabilidadReal);
}

function calcularEvolucionCompleta(
  datos: ClienteAPV,
  beneficioAnualA: number,
  rentabilidadReal: number
): EvolucionAnual[] {
  const evolucion: EvolucionAnual[] = [];
  const aporteAnual = datos.montoAPVMensual * 12;
  const aporteConBeneficio = aporteAnual + beneficioAnualA;
  const aniosHastaRetiro = datos.edadRetiro - datos.edad;

  // Generar todos los años para el gráfico
  for (let anio = 0; anio <= aniosHastaRetiro; anio++) {
    const saldoConAPV = calcularValorFuturo(aporteConBeneficio, rentabilidadReal, anio);
    const saldoSinAPV = calcularValorFuturo(aporteAnual, rentabilidadReal, anio);

    evolucion.push({
      edad: datos.edad + anio,
      anio,
      aportadoAcumulado: aporteAnual * anio,
      saldoConAPV,
      saldoSinAPV,
      diferencia: saldoConAPV - saldoSinAPV,
    });
  }

  return evolucion;
}

function calcularEvolucionHitos(evolucionCompleta: EvolucionAnual[]): EvolucionAnual[] {
  const aniosTotal = evolucionCompleta.length - 1;
  const indices = [0, 2, 5, 7, 10, 12, 15, aniosTotal];
  return indices
    .filter(i => i <= aniosTotal)
    .map(i => evolucionCompleta[i]);
}

function calcularCostoPostergar(
  datos: ClienteAPV,
  beneficioAnualA: number,
  rentabilidadReal: number
): CostoPostergar[] {
  const aporteAnual = datos.montoAPVMensual * 12;
  const aporteConBeneficio = aporteAnual + beneficioAnualA;
  const aniosHastaRetiro = datos.edadRetiro - datos.edad;
  const saldoBaseHoy = calcularValorFuturo(aporteConBeneficio, rentabilidadReal, aniosHastaRetiro);

  return [0, 1, 3, 5].map((aniosPostergados) => {
    const nuevaEdadInicio = datos.edad + aniosPostergados;
    const nuevosAniosInversion = datos.edadRetiro - nuevaEdadInicio;
    const saldoFinal = calcularValorFuturo(aporteConBeneficio, rentabilidadReal, nuevosAniosInversion);
    const perdida = saldoBaseHoy - saldoFinal;

    return { aniosPostergados, edadInicio: nuevaEdadInicio, saldoFinal, perdida };
  });
}

function calcularTodo(
  datos: ClienteAPV,
  valorUF: number,
  rentabilidadesPersonalizadas: Record<string, number>
): ResultadoAPV {
  const salarioAnual = datos.salarioBrutoMensual * 12;
  const aporteAnual = datos.montoAPVMensual * 12;

  const resultadoA = calcularAPV_A(salarioAnual, aporteAnual, valorUF);
  const resultadoB = calcularAPV_B(aporteAnual, valorUF);

  const rentabilidadReal = rentabilidadesPersonalizadas[datos.perfilInversion] / 100;
  const aniosHastaRetiro = datos.edadRetiro - datos.edad;
  const totalAportado = aporteAnual * aniosHastaRetiro;
  const aporteConBeneficio = aporteAnual + resultadoA.ahorroAnual;

  const saldoFinalConAPV = calcularValorFuturo(aporteConBeneficio, rentabilidadReal, aniosHastaRetiro);
  const saldoFinalSinAPV = calcularValorFuturo(aporteAnual, rentabilidadReal, aniosHastaRetiro);
  const diferenciaTotal = saldoFinalConAPV - saldoFinalSinAPV;
  const gananciaPorRentabilidad = saldoFinalSinAPV - totalAportado;
  const gananciaPorBeneficio = diferenciaTotal;

  const evolucionCompleta = calcularEvolucionCompleta(datos, resultadoA.ahorroAnual, rentabilidadReal);
  const evolucion = calcularEvolucionHitos(evolucionCompleta);
  const costoPostergar = calcularCostoPostergar(datos, resultadoA.ahorroAnual, rentabilidadReal);

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
    evolucionCompleta,
    costoPostergar,
  };
}

// ============================================================
// COMPONENTE PRINCIPAL
// ============================================================

export default function CalculadoraAPV() {
  const [valorUF, setValorUF] = useState(37800);
  const [mostrarConfiguracion, setMostrarConfiguracion] = useState(false);

  const [rentabilidades, setRentabilidades] = useState({
    conservador: 1.5,
    moderado: 4.0,
    agresivo: 7.0,
  });

  const [datos, setDatos] = useState<ClienteAPV>({
    salarioBrutoMensual: 5000000,
    montoAPVMensual: 200000,
    edad: 48,
    edadRetiro: 65,
    perfilInversion: "moderado",
  });

  const [resultado, setResultado] = useState<ResultadoAPV | null>(null);

  const perfilesInfo: Record<string, RentabilidadPerfil> = {
    conservador: {
      nombre: "Conservador",
      descripcion: "70% Bonos, 30% Acciones",
      rentabilidadReal: 1.5,
      rentabilidadEditable: rentabilidades.conservador,
      riesgo: "Bajo",
      ejemplos: "Fondo E (multifondos)",
    },
    moderado: {
      nombre: "Moderado",
      descripcion: "50% Bonos, 50% Acciones",
      rentabilidadReal: 4.0,
      rentabilidadEditable: rentabilidades.moderado,
      riesgo: "Medio",
      ejemplos: "Fondo C (multifondos)",
    },
    agresivo: {
      nombre: "Agresivo",
      descripcion: "90% Acciones, 10% Bonos",
      rentabilidadReal: 7.0,
      rentabilidadEditable: rentabilidades.agresivo,
      riesgo: "Alto",
      ejemplos: "Fondo A (multifondos)",
    },
  };

  const handleCalcular = () => {
    const res = calcularTodo(datos, valorUF, rentabilidades);
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

  const formatearUF = (valorPesos: number) => {
    const uf = valorPesos / valorUF;
    return `${uf.toLocaleString("es-CL", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} UF`;
  };

  const formatearConUF = (valorPesos: number) => {
    return `${formatearPesos(valorPesos)} (${formatearUF(valorPesos)})`;
  };

  const formatearMillones = (valor: number) => {
    const millones = valor / 1000000;
    return `$${millones.toFixed(1)}M`;
  };

  const perfil = perfilesInfo[datos.perfilInversion];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 py-12">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-blue-600 to-blue-700 rounded-full mb-4">
            <Calculator className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-4xl font-bold text-slate-900 mb-2">
            Calculadora APV con Proyección
          </h1>
          <p className="text-lg text-slate-600">
            Descubre cuánto ahorrarás en impuestos y cuánto tendrás al jubilar
          </p>
        </div>

        {/* Configuración UF y Rentabilidades */}
        <div className="bg-white rounded-lg shadow-md p-4 mb-6 border border-slate-200">
          <button
            onClick={() => setMostrarConfiguracion(!mostrarConfiguracion)}
            className="w-full flex items-center justify-between text-left"
          >
            <div className="flex items-center gap-2">
              <Settings className="w-5 h-5 text-slate-600" />
              <span className="font-semibold text-slate-900">Configuración Avanzada</span>
            </div>
            <span className="text-slate-400">{mostrarConfiguracion ? "▼" : "▶"}</span>
          </button>

          {mostrarConfiguracion && (
            <div className="mt-4 space-y-4 pt-4 border-t border-slate-200">
              {/* Valor UF */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Valor UF (pesos chilenos)
                </label>
                <input
                  type="number"
                  value={valorUF}
                  onChange={(e) => setValorUF(Number(e.target.value))}
                  className="w-full border border-slate-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Actualiza este valor según la UF del día
                </p>
              </div>

              {/* Rentabilidades Reales */}
              <div>
                <p className="text-sm font-medium text-slate-700 mb-3">
                  Rentabilidades Reales Anuales (descontada inflación)
                </p>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs text-slate-600 mb-1">Conservador</label>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        step="0.1"
                        value={rentabilidades.conservador}
                        onChange={(e) =>
                          setRentabilidades({
                            ...rentabilidades,
                            conservador: Number(e.target.value),
                          })
                        }
                        className="w-full border border-slate-300 rounded px-2 py-1 text-sm focus:outline-none focus:border-blue-500"
                      />
                      <span className="text-xs text-slate-600">%</span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-600 mb-1">Moderado</label>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        step="0.1"
                        value={rentabilidades.moderado}
                        onChange={(e) =>
                          setRentabilidades({
                            ...rentabilidades,
                            moderado: Number(e.target.value),
                          })
                        }
                        className="w-full border border-slate-300 rounded px-2 py-1 text-sm focus:outline-none focus:border-blue-500"
                      />
                      <span className="text-xs text-slate-600">%</span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-600 mb-1">Agresivo</label>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        step="0.1"
                        value={rentabilidades.agresivo}
                        onChange={(e) =>
                          setRentabilidades({
                            ...rentabilidades,
                            agresivo: Number(e.target.value),
                          })
                        }
                        className="w-full border border-slate-300 rounded px-2 py-1 text-sm focus:outline-none focus:border-blue-500"
                      />
                      <span className="text-xs text-slate-600">%</span>
                    </div>
                  </div>
                </div>
                <p className="text-xs text-slate-500 mt-2">
                  💡 Estas son rentabilidades reales (ya descontada la inflación). Valores
                  históricos 2010-2024.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Inputs */}
        <div className="bg-white rounded-xl shadow-lg p-8 mb-8 border border-slate-200">
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
                className="w-full border-2 border-slate-300 rounded-lg px-4 py-3 text-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
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
                className="w-full border-2 border-slate-300 rounded-lg px-4 py-3 text-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
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
                  className="w-full border-2 border-slate-300 rounded-lg pl-8 pr-4 py-3 text-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                />
              </div>
              <p className="text-xs text-slate-500 mt-1">
                ≈ {formatearUF(datos.salarioBrutoMensual)}
              </p>
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
                  className="w-full border-2 border-slate-300 rounded-lg pl-8 pr-4 py-3 text-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                />
              </div>
              <p className="text-xs text-slate-500 mt-1">
                ≈ {formatearUF(datos.montoAPVMensual)}
              </p>
            </div>
          </div>

          {/* Perfil de Inversión */}
          <div className="mt-8">
            <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-blue-600" />
              Paso 2: Perfil de Inversión
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {(["conservador", "moderado", "agresivo"] as const).map((tipo) => {
                const p = perfilesInfo[tipo];
                const isSelected = datos.perfilInversion === tipo;

                return (
                  <button
                    key={tipo}
                    onClick={() => setDatos({ ...datos, perfilInversion: tipo })}
                    className={`p-4 rounded-lg border-2 transition-all text-left ${
                      isSelected
                        ? "border-blue-600 bg-blue-50"
                        : "border-slate-300 hover:border-slate-400 bg-white"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <div
                        className={`w-4 h-4 rounded-full border-2 ${
                          isSelected ? "border-blue-600 bg-blue-600" : "border-slate-400"
                        }`}
                      >
                        {isSelected && (
                          <div className="w-full h-full rounded-full bg-white scale-50" />
                        )}
                      </div>
                      <span className="font-semibold text-slate-900">{p.nombre}</span>
                    </div>
                    <p className="text-sm text-slate-600 mb-1">{p.descripcion}</p>
                    <p className="text-sm font-semibold text-blue-700">
                      {p.rentabilidadEditable}% real anual
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
            <div className="bg-gradient-to-br from-blue-600 to-blue-800 rounded-xl shadow-xl p-8 text-white border border-blue-700">
              <div className="flex items-center gap-3 mb-6">
                <Target className="w-8 h-8" />
                <h2 className="text-3xl font-bold">
                  Tu Proyección a los {datos.edadRetiro} Años
                </h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white/10 backdrop-blur rounded-lg p-6 border border-white/20">
                  <p className="text-blue-100 text-sm mb-2">Vas a aportar</p>
                  <p className="text-3xl font-bold">{formatearMillones(resultado.totalAportado)}</p>
                  <p className="text-blue-100 text-xs mt-1">
                    {formatearUF(resultado.totalAportado)}
                  </p>
                </div>

                <div className="bg-white/10 backdrop-blur rounded-lg p-6 border border-white/20">
                  <p className="text-blue-100 text-sm mb-2">Se transformará en</p>
                  <p className="text-3xl font-bold flex items-center gap-2">
                    <Sparkles className="w-8 h-8" />
                    {formatearMillones(resultado.saldoFinalConAPV)}
                  </p>
                  <p className="text-blue-100 text-xs mt-1">
                    {formatearUF(resultado.saldoFinalConAPV)}
                  </p>
                </div>

                <div className="bg-white/10 backdrop-blur rounded-lg p-6 border border-white/20">
                  <p className="text-blue-100 text-sm mb-2">Multiplicador</p>
                  <p className="text-3xl font-bold">{resultado.multiplicador.toFixed(1)}x</p>
                  <p className="text-blue-100 text-xs mt-1">
                    Tu dinero se multiplica por {resultado.multiplicador.toFixed(1)}
                  </p>
                </div>
              </div>
            </div>

            {/* Continúa en siguiente archivo... */}
          </div>
        )}

        {/* Gráfico de Evolución */}
        {resultado && (
          <div className="bg-white rounded-xl shadow-lg p-8 border border-slate-200">
            <h3 className="text-2xl font-bold text-slate-900 mb-6">
              📈 Evolución Visual de tu Ahorro
            </h3>

            <ResponsiveContainer width="100%" height={400}>
              <AreaChart data={resultado.evolucionCompleta}>
                <defs>
                  <linearGradient id="colorConAPV" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorSinAPV" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#64748b" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#64748b" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  dataKey="edad"
                  stroke="#64748b"
                  label={{ value: "Edad", position: "insideBottom", offset: -5 }}
                />
                <YAxis
                  stroke="#64748b"
                  tickFormatter={(value) => `$${(value / 1000000).toFixed(0)}M`}
                  label={{ value: "Saldo (Millones $)", angle: -90, position: "insideLeft" }}
                />
                <Tooltip
                  formatter={(value: any) => formatearConUF(value)}
                  labelFormatter={(label) => `Edad: ${label} años`}
                  contentStyle={{
                    backgroundColor: "white",
                    border: "1px solid #e2e8f0",
                    borderRadius: "8px",
                  }}
                />
                <Legend />
                <Area
                  type="monotone"
                  dataKey="saldoConAPV"
                  stroke="#2563eb"
                  strokeWidth={3}
                  fillOpacity={1}
                  fill="url(#colorConAPV)"
                  name="Con APV"
                />
                <Area
                  type="monotone"
                  dataKey="saldoSinAPV"
                  stroke="#64748b"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorSinAPV)"
                  name="Sin APV"
                />
              </AreaChart>
            </ResponsiveContainer>

            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-center gap-3 p-4 bg-blue-50 rounded-lg border border-blue-200">
                <div className="w-4 h-4 bg-blue-600 rounded"></div>
                <div>
                  <p className="font-semibold text-slate-900">Línea Azul: Con APV</p>
                  <p className="text-sm text-slate-600">
                    Incluye el beneficio tributario que aumenta tu capital
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-lg border border-slate-200">
                <div className="w-4 h-4 bg-slate-500 rounded"></div>
                <div>
                  <p className="font-semibold text-slate-900">Línea Gris: Sin APV</p>
                  <p className="text-sm text-slate-600">
                    Inversión directa sin beneficio tributario
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-4 p-4 bg-gradient-to-r from-blue-50 to-slate-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-slate-700">
                💡 <strong>La diferencia entre las líneas</strong> es el valor del beneficio tributario.
                Observa cómo crece exponencialmente con el tiempo gracias al interés compuesto.
              </p>
            </div>
          </div>
        )}

        {/* Valor del Beneficio */}
        {resultado && (
          <div className="bg-white rounded-xl shadow-lg p-8 border border-slate-200">
            <h3 className="text-2xl font-bold text-slate-900 mb-6 flex items-center gap-2">
              <Sparkles className="w-6 h-6 text-blue-600" />
              Valor del Beneficio Tributario APV
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div className="bg-slate-50 rounded-lg p-6 border border-slate-200">
                <p className="text-slate-600 text-sm mb-2">SIN APV (inversión directa)</p>
                <p className="text-3xl font-bold text-slate-700">
                  {formatearMillones(resultado.saldoFinalSinAPV)}
                </p>
                <p className="text-sm text-slate-600 mt-1">
                  {formatearUF(resultado.saldoFinalSinAPV)}
                </p>
              </div>

              <div className="bg-emerald-50 rounded-lg p-6 border border-emerald-200">
                <p className="text-emerald-700 text-sm mb-2">CON APV Tipo A</p>
                <p className="text-3xl font-bold text-emerald-700">
                  {formatearMillones(resultado.saldoFinalConAPV)}
                </p>
                <p className="text-sm text-emerald-600 mt-1">
                  {formatearUF(resultado.saldoFinalConAPV)}
                </p>
              </div>
            </div>

            <div className="bg-gradient-to-r from-emerald-50 to-blue-50 border-2 border-emerald-300 rounded-lg p-6">
              <p className="text-lg font-semibold text-slate-900 mb-2">
                ✅ DIFERENCIA: {formatearMillones(resultado.diferenciaTotal)}
              </p>
              <p className="text-slate-700">
                El beneficio tributario te regala{" "}
                <span className="font-bold text-emerald-700">
                  {formatearMillones(resultado.diferenciaTotal)} ({formatearUF(resultado.diferenciaTotal)})
                </span>{" "}
                extras que no tendrías invirtiendo directo.
              </p>
            </div>
          </div>
        )}

        {/* Desglose */}
        {resultado && (
          <div className="bg-white rounded-xl shadow-lg p-8 border border-slate-200">
            <h3 className="text-2xl font-bold text-slate-900 mb-6">
              💡 ¿De dónde vienen los {formatearMillones(resultado.saldoFinalConAPV)}?
            </h3>

            <div className="space-y-4">
              <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-lg border border-slate-200">
                <div className="w-16 h-16 bg-slate-600 rounded-full flex items-center justify-center flex-shrink-0">
                  <DollarSign className="w-8 h-8 text-white" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-slate-900">
                    {formatearMillones(resultado.totalAportado)} son tus aportes
                  </p>
                  <p className="text-sm text-slate-600">
                    Lo que tú pones mes a mes • {formatearUF(resultado.totalAportado)}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
                <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center flex-shrink-0">
                  <TrendingUp className="w-8 h-8 text-white" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-slate-900">
                    {formatearMillones(resultado.gananciaPorRentabilidad)} vienen de rentabilidad
                  </p>
                  <p className="text-sm text-slate-600">
                    Interés compuesto al {perfil.rentabilidadEditable}% real anual •{" "}
                    {formatearUF(resultado.gananciaPorRentabilidad)}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-4 p-4 bg-emerald-50 rounded-lg border border-emerald-200">
                <div className="w-16 h-16 bg-emerald-600 rounded-full flex items-center justify-center flex-shrink-0">
                  <Sparkles className="w-8 h-8 text-white" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-slate-900">
                    {formatearMillones(resultado.gananciaPorBeneficio)} son REGALO del beneficio APV
                  </p>
                  <p className="text-sm text-slate-600">
                    El Estado te regala ~{resultado.rentabilidadEquivalenteA.toFixed(1)}% de tu aporte
                    cada año • {formatearUF(resultado.gananciaPorBeneficio)}
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-6 p-4 bg-gradient-to-r from-blue-50 to-slate-100 rounded-lg border border-slate-300">
              <p className="text-center text-lg font-semibold text-slate-900">
                🎁 El Estado te está regalando prácticamente lo que aportaste
              </p>
            </div>
          </div>
        )}

        {/* Tabla Evolución Año por Año */}
        {resultado && (
          <div className="bg-white rounded-xl shadow-lg p-8 border border-slate-200">
            <h3 className="text-2xl font-bold text-slate-900 mb-6">📊 Evolución Año por Año</h3>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b-2 border-slate-300">
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
                        className={`border-b border-slate-200 ${
                          isUltimo ? "bg-blue-50 font-semibold" : ""
                        }`}
                      >
                        <td className="py-3 px-4 text-slate-900">{ev.edad}</td>
                        <td className="py-3 px-4 text-slate-700">{ev.anio}</td>
                        <td className="py-3 px-4 text-right text-slate-700">
                          {formatearMillones(ev.aportadoAcumulado)}
                        </td>
                        <td className="py-3 px-4 text-right text-blue-700">
                          {formatearMillones(ev.saldoConAPV)}
                          {isUltimo && " 🎯"}
                        </td>
                        <td className="py-3 px-4 text-right text-slate-600">
                          {formatearMillones(ev.saldoSinAPV)}
                        </td>
                        <td className="py-3 px-4 text-right text-emerald-700">
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
          <div className="bg-gradient-to-br from-slate-50 to-slate-100 border-2 border-slate-300 rounded-xl shadow-lg p-8">
            <h3 className="text-2xl font-bold text-slate-900 mb-4 flex items-center gap-2">
              <AlertCircle className="w-6 h-6 text-slate-700" />
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
                      className="bg-emerald-50 border-2 border-emerald-400 rounded-lg p-4"
                    >
                      <p className="font-semibold text-emerald-800">
                        ✅ Si empiezas HOY ({datos.edad} años):
                      </p>
                      <p className="text-2xl font-bold text-emerald-700 mt-2">
                        A los {datos.edadRetiro} tendrás: {formatearMillones(cp.saldoFinal)}
                      </p>
                      <p className="text-sm text-emerald-600 mt-1">
                        {formatearUF(cp.saldoFinal)}
                      </p>
                    </div>
                  );
                }

                return (
                  <div
                    key={cp.aniosPostergados}
                    className="bg-white border-2 border-slate-300 rounded-lg p-4"
                  >
                    <p className="font-semibold text-slate-800">
                      Si empiezas en {cp.aniosPostergados} año
                      {cp.aniosPostergados > 1 ? "s" : ""} ({cp.edadInicio} años):
                    </p>
                    <div className="flex flex-col sm:flex-row items-start sm:items-baseline gap-2 sm:gap-4 mt-2">
                      <p className="text-xl font-bold text-slate-700">
                        Tendrás: {formatearMillones(cp.saldoFinal)}
                      </p>
                      <p className="text-lg font-bold text-slate-600">
                        ❌ PIERDES: {formatearMillones(cp.perdida)}
                      </p>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      Diferencia: {formatearUF(cp.perdida)}
                    </p>
                  </div>
                );
              })}
            </div>

            <div className="mt-6 p-4 bg-white rounded-lg border-2 border-slate-400">
              <p className="text-center font-semibold text-slate-900">
                💡 El mejor momento para empezar fue ayer. El segundo mejor momento es HOY.
              </p>
            </div>
          </div>
        )}

        {/* Comparación Tipo A vs Tipo B */}
        {resultado && (
          <div className="bg-white rounded-xl shadow-lg p-8 border border-slate-200">
            <h3 className="text-2xl font-bold text-slate-900 mb-6">
              ⚖️ Comparación: APV Tipo A vs Tipo B
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="border-2 border-emerald-400 rounded-lg p-6 bg-emerald-50">
                <h4 className="text-xl font-bold text-emerald-800 mb-4">
                  APV Tipo A (Recomendado)
                </h4>
                <div className="space-y-3">
                  <div>
                    <p className="text-sm text-slate-600">Ahorro Mensual</p>
                    <p className="text-2xl font-bold text-emerald-800">
                      {formatearPesos(resultado.ahorroMensualA)}
                    </p>
                    <p className="text-xs text-slate-600">
                      {formatearUF(resultado.ahorroMensualA)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-600">Ahorro Anual</p>
                    <p className="text-2xl font-bold text-emerald-800">
                      {formatearPesos(resultado.ahorroAnualA)}
                    </p>
                    <p className="text-xs text-slate-600">{formatearUF(resultado.ahorroAnualA)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-600">Rentabilidad Equivalente</p>
                    <p className="text-2xl font-bold text-emerald-800">
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
                    <p className="text-xs text-slate-600">
                      {formatearUF(resultado.creditoMensualB)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-600">Crédito Anual</p>
                    <p className="text-2xl font-bold text-slate-700">
                      {formatearPesos(resultado.creditoAnualB)}
                    </p>
                    <p className="text-xs text-slate-600">{formatearUF(resultado.creditoAnualB)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-600">Rentabilidad</p>
                    <p className="text-2xl font-bold text-slate-700">15.0% (fijo)</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 p-6 bg-gradient-to-r from-emerald-50 to-blue-50 border-2 border-emerald-400 rounded-lg">
              <p className="font-bold text-emerald-800 text-lg mb-2">
                ✅ RECOMENDACIÓN: APV Tipo A es mejor para tu caso
              </p>
              <p className="text-slate-700 mb-2">
                Ahorras{" "}
                <span className="font-bold text-emerald-700">
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
        <div className="bg-gradient-to-br from-slate-50 to-blue-50 border-2 border-slate-300 rounded-xl shadow-lg p-8">
          <h3 className="text-2xl font-bold text-slate-900 mb-6">🎓 Explicación Didáctica</h3>

          <div className="space-y-6">
            <div>
              <h4 className="font-bold text-lg text-slate-900 mb-2">
                ¿Por qué se multiplica tanto tu dinero?
              </h4>
              <div className="space-y-3">
                <div className="flex gap-3 p-4 bg-white rounded-lg border border-slate-200">
                  <span className="text-2xl flex-shrink-0">1️⃣</span>
                  <div>
                    <p className="font-semibold text-slate-900">INTERÉS COMPUESTO</p>
                    <p className="text-slate-600 text-sm">
                      No solo ganas sobre tu plata, sino también sobre las ganancias. Es como una
                      bola de nieve que crece exponencialmente.
                    </p>
                  </div>
                </div>

                <div className="flex gap-3 p-4 bg-white rounded-lg border border-slate-200">
                  <span className="text-2xl flex-shrink-0">2️⃣</span>
                  <div>
                    <p className="font-semibold text-slate-900">BENEFICIO TRIBUTARIO</p>
                    <p className="text-slate-600 text-sm">
                      El Estado te "regala" ~{resultado?.rentabilidadEquivalenteA.toFixed(0)}% de tu
                      aporte cada año (en tu tramo). Es dinero extra que también genera
                      rentabilidad.
                    </p>
                  </div>
                </div>

                <div className="flex gap-3 p-4 bg-white rounded-lg border border-slate-200">
                  <span className="text-2xl flex-shrink-0">3️⃣</span>
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

            <div className="p-4 bg-white rounded-lg border-2 border-slate-400">
              <p className="text-center font-semibold text-slate-900">
                💡 Regla Simple: Si tu tramo impositivo es {">"} 15% → APV Tipo A es mejor
              </p>
            </div>

            <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
              <p className="text-sm text-slate-700">
                <strong>Nota sobre UF:</strong> Todos los valores se muestran en pesos chilenos con
                su equivalente en UF. Las rentabilidades son REALES (ya descontada la inflación
                ~3%). Valor UF actual: {formatearPesos(valorUF)}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
