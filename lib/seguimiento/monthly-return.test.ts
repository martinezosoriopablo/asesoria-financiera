import { describe, it, expect } from "vitest";
import { computeMonthlyReturn, type MonthlyHoldingInput } from "./monthly-return";

// El retorno mensual se calcula por VALOR CUOTA (marketValue/quantity), ponderado
// por el % de cada activo al inicio del mes. Las compras/ventas NO cuentan como
// retorno: se reflejan como flujo de caja neto (aportes/retiros) mostrado aparte.

describe("computeMonthlyReturn", () => {
  it("calcula el retorno por valor cuota, independiente de la cantidad (compras)", () => {
    // Compró más cuotas a mitad de mes: 100 cuotas@$1 -> 200 cuotas@$1,10.
    // El retorno es el del PRECIO (+10%), NO (220-100)/100 = +120%.
    const holdings: MonthlyHoldingInput[] = [
      { name: "Fondo X", assetClass: "equity", startCLP: 100, startQty: 100, endCLP: 220, endQty: 200 },
    ];
    const r = computeMonthlyReturn(holdings, 0, 0);
    expect(r.holdings[0].returnPct).toBeCloseTo(10, 6);
    expect(r.portfolioReturnPct).toBeCloseTo(10, 6);
  });

  it("una compra nueva no infla el retorno; se refleja como flujo de caja", () => {
    // X: 100 cuotas@$1 -> $110 (+10%). Y: nuevo, comprado por $50, sube a $52,5.
    const holdings: MonthlyHoldingInput[] = [
      { name: "X", assetClass: "equity", startCLP: 100, startQty: 100, endCLP: 110, endQty: 100 },
      { name: "Y", assetClass: "equity", startCLP: 0, startQty: 0, endCLP: 52.5, endQty: 50, externalReturnPct: 5 },
    ];
    const r = computeMonthlyReturn(holdings, 0, 0);
    // Retorno de la cartera = 10% (solo X; Y entró después)
    expect(r.portfolioReturnPct).toBeCloseTo(10, 6);
    // Y no contribuye al retorno del mes (entró a mitad)
    const y = r.holdings.find(h => h.name === "Y")!;
    expect(y.status).toBe("new");
    expect(y.contributionPp).toBeCloseTo(0, 6);
    // Flujo de caja neto ≈ ΔValor - retorno explicado = (162,5-100) - 10 = 52,5
    expect(r.netCashFlowCLP).toBeCloseTo(52.5, 6);
  });

  it("suma de contribuciones = retorno del portafolio", () => {
    const holdings: MonthlyHoldingInput[] = [
      { name: "A", assetClass: "equity", startCLP: 60, startQty: 60, endCLP: 66, endQty: 60 },       // +10%
      { name: "B", assetClass: "fixedIncome", startCLP: 40, startQty: 40, endCLP: 38, endQty: 40 },   // -5%
    ];
    const r = computeMonthlyReturn(holdings, 0, 0);
    const sumContrib = r.holdings.reduce((s, h) => s + h.contributionPp, 0);
    expect(sumContrib).toBeCloseTo(r.portfolioReturnPct, 6);
    // 0.10*0.6 + (-0.05)*0.4 = 0.06 - 0.02 = 0.04 -> 4%
    expect(r.portfolioReturnPct).toBeCloseTo(4, 6);
  });

  it("una venta total sin retorno externo no cuenta como retorno (es retiro)", () => {
    const holdings: MonthlyHoldingInput[] = [
      { name: "Mantiene", assetClass: "equity", startCLP: 100, startQty: 100, endCLP: 110, endQty: 100 },
      { name: "Vendido", assetClass: "fixedIncome", startCLP: 50, startQty: 50, endCLP: 0, endQty: 0 },
    ];
    const r = computeMonthlyReturn(holdings, 0, 0);
    const sold = r.holdings.find(h => h.name === "Vendido")!;
    expect(sold.status).toBe("sold");
    expect(sold.returnPct).toBeNull();
    expect(sold.contributionPp).toBeCloseTo(0, 6);
  });

  it("el efectivo pondera pero no aporta retorno", () => {
    const holdings: MonthlyHoldingInput[] = [
      { name: "X", assetClass: "equity", startCLP: 50, startQty: 50, endCLP: 55, endQty: 50 }, // +10%
    ];
    // 50 en activos + 50 en caja -> el activo pesa 50% -> retorno cartera = 5%
    const r = computeMonthlyReturn(holdings, 50, 50);
    expect(r.portfolioReturnPct).toBeCloseTo(5, 6);
  });
});
