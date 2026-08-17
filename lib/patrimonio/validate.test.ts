import { describe, it, expect } from "vitest";
import { isMoneda, validateMoney, validateSeguro, validateInmueble, validateActivo } from "./validate";

describe("isMoneda", () => {
  it("acepta CLP/UF/USD y rechaza el resto", () => {
    expect(isMoneda("UF")).toBe(true);
    expect(isMoneda("EUR")).toBe(false);
    expect(isMoneda(null)).toBe(false);
  });
});

describe("validateMoney", () => {
  it("exige moneda válida cuando hay monto", () => {
    expect(validateMoney(100, null, "Prima")).toContain("Prima: falta la moneda");
    expect(validateMoney(100, "EUR", "Prima")).toContain("Prima: moneda inválida");
    expect(validateMoney(100, "UF", "Prima")).toEqual([]);
  });
  it("rechaza montos negativos", () => {
    expect(validateMoney(-5, "UF", "Prima")).toContain("Prima: el monto no puede ser negativo");
  });
  it("no exige nada cuando no hay monto", () => {
    expect(validateMoney(null, null, "Prima")).toEqual([]);
  });
});

describe("validateSeguro", () => {
  it("exige tipo válido", () => {
    expect(validateSeguro({ tipo: "auto" as never }).ok).toBe(false);
    expect(validateSeguro({ tipo: "vida" }).ok).toBe(true);
  });
  it("valida devolucion_pct en [0,100]", () => {
    expect(validateSeguro({ tipo: "vida", devolucion_pct: 150 }).errors)
      .toContain("Devolución: el porcentaje debe estar entre 0 y 100");
  });
  it("valida la moneda de la prima", () => {
    expect(validateSeguro({ tipo: "vida", prima_monto: 4, prima_moneda: "EUR" as never }).ok).toBe(false);
  });
});

describe("validateInmueble", () => {
  it("exige tipo válido", () => {
    expect(validateInmueble({ tipo: "bodega" as never }).ok).toBe(false);
  });
  it("si tiene_credito exige cuota con moneda", () => {
    const r = validateInmueble({ tipo: "inversion", tiene_credito: true });
    expect(r.ok).toBe(false);
    expect(r.errors).toContain("Crédito: falta el dividendo (cuota)");
  });
  it("si se_arrienda exige arriendo con moneda", () => {
    const r = validateInmueble({ tipo: "inversion", se_arrienda: true });
    expect(r.errors).toContain("Arriendo: falta el monto");
  });
});

describe("validateActivo", () => {
  it("exige tipo válido", () => {
    expect(validateActivo({ tipo: "cripto" as never }).ok).toBe(false);
  });
  it("regimen solo aplica a APV", () => {
    expect(validateActivo({ tipo: "afp", regimen: "A" }).errors)
      .toContain("Régimen: solo aplica a APV");
    expect(validateActivo({ tipo: "apv", regimen: "A" }).ok).toBe(true);
  });
  it("acepta régimen vacío como ausente", () => {
    expect(validateActivo({ tipo: "apv", regimen: "" }).ok).toBe(true);
  });
  it("rechaza régimen que no sea A/B en APV", () => {
    expect(validateActivo({ tipo: "apv", regimen: "C" }).errors).toContain("Régimen: debe ser A o B");
  });
  it("si hay aporte exige periodicidad", () => {
    expect(validateActivo({ tipo: "ahorro_periodico", aporte_monto: 5, aporte_moneda: "UF" }).errors)
      .toContain("Aporte: falta la periodicidad");
  });
});
