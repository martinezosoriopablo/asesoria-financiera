import { describe, it, expect } from "vitest";
import { proratePeriodReturn } from "./prorate-period-return";

// accRet (retorno acumulado del bono) está medido desde la cartola hasta la
// fecha de referencia (hoy). Para estimar el tramo de un período (mes) se
// prorratea linealmente: ret = accRet * (díasEfectivosDelPeríodo / (hoy - cartola)).
// El denominador SIEMPRE es (hoy - cartola) porque es el lapso que abarca accRet.

const ms = (d: string) => new Date(d + "T00:00:00").getTime();

describe("proratePeriodReturn", () => {
  it("prorratea con denominador hoy - cartola", () => {
    // cartola 01-ene, hoy 11-ene (10 días), período 01-06 ene (5 días) -> 50%
    const ret = proratePeriodReturn({
      accumulatedReturnPct: 10,
      cartolaDate: "2026-01-01",
      referenceDateMs: ms("2026-01-11"),
      periodStart: "2026-01-01",
      periodEnd: "2026-01-06",
    });
    expect(ret).toBeCloseTo(5, 6);
  });

  it("nunca devuelve un tramo mayor que el retorno total (cap proRatio <= 1)", () => {
    // período (30 días) mayor que el lapso total (4 días) -> cap a accRet
    const ret = proratePeriodReturn({
      accumulatedReturnPct: 8,
      cartolaDate: "2026-01-01",
      referenceDateMs: ms("2026-01-05"),
      periodStart: "2026-01-01",
      periodEnd: "2026-01-31",
    });
    expect(ret).toBeCloseTo(8, 6);
  });

  it("acota los días al período efectivamente tenido (compra a mitad de mes)", () => {
    // cartola 20-jun, hoy 20-jul (30 días). Junio efectivo: 20-jun a 30-jun (10 días) -> 1/3
    const ret = proratePeriodReturn({
      accumulatedReturnPct: 9,
      cartolaDate: "2026-06-20",
      referenceDateMs: ms("2026-07-20"),
      periodStart: "2026-06-01",
      periodEnd: "2026-06-30",
    });
    expect(ret).toBeCloseTo(3, 6);
  });

  it("devuelve 0 si el período es anterior a la cartola", () => {
    const ret = proratePeriodReturn({
      accumulatedReturnPct: 5,
      cartolaDate: "2026-06-01",
      referenceDateMs: ms("2026-07-01"),
      periodStart: "2026-05-01",
      periodEnd: "2026-05-31",
    });
    expect(ret).toBe(0);
  });

  it("sin fecha de cartola devuelve el retorno acumulado (fallback seguro)", () => {
    const ret = proratePeriodReturn({
      accumulatedReturnPct: 4,
      cartolaDate: null,
      referenceDateMs: ms("2026-07-01"),
      periodStart: "2026-06-01",
      periodEnd: "2026-06-30",
    });
    expect(ret).toBe(4);
  });
});
