import { describe, it, expect } from "vitest";
import { estimateImpliedFlow } from "./implied-flow";

// Flujo implícito = (valorNuevo − valorPrevio) − ganancia de mercado de lo tenido.
// Sirve para DETECTAR aportes/retiros no registrados: si es material y el asesor
// no registró flujo, avisar. Un rebalanceo (mismo valor) da ~0; una ganancia de
// precio pura da 0; comprar/vender da el monto del aporte/retiro.

describe("estimateImpliedFlow", () => {
  it("ganancia de precio pura no implica flujo", () => {
    const prev = [{ fundName: "A", quantity: 100, marketValue: 100 }];
    const next = [{ fundName: "A", quantity: 100, marketValue: 110 }]; // +10% precio
    expect(estimateImpliedFlow(prev, next)).toBeCloseTo(0, 6);
  });

  it("comprar más de un fondo implica un aporte", () => {
    const prev = [{ fundName: "A", quantity: 100, marketValue: 100 }]; // $1/cuota
    const next = [{ fundName: "A", quantity: 200, marketValue: 200 }]; // 100 cuotas nuevas a $1
    expect(estimateImpliedFlow(prev, next)).toBeCloseTo(100, 6);
  });

  it("vender parte de un fondo implica un retiro", () => {
    const prev = [{ fundName: "A", quantity: 100, marketValue: 100 }];
    const next = [{ fundName: "A", quantity: 50, marketValue: 50 }];
    expect(estimateImpliedFlow(prev, next)).toBeCloseTo(-50, 6);
  });

  it("rebalanceo A->B por el mismo valor no implica flujo", () => {
    const prev = [{ fundName: "A", quantity: 100, marketValue: 100 }];
    const next = [{ fundName: "B", quantity: 100, marketValue: 100 }];
    expect(estimateImpliedFlow(prev, next)).toBeCloseTo(0, 6);
  });

  it("combina ganancia de precio y aporte", () => {
    // A sube 10% (100->110) y además se aportan $50 comprando fondo nuevo C
    const prev = [{ fundName: "A", quantity: 100, marketValue: 100 }];
    const next = [
      { fundName: "A", quantity: 100, marketValue: 110 },
      { fundName: "C", quantity: 50, marketValue: 50 },
    ];
    // totalNext-totalPrev = 160-100 = 60; ganancia mercado A = 100*(1.1-1)=10; flujo=50
    expect(estimateImpliedFlow(prev, next)).toBeCloseTo(50, 6);
  });

  it("matchea por securityId+serie cuando está disponible", () => {
    const prev = [{ fundName: "Fondo X", securityId: "8052", serie: "A", quantity: 100, marketValue: 100 }];
    const next = [{ fundName: "Fondo X reclasificado", securityId: "8052", serie: "A", quantity: 100, marketValue: 105 }];
    expect(estimateImpliedFlow(prev, next)).toBeCloseTo(0, 6);
  });
});
