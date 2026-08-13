import { describe, it, expect } from "vitest";
import { computePatrimonioSummary } from "./summary";
import type { PatrimonioData } from "./types";

const rates = { usd: 950, eur: 1000, uf: 38000 }; // CLP por unidad

// Helper para construir items mínimos (el resto de campos no afecta el cálculo).
function data(partial: Partial<PatrimonioData>): PatrimonioData {
  return { seguros: [], inmuebles: [], activos: [], ...partial } as PatrimonioData;
}

describe("computePatrimonioSummary", () => {
  it("suma activos por categoría y convierte a CLP", () => {
    const s = computePatrimonioSummary(
      data({
        inmuebles: [
          { tipo: "inversion", valor_estimado_venta_monto: 5000, valor_estimado_venta_moneda: "UF" } as never, // 190.000.000
        ],
        activos: [
          { tipo: "apv", saldo_monto: 1000, saldo_moneda: "UF" } as never,   // 38.000.000
          { tipo: "afp", saldo_monto: 4900, saldo_moneda: "UF" } as never,   // 186.200.000
        ],
      }),
      6_000_000_000, // portafolio CLP (6 mil millones para el ejemplo)
      rates
    );
    expect(s.activos.inmuebles_inversion).toBe(190_000_000);
    expect(s.activos.apv).toBe(38_000_000);
    expect(s.activos.afp).toBe(186_200_000);
    expect(s.activos.portafolio).toBe(6_000_000_000);
    expect(s.portafolioDisponible).toBe(true);
  });

  it("patrimonio neto = activos − pasivos; invertible excluye casa y su hipoteca", () => {
    const s = computePatrimonioSummary(
      data({
        inmuebles: [
          { tipo: "habitacion", valor_estimado_venta_monto: 300_000_000, valor_estimado_venta_moneda: "CLP",
            tiene_credito: true, credito_saldo_monto: 100_000_000, credito_saldo_moneda: "CLP" } as never,
          { tipo: "inversion", valor_estimado_venta_monto: 200_000_000, valor_estimado_venta_moneda: "CLP" } as never,
        ],
      }),
      null, // sin portafolio
      rates
    );
    // activos.total = 300M (casa) + 200M (inversion) = 500M ; pasivos = 100M
    expect(s.patrimonioNeto).toBe(400_000_000);              // 500M − 100M
    // invertible = 400M − (300M casa − 100M hipoteca casa) = 400M − 200M = 200M
    expect(s.patrimonioInvertible).toBe(200_000_000);
    expect(s.portafolioDisponible).toBe(false);
    expect(s.activos.portafolio).toBe(0);
  });

  it("flujo pasivo = Σ (arriendo − dividendo) de los que se arriendan; puede ser negativo", () => {
    const s = computePatrimonioSummary(
      data({
        inmuebles: [
          { tipo: "inversion", se_arrienda: true, arriendo_monto: 18, arriendo_moneda: "UF",
            tiene_credito: true, credito_cuota_monto: 15, credito_cuota_moneda: "UF" } as never, // (18−15)*38000 = 114.000
          { tipo: "inversion", se_arrienda: true, arriendo_monto: 10, arriendo_moneda: "UF",
            tiene_credito: true, credito_cuota_monto: 14, credito_cuota_moneda: "UF" } as never, // (10−14)*38000 = −152.000
          { tipo: "inversion", se_arrienda: false, arriendo_monto: 99, arriendo_moneda: "UF" } as never, // no cuenta
        ],
      }),
      null, rates
    );
    expect(s.flujoPasivoMensual).toBe((3 - 4) * 38000); // 114000 − 152000 = −38000
  });

  it("suma el componente de ahorro de los seguros", () => {
    const s = computePatrimonioSummary(
      data({ seguros: [{ tipo: "vida_con_ahorro", componente_ahorro_monto: 500, componente_ahorro_moneda: "UF" } as never] }),
      0, rates
    );
    expect(s.activos.ahorro_seguros).toBe(19_000_000);
  });
});
