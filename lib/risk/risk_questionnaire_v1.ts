// lib/risk/risk_questionnaire_v1.ts

export type RiskDimension =
  | "capacity"
  | "tolerance"
  | "perception"
  | "composure"
  | "validation"
  | "goal";

export type RiskQuestionType =
  | "single_choice"
  | "likert_1_5";

export interface RiskOption {
  value: string;
  label: string;
  score: number; // 0-100 para single_choice, interpretado como tal
}

export interface RiskQuestion {
  id: string;
  dimension: RiskDimension;
  type: RiskQuestionType;
  text: string;
  options?: RiskOption[]; // para single_choice
  // para likert
  reverse?: boolean; // si true, invierte el scoring (para ítems de aversión)
}

export const RISK_QUESTIONNAIRE_V1: RiskQuestion[] = [
  // ======================
  // CAPACITY (capacidad)
  // ======================
  {
    id: "cap_1_age",
    dimension: "capacity",
    type: "single_choice",
    text: "¿Cuál es tu rango de edad?",
    options: [
      { value: "menos_35", label: "Menos de 35 años", score: 90 },
      { value: "35_50", label: "Entre 35 y 50 años", score: 75 },
      { value: "50_65", label: "Entre 50 y 65 años", score: 50 },
      { value: "mas_65", label: "Más de 65 años", score: 30 },
    ],
  },
  {
    id: "cap_2_ingresos_estables",
    dimension: "capacity",
    type: "single_choice",
    text: "¿Cómo describirías la estabilidad de tus ingresos actuales?",
    options: [
      { value: "muy_estables", label: "Muy estables y predecibles", score: 90 },
      { value: "estables", label: "Relativamente estables", score: 70 },
      { value: "variables", label: "Bastante variables", score: 50 },
      { value: "muy_variables", label: "Muy variables o inciertos", score: 30 },
    ],
  },
  {
    id: "cap_3_dependencia_portafolio",
    dimension: "capacity",
    type: "single_choice",
    text: "¿Qué tan dependes de este portafolio para financiar tus gastos anuales?",
    options: [
      { value: "nada", label: "Casi nada, es ahorro de largo plazo", score: 90 },
      { value: "parcial", label: "Parcialmente, pero no es mi fuente principal", score: 70 },
      { value: "alta", label: "Alta, financia una parte importante de mis gastos", score: 40 },
      { value: "critica", label: "Es crítico, sin esto no puedo cubrir gastos esenciales", score: 20 },
    ],
  },
  {
    id: "cap_4_horizonte",
    dimension: "capacity",
    type: "single_choice",
    text: "¿En cuántos años esperas comenzar a retirar una parte importante de este portafolio?",
    options: [
      { value: "10_plus", label: "En 10 años o más", score: 90 },
      { value: "5_10", label: "Entre 5 y 10 años", score: 70 },
      { value: "2_5", label: "Entre 2 y 5 años", score: 50 },
      { value: "menos_2", label: "En menos de 2 años", score: 30 },
    ],
  },
  {
    id: "cap_5_tolerancia_perdida_objetivos",
    dimension: "capacity",
    type: "single_choice",
    text: "Si tu portafolio sufriera una caída del 25% en un año, ¿cómo afectaría tus objetivos financieros?",
    options: [
      { value: "no_afecta", label: "No afectaría mis objetivos de largo plazo", score: 90 },
      { value: "ajuste_menor", label: "Requeriría algunos ajustes, pero mis objetivos se mantienen", score: 70 },
      { value: "ajuste_mayor", label: "Tendría que aplazar o reducir varios objetivos importantes", score: 40 },
      { value: "inaceptable", label: "Sería inaceptable, arruinaría mis planes clave", score: 20 },
    ],
  },

  // ======================
  // TOLERANCE (psicometría)
  // ======================
  {
    id: "tol_1_riesgo_vs_retorno",
    dimension: "tolerance",
    type: "likert_1_5",
    text: "Estoy dispuesto a aceptar mayores fluctuaciones en el valor de mis inversiones si eso aumenta la probabilidad de obtener mayores retornos en el largo plazo.",
    reverse: false,
  },
  {
    id: "tol_2_ansiedad_caidas",
    dimension: "tolerance",
    type: "likert_1_5",
    text: "Las caídas temporales del mercado me generan mucha ansiedad, incluso si sé que son normales.",
    reverse: true,
  },
  {
    id: "tol_3_perdidas_corto_plazo",
    dimension: "tolerance",
    type: "likert_1_5",
    text: "Puedo tolerar pérdidas significativas en el corto plazo si confío en la estrategia de largo plazo.",
    reverse: false,
  },
  {
    id: "tol_4_cambios_portafolio",
    dimension: "tolerance",
    type: "likert_1_5",
    text: "Me cuesta mucho mantener una inversión cuando ha tenido varios meses seguidos de malos resultados.",
    reverse: true,
  },
  {
    id: "tol_5_agresividad_oportunidades",
    dimension: "tolerance",
    type: "likert_1_5",
    text: "Cuando veo una buena oportunidad de inversión, prefiero aprovecharla aunque implique asumir más riesgo.",
    reverse: false,
  },

  // ======================
  // PERCEPTION (percepción actual)
  // ======================
  {
    id: "per_1_entorno_actual",
    dimension: "perception",
    type: "single_choice",
    text: "¿Cómo describirías el entorno económico y de mercados financieros actuales?",
    options: [
      { value: "muy_riesgoso", label: "Muy riesgoso e incierto", score: 20 },
      { value: "algo_riesgoso", label: "Algo más riesgoso de lo normal", score: 40 },
      { value: "normal", label: "Dentro de lo normal", score: 60 },
      { value: "atractivo", label: "Relativamente atractivo para invertir", score: 80 },
    ],
  },
  {
    id: "per_2_en_comparacion",
    dimension: "perception",
    type: "single_choice",
    text: "En comparación con los últimos 3–5 años, ¿cómo ves el nivel de riesgo en los mercados hoy?",
    options: [
      { value: "mucho_mas_riesgo", label: "Mucho más riesgo que antes", score: 30 },
      { value: "algo_mas_riesgo", label: "Algo más de riesgo", score: 45 },
      { value: "similar", label: "Riesgo similar", score: 60 },
      { value: "menos_riesgo", label: "Menos riesgo que antes", score: 75 },
    ],
  },
  {
    id: "per_3_confianza_largo_plazo",
    dimension: "perception",
    type: "single_choice",
    text: "¿Qué tan confiado te sientes en que los mercados globales seguirán generando retornos positivos en el largo plazo (10 años o más)?",
    options: [
      { value: "muy_poco", label: "Muy poco confiado", score: 30 },
      { value: "algo", label: "Algo confiado", score: 50 },
      { value: "bastante", label: "Bastante confiado", score: 70 },
      { value: "muy", label: "Muy confiado", score: 85 },
    ],
  },

  // ======================
  // COMPOSURE (comportamiento)
  // ======================
  {
    id: "comp_1_reaccion_caida_20",
    dimension: "composure",
    type: "single_choice",
    text: "Si tu portafolio cayera 20% en un periodo corto (por ejemplo 6 meses), ¿qué harías más probablemente?",
    options: [
      { value: "vende_todo", label: "Vendería casi todo para evitar más pérdidas", score: 20 },
      { value: "reduce_algo", label: "Reduciría parte de la inversión para estar más tranquilo", score: 40 },
      { value: "mantiene", label: "Mantendría la inversión y esperaría una recuperación", score: 70 },
      { value: "aumenta", label: "Aumentaría la inversión aprovechando los precios bajos", score: 90 },
    ],
  },
  {
    id: "comp_2_historial_crisis",
    dimension: "composure",
    type: "single_choice",
    text: "En crisis anteriores (por ejemplo, 2008, 2011, 2020), ¿cómo reaccionaste con tus inversiones?",
    options: [
      { value: "vendi", label: "Vendí una parte importante de mis inversiones", score: 30 },
      { value: "reduje_algo", label: "Reduje algo, pero mantuve posiciones relevantes", score: 50 },
      { value: "mantuve", label: "En general mantuve las inversiones", score: 70 },
      { value: "aumente", label: "Aumenté posiciones o aporté más recursos", score: 85 },
      { value: "no_tenia", label: "No tenía inversiones en esos periodos", score: 55 },
    ],
  },
  {
    id: "comp_3_revision_portafolio",
    dimension: "composure",
    type: "single_choice",
    text: "¿Con qué frecuencia revisas el valor de tus inversiones?",
    options: [
      { value: "todos_dias", label: "Diariamente", score: 40 },
      { value: "semanal", label: "Varias veces al mes", score: 55 },
      { value: "mensual", label: "Aproximadamente una vez al mes", score: 70 },
      { value: "trimestral", label: "Menos de una vez al mes", score: 80 },
    ],
  },

  // ======================
  // VALIDATION (sanity check)
  // ======================
  {
    id: "val_1_portafolio_preferido",
    dimension: "validation",
    type: "single_choice",
    text: "Imagina tres portafolios: A) sube y baja poco pero con retornos moderados; B) tiene subidas y bajadas intermedias con buenos retornos esperados; C) sube y baja mucho pero con retornos esperados más altos. ¿Con cuál te sientes más identificado?",
    options: [
      { value: "A", label: "A: prefiero estabilidad y menor volatilidad", score: 30 },
      { value: "B", label: "B: un equilibrio entre estabilidad y crecimiento", score: 60 },
      { value: "C", label: "C: mayor volatilidad a cambio de retornos superiores", score: 85 },
    ],
  },

  // ======================
  // GOAL (objetivo del ahorro) — informativo, no afecta scoring
  // ======================
  {
    id: "goal_1_objetivo",
    dimension: "goal",
    type: "single_choice",
    text: "¿Cuál es el principal objetivo de este ahorro/inversión?",
    options: [
      { value: "pension", label: "Pensión / Retiro", score: 0 },
      { value: "vivienda", label: "Compra de vivienda", score: 0 },
      { value: "educacion", label: "Educación de hijos", score: 0 },
      { value: "libertad", label: "Libertad financiera / Independencia", score: 0 },
      { value: "patrimonio", label: "Crecimiento de patrimonio", score: 0 },
      { value: "otro", label: "Otro", score: 0 },
    ],
  },
];

