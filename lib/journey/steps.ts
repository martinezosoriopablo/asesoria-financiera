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

export function computeJourneySteps(c: JourneyClient): JourneyStep[] {
  const done = {
    datos: true,
    perfil: !!(c.perfil_riesgo && c.perfil_riesgo.trim()),
    cartola: !!c.tiene_portfolio,
    recomendacion: !!c.tiene_cartera_recomendada,
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
