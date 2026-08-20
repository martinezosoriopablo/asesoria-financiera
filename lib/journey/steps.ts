// lib/journey/steps.ts
export interface JourneyClient {
  perfil_riesgo?: string | null;
  tiene_portfolio?: boolean | null;
  tiene_cartera_recomendada?: boolean | null;
}

export interface JourneyStep {
  key: "datos" | "perfil" | "cartola" | "recomendacion" | "comparar";
  label: string;
  done: boolean;
  isNext: boolean;
}

// Una recomendación "real" es un JSONB no-null con al menos una posición en `cartera`.
// Un objeto vacío ({} o {cartera:[]}) NO cuenta (evita falsos "journey completo").
// Mismo criterio que la migración 20260327_recommendation_versions.sql.
export function hasRealRecommendation(carteraRecomendada: unknown): boolean {
  if (!carteraRecomendada || typeof carteraRecomendada !== "object") return false;
  const cartera = (carteraRecomendada as { cartera?: unknown }).cartera;
  if (Array.isArray(cartera)) return cartera.length > 0;
  // Sin sub-array `cartera`: cualquier objeto no vacío se considera recomendación.
  return Object.keys(carteraRecomendada as object).length > 0;
}

export function computeJourneySteps(c: JourneyClient): JourneyStep[] {
  const done = {
    datos: true,
    perfil: !!(c.perfil_riesgo && c.perfil_riesgo.trim()),
    cartola: !!c.tiene_portfolio,
    recomendacion: !!c.tiene_cartera_recomendada,
    // NOTA: "comparar" comparte señal con "recomendacion" — no existe un flag
    // propio de "el asesor abrió la comparación". El 5º paso se marca ✓ al haber
    // recomendación. Si en el futuro se registra la acción de comparar, darle su
    // propia señal aquí.
    comparar: !!c.tiene_cartera_recomendada,
  };
  const labels: Record<JourneyStep["key"], string> = {
    datos: "Datos del cliente",
    perfil: "Perfil de riesgo",
    cartola: "Subir cartola",
    recomendacion: "Recomendación",
    comparar: "Comparar ideal vs actual",
  };
  const order: JourneyStep["key"][] = ["datos", "perfil", "cartola", "recomendacion", "comparar"];
  const firstPending = order.find((k) => !done[k]);
  return order.map((k) => ({ key: k, label: labels[k], done: done[k], isNext: k === firstPending }));
}
