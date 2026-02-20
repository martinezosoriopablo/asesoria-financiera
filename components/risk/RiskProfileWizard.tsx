"use client";

import React, { useState, useMemo, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { getBenchmarkFromScore, AssetAllocation } from "@/lib/risk/benchmarks";
import {
  RISK_QUESTIONNAIRE_V1,
  RiskQuestion,
} from "@/lib/risk/risk_questionnaire_v1";
import {
  calculateRiskScores,
  AnswerMap,
  RiskScores,
} from "@/lib/risk/risk_scoring";
import {
  calculateRetirementProjection,
  RetirementProjection,
  LifeExpectancyInput,
} from "@/lib/risk/life_expectancy";
import { ProfileGauge } from "./ProfileGauge";
import { RetirementSummary } from "./RetirementSummary";

interface StepDef {
  id: string;
  label: string;
  dimensions: string[];
  conditional?: (answers: AnswerMap, retirementAnswers: RetirementAnswers) => boolean;
}

interface RetirementAnswers {
  sexo: "masculino" | "femenino";
  edadActual: number;
  edadJubilacion: number;
  pensionDeseada: number;
  ahorroActual: number;
  fuma: boolean;
  salud: "excelente" | "buena" | "regular" | "mala";
}

const ALL_STEPS: StepDef[] = [
  { id: "capacity", label: "Capacidad de riesgo", dimensions: ["capacity"] },
  { id: "tolerance", label: "Tolerancia al riesgo", dimensions: ["tolerance"] },
  { id: "perception", label: "Percepción actual", dimensions: ["perception"] },
  { id: "composure", label: "Comportamiento", dimensions: ["composure"] },
  { id: "validation", label: "Validación final", dimensions: ["validation"] },
  { id: "goal", label: "Objetivo", dimensions: ["goal"] },
  {
    id: "retirement",
    label: "Planificación retiro",
    dimensions: ["retirement"],
    conditional: (answers) => answers["goal_1_objetivo"] === "pension",
  },
];

const DEFAULT_RETIREMENT: RetirementAnswers = {
  sexo: "masculino",
  edadActual: 35,
  edadJubilacion: 65,
  pensionDeseada: 500000,
  ahorroActual: 0,
  fuma: false,
  salud: "buena",
};

export default function RiskProfileWizard() {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [answers, setAnswers] = useState<AnswerMap>({});
  const [retirementAnswers, setRetirementAnswers] = useState<RetirementAnswers>(DEFAULT_RETIREMENT);
  const [scores, setScores] = useState<RiskScores | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const searchParams = useSearchParams();
  const emailFromUrl = searchParams.get("email") || "";
  const advisorFromUrl = searchParams.get("advisor") || "";
  const [email, setEmail] = useState("");
  const [includeAlternatives, setIncludeAlternatives] = useState(false);

  useEffect(() => {
    if (emailFromUrl) setEmail(emailFromUrl);
  }, [emailFromUrl]);
  const [benchmark, setBenchmark] = useState<AssetAllocation | null>(null);
  const [retirementProjection, setRetirementProjection] = useState<RetirementProjection | null>(null);

  const visibleSteps = useMemo(
    () => ALL_STEPS.filter((s) => !s.conditional || s.conditional(answers, retirementAnswers)),
    [answers, retirementAnswers]
  );

  const currentStep = visibleSteps[currentStepIndex];

  const questionsForCurrentStep: RiskQuestion[] = currentStep
    ? RISK_QUESTIONNAIRE_V1.filter((q) => currentStep.dimensions.includes(q.dimension))
    : [];

  const handleSingleChoiceChange = (questionId: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  };

  const handleLikertChange = (questionId: string, value: number) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  };

  const goNext = () => {
    if (currentStepIndex < visibleSteps.length - 1) {
      setCurrentStepIndex((prev) => prev + 1);
      window.scrollTo(0, 0);
    }
  };

  const goBack = () => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex((prev) => prev - 1);
      window.scrollTo(0, 0);
    }
  };

  const handleSubmit = async () => {
    setSubmitting(true);

    try {
      const result = calculateRiskScores(answers);
      setScores(result);

      const bm = getBenchmarkFromScore(result.global, includeAlternatives, "global");
      setBenchmark(bm);

      // Calculate retirement projection if applicable
      let projection: RetirementProjection | null = null;
      if (answers["goal_1_objetivo"] === "pension") {
        const input: LifeExpectancyInput = {
          sexo: retirementAnswers.sexo,
          edadActual: retirementAnswers.edadActual,
          fuma: retirementAnswers.fuma,
          salud: retirementAnswers.salud,
        };
        projection = calculateRetirementProjection(
          input,
          retirementAnswers.edadJubilacion,
          retirementAnswers.pensionDeseada
        );
        setRetirementProjection(projection);
      }

      if (!email) {
        alert("Ingresa tu correo para poder guardar tu perfil.");
        return;
      }

      const saveRes = await fetch("/api/save-risk-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          scores: result,
          responses: answers,
          retirementData:
            answers["goal_1_objetivo"] === "pension" ? retirementAnswers : null,
          projection,
          advisorEmail: advisorFromUrl || undefined,
        }),
      });

      if (!saveRes.ok) {
        const err = await saveRes.json();
        alert(err.error || "Error guardando el perfil.");
        return;
      }

      console.log("Perfil guardado correctamente.");
    } catch (error) {
      console.error("Error guardando perfil:", error);
      alert("Hubo un problema guardando tus datos.");
    } finally {
      setSubmitting(false);
    }
  };

  const isLastStep = currentStepIndex === visibleSteps.length - 1;
  const isRetirementStep = currentStep?.id === "retirement";

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <header className="mb-8">
          <h1 className="text-2xl md:text-3xl font-semibold text-slate-900">
            Mi Perfil de Inversor
          </h1>
          <p className="text-slate-600 mt-2">
            Este cuestionario nos ayuda a entender tu capacidad, tolerancia y
            comportamiento frente al riesgo, para recomendarte una estrategia de
            inversión alineada con tus objetivos.
          </p>

          <div className="mt-4 max-w-md">
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Correo electrónico (para guardar tu perfil)
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              readOnly={!!emailFromUrl}
              placeholder="tu@email.com"
              className={`w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${emailFromUrl ? "bg-slate-100 cursor-not-allowed" : ""}`}
            />
            <p className="text-xs text-slate-500 mt-1">
              Usaremos este correo sólo para asociar tu perfil de riesgo en la
              base de datos.
            </p>
          </div>
        </header>

        {/* Barra de progreso */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            {visibleSteps.map((step, index) => (
              <div key={step.id} className="flex-1 flex flex-col items-center">
                <div
                  className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-semibold
                  ${
                    index === currentStepIndex
                      ? "bg-blue-600 text-white"
                      : index < currentStepIndex
                      ? "bg-emerald-500 text-white"
                      : "bg-slate-200 text-slate-600"
                  }`}
                >
                  {index + 1}
                </div>
                <span className="mt-1 text-[11px] text-center text-slate-600">
                  {step.label}
                </span>
              </div>
            ))}
          </div>
          <div className="w-full bg-slate-200 rounded-full h-1">
            <div
              className="bg-blue-600 h-1 rounded-full transition-all"
              style={{
                width: `${((currentStepIndex + 1) / visibleSteps.length) * 100}%`,
              }}
            ></div>
          </div>
        </div>

        {/* Contenido del paso actual */}
        <section className="bg-white shadow-sm rounded-xl p-6 md:p-8 mb-6 border border-slate-100">
          <h2 className="text-xl font-semibold text-slate-900 mb-4">
            {currentStep?.label}
          </h2>

          {/* Retirement step: custom form */}
          {isRetirementStep ? (
            <RetirementForm
              values={retirementAnswers}
              onChange={setRetirementAnswers}
            />
          ) : (
            <div className="space-y-8">
              {questionsForCurrentStep.map((q) => (
                <div key={q.id} className="border-b border-slate-100 pb-6 last:border-0">
                  <p className="font-medium text-slate-900 mb-4 text-lg">{q.text}</p>

                  {q.type === "single_choice" && q.options && (
                    <div className="space-y-3">
                      {q.options.map((opt) => {
                        const checked = answers[q.id] === opt.value;
                        return (
                          <label
                            key={opt.value}
                            className={`flex items-center gap-3 cursor-pointer rounded-xl px-4 py-3 border transition-all duration-200
                             ${
                               checked
                                 ? "border-blue-500 bg-blue-50 ring-1 ring-blue-200"
                                 : "border-slate-200 hover:bg-slate-50 hover:border-slate-300"
                             }`}
                          >
                            <input
                              type="radio"
                              name={q.id}
                              value={opt.value}
                              checked={checked}
                              onChange={() => handleSingleChoiceChange(q.id, opt.value)}
                              className="h-4 w-4 text-blue-600 focus:ring-blue-500"
                            />
                            <span className="text-sm text-slate-700">{opt.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  )}

                  {q.type === "likert_1_5" && (
                    <div className="mt-4">
                      <div className="flex flex-col items-center w-full">
                        <div className="flex items-center justify-center gap-2 sm:gap-4 w-full">
                          <span className="hidden sm:block text-xs font-medium text-slate-400 text-center w-24 leading-tight">
                            Totalmente en desacuerdo
                          </span>
                          <div className="flex gap-2 sm:gap-3">
                            {[1, 2, 3, 4, 5].map((val) => {
                              const isSelected = answers[q.id] === val;
                              return (
                                <button
                                  key={val}
                                  type="button"
                                  onClick={() => handleLikertChange(q.id, val)}
                                  className={`
                                    w-10 h-10 sm:w-12 sm:h-12
                                    rounded-lg border
                                    flex items-center justify-center
                                    text-base font-semibold
                                    transition-all duration-200
                                    ${isSelected
                                      ? "bg-blue-600 border-blue-600 text-white shadow-md scale-105"
                                      : "bg-white border-slate-200 text-slate-600 hover:border-blue-400 hover:bg-blue-50 hover:text-blue-600"
                                    }
                                  `}
                                >
                                  {val}
                                </button>
                              );
                            })}
                          </div>
                          <span className="hidden sm:block text-xs font-medium text-slate-400 text-center w-24 leading-tight">
                            Totalmente de acuerdo
                          </span>
                        </div>
                        <div className="flex justify-between w-full max-w-[300px] sm:hidden mt-2 px-1">
                          <span className="text-[10px] font-medium text-slate-400 text-left w-20 leading-tight">
                            Totalmente en desacuerdo
                          </span>
                          <span className="text-[10px] font-medium text-slate-400 text-right w-20 leading-tight">
                            Totalmente de acuerdo
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Botones siguiente / atrás */}
          <div className="flex justify-between mt-8 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={goBack}
              disabled={currentStepIndex === 0}
              className="px-5 py-2.5 text-sm font-medium rounded-lg border border-slate-300 text-slate-700 disabled:opacity-40 hover:bg-slate-50 transition-colors"
            >
              Atrás
            </button>

            {!isLastStep && (
              <button
                type="button"
                onClick={goNext}
                className="px-5 py-2.5 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 shadow-sm shadow-blue-200 transition-colors"
              >
                Siguiente
              </button>
            )}

            {isLastStep && (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                className="px-5 py-2.5 text-sm font-medium rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60 shadow-sm shadow-emerald-200 transition-colors"
              >
                {submitting ? "Calculando..." : "Calcular perfil"}
              </button>
            )}
          </div>
        </section>

        {/* Resultado del perfil */}
        {scores && (
          <section className="bg-white shadow-sm rounded-xl p-6 md:p-8 border border-emerald-200 animate-fade-in-up">
            <h2 className="text-xl font-semibold text-slate-900 mb-3">
              Tu perfil de inversor
            </h2>
            <p className="text-slate-700 mb-4">
              Según tus respuestas, tu perfil de riesgo sugerido es:
            </p>
            <div className="mb-4 flex flex-wrap items-center gap-4">
              <span className="inline-flex items-center px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 text-sm font-semibold">
                {scores.profileLabel} ({scores.global.toFixed(1)}/100)
              </span>

              <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeAlternatives}
                  onChange={(e) => setIncludeAlternatives(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                Incluir activos alternativos en el benchmark sugerido
              </label>
            </div>

            {benchmark && (
              <div className="mt-4 mb-8 bg-slate-50 rounded-lg p-4 border border-slate-200">
                <h3 className="text-sm font-semibold text-slate-800 mb-3">
                  Benchmark estratégico sugerido ({benchmark.band})
                </h3>
                <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-100">
                      <tr>
                        <th className="px-4 py-2 text-left text-slate-600 font-medium">
                          Clase de activo
                        </th>
                        <th className="px-4 py-2 text-right text-slate-600 font-medium">
                          Porcentaje
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      <tr>
                        <td className="px-4 py-2 text-slate-800">Liquidez / MM</td>
                        <td className="px-4 py-2 text-right text-slate-800 font-mono">{benchmark.weights.cash}%</td>
                      </tr>
                      <tr>
                        <td className="px-4 py-2 text-slate-800">Renta fija</td>
                        <td className="px-4 py-2 text-right text-slate-800 font-mono">{benchmark.weights.fixedIncome}%</td>
                      </tr>
                      <tr>
                        <td className="px-4 py-2 text-slate-800">Renta variable</td>
                        <td className="px-4 py-2 text-right text-slate-800 font-mono">{benchmark.weights.equities}%</td>
                      </tr>
                      <tr>
                        <td className="px-4 py-2 text-slate-800">Alternativos</td>
                        <td className="px-4 py-2 text-right text-slate-800 font-mono">{benchmark.weights.alternatives}%</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <ProfileGauge label="Capacidad" value={scores.capacity} color="bg-sky-500" />
              <ProfileGauge label="Tolerancia" value={scores.tolerance} color="bg-indigo-500" />
              <ProfileGauge label="Percepción" value={scores.perception} color="bg-amber-500" />
              <ProfileGauge label="Comportamiento" value={scores.composure} color="bg-rose-500" />
            </div>

            {/* Goal / Retirement summary */}
            {answers["goal_1_objetivo"] && (
              <RetirementSummary
                goalType={answers["goal_1_objetivo"] as string}
                retirementData={
                  answers["goal_1_objetivo"] === "pension"
                    ? {
                        sexo: retirementAnswers.sexo,
                        edadActual: retirementAnswers.edadActual,
                        edadJubilacion: retirementAnswers.edadJubilacion,
                        pensionDeseada: retirementAnswers.pensionDeseada,
                        fuma: retirementAnswers.fuma,
                        salud: retirementAnswers.salud,
                      }
                    : null
                }
                projection={retirementProjection}
              />
            )}

            <p className="text-xs text-slate-500 mt-6 italic">
              Este resultado no es definitivo. Siempre se complementa con una
              conversación y revisión conjunta de tus objetivos y situación
              financiera.
            </p>
          </section>
        )}
      </div>
    </div>
  );
}

// --- Retirement Form sub-component ---

interface RetirementFormProps {
  values: RetirementAnswers;
  onChange: (v: RetirementAnswers) => void;
}

function RetirementForm({ values, onChange }: RetirementFormProps) {
  const update = <K extends keyof RetirementAnswers>(key: K, val: RetirementAnswers[K]) =>
    onChange({ ...values, [key]: val });

  return (
    <div className="space-y-6">
      {/* Sexo */}
      <div>
        <p className="font-medium text-slate-900 mb-3 text-lg">Sexo</p>
        <div className="flex gap-3">
          {(["masculino", "femenino"] as const).map((s) => (
            <label
              key={s}
              className={`flex items-center gap-2 cursor-pointer rounded-xl px-4 py-3 border transition-all duration-200
                ${values.sexo === s
                  ? "border-blue-500 bg-blue-50 ring-1 ring-blue-200"
                  : "border-slate-200 hover:bg-slate-50 hover:border-slate-300"
                }`}
            >
              <input
                type="radio"
                name="ret_sexo"
                checked={values.sexo === s}
                onChange={() => {
                  update("sexo", s);
                  if (s === "femenino" && values.edadJubilacion === 65) {
                    update("edadJubilacion", 60);
                  } else if (s === "masculino" && values.edadJubilacion === 60) {
                    update("edadJubilacion", 65);
                  }
                }}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-slate-700 capitalize">{s}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Edad actual */}
      <div>
        <label className="font-medium text-slate-900 mb-1 block text-lg">Edad actual</label>
        <input
          type="number"
          min={18}
          max={100}
          value={values.edadActual}
          onChange={(e) => update("edadActual", Number(e.target.value))}
          className="w-32 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Edad jubilación */}
      <div>
        <label className="font-medium text-slate-900 mb-1 block text-lg">
          ¿A qué edad deseas jubilarte?
        </label>
        <input
          type="number"
          min={40}
          max={100}
          value={values.edadJubilacion}
          onChange={(e) => update("edadJubilacion", Number(e.target.value))}
          className="w-32 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Pensión deseada */}
      <div>
        <label className="font-medium text-slate-900 mb-1 block text-lg">
          ¿Cuál es la pensión mensual deseada (CLP)?
        </label>
        <input
          type="number"
          min={0}
          step={50000}
          value={values.pensionDeseada}
          onChange={(e) => update("pensionDeseada", Number(e.target.value))}
          className="w-48 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Ahorro actual */}
      <div>
        <label className="font-medium text-slate-900 mb-1 block text-lg">
          ¿Cuánto tienes ahorrado actualmente para tu jubilación? (CLP)
        </label>
        <p className="text-sm text-slate-500 mb-2">
          Incluye AFP, APV, ahorro voluntario, inversiones destinadas a retiro.
        </p>
        <input
          type="number"
          min={0}
          step={1000000}
          value={values.ahorroActual}
          onChange={(e) => update("ahorroActual", Number(e.target.value))}
          className="w-48 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Fuma */}
      <div>
        <p className="font-medium text-slate-900 mb-3 text-lg">¿Fumas actualmente?</p>
        <div className="flex gap-3">
          {([true, false] as const).map((v) => (
            <label
              key={String(v)}
              className={`flex items-center gap-2 cursor-pointer rounded-xl px-4 py-3 border transition-all duration-200
                ${values.fuma === v
                  ? "border-blue-500 bg-blue-50 ring-1 ring-blue-200"
                  : "border-slate-200 hover:bg-slate-50 hover:border-slate-300"
                }`}
            >
              <input
                type="radio"
                name="ret_fuma"
                checked={values.fuma === v}
                onChange={() => update("fuma", v)}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-slate-700">{v ? "Sí" : "No"}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Salud */}
      <div>
        <p className="font-medium text-slate-900 mb-3 text-lg">
          ¿Cómo describirías tu salud general?
        </p>
        <div className="flex flex-wrap gap-3">
          {(["excelente", "buena", "regular", "mala"] as const).map((s) => (
            <label
              key={s}
              className={`flex items-center gap-2 cursor-pointer rounded-xl px-4 py-3 border transition-all duration-200
                ${values.salud === s
                  ? "border-blue-500 bg-blue-50 ring-1 ring-blue-200"
                  : "border-slate-200 hover:bg-slate-50 hover:border-slate-300"
                }`}
            >
              <input
                type="radio"
                name="ret_salud"
                checked={values.salud === s}
                onChange={() => update("salud", s)}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-slate-700 capitalize">{s}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
