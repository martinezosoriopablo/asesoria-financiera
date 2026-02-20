"use client";

import React, { useState, useEffect } from "react";
import { getUFValue, clpToUF, formatUF, formatCLP } from "@/lib/uf";
import {
  Calculator,
  TrendingUp,
  DollarSign,
  Calendar,
  Target,
  AlertCircle,
  ArrowRight,
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
  ahorroMensualA: number;
  ahorroAnualA: number;
  rentabilidadEquivalenteA: number;
  creditoMensualB: number;
  creditoAnualB: number;
  aniosHastaRetiro: number;
  totalAportado: number;
  saldoFinalConAPV: number;
  saldoFinalSinAPV: number;
  diferenciaTotal: number;
  multiplicador: number;
  gananciaPorRentabilidad: number;
  gananciaPorBeneficio: number;
  evolucion: EvolucionAnual[];
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

let UF_VALOR = 38000;

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
  const tope600UF = 600 * UF_VALOR;
  const tope30Porciento = salarioAnual * 0.3;
  const topeAPV = Math.min(tope600UF, tope30Porciento);
  const aporteElegible = Math.min(aporteAnual, topeAPV);
  const impuestoSinAPV = calcularImpuesto(salarioAnual);
  const impuestoConAPV = calcularImpuesto(salarioAnual - aporteElegible);
  const ahorroAnual = impuestoSinAPV - impuestoConAPV;
  const rentabilidadEquivalente = (ahorroAnual / aporteAnual) * 100;
  return { ahorroAnual, ahorroMensual: ahorroAnual / 12, rentabilidadEquivalente };
}

function calcularAPV_B(aporteAnual: number) {
  const tope = 600 * UF_VALOR;
  const aporteElegible = Math.min(aporteAnual, tope);
  const creditoAnual = aporteElegible * 0.15;
  return { creditoAnual, creditoMensual: creditoAnual / 12 };
}

function calcularValorFuturo(aporteAnual: number, rentabilidadAnual: number, años: number): number {
  if (años === 0) return 0;
  const factor = Math.pow(1 + rentabilidadAnual, años) - 1;
  return aporteAnual * (factor / rentabilidadAnual);
}

function calcularEvolucionAnual(datos: ClienteAPV, beneficioAnualA: number, rentabilidadAnual: number): EvolucionAnual[] {
  const evolucion: EvolucionAnual[] = [];
  const aporteAnual = datos.montoAPVMensual * 12;
  const aporteConBeneficio = aporteAnual + beneficioAnualA;
  const aniosHastaRetiro = datos.edadRetiro - datos.edad;
  const hitos = [0, 2, 5, 7, 10, 12, 15, aniosHastaRetiro];
  hitos.forEach((anio) => {
    if (anio <= aniosHastaRetiro) {
      evolucion.push({
        edad: datos.edad + anio,
        anio,
        aportadoAcumulado: aporteAnual * anio,
        saldoConAPV: calcularValorFuturo(aporteConBeneficio, rentabilidadAnual, anio),
        saldoSinAPV: calcularValorFuturo(aporteAnual, rentabilidadAnual, anio),
        diferencia: calcularValorFuturo(aporteConBeneficio, rentabilidadAnual, anio) - calcularValorFuturo(aporteAnual, rentabilidadAnual, anio),
      });
    }
  });
  return evolucion;
}

function calcularCostoPostergar(datos: ClienteAPV, beneficioAnualA: number, rentabilidadAnual: number): CostoPostergar[] {
  const aporteAnual = datos.montoAPVMensual * 12;
  const aporteConBeneficio = aporteAnual + beneficioAnualA;
  const aniosHastaRetiro = datos.edadRetiro - datos.edad;
  const saldoBaseHoy = calcularValorFuturo(aporteConBeneficio, rentabilidadAnual, aniosHastaRetiro);
  return [0, 1, 3, 5].map((aniosPostergados) => {
    const nuevosAnios = datos.edadRetiro - (datos.edad + aniosPostergados);
    const saldoFinal = calcularValorFuturo(aporteConBeneficio, rentabilidadAnual, nuevosAnios);
    return { aniosPostergados, edadInicio: datos.edad + aniosPostergados, saldoFinal, perdida: saldoBaseHoy - saldoFinal };
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
  const saldoFinalConAPV = calcularValorFuturo(aporteConBeneficio, rentabilidadAnual, aniosHastaRetiro);
  const saldoFinalSinAPV = calcularValorFuturo(aporteAnual, rentabilidadAnual, aniosHastaRetiro);
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
    diferenciaTotal: saldoFinalConAPV - saldoFinalSinAPV,
    multiplicador: saldoFinalConAPV / totalAportado,
    gananciaPorRentabilidad: saldoFinalSinAPV - totalAportado,
    gananciaPorBeneficio: saldoFinalConAPV - saldoFinalSinAPV,
    evolucion: calcularEvolucionAnual(datos, resultadoA.ahorroAnual, rentabilidadAnual),
    costoPostergar: calcularCostoPostergar(datos, resultadoA.ahorroAnual, rentabilidadAnual),
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
  const [ufActual, setUfActual] = useState(38000);

  useEffect(() => {
    getUFValue().then((v) => {
      UF_VALOR = v;
      setUfActual(v);
    });
  }, []);

  const handleCalcular = () => {
    setResultado(calcularTodo(datos));
  };

  const fmtCLP = (v: number) => formatCLP(v);
  const fmtUF = (v: number) => formatUF(clpToUF(v, ufActual));
  const fmtM = (v: number) => `$${(v / 1000000).toFixed(1)}M`;

  const perfil = rentabilidadesHistoricas[datos.perfilInversion];

  return (
    <div className="min-h-screen bg-gb-light py-10">
      <div className="max-w-4xl mx-auto px-5">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-gb-black mb-1">
            Calculadora APV
          </h1>
          <p className="text-sm text-gb-gray">
            Proyección de ahorro previsional voluntario con beneficio tributario
          </p>
          <p className="text-xs text-gb-gray mt-1">
            Valor UF: {fmtCLP(ufActual)}
          </p>
        </div>

        {/* Inputs */}
        <div className="bg-white border border-gb-border rounded-lg p-6 mb-6">
          <h2 className="text-base font-semibold text-gb-black mb-5 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-gb-gray" />
            Datos del Cliente
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-sm font-medium text-gb-dark mb-1">Edad Actual</label>
              <input
                type="number"
                value={datos.edad}
                onChange={(e) => setDatos({ ...datos, edad: Number(e.target.value) })}
                className="w-full border border-gb-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-gb-accent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gb-dark mb-1">Edad de Retiro</label>
              <input
                type="number"
                value={datos.edadRetiro}
                onChange={(e) => setDatos({ ...datos, edadRetiro: Number(e.target.value) })}
                className="w-full border border-gb-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-gb-accent"
              />
              <p className="text-xs text-gb-gray mt-1">
                {datos.edadRetiro - datos.edad} años hasta retiro
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gb-dark mb-1">Salario Bruto Mensual</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gb-gray text-sm">$</span>
                <input
                  type="text"
                  value={datos.salarioBrutoMensual.toLocaleString("es-CL")}
                  onChange={(e) => setDatos({ ...datos, salarioBrutoMensual: Number(e.target.value.replace(/\D/g, "")) })}
                  className="w-full border border-gb-border rounded-lg pl-7 pr-3 py-2.5 text-sm focus:outline-none focus:border-gb-accent"
                />
              </div>
              <p className="text-xs text-gb-gray mt-1">{fmtUF(datos.salarioBrutoMensual)}</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gb-dark mb-1">Aporte APV Mensual</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gb-gray text-sm">$</span>
                <input
                  type="text"
                  value={datos.montoAPVMensual.toLocaleString("es-CL")}
                  onChange={(e) => setDatos({ ...datos, montoAPVMensual: Number(e.target.value.replace(/\D/g, "")) })}
                  className="w-full border border-gb-border rounded-lg pl-7 pr-3 py-2.5 text-sm focus:outline-none focus:border-gb-accent"
                />
              </div>
              <p className="text-xs text-gb-gray mt-1">{fmtUF(datos.montoAPVMensual)}</p>
            </div>
          </div>

          {/* Perfil */}
          <div className="mt-6">
            <h3 className="text-sm font-semibold text-gb-dark mb-3 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-gb-gray" />
              Perfil de Inversión
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {(["conservador", "moderado", "agresivo"] as const).map((tipo) => {
                const p = rentabilidadesHistoricas[tipo];
                const isSelected = datos.perfilInversion === tipo;
                return (
                  <button
                    key={tipo}
                    onClick={() => setDatos({ ...datos, perfilInversion: tipo })}
                    className={`p-3 rounded-lg border text-left transition-all ${
                      isSelected
                        ? "border-gb-black bg-gb-light"
                        : "border-gb-border hover:border-gb-gray"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <div className={`w-3 h-3 rounded-full border-2 ${isSelected ? "border-gb-black bg-gb-black" : "border-gb-border"}`} />
                      <span className="text-sm font-medium text-gb-black">{p.nombre}</span>
                    </div>
                    <p className="text-xs text-gb-gray">{p.descripcion}</p>
                    <p className="text-xs font-medium text-gb-dark mt-1">
                      {(p.rentabilidadAnual * 100).toFixed(1)}% anual — Riesgo {p.riesgo}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          <button
            onClick={handleCalcular}
            className="w-full mt-6 bg-gb-black text-white font-medium py-3 rounded-lg hover:bg-gb-dark transition-colors flex items-center justify-center gap-2"
          >
            <Calculator className="w-4 h-4" />
            Calcular Proyección
          </button>
        </div>

        {/* Resultados */}
        {resultado && (
          <div className="space-y-6">
            {/* Proyección Principal */}
            <div className="bg-white border border-gb-border rounded-lg p-6">
              <h2 className="text-lg font-semibold text-gb-black mb-4 flex items-center gap-2">
                <Target className="w-5 h-5 text-gb-gray" />
                Proyección a los {datos.edadRetiro} Años
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-gb-light rounded-lg p-4">
                  <p className="text-xs text-gb-gray mb-1">Vas a aportar</p>
                  <p className="text-xl font-semibold text-gb-black">{fmtM(resultado.totalAportado)}</p>
                  <p className="text-xs text-gb-gray">{fmtUF(resultado.totalAportado)}</p>
                </div>
                <div className="bg-gb-light rounded-lg p-4">
                  <p className="text-xs text-gb-gray mb-1">Se transformará en</p>
                  <p className="text-xl font-semibold text-gb-black">{fmtM(resultado.saldoFinalConAPV)}</p>
                  <p className="text-xs text-gb-gray">{fmtUF(resultado.saldoFinalConAPV)}</p>
                </div>
                <div className="bg-gb-light rounded-lg p-4 border-2 border-gb-dark">
                  <p className="text-xs text-gb-gray mb-1">Multiplicador</p>
                  <p className="text-xl font-bold text-gb-black">{resultado.multiplicador.toFixed(1)}x</p>
                  <p className="text-xs text-gb-gray">Con APV Tipo A + {perfil.nombre}</p>
                </div>
              </div>
            </div>

            {/* Beneficio Tributario */}
            <div className="bg-white border border-gb-border rounded-lg p-6">
              <h3 className="text-base font-semibold text-gb-black mb-4">
                Valor del Beneficio Tributario APV
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div className="bg-gb-light rounded-lg p-4">
                  <p className="text-xs text-gb-gray mb-1">Sin APV (inversión directa)</p>
                  <p className="text-xl font-semibold text-gb-dark">{fmtM(resultado.saldoFinalSinAPV)}</p>
                  <p className="text-xs text-gb-gray">{fmtUF(resultado.saldoFinalSinAPV)}</p>
                </div>
                <div className="bg-gb-light rounded-lg p-4">
                  <p className="text-xs text-gb-gray mb-1">Con APV Tipo A</p>
                  <p className="text-xl font-semibold text-emerald-700">{fmtM(resultado.saldoFinalConAPV)}</p>
                  <p className="text-xs text-gb-gray">{fmtUF(resultado.saldoFinalConAPV)}</p>
                </div>
              </div>

              <div className="p-4 bg-gb-light border border-gb-border rounded-lg">
                <p className="text-sm font-medium text-gb-black">
                  Diferencia: {fmtM(resultado.diferenciaTotal)} ({fmtUF(resultado.diferenciaTotal)})
                </p>
                <p className="text-xs text-gb-gray mt-1">
                  El beneficio tributario genera {fmtM(resultado.diferenciaTotal)} extras que no tendrías invirtiendo directo.
                </p>
              </div>
            </div>

            {/* Desglose */}
            <div className="bg-white border border-gb-border rounded-lg p-6">
              <h3 className="text-base font-semibold text-gb-black mb-4">Desglose del Capital Final</h3>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gb-light rounded-full flex items-center justify-center">
                    <DollarSign className="w-5 h-5 text-gb-gray" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gb-black">{fmtM(resultado.totalAportado)} — Tus aportes</p>
                    <p className="text-xs text-gb-gray">{fmtUF(resultado.totalAportado)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gb-light rounded-full flex items-center justify-center">
                    <TrendingUp className="w-5 h-5 text-gb-gray" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gb-black">{fmtM(resultado.gananciaPorRentabilidad)} — Rentabilidad ({(perfil.rentabilidadAnual * 100).toFixed(1)}% anual)</p>
                    <p className="text-xs text-gb-gray">{fmtUF(resultado.gananciaPorRentabilidad)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gb-light rounded-full flex items-center justify-center">
                    <ArrowRight className="w-5 h-5 text-gb-gray" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gb-black">{fmtM(resultado.gananciaPorBeneficio)} — Beneficio tributario APV</p>
                    <p className="text-xs text-gb-gray">{fmtUF(resultado.gananciaPorBeneficio)} — ~{resultado.rentabilidadEquivalenteA.toFixed(1)}% de tu aporte cada año</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Evolución */}
            <div className="bg-white border border-gb-border rounded-lg p-6">
              <h3 className="text-base font-semibold text-gb-black mb-4">Evolución del Ahorro</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gb-border">
                      <th className="text-left py-2 font-medium text-gb-gray">Edad</th>
                      <th className="text-left py-2 font-medium text-gb-gray">Años</th>
                      <th className="text-right py-2 font-medium text-gb-gray">Aportado</th>
                      <th className="text-right py-2 font-medium text-gb-gray">Con APV</th>
                      <th className="text-right py-2 font-medium text-gb-gray">Sin APV</th>
                      <th className="text-right py-2 font-medium text-gb-gray">Diferencia</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resultado.evolucion.map((ev, idx) => {
                      const isLast = idx === resultado.evolucion.length - 1;
                      return (
                        <tr key={ev.edad} className={`border-b border-gb-border ${isLast ? "font-semibold bg-gb-light" : ""}`}>
                          <td className="py-2">{ev.edad}</td>
                          <td className="py-2">{ev.anio}</td>
                          <td className="py-2 text-right">{fmtM(ev.aportadoAcumulado)}</td>
                          <td className="py-2 text-right text-emerald-700">{fmtM(ev.saldoConAPV)}</td>
                          <td className="py-2 text-right text-gb-gray">{fmtM(ev.saldoSinAPV)}</td>
                          <td className="py-2 text-right text-gb-dark">{fmtM(ev.diferencia)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Costo de Postergar */}
            <div className="bg-white border border-gb-border rounded-lg p-6">
              <h3 className="text-base font-semibold text-gb-black mb-4 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-amber-600" />
                Costo de Postergar
              </h3>
              <div className="space-y-3">
                {resultado.costoPostergar.map((cp) => (
                  <div key={cp.aniosPostergados} className={`p-3 rounded-lg border ${cp.aniosPostergados === 0 ? "border-emerald-300 bg-emerald-50" : "border-gb-border"}`}>
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-gb-black">
                        {cp.aniosPostergados === 0 ? "Empezar hoy" : `Postergar ${cp.aniosPostergados} año${cp.aniosPostergados > 1 ? "s" : ""}`} ({cp.edadInicio} años)
                      </p>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-gb-black">{fmtM(cp.saldoFinal)}</p>
                        {cp.perdida > 0 && (
                          <p className="text-xs text-red-600">-{fmtM(cp.perdida)}</p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Comparación A vs B */}
            <div className="bg-white border border-gb-border rounded-lg p-6">
              <h3 className="text-base font-semibold text-gb-black mb-4">APV Tipo A vs Tipo B</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 border-2 border-gb-dark rounded-lg">
                  <h4 className="text-sm font-semibold text-gb-black mb-3">APV Tipo A</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gb-gray">Ahorro mensual</span>
                      <span className="font-medium">{fmtCLP(resultado.ahorroMensualA)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gb-gray">Ahorro anual</span>
                      <span className="font-medium">{fmtCLP(resultado.ahorroAnualA)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gb-gray">Rentabilidad eq.</span>
                      <span className="font-medium">{resultado.rentabilidadEquivalenteA.toFixed(1)}%</span>
                    </div>
                  </div>
                </div>
                <div className="p-4 border border-gb-border rounded-lg">
                  <h4 className="text-sm font-semibold text-gb-dark mb-3">APV Tipo B</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gb-gray">Crédito mensual</span>
                      <span className="font-medium">{fmtCLP(resultado.creditoMensualB)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gb-gray">Crédito anual</span>
                      <span className="font-medium">{fmtCLP(resultado.creditoAnualB)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gb-gray">Rentabilidad</span>
                      <span className="font-medium">15.0% (fijo)</span>
                    </div>
                  </div>
                </div>
              </div>

              {resultado.ahorroAnualA > resultado.creditoAnualB && (
                <div className="mt-4 p-3 bg-gb-light border border-gb-border rounded-lg">
                  <p className="text-sm font-medium text-gb-black">
                    Recomendación: APV Tipo A — ahorras {fmtCLP(resultado.ahorroAnualA - resultado.creditoAnualB)} más al año
                  </p>
                  <p className="text-xs text-gb-gray mt-1">
                    Tu tramo impositivo ({resultado.rentabilidadEquivalenteA.toFixed(1)}%) es mayor que el crédito fiscal (15%)
                  </p>
                </div>
              )}
            </div>

            {/* Rentabilidades Históricas */}
            <div className="bg-white border border-gb-border rounded-lg p-6">
              <h3 className="text-base font-semibold text-gb-black mb-4">Rentabilidades Históricas</h3>
              <div className="p-4 bg-gb-light rounded-lg mb-4">
                <p className="text-sm font-medium text-gb-black mb-2">Perfil {perfil.nombre}: {perfil.descripcion}</p>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <p className="text-xs text-gb-gray">Promedio</p>
                    <p className="font-semibold text-gb-black">{perfil.historico.promedio}%/año</p>
                  </div>
                  <div>
                    <p className="text-xs text-gb-gray">Mejor año</p>
                    <p className="font-semibold text-emerald-700">+{perfil.historico.mejor}%</p>
                  </div>
                  <div>
                    <p className="text-xs text-gb-gray">Peor año</p>
                    <p className="font-semibold text-red-600">{perfil.historico.peor}%</p>
                  </div>
                </div>
              </div>
              <p className="text-xs text-gb-gray">
                Rentabilidades pasadas no garantizan resultados futuros, pero dan contexto histórico real del mercado chileno.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
