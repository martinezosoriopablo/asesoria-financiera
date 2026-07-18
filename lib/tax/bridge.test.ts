import { describe, it, expect } from "vitest";
import { convertToTaxHoldings } from "./bridge";

// Regresión: la conversión a CLP debe manejar UF (moneda de primera clase en
// depósitos/bonos chilenos). Antes, la toCLP local solo cubría USD/EUR y trataba
// la UF como si ya fuera CLP, subvaluando el cost basis ~38.000x y sobreestimando
// la ganancia (y el impuesto) del holding en UF.

describe("convertToTaxHoldings - conversión de moneda", () => {
  it("convierte holdings en UF a CLP usando la UF (no los trata como CLP)", () => {
    const result = convertToTaxHoldings(
      [{ fundName: "Depósito UF", currency: "UF", marketValue: 1000, costBasis: 900, securityId: "", serie: "" }],
      [],
      38000, // valor UF
      { usdRate: 950 }
    );
    expect(result).toHaveLength(1);
    // 1000 UF * 38.000 = 38.000.000 CLP -> 1000 UF
    expect(result[0].currentValueCLP).toBeCloseTo(38_000_000, 0);
    expect(result[0].currentValueUF).toBeCloseTo(1000, 6);
    // 900 UF de costo -> 900 UF (no 0,0237 UF)
    expect(result[0].acquisitionCostUF).toBeCloseTo(900, 6);
  });

  it("holdings en USD se convierten con la tasa USD", () => {
    const result = convertToTaxHoldings(
      [{ fundName: "Bono USD", currency: "USD", marketValue: 100, securityId: "", serie: "" }],
      [],
      38000,
      { usdRate: 950 }
    );
    // 100 USD * 950 = 95.000 CLP
    expect(result[0].currentValueCLP).toBeCloseTo(95_000, 0);
  });
});
