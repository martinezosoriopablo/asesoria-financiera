// lib/journey/steps.test.ts
import { describe, it, expect } from "vitest";
import { computeJourneySteps } from "./steps";

describe("computeJourneySteps", () => {
  it("cliente recién creado: solo paso 1 done, paso 2 es el siguiente", () => {
    const s = computeJourneySteps({});
    expect(s).toHaveLength(5);
    expect(s[0].done).toBe(true);            // Datos
    expect(s[1].done).toBe(false);           // Perfil
    expect(s[1].isNext).toBe(true);
    expect(s.filter((x) => x.isNext)).toHaveLength(1);
  });
  it("con perfil: pasos 1-2 done, cartola es el siguiente", () => {
    const s = computeJourneySteps({ perfil_riesgo: "moderado" });
    expect(s[1].done).toBe(true);
    expect(s[2].isNext).toBe(true);
  });
  it("con perfil + cartola: paso 4 (recomendación) es el siguiente", () => {
    const s = computeJourneySteps({ perfil_riesgo: "moderado", tiene_portfolio: true });
    expect(s[2].done).toBe(true);
    expect(s[3].isNext).toBe(true);
  });
  it("todo completo: ningún isNext, todos done", () => {
    const s = computeJourneySteps({ perfil_riesgo: "x", tiene_portfolio: true, tiene_cartera_recomendada: true });
    expect(s.every((x) => x.done)).toBe(true);
    expect(s.some((x) => x.isNext)).toBe(false);
  });
});
