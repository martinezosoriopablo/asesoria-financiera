import { describe, it, expect } from "vitest";
import { computeJourneySteps, type JourneyClient } from "./journey";

const HOY = new Date("2026-08-05T00:00:00Z");
const base: JourneyClient = {
  id: "c1", email: "a@b.cl", perfil_riesgo: null, puntaje_riesgo: null,
  tiene_portfolio: false, cartera_recomendada: null, next_questionnaire_date: null,
};
const st = (steps: ReturnType<typeof computeJourneySteps>, key: string) => steps.find(s => s.key === key)!;

describe("computeJourneySteps", () => {
  it("cliente nuevo (solo email): datos done, current = perfil, resto pending", () => {
    const s = computeJourneySteps(base, HOY);
    expect(s.map(x => x.key)).toEqual(["datos", "perfil", "cartola", "recomendacion", "seguimiento"]);
    expect(st(s, "datos").status).toBe("done");
    expect(st(s, "perfil").status).toBe("current");
    expect(st(s, "cartola").status).toBe("pending");
    expect(st(s, "recomendacion").status).toBe("pending");
    expect(st(s, "seguimiento").status).toBe("pending");
  });

  it("sin email: datos current", () => {
    const s = computeJourneySteps({ ...base, email: null }, HOY);
    expect(st(s, "datos").status).toBe("current");
  });

  it("perfil real (puntaje>0): perfil done con detalle, current = cartola", () => {
    const s = computeJourneySteps({ ...base, perfil_riesgo: "moderado", puntaje_riesgo: 62 }, HOY);
    expect(st(s, "perfil").status).toBe("done");
    expect(st(s, "perfil").detail).toBe("moderado · 62");
    expect(st(s, "cartola").status).toBe("current");
  });

  it("perfil solo estimado (puntaje=0): perfil NO done", () => {
    const s = computeJourneySteps({ ...base, perfil_riesgo: "moderado", puntaje_riesgo: 0 }, HOY);
    expect(st(s, "perfil").status).toBe("current");
  });

  it("con cartola: current = recomendacion", () => {
    const s = computeJourneySteps({ ...base, perfil_riesgo: "moderado", puntaje_riesgo: 62, tiene_portfolio: true }, HOY);
    expect(st(s, "cartola").status).toBe("done");
    expect(st(s, "recomendacion").status).toBe("current");
  });

  it("con recomendación con contenido: seguimiento done (en curso), sin current", () => {
    const s = computeJourneySteps({
      ...base, perfil_riesgo: "moderado", puntaje_riesgo: 62, tiene_portfolio: true,
      cartera_recomendada: { cartera: [{ ticker: "VOO", porcentaje: 100 }] },
    }, HOY);
    expect(st(s, "recomendacion").status).toBe("done");
    expect(st(s, "seguimiento").status).toBe("done");
    expect(st(s, "seguimiento").detail).toBe("en curso");
    expect(s.some(x => x.status === "current")).toBe(false);
  });

  it("cartera_recomendada vacía → recomendacion pending", () => {
    const s = computeJourneySteps({
      ...base, perfil_riesgo: "moderado", puntaje_riesgo: 62, tiene_portfolio: true,
      cartera_recomendada: { cartera: [] },
    }, HOY);
    expect(st(s, "recomendacion").status).toBe("current");
  });

  it("next_questionnaire_date vencida → perfil done + warn", () => {
    const s = computeJourneySteps({
      ...base, perfil_riesgo: "moderado", puntaje_riesgo: 62, next_questionnaire_date: "2026-01-01",
    }, HOY);
    expect(st(s, "perfil").status).toBe("done");
    expect(st(s, "perfil").warn).toBe(true);
  });

  it("hrefs scopeados al cliente", () => {
    const s = computeJourneySteps(base, HOY);
    expect(st(s, "recomendacion").href).toBe("/recomendacion/c1");
    expect(st(s, "cartola").href).toBe("/clients/c1/seguimiento");
    expect(st(s, "perfil").href).toBe("/analisis-cartola?client=a%40b.cl");
  });
});
