import { describe, it, expect } from "vitest";
import { calcularAhorroAPV_A_UF, calcularCreditoAPV_B_UF } from "./apv";

// Tramos de impuesto son UF MENSUALES. El beneficio APV Tipo A es la diferencia
// de impuesto Global Complementario con y sin el aporte deducido. La regresión
// que estos tests fijan: comparar renta ANUAL contra tramos MENSUALES (sin /12)
// empujaba casi cualquier sueldo al tramo 40%, inflando el ahorro ~10x.

describe("calcularAhorroAPV_A_UF", () => {
  it("sueldo bajo (20 UF/mes) queda en tramo marginal 4%, no 40%", () => {
    // salario 240 UF/año (20/mes), aporte 24 UF/año
    // impSin(240): mensual 20 -> (20-13.5)*0.04=0.26 -> *12 = 3.12
    // impCon(216): mensual 18 -> (18-13.5)*0.04=0.18 -> *12 = 2.16
    // ahorro = 0.96, rentEq = 0.96/24 = 4.0%
    const r = calcularAhorroAPV_A_UF(240, 24);
    expect(r.ahorroAnualUF).toBeCloseTo(0.96, 4);
    expect(r.rentabilidadEquivalente).toBeCloseTo(4.0, 4);
    expect(r.aporteElegibleUF).toBe(24);
  });

  it("sueldo medio (80 UF/mes) atraviesa varios tramos correctamente", () => {
    // salario 960 UF/año (80/mes), aporte 120 UF/año
    // impSin(960): mensual 80 -> 0.66+1.6+2.7+2.3=7.26 -> *12 = 87.12
    // impCon(840): mensual 70 -> 0.66+1.6+2.7=4.96 -> *12 = 59.52
    // ahorro = 27.6, rentEq = 27.6/120 = 23%
    const r = calcularAhorroAPV_A_UF(960, 120);
    expect(r.ahorroAnualUF).toBeCloseTo(27.6, 4);
    expect(r.rentabilidadEquivalente).toBeCloseTo(23.0, 4);
  });

  it("aplica el tope de 600 UF anuales cuando el 30% del salario es mayor", () => {
    // salario 10000 UF/año -> tope = min(600, 3000) = 600
    const r = calcularAhorroAPV_A_UF(10000, 800);
    expect(r.aporteElegibleUF).toBe(600);
  });

  it("aplica el tope del 30% del salario cuando es menor que 600 UF", () => {
    // salario 1000 UF/año -> tope = min(600, 300) = 300
    const r = calcularAhorroAPV_A_UF(1000, 600);
    expect(r.aporteElegibleUF).toBe(300);
  });

  it("aporte cero no produce ahorro ni división por cero", () => {
    const r = calcularAhorroAPV_A_UF(960, 0);
    expect(r.ahorroAnualUF).toBe(0);
    expect(r.rentabilidadEquivalente).toBe(0);
  });
});

describe("calcularCreditoAPV_B_UF", () => {
  it("crédito = 15% del aporte elegible", () => {
    const r = calcularCreditoAPV_B_UF(120);
    expect(r.aporteElegibleUF).toBe(120);
    expect(r.creditoAnualUF).toBeCloseTo(18, 6);
  });

  it("topa el aporte elegible en 600 UF anuales", () => {
    const r = calcularCreditoAPV_B_UF(800);
    expect(r.aporteElegibleUF).toBe(600);
    expect(r.creditoAnualUF).toBeCloseTo(90, 6);
  });
});
